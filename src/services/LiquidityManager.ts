/**
 * 流动性管理器 - 专用于PancakeSwap V3流动性添加
 * 100%复现 real_multicall_direct_test_fixed_v5.js 的所有功能和步骤
 */

import { ethers } from 'ethers';
import { inject, injectable } from 'tsyringe';
import { TYPES, IService, ModuleConfig, ModuleHealth, ModuleMetrics } from '../types/interfaces.js';
import { ContractService } from './ContractService.js';
import { Web3Service } from './Web3Service.js';
import { IEventBus } from '../types/interfaces.js';
import { GasService } from './GasService.js';

// BSC主网配置
const FACTORY_ADDRESS = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const POSITION_MANAGER_ADDRESS = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

// ABI定义
const POSITION_MANAGER_ABI = [
    'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
    'function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)',
    'event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
];

const FACTORY_ABI = [
    'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
];

const POOL_ABI = [
    'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
    'function liquidity() external view returns (uint128)',
    'function token0() external view returns (address)',
    'function token1() external view returns (address)',
    'function fee() external view returns (uint24)'
];

/**
 * 流动性添加参数接口
 */
export interface AddLiquidityParams {
    inputAmount: string;        // 输入金额 (如 "0.1")
    inputToken: string;          // 输入代币地址 (支持任意代币)
    lowerPercent: number;       // 下限百分比 (如 -5 表示-5%)
    upperPercent: number;       // 上限百分比 (如 5 表示+5%)
    baseSlippagePercent: number; // 基础滑点 (如 1 表示1%)
    // 🔴 修改：池子配置现在为必需参数
    poolConfig: {
        poolAddress: string;      // 池子地址
        token0Address: string;    // Token0 地址
        token1Address: string;    // Token1 地址
        fee: number;             // 费率
    };
}

/**
 * 池子配置
 */
const POOL_CONFIG = {
    token0: USDT_ADDRESS,  // USDT作为token0
    token1: WBNB_ADDRESS,  // WBNB作为token1  
    fee: 100  // 0.01% (正确的费率)
};

@injectable()
export class LiquidityManager implements IService {
    readonly name = 'LiquidityManager';
    readonly version = '1.0.0';
    readonly dependencies = ['ContractService', 'Web3Service', 'GasService', 'EventBus'];

    private readonly metrics: ModuleMetrics = {
        uptime: 0,
        requestCount: 0,
        errorCount: 0,
        lastActivity: Date.now()
    };

    constructor(
        @inject(TYPES.ContractService) private contractService: ContractService,
        @inject(TYPES.Web3Service) private web3Service: Web3Service,
        @inject(TYPES.GasService) private gasService: GasService,
        @inject(TYPES.EventBus) private eventBus: IEventBus
    ) {}

    async initialize(config: ModuleConfig): Promise<void> {
        console.log('🔗 初始化LiquidityManager...');
        console.log('✅ LiquidityManager初始化完成');
    }

    async start(): Promise<void> {
        console.log('🚀 LiquidityManager已启动');
        this.metrics.uptime = Date.now();
    }

    async stop(): Promise<void> {
        console.log('🛑 LiquidityManager已停止');
    }

    async healthCheck(): Promise<ModuleHealth> {
        try {
            const provider = this.web3Service.getProvider();
            if (!provider) {
                return {
                    status: 'error',
                    message: 'Provider未连接',
                    timestamp: Date.now()
                };
            }

            return {
                status: 'healthy',
                message: 'LiquidityManager运行正常',
                timestamp: Date.now()
            };
        } catch (error) {
            return {
                status: 'error',
                message: error instanceof Error ? error.message : '健康检查失败',
                timestamp: Date.now()
            };
        }
    }

    getMetrics(): ModuleMetrics {
        return {
            ...this.metrics,
            uptime: this.metrics.uptime ? Date.now() - this.metrics.uptime : 0
        };
    }

    async execute(params: any): Promise<any> {
        throw new Error('通用execute方法未实现，请使用具体的方法');
    }

    validate(params: any): boolean {
        return typeof params === 'object' && params !== null;
    }

    /**
     * 创建流动性头寸 - 轻量级入口（方案1优化版）
     * 只做基本验证和准备工作，核心逻辑委托给executeWithRealTimeRecalculation
     */
    async createLiquidityPosition(params: AddLiquidityParams): Promise<{
        txHash: string;
        tokenId: string;
        gasUsed: string;
        totalCost: string;
        calculatedParams: any;
    }> {
        try {
            this.metrics.requestCount++;
            this.metrics.lastActivity = Date.now();

            console.log('[STRATEGY] 💧 开始创建流动性头寸...', params);

            // 🎯 轻量级验证：只做基本检查
            const provider = this.web3Service.getProvider();
            const wallet = this.web3Service.getWallet();
            
            if (!provider || !wallet) {
                throw new Error('Provider或钱包未连接');
            }

            // ✅ 直接委托给集中式执行方法
            console.log('[STRATEGY] 🚀 === 开始完整流程执行 (方案1优化版) ===');
            const result = await this.executeWithRealTimeRecalculation(
                wallet, 
                params.inputAmount, 
                params.inputToken, 
                params.lowerPercent, 
                params.upperPercent, 
                params.baseSlippagePercent,
                params.poolConfig
            );

            console.log('[STRATEGY] ✅ 流动性头寸创建成功');
            
            // 🔧 新增：触发头寸创建事件，供盈亏统计监听
            try {
                await this.eventBus.publish({
                    type: 'position.created',
                    data: {
                        tokenId: result.tokenId,
                        poolConfig: params.poolConfig, // 添加池子配置
                        strategyApiResult: result, // 添加策略API结果 (盈亏统计插件期望的数据)
                        创建结果: result,
                        交易哈希: result.txHash,
                        钱包地址: wallet.address,
                        输入参数: params,
                        时间戳: Date.now()
                    },
                    timestamp: Date.now(),
                    source: 'LiquidityManager'
                });
                console.log(`📡 已触发头寸创建事件: TokenID ${result.tokenId}`);
                console.log(`📡 包含必要数据: poolConfig ✅, strategyApiResult ✅`);
            } catch (eventError) {
                console.warn(`⚠️ 头寸创建事件触发失败:`, eventError);
            }
            
            return result;

        } catch (error) {
            this.metrics.errorCount++;
            console.error('[STRATEGY] ❌ 创建流动性头寸失败:', error);
            throw error;
        }
    }

    /**
     * 集中式执行方法 - 包含所有核心逻辑（方案1优化版）
     * 消除冗余，统一管理整个执行流程
     */
    private async executeWithRealTimeRecalculation(
        wallet: ethers.Wallet, 
        inputAmount: string, 
        inputToken: string, 
        lowerPercent: number, 
        upperPercent: number, 
        baseSlippagePercent: number,
        poolConfig: {
            poolAddress: string;
            token0Address: string;
            token1Address: string;
            fee: number;
        }
    ): Promise<{
        txHash: string;
        tokenId: string;
        gasUsed: string;
        totalCost: string;
        calculatedParams: any;
    }> {
        const provider = wallet.provider as ethers.JsonRpcProvider;
        
        // 🎯 阶段1: 准备计算 (合并: 池子验证 + 状态获取 + 重新计算)
        console.log('[STRATEGY] \n🎯 子阶段3.1: 准备计算');
        const poolAddress = await this.getPoolAddress(provider, poolConfig);
        
        const initialState = await this.getRealTimeStateAndRecalculate(
            provider, poolAddress, inputAmount, inputToken, lowerPercent, upperPercent, '', poolConfig
        );
        
        const finalState = await this.getRealTimeStateAndRecalculate(
            provider, poolAddress, inputAmount, inputToken, lowerPercent, upperPercent, '', poolConfig
        );
        finalState.timestamp = Date.now();
        
        // 🎯 阶段2: 参数构建 (合并: 余额检查 + 滑点计算 + 参数构建)
        console.log('[STRATEGY] \n🎯 子阶段3.2: 参数构建');
        await this.checkTokenBalanceAndAllowance(
            provider, wallet, initialState.amount0, initialState.amount1, poolConfig
        );
        
        const dynamicSlippage = this.calculateDynamicSlippage(
            initialState.currentTick, finalState.currentTick, baseSlippagePercent, poolConfig, lowerPercent, upperPercent
        );
        
        const mintParams = this.buildMintParams(finalState, dynamicSlippage, wallet.address, poolConfig);
        console.log(`[STRATEGY] 💧 流动性计算: Token0=${ethers.formatUnits(finalState.amount0, 18)} ${poolConfig.token0Address === '0x55d398326f99059fF775485246999027B3197955' ? 'USDT' : 'Token0'}, Token1=${ethers.formatUnits(finalState.amount1, 18)} ${poolConfig.token1Address === '0xa0c56a8c0692bD10B3fA8f8bA79Cf5332B7107F9' ? 'MERL' : 'Token1'}, 滑点=${dynamicSlippage}%`);
        
        // 执行mint交易
        const positionManager = new ethers.Contract(POSITION_MANAGER_ADDRESS, POSITION_MANAGER_ABI, wallet);
        
        try {
            // 🎯 阶段3: 执行交易 (合并: Gas优化 + 交易执行)
            console.log('[STRATEGY] \n🎯 子阶段3.3: 执行交易');
            
            // Gas优化策略 (完整版)
            const estimatedGas = await positionManager.mint.estimateGas(mintParams);
            console.log(`[STRATEGY] 📊 原始Gas估算: ${estimatedGas}`);
            
            // Gas Limit优化（根据tick变化动态调整）
            const tickChange = Math.abs(finalState.currentTick - initialState.currentTick);
            const gasLimitMultiplier = tickChange > 5 ? 160n : 150n; // 大变化时增加更多gas
            const optimizedGasLimit = estimatedGas * gasLimitMultiplier / 100n;
            console.log(`[STRATEGY] 📊 优化Gas Limit: ${optimizedGasLimit} (${gasLimitMultiplier/10n}%)`);
            
            // Gas Price优化（使用GasService获取准确价格）
            console.log(`[STRATEGY] 🔍 获取BSC网络真实Gas价格...`);
            
            let currentGasPrice: bigint = ethers.parseUnits('0.1', 'gwei'); // 初始化为默认值
            
            // 🔧 修改：使用GasService获取准确Gas价格
            try {
                console.log(`[STRATEGY]    🔍 通过GasService获取准确Gas价格...`);
                const gasPrices = await this.gasService.getCurrentGasPrices();
                const networkGasPrice = ethers.parseUnits(gasPrices.standard.toString(), 'gwei');
                
                if (networkGasPrice && networkGasPrice > 0n) {
                    currentGasPrice = networkGasPrice;
                    console.log(`[STRATEGY]    ✅ 获取到Gas价格: ${gasPrices.standard} Gwei`);
                } else {
                    console.log(`[STRATEGY]    ⚠️ GasService获取失败，使用默认值`);
                }
            } catch (gasServiceError) {
                console.log(`[STRATEGY]    ⚠️ GasService获取失败: ${gasServiceError instanceof Error ? gasServiceError.message.substring(0, 50) : '未知错误'}`);
                console.log(`[STRATEGY]    🔄 使用默认Gas价格: ${ethers.formatUnits(currentGasPrice, 'gwei')} Gwei`);
            }
            
            console.log(`[STRATEGY] ✅ 最终使用Gas价格: ${ethers.formatUnits(currentGasPrice, 'gwei')} Gwei`);
            
            const optimizedGasPrice = currentGasPrice * 110n / 100n; // 提高10%
            console.log(`[STRATEGY] 💰 当前Gas Price: ${ethers.formatUnits(currentGasPrice, 'gwei')} Gwei`);
            console.log(`[STRATEGY] 💰 优化Gas Price: ${ethers.formatUnits(optimizedGasPrice, 'gwei')} Gwei (+10%)`);
            
            // 计算总Gas费用
            const totalGasCost = optimizedGasLimit * optimizedGasPrice;
            const totalGasCostBNB = ethers.formatEther(totalGasCost);
            console.log(`[STRATEGY] 💸 预估总Gas费用: ${totalGasCostBNB} BNB`);
            
            const optimizedTxParams = {
                gasLimit: optimizedGasLimit,
                gasPrice: optimizedGasPrice,
                value: '0'
            };
            
            console.log(`[STRATEGY] ✅ Gas优化完成，准备快速执行...`);
            
            // 执行交易
            const tx = await positionManager.mint(mintParams, optimizedTxParams);
            console.log(`[STRATEGY] 🚀 交易已发送: ${tx.hash}`);
            console.log(`[STRATEGY] ⚡ 使用优化Gas Price: ${ethers.formatUnits(optimizedGasPrice, 'gwei')} Gwei`);
            
            console.log(`[STRATEGY] ⏳ 等待交易确认...`);
            const receipt = await tx.wait();
            
            if (receipt.status === 1) {
                console.log(`[STRATEGY] \n🎉 === 方案1优化版执行成功! ===`);
                console.log(`[STRATEGY] ✅ 交易哈希: ${receipt.hash}`);
                console.log(`[STRATEGY] ⛽ 实际Gas使用: ${receipt.gasUsed}`);
                console.log(`[STRATEGY] 💰 实际Gas价格: ${ethers.formatUnits(receipt.gasPrice || 0n, 'gwei')} Gwei`);
                console.log(`[STRATEGY] 💸 实际Gas费用: ${ethers.formatEther(receipt.gasUsed * (receipt.gasPrice || 0n))} BNB`);
                console.log(`[STRATEGY] 📊 最终滑点: ${dynamicSlippage}%`);
                console.log(`[STRATEGY] 🔄 Tick变化: ${initialState.currentTick} → ${finalState.currentTick}`);
                
                // 计算Gas效率
                const gasEfficiency = (Number(receipt.gasUsed) / Number(optimizedGasLimit) * 100).toFixed(2);
                console.log(`[STRATEGY] 📈 Gas使用效率: ${gasEfficiency}%`);
                
                // 🔧 完整TokenID解析逻辑 + 实际投入数量解析
                console.log(`[STRATEGY] \n📋 开始解析TokenID和实际投入数量...`);
                let tokenId = '0';
                let actualAmount0 = '0';
                let actualAmount1 = '0';
                let actualLiquidity = '0';
                let poolToken0 = '';
                let poolToken1 = '';
                let baseCurrencyName = '';
                let baseCurrencyPosition = '';
                
                // 方法1: 解析IncreaseLiquidity事件（优先，最可靠，一次性获取所有数据）
                console.log(`[STRATEGY] 🔍 解析方法1: 查找IncreaseLiquidity事件...`);
                let method1Success = false;
                
                for (const log of receipt.logs) {
                    try {
                        if (log.address.toLowerCase() === POSITION_MANAGER_ADDRESS.toLowerCase()) {
                            console.log(`[STRATEGY] 🔍 解析Position Manager事件，地址匹配: ${log.address}`);
                            console.log(`[STRATEGY] 🔍 Log topics: ${log.topics.length} 个`);
                            console.log(`[STRATEGY] 🔍 Log data长度: ${log.data.length}`);
                            
                            // 🔧 基本验证：确保有足够的数据
                            if (log.topics.length === 0) {
                                console.log(`[STRATEGY] ⚠️ 跳过无效事件: 无topics`);
                                continue;
                            }
                            
                            const parsed = positionManager.interface.parseLog(log);
                            
                            if (parsed) {
                                console.log(`[STRATEGY] ✅ 成功解析事件: ${parsed.name}`);
                                console.log(`[STRATEGY] 🔍 事件参数: ${Object.keys(parsed.args || {}).join(', ')}`);
                                
                                if (parsed.name === 'IncreaseLiquidity') {
                                    console.log(`[STRATEGY] 🎉 找到IncreaseLiquidity事件!`);
                                    console.log(`[STRATEGY] 🔍 事件完整参数:`, {
                                        tokenId: parsed.args.tokenId?.toString(),
                                        liquidity: parsed.args.liquidity?.toString(),
                                        amount0: parsed.args.amount0?.toString(),
                                        amount1: parsed.args.amount1?.toString()
                                    });
                                    
                                    // 🎯 一次性获取所有需要的数据（与测试脚本保持一致）
                                    tokenId = parsed.args.tokenId.toString();
                                    actualLiquidity = parsed.args.liquidity.toString();
                                    actualAmount0 = parsed.args.amount0.toString();
                                    actualAmount1 = parsed.args.amount1.toString();
                                
                                console.log(`[STRATEGY] ✅ 方法1成功: 从IncreaseLiquidity事件一次性解析所有数据:`);
                                console.log(`[STRATEGY]    TokenID: ${tokenId}`);
                                console.log(`[STRATEGY]    实际流动性: ${actualLiquidity}`);
                                console.log(`[STRATEGY]    实际Amount0: ${ethers.formatUnits(actualAmount0, 18)}`);
                                console.log(`[STRATEGY]    实际Amount1: ${ethers.formatUnits(actualAmount1, 18)}`);
                                
                                // 🔴 获取Pool信息并识别基础货币
                                try {
                                    poolToken0 = poolConfig.token0Address;
                                    poolToken1 = poolConfig.token1Address;
                                    
                                    console.log(`[STRATEGY] 📋 Pool代币信息:`);
                                    console.log(`[STRATEGY]    Token0: ${poolToken0}`);
                                    console.log(`[STRATEGY]    Token1: ${poolToken1}`);
                                    
                                    // 基础货币识别逻辑
                                    const baseCurrencyAddresses = {
                                        'USDT': '0x55d398326f99059ff775485246999027b3197955',
                                        'USDC': '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
                                        'WBNB': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
                                    };
                                    
                                    const token0Lower = poolToken0.toLowerCase();
                                    const token1Lower = poolToken1.toLowerCase();
                                    
                                    // 检查token0是否为基础货币
                                    for (const [name, address] of Object.entries(baseCurrencyAddresses)) {
                                        if (address.toLowerCase() === token0Lower) {
                                            baseCurrencyName = name;
                                            baseCurrencyPosition = 'token0';
                                            console.log(`[STRATEGY] ✅ Token0是基础货币: ${name}`);
                                            console.log(`[STRATEGY]    基础货币投入: ${ethers.formatUnits(actualAmount0, 18)} ${name}`);
                                            console.log(`[STRATEGY]    非基础货币投入: ${ethers.formatUnits(actualAmount1, 18)} Token1`);
                                            break;
                                        }
                                    }
                                    
                                    // 检查token1是否为基础货币（如果token0不是）
                                    if (!baseCurrencyName) {
                                        for (const [name, address] of Object.entries(baseCurrencyAddresses)) {
                                            if (address.toLowerCase() === token1Lower) {
                                                baseCurrencyName = name;
                                                baseCurrencyPosition = 'token1';
                                                console.log(`[STRATEGY] ✅ Token1是基础货币: ${name}`);
                                                console.log(`[STRATEGY]    非基础货币投入: ${ethers.formatUnits(actualAmount0, 18)} Token0`);
                                                console.log(`[STRATEGY]    基础货币投入: ${ethers.formatUnits(actualAmount1, 18)} ${name}`);
                                                break;
                                            }
                                        }
                                    }
                                    
                                    // 如果都不是基础货币
                                    if (!baseCurrencyName) {
                                        console.log(`[STRATEGY] 🔍 双非基础货币场景:`);
                                        console.log(`[STRATEGY]    Token0投入: ${ethers.formatUnits(actualAmount0, 18)}`);
                                        console.log(`[STRATEGY]    Token1投入: ${ethers.formatUnits(actualAmount1, 18)}`);
                                        baseCurrencyName = 'USDT'; // 默认基础货币
                                    }
                                    
                                } catch (poolInfoError) {
                                    console.log(`[STRATEGY] ⚠️ 基础货币识别失败: ${poolInfoError instanceof Error ? poolInfoError.message : '未知错误'}`);
                                }
                                
                                // 🎯 关键优化：方法1成功，立即标记并跳出所有解析
                                method1Success = true;
                                console.log(`[STRATEGY] 🚀 方法1解析完全成功，跳过方法2和方法3`);
                                break;
                                }
                            }
                        }
                    } catch (parseError) {
                        console.log(`[STRATEGY] 💥 事件解析异常: ${parseError instanceof Error ? parseError.message : '未知错误'}`);
                        console.log(`[STRATEGY] 🔍 日志地址: ${log.address}`);
                        console.log(`[STRATEGY] 🔍 日志topics数量: ${log.topics.length}`);
                        console.log(`[STRATEGY] 🔍 异常详情:`, parseError);
                        if (log.topics.length > 0) {
                            console.log(`[STRATEGY] 🔍 第一个topic: ${log.topics[0]}`);
                        }
                        continue;
                    }
                }
                
                // 🎯 只有方法1失败时才执行方法2和方法3
                if (!method1Success) {
                    console.log(`[STRATEGY] ⚠️ 方法1失败，回退到备用解析方法...`);
                    
                    // 方法2: 手动解析Transfer事件（备选）
                    if (tokenId === '0') {
                        console.log(`[STRATEGY] 🔍 解析方法2: 手动解析Transfer事件（备选）...`);
                        const transferTopic = ethers.id('Transfer(address,address,uint256)');
                        
                        for (const log of receipt.logs) {
                            if (log.topics[0] === transferTopic && 
                                log.address.toLowerCase() === POSITION_MANAGER_ADDRESS.toLowerCase() &&
                                log.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000') {
                                
                                try {
                                    tokenId = BigInt(log.topics[3]).toString();
                                    console.log(`[STRATEGY] ✅ 方法2成功: 手动解析TokenID = ${tokenId}`);
                                    break;
                                } catch (parseTokenIdError) {
                                    console.log(`[STRATEGY] ⚠️ 方法2失败: ${parseTokenIdError instanceof Error ? parseTokenIdError.message : '解析错误'}`);
                                    continue;
                                }
                            }
                        }
                    }
                    
                    // 方法3: 最新区块查询法 (如果前两种方法都失败)
                    if (tokenId === '0') {
                        console.log(`[STRATEGY] 🔍 解析方法3: 查询最新TokenID...`);
                        try {
                            const totalSupply = await positionManager.totalSupply();
                            tokenId = totalSupply.toString();
                            console.log(`[STRATEGY] ⚠️ 方法3近似: 使用总供应量作为TokenID = ${tokenId} (需手动验证)`);
                        } catch (totalSupplyError) {
                            console.log(`[STRATEGY] ❌ 方法3失败: ${totalSupplyError instanceof Error ? totalSupplyError.message : '查询错误'}`);
                            tokenId = 'PARSE_FAILED_CHECK_MANUALLY';
                        }
                    }
                    
                    // 🔴 方法2/3只能获取TokenID，无法获取实际投入数量，使用理论值
                    if (actualAmount0 === '0' && actualAmount1 === '0') {
                        console.log(`[STRATEGY] ⚠️ 备用方法无法解析实际投入数量，使用理论计算值`);
                        actualAmount0 = finalState.amount0.toString();
                        actualAmount1 = finalState.amount1.toString();
                        actualLiquidity = finalState.liquidity.toString();
                    }
                } else {
                    console.log(`[STRATEGY] ✅ 方法1已获取所有数据，无需备用方法`);
                }
                
                // 最终状态检查
                if (tokenId === '0' || tokenId === 'PARSE_FAILED_CHECK_MANUALLY') {
                    console.log(`[STRATEGY] ❌ TokenID解析完全失败，需要手动检查交易: ${receipt.hash}`);
                    tokenId = 'MANUAL_CHECK_REQUIRED';
                } else {
                    console.log(`[STRATEGY] ✅ TokenID解析成功: ${tokenId}`);
                    console.log(`[STRATEGY] 🔗 查看头寸: https://pancakeswap.finance/liquidity/${tokenId}`);
                }
                
                // 数据质量报告
                if (method1Success) {
                    console.log(`[STRATEGY] 📊 数据质量: 优秀 (100%真实区块链数据)`);
                } else {
                    console.log(`[STRATEGY] 📊 数据质量: 一般 (TokenID真实，金额为理论值)`);
                }
                
                return {
                    txHash: receipt.hash,
                    tokenId: tokenId,
                    gasUsed: receipt.gasUsed.toString(),
                    totalCost: totalGasCostBNB,
                    calculatedParams: {
                        finalState: {
                            // 🔴 关键修改：使用实际投入数量而非理论计算值
                            amount0: actualAmount0,
                            amount1: actualAmount1,
                            liquidity: actualLiquidity,
                            sqrtPriceX96: finalState.sqrtPriceX96.toString(),
                            currentTick: finalState.currentTick,
                            timestamp: finalState.timestamp
                        },
                        finalSlippage: dynamicSlippage,
                        tickChange: finalState.currentTick - initialState.currentTick,
                        mintParams: {
                            ...mintParams,
                            amount0Desired: mintParams.amount0Desired.toString(),
                            amount1Desired: mintParams.amount1Desired.toString(),
                            amount0Min: mintParams.amount0Min.toString(),
                            amount1Min: mintParams.amount1Min.toString()
                        },
                        // 🔴 新增：区分理论值和实际值
                        actualAmounts: {
                            amount0: actualAmount0,
                            amount1: actualAmount1,
                            liquidity: actualLiquidity
                        },
                        theoreticalAmounts: {
                            amount0: finalState.amount0.toString(),
                            amount1: finalState.amount1.toString(),
                            liquidity: finalState.liquidity.toString()
                        },
                        // 🔴 新增：基础货币识别信息
                        baseCurrencyInfo: {
                            baseCurrencyName: baseCurrencyName || '未识别',
                            baseCurrencyPosition: baseCurrencyPosition || '未知',
                            poolToken0: poolToken0 || '未知',
                            poolToken1: poolToken1 || '未知',
                            scenario: baseCurrencyName && baseCurrencyPosition ? 'scenario2' : 'scenario1'
                        }
                    }
                };
            } else {
                throw new Error('交易状态为失败');
            }
            
        } catch (error) {
            console.log(`[STRATEGY] ❌ 方案1优化版执行失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            // 分析失败原因（与原版一致）
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            if (errorMessage.includes('STF') || errorMessage.includes('slippage')) {
                console.log(`[STRATEGY] 🔍 失败原因: 滑点保护仍然触发`);
                console.log(`[STRATEGY] 💡 建议: 可能需要更大的动态滑点调整`);
            } else if (errorMessage.includes('insufficient')) {
                console.log(`[STRATEGY] 🔍 失败原因: 余额不足`);
            } else {
                console.log(`[STRATEGY] 🔍 失败原因: 其他错误`);
            }
            
            throw error;
        }
    }

    /**
     * 实时状态获取和重新计算 - 增加标注参数
     */
    private async getRealTimeStateAndRecalculate(
        provider: ethers.JsonRpcProvider, 
        poolAddress: string, 
        inputAmount: string, 
        inputToken: string, 
        lowerPercent: number, 
        upperPercent: number,
        label: string = '', // 新增标注参数
        poolConfig: {
            poolAddress: string;
            token0Address: string;
            token1Address: string;
            fee: number;
        }
    ): Promise<any> {
        // 获取当前池子状态 (简化日志)
        const poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
        const slot0 = await poolContract.slot0();
        const currentTick = Number(slot0.tick);
        const sqrtPriceX96 = slot0.sqrtPriceX96;

        // 计算目标tick范围 (简化)
        const tickRange = this.calculateTickRange(currentTick, lowerPercent, upperPercent, this.getTickSpacing(100));
        
        // 计算流动性数量 (简化)
        const liquidityCalc = this.calculateLiquidityFromAmount(
            sqrtPriceX96, 
            tickRange.tickLower, 
            tickRange.tickUpper, 
            inputAmount, 
            inputToken,
            poolConfig
        );

        return {
            initialTick: currentTick,
            currentTick: currentTick,
            targetTickLower: tickRange.tickLower,
            targetTickUpper: tickRange.tickUpper,
            sqrtPriceX96: sqrtPriceX96.toString(),
            amount0: liquidityCalc.amount0,
            amount1: liquidityCalc.amount1,
            liquidity: liquidityCalc.liquidity
        };
    }

    /**
     * 动态滑点计算
     * 复现 calculateDynamicSlippage 函数
     */
    private calculateDynamicSlippage(
        initialTick: number, 
        currentTick: number, 
        baseSlippagePercent: number, 
        poolConfig?: {
            poolAddress: string;
            token0Address: string;
            token1Address: string;
            fee: number;
        },
        lowerPercent?: number,
        upperPercent?: number
    ): number {
        const tickDifference = Math.abs(currentTick - initialTick);
        let extraSlippage = Math.min(tickDifference * 0.001, 2);

        // 即使tick没有明显变化，也增加一个固定的微小额外滑点
        if (tickDifference === 0) { 
            extraSlippage += 0.25;
        }
        
        const dynamicSlippage = baseSlippagePercent + extraSlippage;

        return dynamicSlippage;
    }

    /**
     * 计算tick范围 - 使用正确的价格百分比转换
     * 参考 real_multicall_direct_test_fixed_v5.js 的 calculateTickRange 函数
     */
    private calculateTickRange(currentTick: number, lowerPercent: number, upperPercent: number, tickSpacing: number): {
        tickLower: number;
        tickUpper: number;
    } {
        // 使用正确的百分比到tick转换 (简化日志)
        const ticksPerPercent = 100; // 1% ≈ 100 ticks
        
        const lowerTickOffset = Math.floor(lowerPercent * ticksPerPercent);
        const upperTickOffset = Math.floor(upperPercent * ticksPerPercent);
        
        let tickLower = currentTick + lowerTickOffset;
        let tickUpper = currentTick + upperTickOffset;
        
        // 对齐到tickSpacing
        tickLower = Math.floor(tickLower / tickSpacing) * tickSpacing;
        tickUpper = Math.floor(tickUpper / tickSpacing) * tickSpacing;
        
        // 确保范围有效
        if (tickLower >= tickUpper) {
            tickUpper = tickLower + tickSpacing;
        }

        return { tickLower, tickUpper };
    }

    /**
     * 计算流动性数量 - 使用Uniswap V3官方数学公式
     * 参考：@uniswap/v3-sdk 和 uniswap_v3_official_math_test.js
     */
    private calculateLiquidityFromAmount(
        sqrtPriceX96: bigint, 
        tickLower: number, 
        tickUpper: number, 
        inputAmount: string, 
        inputToken: string,
        poolConfig: {
            poolAddress: string;
            token0Address: string;
            token1Address: string;
            fee: number;
        }
    ): {
        amount0: string;
        amount1: string;
        liquidity: string;
    } {
        // 1. 计算区间的sqrtRatio (简化日志)
        const sqrtRatioAX96 = this.getSqrtRatioAtTick(tickLower);
        const sqrtRatioBX96 = this.getSqrtRatioAtTick(tickUpper);
        const sqrtRatioX96 = sqrtPriceX96;

        // 2. 转换输入数量为wei
        const inputAmountWei = ethers.parseUnits(inputAmount, 18);

        // 3. 根据输入代币计算流动性
        let liquidity: bigint;
        
        if (inputToken.toLowerCase() === poolConfig.token0Address.toLowerCase()) {
            liquidity = this.getLiquidityForAmount0(sqrtRatioX96, sqrtRatioAX96, sqrtRatioBX96, inputAmountWei);
        } else {
            liquidity = this.getLiquidityForAmount1(sqrtRatioX96, sqrtRatioAX96, sqrtRatioBX96, inputAmountWei);
        }

        // 4. 根据流动性计算两种代币的精确数量
        const { amount0, amount1 } = this.getAmountsForLiquidity(sqrtRatioX96, sqrtRatioAX96, sqrtRatioBX96, liquidity);

        const result = {
            amount0: amount0.toString(),
            amount1: amount1.toString(),
            liquidity: liquidity.toString()
        };

        // 只保留最终结果日志
        console.log(`[STRATEGY] ✅ 官方公式计算结果: {
  amount0: '${ethers.formatUnits(result.amount0, 18)}',
  amount1: '${ethers.formatUnits(result.amount1, 18)}',
  liquidity: '${result.liquidity}'
}`);

        return result;
    }

    /**
     * Uniswap V3官方：Tick转SqrtRatioX96
     * 参考：@uniswap/v3-sdk
     */
    private getSqrtRatioAtTick(tick: number): bigint {
        const absTick = BigInt(Math.abs(tick));
        
        // Uniswap V3精确bit-shifting算法
        let ratio = (absTick & 0x1n) !== 0n 
            ? 0xfffcb933bd6fad37aa2d162d1a594001n 
            : 0x100000000000000000000000000000000n;
            
        if ((absTick & 0x2n) !== 0n) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n;
        if ((absTick & 0x4n) !== 0n) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
        if ((absTick & 0x8n) !== 0n) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
        if ((absTick & 0x10n) !== 0n) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
        if ((absTick & 0x20n) !== 0n) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
        if ((absTick & 0x40n) !== 0n) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
        if ((absTick & 0x80n) !== 0n) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
        if ((absTick & 0x100n) !== 0n) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
        if ((absTick & 0x200n) !== 0n) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
        if ((absTick & 0x400n) !== 0n) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
        if ((absTick & 0x800n) !== 0n) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
        if ((absTick & 0x1000n) !== 0n) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
        if ((absTick & 0x2000n) !== 0n) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
        if ((absTick & 0x4000n) !== 0n) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
        if ((absTick & 0x8000n) !== 0n) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
        if ((absTick & 0x10000n) !== 0n) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
        if ((absTick & 0x20000n) !== 0n) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
        if ((absTick & 0x40000n) !== 0n) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
        if ((absTick & 0x80000n) !== 0n) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n;
        
        // 处理负数tick
        if (tick > 0) {
            ratio = (1n << 256n) / ratio;
        }
        
        // 转换为Q96格式
        return ratio >> 32n;
    }

    /**
     * 从sqrtRatio反推tick (近似算法)
     */
    private getTickAtSqrtRatio(sqrtRatioX96: bigint): number {
        const Q96 = 2n ** 96n;
        const sqrtPrice = Number(sqrtRatioX96) / Number(Q96);
        const price = sqrtPrice * sqrtPrice;
        const tick = Math.log(price) / Math.log(1.0001);
        return Math.round(tick);
    }

    /**
     * 计算给定流动性L所需的代币数量 (Uniswap V3官方公式)
     */
    private getAmountsForLiquidity(sqrtRatioX96: bigint, sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, liquidity: bigint): {
        amount0: bigint;
        amount1: bigint;
    } {
        const Q96 = 2n ** 96n;
        
        // 确保A < B
        if (sqrtRatioAX96 > sqrtRatioBX96) {
            [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
        }
        
        let amount0 = 0n;
        let amount1 = 0n;
        
        if (sqrtRatioX96 <= sqrtRatioAX96) {
            // 当前价格在区间下方，只需要token0
            amount0 = (liquidity * Q96 * (sqrtRatioBX96 - sqrtRatioAX96)) / (sqrtRatioAX96 * sqrtRatioBX96);
        } else if (sqrtRatioX96 < sqrtRatioBX96) {
            // 当前价格在区间内，需要两种代币
            amount0 = (liquidity * Q96 * (sqrtRatioBX96 - sqrtRatioX96)) / (sqrtRatioX96 * sqrtRatioBX96);
            amount1 = liquidity * (sqrtRatioX96 - sqrtRatioAX96) / Q96;
        } else {
            // 当前价格在区间上方，只需要token1
            amount1 = liquidity * (sqrtRatioBX96 - sqrtRatioAX96) / Q96;
        }
        
        return { amount0, amount1 };
    }

    /**
     * 从token0数量计算流动性 (Uniswap V3官方公式)
     */
    private getLiquidityForAmount0(sqrtRatioX96: bigint, sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, amount0: bigint): bigint {
        const Q96 = 2n ** 96n;
        
        // 确保A < B
        if (sqrtRatioAX96 > sqrtRatioBX96) {
            [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
        }
        
        if (sqrtRatioX96 <= sqrtRatioAX96) {
            // 当前价格在区间下方
            return (amount0 * sqrtRatioAX96 * sqrtRatioBX96) / (Q96 * (sqrtRatioBX96 - sqrtRatioAX96));
        } else if (sqrtRatioX96 < sqrtRatioBX96) {
            // 当前价格在区间内
            return (amount0 * sqrtRatioX96 * sqrtRatioBX96) / (Q96 * (sqrtRatioBX96 - sqrtRatioX96));
        } else {
            // 当前价格在区间上方，token0不需要
            return 0n;
        }
    }

    /**
     * 从token1数量计算流动性 (Uniswap V3官方公式)
     */
    private getLiquidityForAmount1(sqrtRatioX96: bigint, sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, amount1: bigint): bigint {
        const Q96 = 2n ** 96n;
        
        // 确保A < B
        if (sqrtRatioAX96 > sqrtRatioBX96) {
            [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
        }
        
        if (sqrtRatioX96 >= sqrtRatioBX96) {
            // 当前价格在区间上方
            return (amount1 * Q96) / (sqrtRatioBX96 - sqrtRatioAX96);
        } else if (sqrtRatioX96 > sqrtRatioAX96) {
            // 当前价格在区间内
            return (amount1 * Q96) / (sqrtRatioX96 - sqrtRatioAX96);
        } else {
            // 当前价格在区间下方，token1不需要
            return 0n;
        }
    }

    /**
     * 获取池子地址
     * 直接使用用户指定的池子配置
     */
    private async getPoolAddress(
        provider: ethers.JsonRpcProvider, 
        poolConfig: {
            poolAddress: string;
            token0Address: string;
            token1Address: string;
            fee: number;
        }
    ): Promise<string> {
        // 🔴 直接返回用户指定的池子地址
        console.log('[STRATEGY] 🎯 使用用户指定的池子地址:', poolConfig.poolAddress);
        console.log('[STRATEGY] 🎯 池子代币对:', {
            token0: poolConfig.token0Address,
            token1: poolConfig.token1Address,
            fee: poolConfig.fee
        });
        
        // 🔴 可选：验证池子地址是否真实存在
        try {
            const poolContract = new ethers.Contract(
                poolConfig.poolAddress,
                ['function token0() external view returns (address)', 'function token1() external view returns (address)', 'function fee() external view returns (uint24)'],
                provider
            );
            
            const [actualToken0, actualToken1, actualFee] = await Promise.all([
                poolContract.token0(),
                poolContract.token1(),
                poolContract.fee()
            ]);
            
            console.log('[STRATEGY] ✅ 池子验证成功:', {
                actualToken0,
                actualToken1,
                actualFee: actualFee.toString()
            });
            
        } catch (error) {
            console.warn('[STRATEGY] ⚠️ 池子验证失败，但继续执行:', error);
        }
        
        return poolConfig.poolAddress;
    }

    /**
     * 检查代币余额和授权 - 增强版
     */
    private async checkTokenBalanceAndAllowance(
        provider: ethers.JsonRpcProvider, 
        wallet: ethers.Wallet, 
        amount0: string, 
        amount1: string,
        poolConfig: {
            poolAddress: string;
            token0Address: string;
            token1Address: string;
            fee: number;
        }
    ): Promise<void> {
        console.log('[STRATEGY] 💰 检查余额和授权...');
        
        // 检查BNB余额
        const bnbBalance = await provider.getBalance(wallet.address);
        console.log('[STRATEGY] 💰 BNB余额:', ethers.formatEther(bnbBalance));
        
        if (bnbBalance < ethers.parseEther('0.001')) {
            throw new Error('BNB余额不足，需要至少0.001 BNB作为gas费');
        }
        
        // ERC20代币ABI (只需要基本方法)
        const ERC20_ABI = [
            'function balanceOf(address owner) view returns (uint256)',
            'function allowance(address owner, address spender) view returns (uint256)',
            'function approve(address spender, uint256 amount) returns (bool)',
            'function decimals() view returns (uint8)',
            'function symbol() view returns (string)'
        ];

        // 检查Token0 (USDT)
        console.log('[STRATEGY] 🔍 检查Token0 (USDT)...');
        const token0Contract = new ethers.Contract(poolConfig.token0Address, ERC20_ABI, wallet);
        
        try {
            const [token0Balance, token0Symbol, token0Decimals] = await Promise.all([
                token0Contract.balanceOf(wallet.address),
                token0Contract.symbol(),
                token0Contract.decimals()
            ]);
            
            console.log(`[STRATEGY] 💰 ${token0Symbol} 余额:`, ethers.formatUnits(token0Balance, token0Decimals));
            
            // 检查余额是否足够
            const requiredAmount0 = BigInt(amount0);
            if (token0Balance < requiredAmount0) {
                throw new Error(`${token0Symbol} 余额不足。需要: ${ethers.formatUnits(requiredAmount0, token0Decimals)}, 当前: ${ethers.formatUnits(token0Balance, token0Decimals)}`);
            }

            // 检查授权
            const token0Allowance = await token0Contract.allowance(wallet.address, POSITION_MANAGER_ADDRESS);
            console.log(`[STRATEGY] 🔐 ${token0Symbol} 当前授权额度:`, ethers.formatUnits(token0Allowance, token0Decimals));
            
            if (token0Allowance < requiredAmount0) {
                console.log(`[STRATEGY] ⚠️ ${token0Symbol} 授权不足，需要进行无限额度授权...`);
                
                // 🔴 授权无限额度 (MaxUint256) 以避免频繁授权
                console.log(`[STRATEGY] 🔓 正在对 ${token0Symbol} 进行无限额度授权给 PancakeSwap V3...`);
                
                const approveTx0 = await token0Contract.approve(POSITION_MANAGER_ADDRESS, ethers.MaxUint256);
                console.log(`[STRATEGY] 📝 ${token0Symbol} 无限额度授权交易已发送:`, approveTx0.hash);
                
                const approveReceipt0 = await approveTx0.wait();
                if (approveReceipt0.status === 1) {
                    console.log(`[STRATEGY] ✅ ${token0Symbol} 无限额度授权成功`);
                } else {
                    throw new Error(`${token0Symbol} 授权失败`);
                }
            } else {
                console.log(`[STRATEGY] ✅ ${token0Symbol} 授权充足`);
            }
        } catch (error) {
            console.error(`[STRATEGY] ❌ Token0检查失败:`, error);
            throw error;
        }

        // 检查Token1 (B2)
        console.log('[STRATEGY] 🔍 检查Token1 (B2)...');
        const token1Contract = new ethers.Contract(poolConfig.token1Address, ERC20_ABI, wallet);
        
        try {
            const [token1Balance, token1Symbol, token1Decimals] = await Promise.all([
                token1Contract.balanceOf(wallet.address),
                token1Contract.symbol(),
                token1Contract.decimals()
            ]);
            
            console.log(`[STRATEGY] 💰 ${token1Symbol} 余额:`, ethers.formatUnits(token1Balance, token1Decimals));
            
            // 检查余额是否足够
            const requiredAmount1 = BigInt(amount1);
            if (token1Balance < requiredAmount1) {
                throw new Error(`${token1Symbol} 余额不足。需要: ${ethers.formatUnits(requiredAmount1, token1Decimals)}, 当前: ${ethers.formatUnits(token1Balance, token1Decimals)}`);
            }

            // 检查授权
            const token1Allowance = await token1Contract.allowance(wallet.address, POSITION_MANAGER_ADDRESS);
            console.log(`[STRATEGY] 🔐 ${token1Symbol} 当前授权额度:`, ethers.formatUnits(token1Allowance, token1Decimals));
            
            if (token1Allowance < requiredAmount1) {
                console.log(`[STRATEGY] ⚠️ ${token1Symbol} 授权不足，需要进行无限额度授权...`);
                
                // 🔴 授权无限额度 (MaxUint256) 以避免频繁授权
                console.log(`[STRATEGY] 🔓 正在对 ${token1Symbol} 进行无限额度授权给 PancakeSwap V3...`);
                
                const approveTx1 = await token1Contract.approve(POSITION_MANAGER_ADDRESS, ethers.MaxUint256);
                console.log(`[STRATEGY] 📝 ${token1Symbol} 无限额度授权交易已发送:`, approveTx1.hash);
                
                const approveReceipt1 = await approveTx1.wait();
                if (approveReceipt1.status === 1) {
                    console.log(`[STRATEGY] ✅ ${token1Symbol} 无限额度授权成功`);
                } else {
                    throw new Error(`${token1Symbol} 授权失败`);
                }
            } else {
                console.log(`[STRATEGY] ✅ ${token1Symbol} 授权充足`);
            }
        } catch (error) {
            console.error(`[STRATEGY] ❌ Token1检查失败:`, error);
            throw error;
        }
        
        console.log('[STRATEGY] ✅ 代币余额和授权检查全部通过');
    }

    /**
     * 构建mint参数
     * 复现 buildMintParams 函数
     */
    private buildMintParams(
        state: any, 
        slippagePercent: number, 
        recipient: string,
        poolConfig: {
            poolAddress: string;
            token0Address: string;
            token1Address: string;
            fee: number;
        }
    ): any {
        // 🔴 修复：限制最大滑点为99.9%，避免负数
        const maxSlippage = 99.9; // 最大99.9%滑点
        const clampedSlippage = Math.min(slippagePercent, maxSlippage);
        
        if (slippagePercent > maxSlippage) {
            console.warn(`[STRATEGY] ⚠️ 滑点 ${slippagePercent}% 超过最大值，已调整为 ${maxSlippage}%`);
        }

        // 将滑点百分比转换为基点，并确保不超过9990（99.9%）
        const slippageBasisPoints = BigInt(Math.round(clampedSlippage * 100)); 
        const maxBasisPoints = 9990n; // 99.9%
        const safeBasisPoints = slippageBasisPoints > maxBasisPoints ? maxBasisPoints : slippageBasisPoints;

        // 🔴 修复：确保amount0Min和amount1Min永远不为负数
        const amount0Min = (BigInt(state.amount0) * (10000n - safeBasisPoints)) / 10000n;
        const amount1Min = (BigInt(state.amount1) * (10000n - safeBasisPoints)) / 10000n;

        // 🔴 最终安全检查：如果仍然是负数，设置为0
        const safeAmount0Min = amount0Min < 0n ? 0n : amount0Min;
        const safeAmount1Min = amount1Min < 0n ? 0n : amount1Min;

        console.log('[STRATEGY] 🔧 构建Mint参数 (安全滑点版):', {
            originalSlippagePercent: slippagePercent,
            clampedSlippagePercent: clampedSlippage,
            stateAmount0: state.amount0.toString(),
            stateAmount1: state.amount1.toString(),
            safeBasisPoints: safeBasisPoints.toString(),
            calculatedAmount0Min: amount0Min.toString(),
            calculatedAmount1Min: amount1Min.toString(),
            safeAmount0Min: safeAmount0Min.toString(),
            safeAmount1Min: safeAmount1Min.toString(),
            recipient: recipient,
            deadline: Math.floor(Date.now() / 1000) + 1200,
            token0Address: poolConfig.token0Address,
            token1Address: poolConfig.token1Address,
            fee: poolConfig.fee
        });

        return {
            token0: poolConfig.token0Address,
            token1: poolConfig.token1Address,
            fee: poolConfig.fee,
            tickLower: state.targetTickLower,
            tickUpper: state.targetTickUpper,
            amount0Desired: state.amount0.toString(),
            amount1Desired: state.amount1.toString(),
            amount0Min: safeAmount0Min.toString(), // 🔴 使用安全的最小值
            amount1Min: safeAmount1Min.toString(), // 🔴 使用安全的最小值
            recipient: recipient,
            deadline: Math.floor(Date.now() / 1000) + 1200
        };
    }

    /**
     * 获取tick间距
     */
    private getTickSpacing(fee: number): number {
        switch (fee) {
            case 100: return 1;
            case 500: return 10;
            case 2500: return 50;
            case 10000: return 200;
            default: return 10;
        }
    }

    /**
     * 🔧 公共方法：计算代币需求量 - 供TickCalculatorService使用
     * 使用Uniswap V3官方算法，避免代码重复
     * 🔧 新增：支持实时数据获取，与实际流动性创建保持一致
     */
    public async calculateTokenRequirements(参数: {
        inputAmount: number;
        inputTokenType: 'token0' | 'token1';
        currentTick?: number;  // 可选：如果不提供，将获取实时tick
        tickLower: number;
        tickUpper: number;
        token0Decimals: number;
        token1Decimals: number;
        poolConfig: {
            poolAddress: string;
            token0Address: string;
            token1Address: string;
            fee: number;
        };
        useRealTimeData?: boolean;  // 新增：是否使用实时数据
    }): Promise<{
        token0需求量: number;
        token1需求量: number;
        计算说明: string;
        实时tick?: number;  // 新增：返回实时tick用于调试
    }> {
        const { inputAmount, inputTokenType, currentTick, tickLower, tickUpper, token0Decimals, token1Decimals, poolConfig, useRealTimeData = false } = 参数;

        console.log('[STRATEGY] 🧮 [LiquidityManager] 计算代币需求量...');

        // 🔧 新增：实时数据获取逻辑
        let finalTick = currentTick;
        if (useRealTimeData || !currentTick) {
            try {
                const provider = this.web3Service.getProvider();
                if (!provider) {
                    throw new Error('Provider未连接');
                }
                
                const poolContract = new ethers.Contract(poolConfig.poolAddress, [
                    'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
                ], provider);
                
                const slot0 = await poolContract.slot0();
                finalTick = Number(slot0.tick);
                
                console.log(`[STRATEGY] 🔄 获取实时tick: ${finalTick} (原tick: ${currentTick || '未提供'})`);
            } catch (error) {
                console.warn(`[STRATEGY] ⚠️ 获取实时tick失败，使用原始tick: ${error instanceof Error ? error.message : '未知错误'}`);
                finalTick = currentTick || 0;
            }
        }

        if (!finalTick) {
            throw new Error('无法获取有效的tick值');
        }

        // 1. 转换为sqrtPriceX96格式
        const sqrtPriceX96 = this.getSqrtRatioAtTick(finalTick);
        const sqrtRatioAX96 = this.getSqrtRatioAtTick(tickLower);
        const sqrtRatioBX96 = this.getSqrtRatioAtTick(tickUpper);

        // 2. 转换输入数量为BigInt wei格式
        const inputAmountWei = BigInt(Math.floor(inputAmount * Math.pow(10, 18)));

        // 3. 根据输入代币类型计算流动性
        let liquidity: bigint;
        
        if (inputTokenType === 'token0') {
            // 输入代币是token0
            liquidity = this.getLiquidityForAmount0(sqrtPriceX96, sqrtRatioAX96, sqrtRatioBX96, inputAmountWei);
        } else {
            // 输入代币是token1 
            liquidity = this.getLiquidityForAmount1(sqrtPriceX96, sqrtRatioAX96, sqrtRatioBX96, inputAmountWei);
        }

        // 4. 根据流动性计算两种代币的精确数量
        const { amount0, amount1 } = this.getAmountsForLiquidity(sqrtPriceX96, sqrtRatioAX96, sqrtRatioBX96, liquidity);

        // 5. 转换为浮点数格式
        const token0需求量 = parseFloat((Number(amount0) / Math.pow(10, token0Decimals)).toFixed(token0Decimals));
        const token1需求量 = parseFloat((Number(amount1) / Math.pow(10, token1Decimals)).toFixed(token1Decimals));

        const 计算类型 = useRealTimeData ? '实时链上数据' : '静态数据';
        
        const result: {
            token0需求量: number;
            token1需求量: number;
            计算说明: string;
            实时tick?: number;
        } = {
            token0需求量,
            token1需求量,
            计算说明: `Uniswap V3官方公式(${计算类型}): L=${liquidity.toString()}, tick范围[${tickLower}, ${tickUpper}], 使用tick=${finalTick}`
        };
        
        if (useRealTimeData) {
            result.实时tick = finalTick;
        }
        
        return result;
    }
} 