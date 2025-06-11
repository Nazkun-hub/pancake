import { injectable, inject } from 'tsyringe';
import { 
  IPoolManager, 
  IEventBus,
  IConfigManager,
  ILiquidityService,
  Pool, 
  PoolConfig, 
  PoolStatus, 
  Position,
  ModuleConfig, 
  ModuleHealth, 
  ModuleMetrics,
  TYPES 
} from '../types/interfaces.js';

/**
 * 池管理器实现
 * 负责流动性池的创建、监控和管理
 */
@injectable()
export class PoolManager implements IPoolManager {
  public readonly name = 'PoolManager';
  public readonly version = '1.0.0';
  public readonly dependencies = ['EventBus', 'ConfigManager', 'LiquidityService'];

  private pools = new Map<string, Pool>();
  private poolCallbacks: Array<(pool: Pool) => void> = [];
  private statusCallbacks: Array<(poolId: string, status: PoolStatus) => void> = [];
  private isStarted = false;
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private lastActivity = Date.now();
  private monitoringInterval?: NodeJS.Timeout;

  constructor(
    @inject(TYPES.EventBus) private eventBus: IEventBus,
    @inject(TYPES.ConfigManager) private configManager: IConfigManager,
    @inject(TYPES.LiquidityService) private liquidityService: ILiquidityService
  ) {}

  /**
   * 初始化池管理器
   */
  async initialize(config: ModuleConfig): Promise<void> {
    console.log('🔄 初始化池管理器...');
    
    // 加载已保存的池配置
    await this.loadExistingPools();
    
    // 设置监控间隔
    const interval = config.monitoringInterval || 30000; // 默认30秒
    this.setupPoolMonitoring(interval);
    
    // 监听系统事件
    this.setupEventListeners();
    
    console.log('✅ 池管理器初始化完成');
  }

  /**
   * 启动池管理器
   */
  async start(): Promise<void> {
    this.isStarted = true;
    this.startTime = Date.now();
    
    // 启动所有池
    for (const pool of this.pools.values()) {
      if (pool.config.autoRebalance) {
        await this.startPoolMonitoring(pool.id);
      }
    }
    
    console.log('🚀 池管理器已启动');
  }

  /**
   * 停止池管理器
   */
  async stop(): Promise<void> {
    this.isStarted = false;
    
    // 清理监控
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    // 停止所有池
    for (const poolId of this.pools.keys()) {
      await this.stopPool(poolId);
    }
    
    console.log('⏹️ 池管理器已停止');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ModuleHealth> {
    try {
      const activePoolsCount = Array.from(this.pools.values())
        .filter(pool => pool.status.isActive).length;
      
      const healthyPoolsCount = Array.from(this.pools.values())
        .filter(pool => pool.status.isHealthy).length;

      if (activePoolsCount === 0) {
        return {
          status: 'warning',
          message: '没有活跃的池',
          timestamp: Date.now()
        };
      }

      if (healthyPoolsCount < activePoolsCount) {
        return {
          status: 'warning',
          message: `${activePoolsCount - healthyPoolsCount} 个池状态异常`,
          timestamp: Date.now()
        };
      }

      return {
        status: this.isStarted ? 'healthy' : 'error',
        message: this.isStarted ? 
          `池管理器运行正常 (${activePoolsCount} 个活跃池)` : 
          '池管理器未启动',
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        status: 'error',
        message: `池管理器健康检查失败: ${error}`,
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
   * 创建新池
   */
  async createPool(config: PoolConfig): Promise<string> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      // 验证配置
      if (!this.validatePoolConfig(config)) {
        throw new Error('池配置验证失败');
      }

      // 检查是否已存在
      if (this.pools.has(config.id)) {
        throw new Error(`池 ${config.id} 已存在`);
      }

      // 创建池实例
      const pool: Pool = {
        id: config.id,
        config,
        status: {
          isActive: false,
          isHealthy: true,
          lastCheck: Date.now()
        },
        createdAt: Date.now(),
        lastUpdate: Date.now(),
        positions: []
      };

      this.pools.set(config.id, pool);

      // 保存配置
      await this.savePoolConfig(pool);

      // 发布事件
      await this.eventBus.publish({
        type: 'PoolCreated',
        data: { pool },
        timestamp: Date.now(),
        source: this.name
      });

      // 通知回调
      this.notifyPoolCallbacks(pool);

      console.log(`✅ 池创建成功: ${config.id}`);
      return config.id;

    } catch (error) {
      this.errorCount++;
      console.error(`❌ 创建池失败 [${config.id}]:`, error);
      throw error;
    }
  }

  /**
   * 获取池信息
   */
  async getPool(poolId: string): Promise<Pool> {
    this.requestCount++;
    this.lastActivity = Date.now();

    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error(`池 ${poolId} 不存在`);
    }

    return { ...pool }; // 返回副本
  }

  /**
   * 启动池
   */
  async startPool(poolId: string): Promise<void> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      const pool = this.pools.get(poolId);
      if (!pool) {
        throw new Error(`池 ${poolId} 不存在`);
      }

      if (pool.status.isActive) {
        console.log(`⚠️ 池 ${poolId} 已经是活跃状态`);
        return;
      }

      // 更新状态
      pool.status.isActive = true;
      pool.status.lastCheck = Date.now();
      pool.lastUpdate = Date.now();

      // 如果启用自动再平衡，开始监控
      if (pool.config.autoRebalance) {
        await this.startPoolMonitoring(poolId);
      }

      // 发布事件
      await this.eventBus.publish({
        type: 'PoolStarted',
        data: { poolId, timestamp: Date.now() },
        timestamp: Date.now(),
        source: this.name
      });

      // 通知回调
      this.notifyStatusCallbacks(poolId, pool.status);

      console.log(`🚀 池启动成功: ${poolId}`);

    } catch (error) {
      this.errorCount++;
      console.error(`❌ 启动池失败 [${poolId}]:`, error);
      throw error;
    }
  }

  /**
   * 停止池
   */
  async stopPool(poolId: string): Promise<void> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      const pool = this.pools.get(poolId);
      if (!pool) {
        throw new Error(`池 ${poolId} 不存在`);
      }

      if (!pool.status.isActive) {
        console.log(`⚠️ 池 ${poolId} 已经是停止状态`);
        return;
      }

      // 更新状态
      pool.status.isActive = false;
      pool.status.lastCheck = Date.now();
      pool.lastUpdate = Date.now();

      // 发布事件
      await this.eventBus.publish({
        type: 'PoolStopped',
        data: { poolId, timestamp: Date.now() },
        timestamp: Date.now(),
        source: this.name
      });

      // 通知回调
      this.notifyStatusCallbacks(poolId, pool.status);

      console.log(`⏹️ 池停止成功: ${poolId}`);

    } catch (error) {
      this.errorCount++;
      console.error(`❌ 停止池失败 [${poolId}]:`, error);
      throw error;
    }
  }

  /**
   * 列出所有池
   */
  async listPools(): Promise<Pool[]> {
    this.requestCount++;
    this.lastActivity = Date.now();

    return Array.from(this.pools.values()).map(pool => ({ ...pool }));
  }

  /**
   * 注册池创建回调
   */
  onPoolCreated(callback: (pool: Pool) => void): void {
    this.poolCallbacks.push(callback);
  }

  /**
   * 注册池状态变化回调
   */
  onPoolStatusChanged(callback: (poolId: string, status: PoolStatus) => void): void {
    this.statusCallbacks.push(callback);
  }

  /**
   * 验证池配置
   */
  private validatePoolConfig(config: PoolConfig): boolean {
    if (!config.id || !config.name) {
      console.error('池配置缺少必需字段: id 或 name');
      return false;
    }

    if (!config.tokenA || !config.tokenB) {
      console.error('池配置缺少必需字段: tokenA 或 tokenB');
      return false;
    }

    if (config.fee <= 0) {
      console.error('池配置错误: fee 必须大于 0');
      return false;
    }

    return true;
  }

  /**
   * 加载已有池配置
   */
  private async loadExistingPools(): Promise<void> {
    try {
      // 这里会从配置管理器加载已保存的池
      console.log('📖 加载已有池配置...');
      // TODO: 实现从存储加载池配置
    } catch (error) {
      console.error('加载池配置失败:', error);
    }
  }

  /**
   * 保存池配置
   */
  private async savePoolConfig(pool: Pool): Promise<void> {
    try {
      // 这里会保存池配置到配置管理器
      console.log(`💾 保存池配置: ${pool.id}`);
      // TODO: 实现保存池配置到存储
    } catch (error) {
      console.error(`保存池配置失败 [${pool.id}]:`, error);
    }
  }

  /**
   * 设置池监控
   */
  private setupPoolMonitoring(interval: number): void {
    this.monitoringInterval = setInterval(async () => {
      await this.checkAllPools();
    }, interval);
  }

  /**
   * 检查所有池状态
   */
  private async checkAllPools(): Promise<void> {
    for (const pool of this.pools.values()) {
      if (pool.status.isActive) {
        await this.checkPoolHealth(pool);
      }
    }
  }

  /**
   * 检查单个池健康状态
   */
  private async checkPoolHealth(pool: Pool): Promise<void> {
    try {
      // 更新检查时间
      pool.status.lastCheck = Date.now();
      pool.lastUpdate = Date.now();

      // TODO: 实现具体的健康检查逻辑
      // 例如：检查价格范围、流动性状态等

      // 如果状态发生变化，通知回调
      this.notifyStatusCallbacks(pool.id, pool.status);

    } catch (error) {
      console.error(`池健康检查失败 [${pool.id}]:`, error);
      
      // 标记为不健康
      pool.status.isHealthy = false;
      pool.status.errorMessage = error instanceof Error ? error.message : String(error);
      
      this.notifyStatusCallbacks(pool.id, pool.status);
    }
  }

  /**
   * 启动单个池监控
   */
  private async startPoolMonitoring(poolId: string): Promise<void> {
    console.log(`👀 开始监控池: ${poolId}`);
    // TODO: 实现具体的池监控逻辑
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听系统事件
    this.eventBus.subscribe('SystemStopping', async () => {
      await this.stop();
    });
  }

  /**
   * 通知池创建回调
   */
  private notifyPoolCallbacks(pool: Pool): void {
    this.poolCallbacks.forEach(callback => {
      try {
        callback(pool);
      } catch (error) {
        console.error('池创建回调执行失败:', error);
      }
    });
  }

  /**
   * 通知状态变化回调
   */
  private notifyStatusCallbacks(poolId: string, status: PoolStatus): void {
    this.statusCallbacks.forEach(callback => {
      try {
        callback(poolId, status);
      } catch (error) {
        console.error('池状态变化回调执行失败:', error);
      }
    });
  }
} 