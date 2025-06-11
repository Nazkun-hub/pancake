/**
 * 🎯 策略引擎 (模块化版本) - 自动化流动性管理策略
 * 
 * 功能特性：
 * - 多实例并行运行
 * - 事件驱动架构
 * - 自动代币交换补充
 * - 智能退出机制
 * - 实时盈亏统计
 * - 容错重试机制
 * 
 * 模块化架构：
 * - ApiService: API调用封装
 * - ExecutionStages: 执行阶段实现
 * - StateManager: 状态管理和推送
 * - Utils: 工具方法和常量
 */

import { EventEmitter } from 'events';
import { injectable, inject } from 'tsyringe';
import { 
  I策略引擎, 
  策略配置, 
  策略实例, 
  策略状态,
  盈亏统计,
  重试配置,
  TYPES,
  ModuleConfig,
  ModuleHealth,
  ModuleMetrics,
  IEventBus
} from '../types/interfaces.js';
import { LiquidityManager } from '../services/LiquidityManager.js';
import { PositionManager } from '../services/PositionManager.js';
import { Web3Service } from '../services/Web3Service.js';
import { ContractService } from '../services/ContractService.js';
import { TickCalculatorService } from '../services/TickCalculatorService.js';
import { 价格监控器 } from './价格监控器.js';

// 模块化组件导入
import { ApiService } from './strategy-engine/ApiService.js';
import { ExecutionStages } from './strategy-engine/ExecutionStages.js';
import { StateManager } from './strategy-engine/StateManager.js';
import { Utils } from './strategy-engine/Utils.js';

@injectable()
export class 策略引擎模块化 extends EventEmitter implements I策略引擎 {
  public readonly name = '策略引擎模块化';
  public readonly version = '2.0.0';
  public readonly dependencies = ['LiquidityManager', 'PositionManager', 'Web3Service', 'ContractService', 'TickCalculatorService'];

  // ==== 📊 模块实例 ====
  private readonly apiService = new ApiService();
  private readonly stateManager: StateManager;
  private executionStages: ExecutionStages;
  
  // 策略实例存储
  private 策略实例集合 = new Map<string, 策略实例>();
  
  // 运行中的监控器
  private 监控器集合 = new Map<string, 价格监控器>();
  
  // 重试配置
  private readonly 重试配置: 重试配置 = {
    初始延迟: 1000,      // 1秒
    最大重试次数: 5,     // 5次
    退避倍数: 2,         // 指数退避
    最大延迟: 30000      // 30秒
  };

  constructor(
    @inject(TYPES.LiquidityManager) private liquidityManager: LiquidityManager,
    @inject(TYPES.PositionManager) private positionManager: PositionManager,
    @inject(TYPES.Web3Service) private web3Service: Web3Service,
    @inject(TYPES.ContractService) private contractService: ContractService,
    @inject(TYPES.TickCalculatorService) private tickCalculatorService: TickCalculatorService,
    @inject(TYPES.EventBus) private eventBus: IEventBus,
    private 价格监控器类: typeof 价格监控器 = 价格监控器
  ) {
    super();
    
    // 初始化状态管理器 - 传递正确的依赖
    this.stateManager = new StateManager(this.tickCalculatorService, this.contractService);
    
    // 初始化执行阶段模块
    this.executionStages = new ExecutionStages(
      this.contractService,
      this.tickCalculatorService,
      this.liquidityManager,
      this.stateManager,
      this.价格监控器类,
      this.监控器集合,
      this.web3Service,
      this.eventBus
    );
  }

  /**
   * 设置WebSocket IO实例
   */
  public setWebSocketIO(io: any) {
    this.stateManager.setWebSocketIO(io);
  }

  // ==== 🔧 模块生命周期管理 ====

  async initialize(config: ModuleConfig): Promise<void> {
    Utils.log('info', '策略引擎模块化版本初始化开始');
    
    await Utils.验证依赖服务({
      liquidityManager: this.liquidityManager,
      contractService: this.contractService,
      web3Service: this.web3Service
    });
    
    Utils.log('complete', '策略引擎模块化版本初始化完成');
  }

  async start(): Promise<void> {
    Utils.log('start', '策略引擎模块化版本启动');
  }

  async stop(): Promise<void> {
    Utils.log('info', '策略引擎模块化版本停止');
    
    // 停止所有监控器
    for (const [实例ID, 监控器] of this.监控器集合) {
      try {
        监控器.停止监控();
        Utils.log('info', `监控器已停止: ${实例ID}`);
      } catch (error) {
        Utils.log('warn', `停止监控器失败: ${实例ID}`, error);
      }
    }
    
    this.监控器集合.clear();
  }

  async healthCheck(): Promise<ModuleHealth> {
    const 运行中实例数 = Array.from(this.策略实例集合.values())
      .filter(实例 => 实例.状态 === '运行中' || 实例.状态 === '监控中').length;
    
    return {
      status: 运行中实例数 > 0 ? 'healthy' : 'warning',
      message: `当前运行${运行中实例数}个策略实例`,
      timestamp: Date.now()
    };
  }

  getMetrics(): ModuleMetrics {
    const 实例总数 = this.策略实例集合.size;
    const 错误实例数 = Array.from(this.策略实例集合.values())
      .filter(实例 => 实例.状态 === '错误').length;
    
    return {
      uptime: Date.now() - 0, // 简化实现
      requestCount: 实例总数,
      errorCount: 错误实例数,
      lastActivity: Date.now()
    };
  }

  // ==== 🎯 策略实例管理 ====

  async 创建策略实例(配置: 策略配置): Promise<string> {
    Utils.log('start', '创建策略实例');
    
    try {
      // 验证配置
      await this.stateManager.验证策略配置(配置);
      
      // 生成实例ID并创建实例
      const 实例ID = this.stateManager.生成实例ID();
      const 实例: 策略实例 = {
        实例ID,
        配置,
        状态: '初始化',
        创建时间: Date.now()
      };
      
      // 保存实例
      this.策略实例集合.set(实例ID, 实例);
      
      Utils.log('complete', `策略实例创建成功: ${实例ID}`);
      return 实例ID;
      
    } catch (error) {
      Utils.log('error', '创建策略实例失败', error);
      throw error;
    }
  }

  async 启动策略(实例ID: string): Promise<void> {
    Utils.log('start', `启动策略: ${实例ID}`);
    
    const 实例 = this.策略实例集合.get(实例ID);
    if (!实例) {
      throw new Error(`策略实例不存在: ${实例ID}`);
    }
    
    if (实例.状态 !== '初始化' && 实例.状态 !== '已暂停') {
      throw new Error(`策略实例状态不允许启动: ${实例.状态}`);
    }
    
    try {
      // 更新状态并开始执行
      this.stateManager.updateAndBroadcastState(实例, {
        状态: '准备中',
        启动时间: Date.now()
      });
      
      // 在后台执行策略流程
      this.执行策略流程(实例ID).catch(error => {
        Utils.处理策略错误(实例ID, error);
      });
      
      Utils.log('complete', `策略启动成功: ${实例ID}`);
      
    } catch (error) {
      await Utils.处理策略错误(实例ID, error);
      throw error;
    }
  }

  async 停止策略(实例ID: string): Promise<void> {
    Utils.log('start', `停止策略: ${实例ID}`);
    
    const 实例 = this.策略实例集合.get(实例ID);
    if (!实例) {
      throw new Error(`策略实例不存在: ${实例ID}`);
    }
    
    // 停止监控器
    const 监控器 = this.监控器集合.get(实例ID);
    if (监控器) {
      监控器.停止监控();
      this.监控器集合.delete(实例ID);
    }
    
    // 更新状态
    this.stateManager.updateAndBroadcastState(实例, {
      状态: '已完成',
      结束时间: Date.now()
    });
    
    Utils.log('complete', `策略停止成功: ${实例ID}`);
  }

  async 暂停策略(实例ID: string): Promise<void> {
    // 简化实现
    throw new Error('暂停功能暂未实现');
  }

  async 恢复策略(实例ID: string): Promise<void> {
    // 简化实现
    throw new Error('恢复功能暂未实现');
  }

  async 删除策略(实例ID: string): Promise<void> {
    Utils.log('start', `删除策略: ${实例ID}`);
    
    // 先停止策略
    try {
      await this.停止策略(实例ID);
    } catch (error) {
      // 停止失败也继续删除
      Utils.log('warn', `停止策略失败，继续删除: ${实例ID}`, error);
    }
    
    // 删除实例
    this.策略实例集合.delete(实例ID);
    
    Utils.log('complete', `策略删除成功: ${实例ID}`);
  }

  async 获取策略状态(实例ID: string): Promise<策略实例> {
    const 实例 = this.策略实例集合.get(实例ID);
    if (!实例) {
      throw new Error(`策略实例不存在: ${实例ID}`);
    }
    return Utils.deepClone(实例);
  }

  async 获取所有策略实例(): Promise<策略实例[]> {
    return Array.from(this.策略实例集合.values()).map(Utils.deepClone);
  }

  // ==== 🎬 策略执行流程 ====

  async 执行策略流程(实例ID: string): Promise<void> {
    const 实例 = this.策略实例集合.get(实例ID);
    if (!实例) {
      throw new Error(`策略实例不存在: ${实例ID}`);
    }
    
    Utils.logStage(0, 'start', 实例ID, ['开始执行策略流程']);
    
    try {
      // 阶段1: 获取市场数据
      Utils.logStage(1, 'start', 实例ID);
      await this.executionStages.阶段1_获取市场数据(实例);
      Utils.logStage(1, 'complete', 实例ID);
      
      // 阶段2: 准备资产
      Utils.logStage(2, 'start', 实例ID);
      await this.executionStages.阶段2_准备资产(实例);
      Utils.logStage(2, 'complete', 实例ID);
      
      // 阶段3: 创建头寸
      Utils.logStage(3, 'start', 实例ID);
      await this.executionStages.阶段3_创建头寸(实例, this.重试配置);
      Utils.logStage(3, 'complete', 实例ID);
      
      // ⚠️ 重要：在阶段4之前设置状态为'运行中'
      this.stateManager.updateAndBroadcastState(实例, { 状态: '运行中' });
      
      // 阶段4: 开始监控
      Utils.logStage(4, 'start', 实例ID);
      await this.executionStages.阶段4_开始监控(实例);
      Utils.logStage(4, 'complete', 实例ID);
      
      Utils.log('complete', `策略流程执行完成: ${实例ID}`);
      
    } catch (error) {
      await Utils.处理策略错误(实例ID, error);
      throw error;
    }
  }

  // ==== 🚪 策略退出 ====

  async 执行策略退出(策略ID: string, 原因?: string): Promise<void> {
    Utils.log('start', `执行策略退出: ${策略ID}`, 原因 ? { 原因 } : undefined);
    
    const 实例 = this.策略实例集合.get(策略ID);
    if (!实例) {
      throw new Error(`策略实例不存在: ${策略ID}`);
    }
    
    try {
      // 更新退出状态
      this.stateManager.updateAndBroadcastState(实例, {
        状态: '退出中',
        退出时间: Date.now(),
        退出原因: 原因 || '用户主动退出'
      });
      
      // 停止监控
      const 监控器 = this.监控器集合.get(策略ID);
      if (监控器) {
        监控器.停止监控();
        this.监控器集合.delete(策略ID);
      }
      
      // 最终状态更新
      this.stateManager.updateAndBroadcastState(实例, {
        状态: '已退出',
        结束时间: Date.now()
      });
      
      Utils.log('complete', `策略退出完成: ${策略ID}`);
      
    } catch (error) {
      Utils.log('error', `策略退出失败: ${策略ID}`, error);
      throw error;
    }
  }
} 