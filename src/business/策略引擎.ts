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
 * - 持久化存储
 * 
 * 模块化架构：
 * - ApiService: API调用封装
 * - ExecutionStages: 执行阶段实现
 * - StateManager: 状态管理和推送
 * - Utils: 工具方法和常量
 * - Persistence: 持久化存储
 */

import { EventEmitter } from 'events';
import { injectable, inject } from 'tsyringe';
import * as fs from 'fs';
import * as path from 'path';
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
export class 策略引擎 extends EventEmitter implements I策略引擎 {
  public readonly name = '策略引擎';
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
  
  // 持久化配置
  private readonly 持久化配置 = {
    数据目录: './data/strategies',
    实例文件: 'strategy-instances.json',
    状态文件: 'strategy-states.json',
    备份目录: './data/backups'
  };
  
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
    
    // 初始化执行阶段模块 - 传入web3Service依赖
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
    
    // 初始化持久化目录
    await this.初始化持久化目录();
    
    // 加载已保存的策略实例
    await this.加载持久化策略();
    
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
    
    // 保存当前策略状态
    await this.保存持久化策略();
    
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

  // ==== 💾 持久化管理 ====

  /**
   * 初始化持久化目录
   */
  private async 初始化持久化目录(): Promise<void> {
    try {
      const directories = [
        this.持久化配置.数据目录,
        this.持久化配置.备份目录
      ];

      for (const dir of directories) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          Utils.log('info', `创建持久化目录: ${dir}`);
        }
      }
    } catch (error) {
      Utils.log('error', '初始化持久化目录失败', error);
      throw error;
    }
  }

  /**
   * 加载持久化策略
   */
  private async 加载持久化策略(): Promise<void> {
    try {
      const 实例文件路径 = path.join(this.持久化配置.数据目录, this.持久化配置.实例文件);
      
      if (fs.existsSync(实例文件路径)) {
        const 数据 = fs.readFileSync(实例文件路径, 'utf8');
        const 实例数组: 策略实例[] = JSON.parse(数据);
        
        // 重新构建策略实例集合
        this.策略实例集合.clear();
        
        for (const 实例 of 实例数组) {
          this.策略实例集合.set(实例.实例ID, 实例);
          Utils.log('info', `加载策略实例: ${实例.实例ID} (状态: ${实例.状态})`);
        }
        
        Utils.log('complete', `成功加载 ${实例数组.length} 个策略实例`);
      } else {
        Utils.log('info', '未找到持久化策略文件，从空白状态开始');
      }
    } catch (error) {
      Utils.log('error', '加载持久化策略失败', error);
      // 不抛出错误，允许系统继续启动
    }
  }

  /**
   * 保存持久化策略
   */
  private async 保存持久化策略(): Promise<void> {
    try {
      const 实例数组 = Array.from(this.策略实例集合.values());
      const 数据 = JSON.stringify(实例数组, null, 2);
      
      const 实例文件路径 = path.join(this.持久化配置.数据目录, this.持久化配置.实例文件);
      
      // 创建备份
      await this.创建备份(实例文件路径);
      
      // 保存当前数据
      fs.writeFileSync(实例文件路径, 数据, 'utf8');
      
      Utils.log('info', `保存 ${实例数组.length} 个策略实例到持久化存储`);
    } catch (error) {
      Utils.log('error', '保存持久化策略失败', error);
      throw error;
    }
  }

  /**
   * 创建备份
   */
  private async 创建备份(文件路径: string): Promise<void> {
    try {
      if (fs.existsSync(文件路径)) {
        const 文件名 = path.basename(文件路径);
        const 时间戳 = new Date().toISOString().replace(/[:.]/g, '-');
        const 备份文件名 = `${时间戳}_${文件名}`;
        const 备份路径 = path.join(this.持久化配置.备份目录, 备份文件名);
        
        fs.copyFileSync(文件路径, 备份路径);
        Utils.log('info', `创建备份: ${备份路径}`);
        
        // 清理老备份（保留最近10个）
        await this.清理老备份();
      }
    } catch (error) {
      Utils.log('warn', '创建备份失败', error);
      // 备份失败不影响主要功能
    }
  }

  /**
   * 清理老备份
   */
  private async 清理老备份(): Promise<void> {
    try {
      const 备份文件 = fs.readdirSync(this.持久化配置.备份目录)
        .filter(file => file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.持久化配置.备份目录, file),
          stat: fs.statSync(path.join(this.持久化配置.备份目录, file))
        }))
        .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

      // 保留最近10个备份
      const 需要删除的文件 = 备份文件.slice(10);
      
      for (const file of 需要删除的文件) {
        fs.unlinkSync(file.path);
        Utils.log('info', `删除老备份: ${file.name}`);
      }
    } catch (error) {
      Utils.log('warn', '清理老备份失败', error);
    }
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
    
    // 🔧 新增：如果配置包含原始价格范围配置，保存到实例中
    if ((配置 as any).原始价格范围配置) {
      实例.原始价格范围配置 = (配置 as any).原始价格范围配置;
    }
    
    // 保存实例
      this.策略实例集合.set(实例ID, 实例);
      
      // 🔴 立即持久化保存
      await this.保存持久化策略();
      
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
    
    // 检查状态是否允许启动
    if (实例.状态 === '运行中' || 实例.状态 === '监控中') {
      throw new Error(`策略实例已在运行: ${实例ID}`);
    }
    
    // 🔧 新增：检查是否为重新开始场景，需要重新计算tick范围
    if (实例.状态 === '已退出' || 实例.状态 === '已完成') {
      Utils.log('info', `检测到重新开始场景，将基于当前市场价格重新计算tick范围`);
      
      if (实例.原始价格范围配置) {
        try {
          // 获取当前池子状态
          const 池子状态 = await this.contractService.getPoolState(实例.配置.池地址);
          const 当前tick = 池子状态.tick;
          Utils.log('info', `当前tick: ${当前tick}`);
          
          // 重新计算tick范围
          const 新tick范围 = this.tickCalculatorService.calculateTickRange(
            当前tick,
            实例.原始价格范围配置.下限百分比,
            实例.原始价格范围配置.上限百分比,
            实例.原始价格范围配置.费率
          );
          
          Utils.log('info', `重新计算tick范围: [${新tick范围.tickLower}, ${新tick范围.tickUpper}]`);
          
          // 更新配置中的tick范围
          实例.配置.代币范围 = {
            下限tick: 新tick范围.tickLower,
            上限tick: 新tick范围.tickUpper
          };
          
          // 增加重启次数
          实例.重启次数 = (实例.重启次数 || 0) + 1;
          
          Utils.log('complete', `tick范围重新计算完成，重启次数: ${实例.重启次数}`);
          
        } catch (error) {
          Utils.log('error', 'tick范围重新计算失败', error);
          throw new Error(`重新计算tick范围失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        Utils.log('warn', '未找到原始价格范围配置，使用当前配置启动');
      }
    }
    
    // 🔧 新增：检查是否缺少代币范围，需要重新计算tick范围  
    if (!实例.配置.代币范围 && 实例.原始价格范围配置) {
      Utils.log('info', `检测到缺少代币范围配置，将基于当前市场价格重新计算tick范围`);
      
      try {
        // 获取当前池子状态
        const 池子状态 = await this.contractService.getPoolState(实例.配置.池地址);
        const 当前tick = 池子状态.tick;
        Utils.log('info', `当前tick: ${当前tick}`);
        
        // 重新计算tick范围
        const 新tick范围 = this.tickCalculatorService.calculateTickRange(
          当前tick,
          实例.原始价格范围配置.下限百分比,
          实例.原始价格范围配置.上限百分比,
          实例.原始价格范围配置.费率
        );
        
        Utils.log('info', `重新计算tick范围: [${新tick范围.tickLower}, ${新tick范围.tickUpper}]`);
        
        // 更新配置中的tick范围
        实例.配置.代币范围 = {
          下限tick: 新tick范围.tickLower,
          上限tick: 新tick范围.tickUpper
        };
        
        Utils.log('complete', `缺失tick范围重新计算完成`);
        
      } catch (error) {
        Utils.log('error', '重新计算缺失tick范围失败', error);
        throw new Error(`重新计算tick范围失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    try {
      实例.启动时间 = Date.now();
      实例.状态 = '运行中';
      // 🔧 修复：清除错误信息
      if (实例.错误信息) {
        实例.错误信息 = '';
      }
      
      // 🔧 持久化保存状态变更
      await this.保存持久化策略();
      
      // 执行策略流程
      await this.执行策略流程(实例ID);
      
      // 🔧 新增：在策略启动完成后，为监控器添加超时触发事件监听
      const 监控器 = this.监控器集合.get(实例ID);
      if (监控器) {
        // 移除之前的监听器（如果有）
        监控器.removeAllListeners('超时触发');
        
        // 添加超时触发事件监听
        监控器.on('超时触发', async (数据) => {
          console.log(`⏰ [${实例ID}] 策略引擎接收到超时触发事件，开始执行退出流程`);
          console.log(`📊 超时数据: 当前tick=${数据.当前tick}, 范围=[${数据.目标范围.下限}, ${数据.目标范围.上限}], 超时时长=${数据.超时时间}ms`);
          
          try {
            // 🔧 关键修复：直接调用策略引擎的退出方法
            await this.执行策略退出(实例ID, `价格监控超时: 持续${数据.超时时间}ms超出范围`);
            console.log(`✅ [${实例ID}] 超时退出流程执行完成`);
          } catch (error) {
            console.error(`❌ [${实例ID}] 超时退出流程执行失败:`, error);
            
            // 即使退出失败也要更新状态
            const 实例 = this.策略实例集合.get(实例ID);
            if (实例) {
      this.stateManager.updateAndBroadcastState(实例, {
                状态: '错误',
                错误信息: `超时退出失败: ${error instanceof Error ? error.message : '未知错误'}`,
                退出时间: Date.now(),
                退出原因: '超时退出失败'
              });
            }
          }
        });
        
        console.log(`🎯 [${实例ID}] 策略引擎已绑定超时触发事件监听器`);
      }
      
      Utils.log('complete', `策略启动成功: ${实例ID}`);
      
    } catch (error) {
      // 启动失败，更新状态
      this.stateManager.setErrorState(实例, 0, error);
      await this.保存持久化策略();
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
    
    // 🔴 持久化保存状态变更
    await this.保存持久化策略();
    
    Utils.log('complete', `策略停止成功: ${实例ID}`);
  }

  async 暂停策略(实例ID: string): Promise<void> {
    // 简化实现
    throw new Error('暂停功能暂未实现');
  }

  async 恢复策略(实例ID: string): Promise<void> {
    Utils.log('start', `恢复策略: ${实例ID}`);
    
    // 🔧 修改：恢复策略就是重新启动策略
    await this.启动策略(实例ID);
    
    Utils.log('complete', `策略恢复成功: ${实例ID}`);
  }

  // 🔧 新增：重置策略状态方法
  async 重置策略状态(实例ID: string): Promise<void> {
    Utils.log('start', `重置策略状态: ${实例ID}`);
    
    const 实例 = this.策略实例集合.get(实例ID);
    if (!实例) {
      throw new Error(`策略实例不存在: ${实例ID}`);
    }
    
    // 检查是否为已退出状态
    if (实例.状态 !== '已退出' && 实例.状态 !== '已完成' && 实例.状态 !== '错误') {
      throw new Error(`只有已退出、已完成或错误状态的策略才能重置，当前状态: ${实例.状态}`);
    }
    
    // 🔧 重要修复：保存原始价格范围配置用于重新计算
    const 原始价格范围配置 = 实例.原始价格范围配置;
    if (!原始价格范围配置) {
      Utils.log('warn', '未找到原始价格范围配置，可能无法重新计算tick范围');
    }
    
    // 清理之前的执行数据，但保留原始配置
    const 原始配置 = 实例.配置;
    const 实例ID_保留 = 实例.实例ID;
    const 创建时间 = 实例.创建时间;
    
    // 🔧 重要修复：完全清理所有动态数据，包括市场数据
    // 重置策略实例状态 - 直接删除和设置属性
    实例.状态 = '初始化';
    delete 实例.启动时间;
    delete 实例.结束时间;
    delete 实例.退出时间;
    delete 实例.退出原因;
    delete 实例.错误信息;
    delete 实例.头寸信息;
    delete 实例.资产准备结果;
    delete 实例.监控器;
    delete 实例.市场数据; // 🔧 完全清理市场数据，强制重新获取
    
    // 🔧 重要修复：清理配置中的过时tick范围，保留其他配置
    const 清理配置 = { ...原始配置 };
    delete (清理配置 as any).代币范围; // 🔧 删除过时的tick范围
    
    // 保留基础信息和原始价格范围配置
    实例.配置 = 清理配置;
    实例.实例ID = 实例ID_保留;
    实例.创建时间 = 创建时间;
    
    // 🔧 重要修复：确保原始价格范围配置存在
    if (原始价格范围配置) {
      实例.原始价格范围配置 = 原始价格范围配置;
      Utils.log('info', `已保留原始价格范围配置: 下限${原始价格范围配置.下限百分比}%, 上限${原始价格范围配置.上限百分比}%`);
    }
    
    // 手动触发状态广播
    this.stateManager.updateAndBroadcastState(实例, {});
    
    // 清理监控器（如果存在）
    const 监控器 = this.监控器集合.get(实例ID);
    if (监控器) {
      监控器.停止监控();
      this.监控器集合.delete(实例ID);
    }
    
    // 🔴 持久化保存状态变更
    await this.保存持久化策略();
    
    Utils.log('complete', `策略状态重置成功: ${实例ID}，已清理过时tick范围，重新启动时将基于当前市场价格重新计算`);
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
    
    // 🔴 持久化保存状态变更
    await this.保存持久化策略();
    
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
      
      // 调用完整的退出阶段
      await this.executionStages.阶段5_执行退出(实例, 原因);
      
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