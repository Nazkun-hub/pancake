import { IStrategy, StrategyContext, StrategyResult, StrategyConfig, StrategyAction } from '../src/types/interfaces.js';

/**
 * 简单重平衡策略示例
 * 
 * 功能：
 * - 监控价格范围，当价格偏离中心时进行重平衡
 * - 自动调整流动性位置以保持最优收益
 * - 支持自定义重平衡阈值和频率
 */
export class SimpleRebalanceStrategy implements IStrategy {
    readonly id = 'simple-rebalance-v1';
    readonly name = '简单重平衡策略';
    readonly description = '当价格偏离设定范围时自动重平衡流动性位置';

    /**
     * 策略执行入口
     */
    async execute(context: StrategyContext): Promise<StrategyResult> {
        const startTime = Date.now();
        const actions: StrategyAction[] = [];

        try {
            // 1. 获取配置参数
            const config = this.validateAndGetConfig(context.config);
            
            context.logger.info(`🚀 开始执行重平衡策略: ${this.name}`);
            context.logger.info(`📊 配置参数:`, config);

            // 2. 获取当前价格
            const currentPrice = await context.utils.getCurrentPrice(config.poolAddress);
            context.logger.info(`💰 当前价格: ${currentPrice}`);

            // 3. 获取用户当前持仓
            const positions = await context.utils.getPositions(config.userAddress);
            const targetPositions = positions.filter(p => 
                p.poolId === config.poolAddress && p.inRange
            );

            if (targetPositions.length === 0) {
                return {
                    success: true,
                    message: '未找到目标池的活跃头寸，跳过重平衡',
                    actions,
                    metrics: {
                        executionTime: Date.now() - startTime,
                        profit: 0
                    }
                };
            }

            // 4. 检查是否需要重平衡
            const needRebalance = await this.checkRebalanceNeeded(
                context, 
                targetPositions[0], 
                currentPrice, 
                config
            );

            if (!needRebalance) {
                return {
                    success: true,
                    message: '价格在正常范围内，无需重平衡',
                    actions,
                    metrics: {
                        executionTime: Date.now() - startTime,
                        profit: 0
                    }
                };
            }

            // 5. 执行重平衡操作
            context.logger.info('🔄 开始执行重平衡操作...');

            // 5.1 收集当前头寸的手续费
            const collectResult = await context.utils.collectFees(
                targetPositions[0].tokenId!.toString()
            );
            
            if (collectResult) {
                actions.push({
                    type: 'collect_fees',
                    timestamp: Date.now(),
                    params: { tokenId: targetPositions[0].tokenId },
                    result: collectResult
                });
                context.logger.info('✅ 手续费收集成功');
            }

            // 5.2 移除当前头寸
            const removeResult = await context.utils.removePosition(
                targetPositions[0].tokenId!.toString()
            );

            if (removeResult) {
                actions.push({
                    type: 'remove_position',
                    timestamp: Date.now(),
                    params: { tokenId: targetPositions[0].tokenId },
                    result: removeResult
                });
                context.logger.info('✅ 旧头寸移除成功');
            }

            // 5.3 计算新的价格范围
            const newRange = await context.utils.calculateOptimalRange(
                config.poolAddress,
                'rebalance'
            );

            // 5.4 创建新头寸
            const createParams = {
                token0: targetPositions[0].tokenA.token,
                token1: targetPositions[0].tokenB.token,
                fee: 3000, // 0.3%
                tickLower: this.priceToTick(newRange.min),
                tickUpper: this.priceToTick(newRange.max),
                amount0Desired: targetPositions[0].tokenA.amount,
                amount1Desired: targetPositions[0].tokenB.amount,
                amount0Min: '0',
                amount1Min: '0',
                recipient: config.userAddress,
                deadline: Math.floor(Date.now() / 1000) + 1800 // 30分钟
            };

            const newTokenId = await context.utils.createPosition(createParams);

            if (newTokenId) {
                actions.push({
                    type: 'create_position',
                    timestamp: Date.now(),
                    params: createParams,
                    result: { tokenId: newTokenId }
                });
                context.logger.info(`✅ 新头寸创建成功，Token ID: ${newTokenId}`);
            }

            // 6. 计算下次执行时间
            const nextRunTime = new Date(Date.now() + config.checkInterval * 1000);

            return {
                success: true,
                message: `重平衡完成，执行了 ${actions.length} 个操作`,
                actions,
                nextRunTime,
                data: {
                    oldTokenId: targetPositions[0].tokenId,
                    newTokenId,
                    oldRange: {
                        min: targetPositions[0].minPrice,
                        max: targetPositions[0].maxPrice
                    },
                    newRange,
                    currentPrice
                },
                metrics: {
                    executionTime: Date.now() - startTime,
                    profit: 0 // 这里可以计算实际收益
                }
            };

        } catch (error) {
            context.logger.error('❌ 策略执行失败:', error);
            
            return {
                success: false,
                message: '策略执行失败',
                error: error instanceof Error ? error.message : String(error),
                actions,
                metrics: {
                    executionTime: Date.now() - startTime,
                    profit: 0
                }
            };
        }
    }

    /**
     * 获取默认配置
     */
    getDefaultConfig(): StrategyConfig {
        return {
            poolAddress: '', // 必须由用户提供
            userAddress: '', // 必须由用户提供
            rebalanceThreshold: 0.05, // 5% 偏离阈值
            checkInterval: 300, // 5分钟检查一次
            maxSlippage: 0.01, // 1% 最大滑点
            minProfitThreshold: 0.001 // 最小收益阈值
        };
    }

    /**
     * 验证配置参数
     */
    validate(config: StrategyConfig): boolean {
        const required = ['poolAddress', 'userAddress'];
        
        for (const field of required) {
            if (!config[field]) {
                throw new Error(`缺少必需参数: ${field}`);
            }
        }

        if (config.rebalanceThreshold <= 0 || config.rebalanceThreshold >= 1) {
            throw new Error('重平衡阈值必须在 0-1 之间');
        }

        if (config.checkInterval < 60) {
            throw new Error('检查间隔不能少于 60 秒');
        }

        return true;
    }

    /**
     * 验证并获取配置
     */
    private validateAndGetConfig(config: StrategyConfig) {
        this.validate(config);
        
        return {
            ...this.getDefaultConfig(),
            ...config
        };
    }

    /**
     * 检查是否需要重平衡
     */
    private async checkRebalanceNeeded(
        context: StrategyContext,
        position: any,
        currentPrice: number,
        config: any
    ): Promise<boolean> {
        // 计算价格范围中心
        const rangeCenter = (position.minPrice + position.maxPrice) / 2;
        
        // 计算价格偏离百分比
        const deviation = Math.abs(currentPrice - rangeCenter) / rangeCenter;
        
        context.logger.info(`📊 价格分析:`);
        context.logger.info(`   当前价格: ${currentPrice}`);
        context.logger.info(`   范围中心: ${rangeCenter}`);
        context.logger.info(`   偏离程度: ${(deviation * 100).toFixed(2)}%`);
        context.logger.info(`   阈值: ${(config.rebalanceThreshold * 100).toFixed(2)}%`);

        return deviation > config.rebalanceThreshold;
    }

    /**
     * 价格转换为 tick（简化版本）
     */
    private priceToTick(price: number): number {
        // 这是一个简化的实现，实际应该使用 PancakeSwap V3 的数学库
        return Math.floor(Math.log(price) / Math.log(1.0001));
    }
} 