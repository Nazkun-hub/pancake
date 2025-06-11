/**
 * 核心模块接口定义
 * 支持高度模块化架构的基础接口
 */

// ==== 基础模块接口 ====
export interface ModuleConfig {
  [key: string]: any;
}

export interface ModuleHealth {
  status: 'healthy' | 'warning' | 'error';
  message: string;
  timestamp: number;
}

export interface ModuleMetrics {
  uptime: number;
  requestCount: number;
  errorCount: number;
  lastActivity: number;
}

export interface IModule {
  readonly name: string;
  readonly version: string;
  readonly dependencies: string[];
  
  initialize(config: ModuleConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<ModuleHealth>;
  getMetrics(): ModuleMetrics;
}

export interface IService<T = any> extends IModule {
  execute(params: T): Promise<any>;
  validate(params: T): boolean;
}

export interface IAdapter<T = any> extends IModule {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  execute(operation: T): Promise<any>;
}

// ==== 事件系统接口 ====
export interface Event {
  type: string;
  data: any;
  timestamp: number;
  source: string;
}

export interface EventHandler {
  (event: Event): Promise<void> | void;
}

export interface IEventBus extends IModule {
  publish(event: Event): Promise<void>;
  subscribe(eventType: string, handler: EventHandler): string;
  unsubscribe(subscriptionId: string): void;
  getEventHistory(eventType: string, timeframe: Timeframe): Promise<Event[]>;
}

// ==== 业务逻辑层接口 ====
export interface PoolConfig {
  id: string;
  name: string;
  tokenA: string;
  tokenB: string;
  fee: number;
  protocol: string;
  strategy?: string;
  riskLevel: 'low' | 'medium' | 'high';
  autoRebalance: boolean;
}

export interface Pool {
  id: string;
  config: PoolConfig;
  status: PoolStatus;
  createdAt: number;
  lastUpdate: number;
  positions: Position[];
}

export interface PoolStatus {
  isActive: boolean;
  isHealthy: boolean;
  errorMessage?: string;
  lastCheck: number;
}

export interface Position {
  id: string;
  poolId: string;
  tokenId?: number;
  tokenA: TokenAmount;
  tokenB: TokenAmount;
  minPrice: number;
  maxPrice: number;
  fees: TokenAmount[];
  inRange: boolean;
  value: number;
  createdAt: number;
}

export interface TokenAmount {
  token: string;
  amount: string;
  decimals: number;
}

export interface IPoolManager extends IModule {
  createPool(config: PoolConfig): Promise<string>;
  getPool(poolId: string): Promise<Pool>;
  startPool(poolId: string): Promise<void>;
  stopPool(poolId: string): Promise<void>;
  listPools(): Promise<Pool[]>;
  
  onPoolCreated(callback: (pool: Pool) => void): void;
  onPoolStatusChanged(callback: (poolId: string, status: PoolStatus) => void): void;
}

// ==== 策略管理接口 ====
export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  parameters: StrategyParameter[];
  riskLevel: 'low' | 'medium' | 'high';
  protocols: string[];
}

export interface StrategyParameter {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'range';
  default: any;
  min?: number;
  max?: number;
  required: boolean;
}

// ==== 新的简化策略架构接口 ====

/**
 * 策略配置接口
 */
export interface StrategyConfig {
  [key: string]: any;
}

/**
 * 策略操作记录
 */
export interface StrategyAction {
  type: 'create_position' | 'remove_position' | 'rebalance' | 'collect_fees' | 'monitor';
  timestamp: number;
  params: any;
  result?: any;
}

/**
 * 策略执行结果接口
 */
export interface StrategyResult {
  success: boolean;
  message: string;
  actions?: StrategyAction[];
  nextRunTime?: Date;
  data?: any;
  error?: string;
  metrics?: {
    executionTime: number;
    gasUsed?: number;
    profit?: number;
  };
}

/**
 * 策略执行上下文接口 - 提供所有现有服务
 */
export interface StrategyContext {
  // 现有服务直接注入
  readonly contractService: any; // IContractService 
  readonly web3Service: any; // IWeb3Service
  readonly priceService: any; // IPriceService
  readonly liquidityService?: any; // ILiquidityService
  readonly transactionService?: any; // ITransactionService
  readonly gasService?: any; // IGasService
  
  // 策略配置和状态
  readonly config: StrategyConfig;
  readonly logger: any; // ILogger
  
  // 简化的工具函数
  readonly utils: {
    getCurrentPrice(poolAddress: string): Promise<number>;
    getPositions(userAddress: string): Promise<Position[]>;
    createPosition(params: CreatePositionParams): Promise<string>;
    removePosition(tokenId: string): Promise<boolean>;
    collectFees(tokenId: string): Promise<boolean>;
    getPoolInfo(poolAddress: string): Promise<PoolInfo>;
    calculateOptimalRange(poolAddress: string, strategy: string): Promise<PriceRange>;
  };
}

/**
 * 简化的策略接口 - 用户只需实现这个接口
 */
export interface IStrategy {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  
  // 策略执行入口 - 用户在这里实现自己的逻辑
  execute(context: StrategyContext): Promise<StrategyResult>;
  
  // 策略配置（可选）
  getDefaultConfig?(): StrategyConfig;
  
  // 策略验证（可选）
  validate?(config: StrategyConfig): boolean;
}

/**
 * 策略实例接口
 */
export interface StrategyInstance {
  readonly instanceId: string;
  readonly strategyId: string;
  readonly config: StrategyConfig;
  readonly status: 'created' | 'running' | 'paused' | 'stopped' | 'error';
  readonly createdAt: number;
  readonly lastExecuted?: number;
  readonly nextExecution?: number;
  readonly executionHistory: StrategyExecution[];
}

/**
 * 策略执行记录
 */
export interface StrategyExecution {
  timestamp: number;
  result: StrategyResult;
  duration: number;
  gasUsed?: number;
}

/**
 * 策略调度配置
 */
export interface StrategySchedule {
  type: 'interval' | 'cron' | 'event' | 'manual';
  value?: number; // for interval in ms
  cronExpression?: string; // for cron
  eventType?: string; // for event-driven
  enabled: boolean;
}

/**
 * 策略引擎接口
 */
// 策略接口将重新定义

/**
 * 🎯 新策略模块 - 类型定义
 */

/**
 * 策略配置接口
 */
export interface 策略配置 {
  池地址: string;                    // V3池合约地址
  代币数量: number;                  // 投入的主要代币数量
  代币范围: {                        // price range设置
    下限tick: number;
    上限tick: number;
    下限百分比?: number;             // 价格下限百分比 (如 -5 表示-5%)
    上限百分比?: number;             // 价格上限百分比 (如 5 表示+5%)
  };
  主要代币: 'token0' | 'token1';     // 指定主要投入的代币类型
  // 🔧 修改: 区分两种不同的滑点
  OKX交易滑点: number;               // OKX DEX API交易滑点 (小数形式，如 0.5 表示0.5%)
  流动性滑点: number;                // PancakeSwap流动性操作滑点 (百分比形式，如 20 表示20%)
  // 🔧 保持向后兼容
  滑点设置?: number;                 // @deprecated 使用 OKX交易滑点 替代
  自动退出: {
    启用超时退出: boolean;
    超时时长: number;                // 毫秒
  };
  交换缓冲百分比: number;            // 代币交换时的缓冲百分比
}

/**
 * 策略状态枚举
 */
export type 策略状态 = '初始化' | '准备中' | '运行中' | '监控中' | '退出中' | '已退出' | '已完成' | '已暂停' | '错误';

/**
 * 资产准备结果接口
 */
export interface 资产准备结果 {
  交换记录: any[];
  最终余额: {
    token0: string;
    token1: string;
  };
  满足需求: boolean;
  准备完成时间: number;
}

/**
 * 头寸信息接口
 */
export interface 头寸信息 {
  tokenId: number;
  交易哈希: string;
  创建时间: number;
  tick范围: {
    下限: number;
    上限: number;
  };
  投入数量: {
    token0: string;
    token1: string;
  };
  状态: '活跃' | '已移除' | '超出范围';
}

/**
 * 策略实例接口
 */
export interface 策略实例 {
  实例ID: string;
  配置: 策略配置;
  状态: 策略状态;
  创建时间: number;
  启动时间?: number;
  结束时间?: number;
  监控开始时间?: number;
  退出时间?: number;              // 新增: 策略退出时间
  退出原因?: string;              // 新增: 退出原因
  错误信息?: string;
  重启次数?: number;              // 🔧 新增: 策略重启次数
  原始价格范围配置?: {            // 🔧 新增: 保存原始百分比配置，用于重新开始时重计算
    下限百分比: number;
    上限百分比: number;
    费率: number;
  };
  执行进度?: {
    当前阶段: number;
    阶段描述: string;
  };
  市场数据?: 市场数据;
  资产准备结果?: 资产准备结果;
  头寸信息?: 头寸信息;
  监控器?: any;                   // 新增: 价格监控器实例
}

/**
 * 盈亏统计接口
 */
export interface 盈亏统计 {
  基准代币: 'USDT' | 'USDC' | 'WBNB';
  初始价值: number;
  最终价值: number;
  盈亏金额: number;
  盈亏百分比: number;
  交易费用: number;
  Gas费用: number;
  净盈亏: number;
}

/**
 * 重试配置接口
 */
export interface 重试配置 {
  初始延迟: number;      // 1000ms
  最大重试次数: number;  // 5次
  退避倍数: number;      // 2倍
  最大延迟: number;      // 30000ms
}

/**
 * 策略引擎接口
 */
export interface I策略引擎 extends IModule {
  // 策略实例管理
  创建策略实例(配置: 策略配置): Promise<string>;
  启动策略(实例ID: string): Promise<void>;
  停止策略(实例ID: string): Promise<void>;
  暂停策略(实例ID: string): Promise<void>;
  恢复策略(实例ID: string): Promise<void>;
  删除策略(实例ID: string): Promise<void>;
  
  // 策略状态查询
  获取策略状态(实例ID: string): Promise<策略实例>;
  获取所有策略实例(): Promise<策略实例[]>;
  
  // 策略执行
  执行策略流程(实例ID: string): Promise<void>;
  
  // 事件监听
  on(事件: string, 回调: Function): void;
  off(事件: string, 回调: Function): void;
}

/**
 * 价格监控器接口
 */
export interface I价格监控器 {
  轮询间隔: number;        // 3000ms
  开始监控(池地址: string, tick范围: { 下限: number; 上限: number }): void;
  停止监控(): void;
  是否在范围内(): boolean;
  获取当前tick(): Promise<number>;
  on(事件: string, 回调: Function): void;
}

// ==== 风险管理接口 ====
export interface RiskAssessment {
  level: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  factors: RiskFactor[];
  recommendations: string[];
}

export interface RiskFactor {
  name: string;
  weight: number;
  value: number;
  description: string;
}

export interface RiskRule {
  name: string;
  condition: string;
  action: 'warn' | 'block' | 'pause';
  threshold: number;
}

export interface RiskAlert {
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  poolId?: string;
  timestamp: number;
  resolved: boolean;
}

export interface IRiskManager extends IModule {
  assessRisk(operation: Operation): Promise<RiskAssessment>;
  checkLimits(poolId: string, operation: Operation): Promise<boolean>;
  setRiskRules(rules: RiskRule[]): Promise<void>;
  startRiskMonitoring(poolId: string): Promise<void>;
  onRiskAlert(callback: (alert: RiskAlert) => void): void;
}

// ==== 服务层接口 ====
export interface AddLiquidityParams {
  poolAddress: string;
  tokenA: TokenAmount;
  tokenB: TokenAmount;
  minPrice: number;
  maxPrice: number;
  slippage: number;
  deadline: number;
  gasSettings?: GasSettings;
}

export interface RemoveLiquidityParams {
  tokenId: number;
  liquidity: string;
  amount0Min: string;
  amount1Min: string;
  deadline: number;
  gasSettings?: GasSettings;
}

export interface PositionInfo {
  tokenId: number;
  owner: string;
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  feeGrowthInside0LastX128: string;
  feeGrowthInside1LastX128: string;
  tokensOwed0: string;
  tokensOwed1: string;
}

export interface LiquidityOperation {
  type: 'add' | 'remove' | 'collect';
  params: any;
  priority: 'low' | 'medium' | 'high';
}

export interface BatchResult {
  success: boolean;
  results: Array<{
    operation: LiquidityOperation;
    result: any;
    error?: string;
  }>;
  totalGasUsed: number;
  totalCost: number;
}

export interface ILiquidityService extends IService {
  addLiquidity(params: AddLiquidityParams): Promise<TransactionResult>;
  removeLiquidity(params: RemoveLiquidityParams): Promise<TransactionResult>;
  getPositionInfo(positionId: string): Promise<PositionInfo>;
  batchOperations(operations: LiquidityOperation[]): Promise<BatchResult>;
}

// ==== 价格服务接口 ====
export interface Price {
  token0: string;
  token1: string;
  price: number;
  timestamp: number;
  source: string;
}

export interface PriceHistory {
  prices: Price[];
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
}

export interface PriceUpdateCallback {
  (price: Price): void;
}

export interface Timeframe {
  unit: 'minute' | 'hour' | 'day' | 'week';
  value: number;
}

export interface IPriceService extends IService {
  getCurrentPrice(poolAddress: string): Promise<Price>;
  getPriceHistory(poolAddress: string, timeframe: Timeframe): Promise<PriceHistory>;
  subscribePriceUpdates(poolAddress: string, callback: PriceUpdateCallback): string;
  unsubscribePriceUpdates(subscriptionId: string): void;
}

// ==== 交易服务接口 ====
export interface Transaction {
  to: string;
  data: string;
  value: string;
  gasLimit: string;
  gasPrice: string;
  nonce?: number;
}

export interface GasEstimate {
  gasLimit: number;
  gasPrices: GasPrices;
  estimatedCost: number;
  recommendedSettings: GasSettings;
}

export interface GasPrices {
  slow: number;
  standard: number;
  fast: number;
  instant: number;
}

export interface GasSettings {
  gasPrice: number;
  gasLimit: number;
  priorityFee?: number;
  maxFeePerGas?: number;
}

export interface TransactionResult {
  hash: string;
  blockNumber?: number;
  gasUsed?: number;
  status: 'pending' | 'confirmed' | 'failed';
  error?: string;
}

export interface TransactionReceipt {
  transactionHash: string;
  blockNumber: number;
  gasUsed: number;
  status: number;
  logs: any[];
}

export interface RetryConfig {
  maxRetries: number;
  delay: number;
  backoff: 'linear' | 'exponential';
}

export interface ITransactionService extends IService {
  buildTransaction(operation: Operation): Promise<Transaction>;
  estimateGas(transaction: Transaction): Promise<GasEstimate>;
  sendTransaction(transaction: Transaction): Promise<TransactionResult>;
  waitForConfirmation(txHash: string): Promise<TransactionReceipt>;
  sendWithRetry(transaction: Transaction, retryConfig: RetryConfig): Promise<TransactionResult>;
}

// ==== Gas服务接口（BSC专用）====
export interface GasPreferences {
  preferredSpeed: 'slow' | 'standard' | 'fast' | 'instant';
  maxGasPrice: number;
  confirmBeforeHighGas: boolean;
  autoAdjustment: boolean;
}

export interface IGasService extends IService {
  getCurrentGasPrices(): Promise<GasPrices>;
  estimateGas(operation: Operation): Promise<GasEstimate>;
  getUserGasPreferences(userId: string): Promise<GasPreferences>;
  setUserGasPreferences(userId: string, preferences: GasPreferences): Promise<void>;
}

// ==== 协议适配层接口 ====
export interface CreatePositionParams {
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  amount0Desired: string;
  amount1Desired: string;
  amount0Min: string;
  amount1Min: string;
  recipient: string;
  deadline: number;
}

export interface PoolInfo {
  address: string;
  token0: string;
  token1: string;
  fee: number;
  liquidity: string;
  sqrtPriceX96: string;
  tick: number;
}

export interface PriceRange {
  min: number;
  max: number;
  current: number;
}

export interface Operation {
  type: string;
  params: any;
  priority: 'low' | 'medium' | 'high';
}

export abstract class ProtocolAdapter implements IAdapter {
  abstract readonly protocolName: string;
  abstract readonly chainId: number;
  
  abstract createPosition(params: CreatePositionParams): Promise<string>;
  abstract removePosition(positionId: string): Promise<boolean>;
  abstract getPoolInfo(poolAddress: string): Promise<PoolInfo>;
  abstract convertPriceToRange(price: number): number;
  abstract convertRangeToPrice(range: number): number;
  
  // IAdapter接口实现
  abstract name: string;
  abstract version: string;
  abstract dependencies: string[];
  abstract initialize(config: ModuleConfig): Promise<void>;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract healthCheck(): Promise<ModuleHealth>;
  abstract getMetrics(): ModuleMetrics;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): boolean;
  abstract execute(operation: Operation): Promise<any>;
}

// ==== 基础设施层接口 ====
export interface IDataStorage extends IModule {
  save<T>(key: string, data: T): Promise<void>;
  load<T>(key: string): Promise<T | null>;
  delete(key: string): Promise<void>;
  list(pattern: string): Promise<string[]>;
  saveBatch(items: Array<{key: string, data: any}>): Promise<void>;
  loadBatch<T>(keys: string[]): Promise<Array<T | null>>;
}

export interface ConfigChangeCallback {
  (config: any): void;
}

export interface ConfigSchema {
  [key: string]: any;
}

export interface IConfigManager extends IModule {
  getConfig<T>(moduleName: string): Promise<T>;
  setConfig<T>(moduleName: string, config: T): Promise<void>;
  watchConfig(moduleName: string, callback: ConfigChangeCallback): string;
  validateConfig<T>(config: T, schema: ConfigSchema): boolean;
}

// ==== 依赖注入相关 ====
export const TYPES = {
  // 业务层
  PoolManager: Symbol.for('PoolManager'),
  策略引擎: Symbol.for('策略引擎'),
  RiskManager: Symbol.for('RiskManager'),
  AnalyticsManager: Symbol.for('AnalyticsManager'),
  
  // 服务层
  LiquidityService: Symbol.for('LiquidityService'),
  LiquidityManager: Symbol.for('LiquidityManager'),
  PositionManager: Symbol.for('PositionManager'),
  TickCalculatorService: Symbol.for('TickCalculatorService'),
  PriceService: Symbol.for('PriceService'),
  TransactionService: Symbol.for('TransactionService'),
  GasService: Symbol.for('GasService'),
  SecurityService: Symbol.for('SecurityService'),
  CryptoService: Symbol.for('CryptoService'),
  Web3Service: Symbol.for('Web3Service'),
  ContractService: Symbol.for('ContractService'),
  
  // 协议适配层
  ProtocolManager: Symbol.for('ProtocolManager'),
  PancakeSwapV3Adapter: Symbol.for('PancakeSwapV3Adapter'),
  
  // 基础设施层
  DataStorage: Symbol.for('DataStorage'),
  ConfigManager: Symbol.for('ConfigManager'),
  EventBus: Symbol.for('EventBus'),
  LoggerService: Symbol.for('LoggerService'),
  CacheService: Symbol.for('CacheService')
};

/**
 * 市场数据接口
 */
export interface 市场数据 {
  池子状态: any;
  当前tick: number;
  当前价格: number;
  token0信息: any;
  token1信息: any;
  价格信息: {
    token0价格_相对token1: number;
    token1价格_相对token0: number;
    小数位调整价格: number;
  };
  代币需求量?: {  // 设为可选，因为阶段1不再计算
    token0需求量: number;
    token1需求量: number;
    计算说明: string;
  };
  数据获取时间: number;
} 