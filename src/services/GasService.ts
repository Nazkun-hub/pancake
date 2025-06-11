import { injectable } from 'tsyringe';
import { 
  IGasService,
  GasPrices,
  GasEstimate,
  GasPreferences,
  Operation,
  ModuleConfig,
  ModuleHealth,
  ModuleMetrics
} from '../types/interfaces.js';

/**
 * BSC Gas服务实现
 * 专门为BSC网络提供Gas价格管理和估算功能
 */
@injectable()
export class GasService implements IGasService {
  public readonly name = 'GasService';
  public readonly version = '1.0.0';
  public readonly dependencies: string[] = [];

  private isStarted = false;
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private lastActivity = Date.now();
  
  // Gas价格缓存
  private gasPriceCache: GasPrices | null = null;
  private lastGasPriceUpdate = 0;
  private gasPriceCacheExpiry = 30000; // 30秒

  // 用户偏好存储
  private userPreferences = new Map<string, GasPreferences>();

  /**
   * 初始化Gas服务
   */
  async initialize(config: ModuleConfig): Promise<void> {
    console.log('🔄 初始化Gas服务...');
    
    this.gasPriceCacheExpiry = config.gasPriceCacheExpiry || 30000;
    
    // 设置定期更新Gas价格
    if (config.enableAutoUpdate !== false) {
      this.setupAutoGasPriceUpdate(config.updateInterval || 30000);
    }
    
    console.log('✅ Gas服务初始化完成');
  }

  /**
   * 启动Gas服务
   */
  async start(): Promise<void> {
    this.isStarted = true;
    this.startTime = Date.now();
    
    // 立即获取一次Gas价格
    await this.updateGasPrices();
    
    console.log('🚀 Gas服务已启动');
  }

  /**
   * 停止Gas服务
   */
  async stop(): Promise<void> {
    this.isStarted = false;
    console.log('⏹️ Gas服务已停止');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ModuleHealth> {
    try {
      const gasPrices = await this.getCurrentGasPrices();
      
      if (!gasPrices || gasPrices.standard <= 0) {
        return {
          status: 'error',
          message: 'Gas价格数据异常',
          timestamp: Date.now()
        };
      }

      return {
        status: this.isStarted ? 'healthy' : 'error',
        message: this.isStarted ? 
          `Gas服务运行正常 (标准: ${gasPrices.standard} Gwei)` : 
          'Gas服务未启动',
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Gas服务健康检查失败: ${error}`,
        timestamp: Date.now()
      };
    }
  }

  /**
   * 获取模块指标
   */
  getMetrics(): ModuleMetrics {
    return {
      uptime: Date.now() - this.startTime,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      lastActivity: this.lastActivity
    };
  }

  /**
   * 执行操作（通用接口）
   */
  async execute(params: any): Promise<any> {
    this.requestCount++;
    this.lastActivity = Date.now();
    
    if (params.type === 'getGasPrices') {
      return await this.getCurrentGasPrices();
    }
    
    throw new Error(`不支持的Gas服务操作: ${params.type}`);
  }

  /**
   * 验证参数
   */
  validate(params: any): boolean {
    return typeof params === 'object' && params !== null;
  }

  /**
   * 获取当前Gas价格
   */
  async getCurrentGasPrices(): Promise<GasPrices> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      // 检查缓存
      if (this.gasPriceCache && 
          (Date.now() - this.lastGasPriceUpdate) < this.gasPriceCacheExpiry) {
        return this.gasPriceCache;
      }

      // 更新Gas价格
      await this.updateGasPrices();

      if (!this.gasPriceCache) {
        throw new Error('获取Gas价格失败');
      }

      return this.gasPriceCache;

    } catch (error) {
      this.errorCount++;
      console.error('❌ 获取Gas价格失败:', error);
      
      // 返回默认值
      return {
        slow: 3,
        standard: 5,
        fast: 8,
        instant: 12
      };
    }
  }

  /**
   * 估算Gas费用
   */
  async estimateGas(operation: Operation): Promise<GasEstimate> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      console.log('⛽ 估算Gas费用...', { 
        type: operation.type, 
        priority: operation.priority 
      });

      // 获取当前Gas价格
      const gasPrices = await this.getCurrentGasPrices();

      // 根据操作类型估算Gas限制
      const gasLimit = this.getGasLimitForOperation(operation.type);

      // 计算估算成本（以BNB计算）
      const bnbPrice = 300; // 假设BNB价格，实际应该从价格服务获取
      const estimatedCost = this.calculateGasCost(gasLimit, gasPrices.standard, bnbPrice);

      // 根据优先级推荐Gas设置
      const recommendedSettings = this.getRecommendedGasSettings(
        gasPrices, 
        gasLimit, 
        operation.priority
      );

      const estimate: GasEstimate = {
        gasLimit,
        gasPrices,
        estimatedCost,
        recommendedSettings
      };

      console.log('✅ Gas估算完成', {
        gasLimit,
        estimatedCost: `$${estimatedCost.toFixed(4)}`,
        recommendedGasPrice: recommendedSettings.gasPrice
      });

      return estimate;

    } catch (error) {
      this.errorCount++;
      console.error('❌ Gas估算失败:', error);
      throw error;
    }
  }

  /**
   * 获取用户Gas偏好
   */
  async getUserGasPreferences(userId: string): Promise<GasPreferences> {
    this.requestCount++;
    this.lastActivity = Date.now();

    const preferences = this.userPreferences.get(userId);
    if (preferences) {
      return preferences;
    }

    // 返回默认偏好
    const defaultPreferences: GasPreferences = {
      preferredSpeed: 'fast',
      maxGasPrice: 20,
      confirmBeforeHighGas: true,
      autoAdjustment: true
    };

    this.userPreferences.set(userId, defaultPreferences);
    return defaultPreferences;
  }

  /**
   * 设置用户Gas偏好
   */
  async setUserGasPreferences(userId: string, preferences: GasPreferences): Promise<void> {
    this.requestCount++;
    this.lastActivity = Date.now();

    // 验证偏好设置
    if (!this.validateGasPreferences(preferences)) {
      throw new Error('Gas偏好设置验证失败');
    }

    this.userPreferences.set(userId, preferences);
    
    console.log('💾 保存用户Gas偏好', {
      userId,
      preferredSpeed: preferences.preferredSpeed,
      maxGasPrice: preferences.maxGasPrice
    });
  }

  /**
   * 更新Gas价格
   */
  private async updateGasPrices(): Promise<void> {
    try {
      console.log('🔄 更新Gas价格...');

      // TODO: 实际从BSC网络或Gas价格API获取
      // 这里使用模拟数据
      const currentNetworkGasPrice = await this.fetchNetworkGasPrice();
      
      this.gasPriceCache = {
        slow: Math.max(1, currentNetworkGasPrice * 0.8),
        standard: currentNetworkGasPrice,
        fast: currentNetworkGasPrice * 1.2,
        instant: currentNetworkGasPrice * 1.5
      };

      this.lastGasPriceUpdate = Date.now();
      
      console.log('✅ Gas价格更新完成', this.gasPriceCache);

    } catch (error) {
      console.error('❌ 更新Gas价格失败:', error);
      this.errorCount++;
    }
  }

  /**
   * 从网络获取Gas价格
   */
  private async fetchNetworkGasPrice(): Promise<number> {
    try {
      // 🔧 修复：使用测试验证过的BSC RPC节点
      console.log('🔍 从BSC网络获取真实Gas价格...');
      
      // 使用测试验证过的BSC RPC节点列表
      const bscRpcUrls = [
        'https://bsc-dataseed1.binance.org/',
        'https://bsc-dataseed2.binance.org/',
        'https://bsc-dataseed3.binance.org/',
        'https://rpc.ankr.com/bsc'
      ];
      
      // 尝试多个RPC节点
      for (const rpcUrl of bscRpcUrls) {
        try {
          console.log(`🔗 尝试RPC节点: ${rpcUrl}`);
          
          // 使用AbortController实现超时控制
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
          
          try {
            const response = await fetch(rpcUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_gasPrice',
                params: [],
                id: 1
              }),
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
              console.log(`⚠️ RPC响应错误: ${response.status}`);
              continue;
            }
            
            const result = await response.json() as { result?: string; error?: any };
            
            if (result.result) {
              // 将十六进制转换为Gwei
              const gasPriceWei = BigInt(result.result);
              const gasPriceGwei = Number(gasPriceWei) / 1e9;
              
              console.log(`✅ 从${rpcUrl}获取真实Gas价格: ${gasPriceGwei.toFixed(3)} Gwei`);
              console.log(`📊 Gas价格详情: ${result.result} (hex) = ${gasPriceWei.toString()} (wei) = ${gasPriceGwei.toFixed(3)} Gwei`);
      
              // 验证Gas价格合理性（BSC通常在0.1-10 Gwei之间）
              if (gasPriceGwei >= 0.05 && gasPriceGwei <= 50) {
                return gasPriceGwei;
              } else {
                console.warn(`⚠️ Gas价格异常: ${gasPriceGwei} Gwei，继续尝试下一个RPC`);
                continue;
              }
            } else {
              console.warn(`⚠️ RPC返回无效结果:`, result);
              continue;
            }
            
          } catch (rpcError) {
            console.log(`❌ RPC节点${rpcUrl}失败:`, rpcError);
            continue;
          }
          
        } catch (error) {
          console.log(`❌ RPC节点${rpcUrl}失败:`, error);
          continue;
        }
      }
      
      // 所有RPC都失败，使用测试验证的合理默认值
      console.warn('⚠️ 所有BSC RPC节点都失败，使用测试验证的默认值');
      return 0.1; // 基于测试结果的BSC合理默认值
      
    } catch (error) {
      console.error('❌ 从BSC网络获取Gas价格失败:', error);
      console.log('🔧 使用BSC测试验证的默认值: 0.1 Gwei');
      return 0.1; // 基于测试结果的BSC合理默认值
    }
  }

  /**
   * 根据操作类型获取Gas限制
   */
  private getGasLimitForOperation(operationType: string): number {
    const gasLimits: Record<string, number> = {
      'addLiquidity': 300000,
      'removeLiquidity': 200000,
      'collect': 150000,
      'multicall': 500000,
      'swap': 200000,
      'approve': 50000
    };

    return gasLimits[operationType] || 200000; // 默认值
  }

  /**
   * 计算Gas成本
   */
  private calculateGasCost(gasLimit: number, gasPrice: number, bnbPrice: number): number {
    const gasCostInBNB = (gasLimit * gasPrice * 1e-9); // 转换为BNB
    return gasCostInBNB * bnbPrice; // 转换为美元
  }

  /**
   * 根据优先级获取推荐Gas设置
   */
  private getRecommendedGasSettings(
    gasPrices: GasPrices, 
    gasLimit: number, 
    priority: 'low' | 'medium' | 'high'
  ) {
    const gasPrice = {
      'low': gasPrices.slow,
      'medium': gasPrices.standard,
      'high': gasPrices.fast
    }[priority];

    return {
      gasPrice,
      gasLimit,
      priorityFee: 0, // BSC不使用EIP-1559
      maxFeePerGas: gasPrice
    };
  }

  /**
   * 验证Gas偏好设置
   */
  private validateGasPreferences(preferences: GasPreferences): boolean {
    if (!['slow', 'standard', 'fast', 'instant'].includes(preferences.preferredSpeed)) {
      console.error('无效的Gas速度偏好');
      return false;
    }

    if (preferences.maxGasPrice <= 0 || preferences.maxGasPrice > 1000) {
      console.error('无效的最大Gas价格设置');
      return false;
    }

    return true;
  }

  /**
   * 设置自动Gas价格更新
   */
  private setupAutoGasPriceUpdate(interval: number): void {
    setInterval(async () => {
      try {
        await this.updateGasPrices();
      } catch (error) {
        console.error('自动Gas价格更新失败:', error);
      }
    }, interval);
  }
} 