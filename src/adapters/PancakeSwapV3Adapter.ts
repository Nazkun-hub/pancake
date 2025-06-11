import { injectable, inject } from 'tsyringe';
import { 
  ProtocolAdapter,
  CreatePositionParams,
  PoolInfo,
  Operation,
  ModuleConfig,
  ModuleHealth,
  ModuleMetrics,
  TYPES
} from '../types/interfaces.js';
import { ContractService } from '../services/ContractService.js';
import { 
  CONTRACT_ADDRESSES,
  FeeAmount,
  TICK_SPACINGS,
  MintParams
} from '../types/contracts.js';

/**
 * PancakeSwap V3协议适配器
 * 专门处理PancakeSwap V3协议的操作
 */
@injectable()
export class PancakeSwapV3Adapter extends ProtocolAdapter {
  public readonly protocolName = 'PancakeSwap V3';
  public readonly chainId = 56; // BSC主网
  public readonly name = 'PancakeSwapV3Adapter';
  public readonly version = '1.0.0';
  public readonly dependencies: string[] = ['ContractService'];

  private isStarted = false;
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private lastActivity = Date.now();
  private _isConnected = false;

  // 协议合约地址
  private readonly contractAddresses = CONTRACT_ADDRESSES;

  constructor(
    @inject(TYPES.ContractService) private contractService: ContractService
  ) {
    super();
  }

  /**
   * 初始化适配器
   */
  async initialize(config: ModuleConfig): Promise<void> {
    console.log('🔄 初始化PancakeSwap V3适配器...');
    
    // ContractService应该已经在依赖注入中初始化
    console.log('✅ PancakeSwap V3适配器初始化完成');
  }

  /**
   * 启动适配器
   */
  async start(): Promise<void> {
    this.isStarted = true;
    this.startTime = Date.now();
    console.log('🚀 PancakeSwap V3适配器已启动');
  }

  /**
   * 停止适配器
   */
  async stop(): Promise<void> {
    this.isStarted = false;
    this._isConnected = false;
    console.log('⏹️ PancakeSwap V3适配器已停止');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ModuleHealth> {
    try {
      if (!this.isStarted) {
        return {
          status: 'error',
          message: 'PancakeSwap V3适配器未启动',
          timestamp: Date.now()
        };
      }

      // 检查合约服务健康状态
      const contractHealth = await this.contractService.healthCheck();
      if (contractHealth.status === 'error') {
        return {
          status: 'error',
          message: `合约服务异常: ${contractHealth.message}`,
          timestamp: Date.now()
        };
      }

      // 尝试获取一个真实池子地址作为连接测试
      await this.contractService.execute({
        operation: 'getPoolAddress',
        token0: CONTRACT_ADDRESSES.WBNB,
        token1: CONTRACT_ADDRESSES.USDT,
        fee: FeeAmount.LOW
      });

      this._isConnected = true;
      return {
        status: 'healthy',
        message: 'PancakeSwap V3适配器运行正常',
        timestamp: Date.now()
      };
    } catch (error) {
      this._isConnected = false;
      return {
        status: 'error',
        message: error instanceof Error ? error.message : '健康检查失败',
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
   * 连接到协议
   */
  async connect(): Promise<void> {
    try {
      console.log('🔗 连接到PancakeSwap V3协议...');
      
      // 验证合约服务可用性
      const contractHealth = await this.contractService.healthCheck();
      if (contractHealth.status === 'error') {
        throw new Error(`合约服务不可用: ${contractHealth.message}`);
      }

      this._isConnected = true;
      console.log('✅ 已连接到PancakeSwap V3协议');
    } catch (error) {
      this.errorCount++;
      console.error('❌ 连接PancakeSwap V3协议失败:', error);
      throw error;
    }
  }

  /**
   * 断开协议连接
   */
  async disconnect(): Promise<void> {
    this._isConnected = false;
    console.log('🔌 已断开PancakeSwap V3协议连接');
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * 执行操作
   */
  async execute(operation: Operation): Promise<any> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      if (!this._isConnected) {
        await this.connect();
      }

      console.log('🎯 执行PancakeSwap V3操作...', {
        type: operation.type,
        priority: operation.priority
      });

      switch (operation.type) {
        case 'createPosition':
          return await this.createPosition(operation.params);
        case 'removePosition':
          return await this.removePosition(operation.params.positionId);
        case 'getPoolInfo':
          return await this.getPoolInfo(operation.params.poolAddress);
        case 'approveToken':
          return await this.approveToken(operation.params.token, operation.params.amount);
        case 'getTokenInfo':
          return await this.getTokenInfo(operation.params.token);
        default:
          throw new Error(`不支持的操作类型: ${operation.type}`);
      }

    } catch (error) {
      this.errorCount++;
      console.error('❌ PancakeSwap V3操作失败:', error);
      throw error;
    }
  }

  /**
   * 创建流动性头寸
   */
  async createPosition(params: CreatePositionParams): Promise<string> {
    try {
      console.log('💧 创建PancakeSwap V3头寸...', {
        token0: params.token0,
        token1: params.token1,
        fee: params.fee
      });

      // 验证参数
      if (!this.validateCreatePositionParams(params)) {
        throw new Error('创建头寸参数无效');
      }

      // 构建mint参数
      const mintParams: MintParams = {
        token0: params.token0,
        token1: params.token1,
        fee: params.fee,
        tickLower: params.tickLower,
        tickUpper: params.tickUpper,
        amount0Desired: params.amount0Desired,
        amount1Desired: params.amount1Desired,
        amount0Min: params.amount0Min,
        amount1Min: params.amount1Min,
        recipient: params.recipient,
        deadline: params.deadline
      };

      // 调用合约服务创建头寸
      const txHash = await this.contractService.mintPosition(mintParams);
      
      console.log('✅ PancakeSwap V3头寸创建成功', { txHash });
      return txHash;

    } catch (error) {
      this.errorCount++;
      console.error('❌ 创建PancakeSwap V3头寸失败:', error);
      throw error;
    }
  }

  /**
   * 移除流动性头寸
   */
  async removePosition(positionId: string): Promise<boolean> {
    try {
      console.log('🗑️ 移除PancakeSwap V3头寸...', { positionId });

      // 先获取头寸信息
      const position = await this.contractService.getPosition(positionId);
      
      // 减少流动性到0
      const decreaseParams = {
        tokenId: positionId,
        liquidity: position.liquidity,
        amount0Min: '0',
        amount1Min: '0',
        deadline: Math.floor(Date.now() / 1000) + 1800 // 30分钟过期
      };

      await this.contractService.decreaseLiquidity(decreaseParams);

      // 收取剩余手续费
      const collectParams = {
        tokenId: positionId,
        recipient: position.operator,
        amount0Max: '0xffffffffffffffffffffffffffffffff',
        amount1Max: '0xffffffffffffffffffffffffffffffff'
      };

      await this.contractService.collectFees(collectParams);

      // 销毁头寸
      await this.contractService.burnPosition(positionId);

      console.log('✅ PancakeSwap V3头寸移除成功');
      return true;

    } catch (error) {
      this.errorCount++;
      console.error('❌ 移除PancakeSwap V3头寸失败:', error);
      throw error;
    }
  }

  /**
   * 获取池子信息
   */
  async getPoolInfo(poolAddress: string): Promise<PoolInfo> {
    try {
      console.log('🏊 获取池子信息...', { poolAddress });

      // 获取池子状态
      const poolState = await this.contractService.getPoolState(poolAddress);

      // TODO: 需要添加获取token0、token1、fee等信息的合约调用
      // 这里暂时返回基本信息
      const poolInfo: PoolInfo = {
        address: poolAddress,
        token0: '', // 需要从合约获取
        token1: '', // 需要从合约获取
        fee: 0, // 需要从合约获取
        liquidity: '0', // 需要从合约获取
        sqrtPriceX96: poolState.sqrtPriceX96,
        tick: poolState.tick
      };

      console.log('✅ 池子信息获取成功', poolInfo);
      return poolInfo;

    } catch (error) {
      this.errorCount++;
      console.error('❌ 获取池子信息失败:', error);
      throw error;
    }
  }

  /**
   * 代币授权
   */
  async approveToken(tokenAddress: string, amount: string): Promise<string> {
    try {
      console.log('🔐 执行代币授权...', { token: tokenAddress, amount });

      const txHash = await this.contractService.approveToken(tokenAddress, amount);
      
      console.log('✅ 代币授权成功', { txHash });
      return txHash;

    } catch (error) {
      this.errorCount++;
      console.error('❌ 代币授权失败:', error);
      throw error;
    }
  }

  /**
   * 获取代币信息
   */
  async getTokenInfo(tokenAddress: string): Promise<any> {
    try {
      const tokenInfo = await this.contractService.getTokenInfo(tokenAddress);
      console.log('✅ 代币信息获取成功', tokenInfo);
      return tokenInfo;
    } catch (error) {
      this.errorCount++;
      console.error('❌ 获取代币信息失败:', error);
      throw error;
    }
  }

  /**
   * 价格转换为范围
   */
  convertPriceToRange(price: number): number {
    // TODO: 实现价格到tick的转换
    // 使用公式: tick = log(price) / log(1.0001)
    return Math.floor(Math.log(price) / Math.log(1.0001));
  }

  /**
   * 范围转换为价格
   */
  convertRangeToPrice(tick: number): number {
    // TODO: 实现tick到价格的转换
    // 使用公式: price = 1.0001^tick
    return Math.pow(1.0001, tick);
  }

  /**
   * 获取协议信息
   */
  getProtocolInfo(): {
    name: string;
    version: string;
    chainId: number;
    contracts: {
      positionManager: string;
      swapRouter: string;
      factory: string;
    };
  } {
    return {
      name: this.protocolName,
      version: this.version,
      chainId: this.chainId,
      contracts: {
        positionManager: this.contractAddresses.POSITION_MANAGER,
        swapRouter: this.contractAddresses.SWAP_ROUTER,
        factory: this.contractAddresses.FACTORY
      }
    };
  }

  /**
   * 计算最优价格范围
   */
  async calculateOptimalRange(
    token0: string, 
    token1: string, 
    strategy: 'conservative' | 'moderate' | 'aggressive'
  ): Promise<{ tickLower: number; tickUpper: number }> {
    try {
      // TODO: 实现最优价格范围计算
      // 1. 获取当前价格
      // 2. 分析历史波动性
      // 3. 根据策略确定范围

      const baseRange = {
        conservative: 0.05,  // ±5%
        moderate: 0.15,      // ±15%
        aggressive: 0.35     // ±35%
      }[strategy];

      // 模拟当前价格 tick
      const currentTick = 0;
      const tickSpacing = 50; // 假设tick间距

      const tickLower = Math.floor((currentTick - baseRange * 1000) / tickSpacing) * tickSpacing;
      const tickUpper = Math.ceil((currentTick + baseRange * 1000) / tickSpacing) * tickSpacing;

      return { tickLower, tickUpper };

    } catch (error) {
      console.error('计算最优价格范围失败:', error);
      throw error;
    }
  }

  /**
   * 估算手续费收益
   */
  async estimateFeeRewards(
    poolAddress: string,
    liquidity: string,
    timeframe: number
  ): Promise<{
    estimatedFees: { token0: string; token1: string };
    apr: number;
  }> {
    try {
      // TODO: 实现手续费收益估算
      // 1. 获取池的历史交易量
      // 2. 计算手续费率
      // 3. 预估收益

      return {
        estimatedFees: {
          token0: '1000000000000000000', // 1 token
          token1: '300000000000000000'   // 0.3 token
        },
        apr: 0.12 // 12% APR
      };

    } catch (error) {
      console.error('估算手续费收益失败:', error);
      throw error;
    }
  }

  /**
   * 验证创建头寸参数
   */
  private validateCreatePositionParams(params: CreatePositionParams): boolean {
    if (!params.token0 || !params.token1) {
      console.error('缺少token地址');
      return false;
    }

    if (!params.fee || ![500, 2500, 10000].includes(params.fee)) {
      console.error('无效的手续费等级');
      return false;
    }

    if (params.tickLower >= params.tickUpper) {
      console.error('价格范围无效');
      return false;
    }

    if (!params.amount0Desired || !params.amount1Desired) {
      console.error('缺少代币数量');
      return false;
    }

    return true;
  }
} 