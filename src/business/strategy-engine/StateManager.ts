/**
 * 📊 状态管理模块 - 策略引擎的状态管理和推送
 */

import { 策略实例, 策略配置 } from '../../types/interfaces.js';
import { broadcastStrategyUpdate, broadcastStrategyProgress } from '../../api/routes.js';
import { TickCalculatorService } from '../../services/TickCalculatorService.js';
import { ContractService } from '../../services/ContractService.js';

export class StateManager {
  private wsIO: any = null;

  constructor(
    private tickCalculatorService: TickCalculatorService,
    private contractService: ContractService
  ) {}

  /**
   * 设置WebSocket IO实例
   */
  setWebSocketIO(io: any) {
    console.log('🔗 StateManager WebSocket IO已设置 (当前已禁用推送功能)');
    this.wsIO = io; // 保留设置，以备将来使用
  }

  /**
   * 统一状态更新和推送
   */
  updateAndBroadcastState(实例: 策略实例, 更新数据: Partial<策略实例>) {
    Object.assign(实例, 更新数据);
    this.推送策略状态(实例.实例ID, 实例);
  }

  /**
   * 阶段进度更新
   */
  updateStageProgress(实例: 策略实例, stage: number, description: string) {
    this.推送策略进度(实例.实例ID, {
      stage,
      description,
      timestamp: Date.now()
    });
  }

  /**
   * 阶段完成
   */
  completeStage(实例: 策略实例, stage: number, details?: string) {
    const stageNames = this.getStageNames();
    const stageName = stageNames[stage as 1 | 2 | 3 | 4];
    const emoji = '✅';
    console.log(`${emoji} 阶段${stage}完成: ${stageName}${details ? ` - ${details}` : ''}`);
  }

  /**
   * 设置错误状态
   */
  setErrorState(实例: 策略实例, stage: number, error: any) {
    const stageNames = this.getStageNames();
    const stageName = stageNames[stage as 1 | 2 | 3 | 4];
    console.log(`❌ 阶段${stage}失败: ${stageName} - ${error instanceof Error ? error.message : String(error)}`);
    
    实例.状态 = '错误';
    实例.错误信息 = error instanceof Error ? error.message : String(error);
    this.推送策略状态(实例.实例ID, 实例);
  }

  /**
   * 推送策略状态到前端
   */
  private 推送策略状态(实例ID: string, 策略状态: 策略实例) {
    // 🔧 减少重复日志：只在状态变化时打印
    const lastPushTime = this.lastPushTimes.get(实例ID) || 0;
    const now = Date.now();
    const timeSinceLastPush = now - lastPushTime;
    
    // 只有在状态变化或距离上次推送超过10秒时才打印详细日志
    if (timeSinceLastPush > 10000) {
      console.log('📡 策略状态更新记录:', {
        实例ID,
        状态: 策略状态.状态,
        时间戳: now
      });
      this.lastPushTimes.set(实例ID, now);
    }
  }

  /**
   * 推送策略进度信息
   */
  private 推送策略进度(实例ID: string, 进度数据: any) {
    if (this.wsIO) {
      broadcastStrategyProgress(实例ID, 进度数据, this.wsIO);
    }
  }

  /**
   * 验证策略配置 - 包含百分比格式转换功能
   */
  async 验证策略配置(配置: 策略配置): Promise<void> {
    // 基本字段验证
    if (!配置.池地址 || !/^0x[a-fA-F0-9]{40}$/.test(配置.池地址)) {
      throw new Error('池地址格式无效');
    }

    if (!配置.代币数量 || 配置.代币数量 <= 0) {
      throw new Error('代币数量必须大于0');
    }

    // 处理价格范围配置 - 支持百分比格式 (从备份文件迁移的功能)
    if ((配置 as any).价格范围配置) {
      const 价格范围配置 = (配置 as any).价格范围配置;
      
      if (typeof 价格范围配置.下限百分比 === 'number' && typeof 价格范围配置.上限百分比 === 'number') {
        console.log('🔄 检测到百分比格式的价格范围，调用tick计算服务进行转换...');
        
        // 🔧 新增：保存原始百分比配置到策略实例，用于重新开始时重计算
        (配置 as any).原始价格范围配置 = {
          下限百分比: 价格范围配置.下限百分比,
          上限百分比: 价格范围配置.上限百分比,
          费率: (配置 as any).费率 || 100
        };
        
        try {
          // 调用tick计算服务
          const tickCalculationResult = await this.调用tick计算服务(
            配置.池地址,
            价格范围配置.下限百分比,
            价格范围配置.上限百分比
          );
          
          // 将计算结果添加到配置中
          配置.代币范围 = {
            下限tick: tickCalculationResult.tickLower,
            上限tick: tickCalculationResult.tickUpper
          };
          
          console.log(`✅ tick范围转换完成: [${tickCalculationResult.tickLower}, ${tickCalculationResult.tickUpper}]`);
          
          // 移除临时的百分比配置
          delete (配置 as any).价格范围配置;
          
        } catch (error) {
          throw new Error(`价格范围tick计算失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // 验证最终的tick范围
    if (!配置.代币范围 || typeof 配置.代币范围.下限tick !== 'number' || typeof 配置.代币范围.上限tick !== 'number') {
      throw new Error('代币范围配置无效，缺少有效的tick范围');
    }

    // tick范围验证
    const { 下限tick, 上限tick } = 配置.代币范围;
    if (下限tick >= 上限tick) {
      throw new Error('下限tick必须小于上限tick');
    }

    const tick范围 = 上限tick - 下限tick;
    if (tick范围 < 10) {
      throw new Error('tick范围过小，至少需要10个tick');
    }

    if (tick范围 > 5000) {
      throw new Error('tick范围过大，不应超过5000个tick');
    }

    // 主要代币验证
    if (!['token0', 'token1'].includes(配置.主要代币)) {
      throw new Error('主要代币必须是token0或token1');
    }

    // 🔧 新增: 滑点参数验证和处理
    this.验证和处理滑点配置(配置);

    // 自动退出配置验证
    if (配置.自动退出) {
      if (配置.自动退出.启用超时退出) {
        if (!配置.自动退出.超时时长 || 配置.自动退出.超时时长 <= 0) {
          throw new Error('超时时长必须大于0');
        }
        
        if (配置.自动退出.超时时长 < 5000) {
          console.log(`⚡ 检测到短超时时间: ${配置.自动退出.超时时长}ms (${配置.自动退出.超时时长/1000}秒)`);
        }
      }
    }
  }

  /**
   * 验证和处理滑点配置
   */
  private 验证和处理滑点配置(配置: 策略配置): void {
    // 🔧 处理前端传入的滑点参数
    const 原始数据 = 配置 as any;
    
    // 🔍 调试：打印接收到的原始数据
    console.log('🔍 调试滑点配置接收的原始数据:');
    console.log('  okxSlippage:', 原始数据.okxSlippage, '(类型:', typeof 原始数据.okxSlippage, ')');
    console.log('  liquiditySlippage:', 原始数据.liquiditySlippage, '(类型:', typeof 原始数据.liquiditySlippage, ')');
    console.log('  滑点设置 (旧):', 配置.滑点设置, '(类型:', typeof 配置.滑点设置, ')');
    
    // 如果前端传入了新的字段名
    if (typeof 原始数据.okxSlippage === 'number') {
      配置.OKX交易滑点 = 原始数据.okxSlippage;
      console.log(`✅ 检测到前端OKX滑点: ${配置.OKX交易滑点}%`);
    }
    
    if (typeof 原始数据.liquiditySlippage === 'number') {
      配置.流动性滑点 = 原始数据.liquiditySlippage;
      console.log(`✅ 检测到前端流动性滑点: ${配置.流动性滑点}%`);
    }
    
    // 向后兼容：如果使用了旧的滑点设置字段
    if (typeof 配置.滑点设置 === 'number' && !配置.OKX交易滑点) {
      console.log(`⚠️ 检测到旧版滑点设置: ${配置.滑点设置}%，将作为OKX交易滑点使用`);
      配置.OKX交易滑点 = 配置.滑点设置;
    }
    
    // 验证OKX交易滑点
    if (typeof 配置.OKX交易滑点 !== 'number' || 配置.OKX交易滑点 <= 0) {
      throw new Error('OKX交易滑点必须是大于0的数值');
    }
    
    if (配置.OKX交易滑点 > 1) {
      throw new Error('OKX交易滑点不能超过1% (根据OKX API限制)');
    }
    
    // 验证流动性滑点
    if (typeof 配置.流动性滑点 !== 'number' || 配置.流动性滑点 <= 0) {
      throw new Error('流动性滑点必须是大于0的数值');
    }
    
    if (配置.流动性滑点 > 50) {
      console.log(`⚠️ 流动性滑点设置较高: ${配置.流动性滑点}%，请确认这是您的预期设置`);
    }
    
    console.log(`📊 滑点配置验证完成 - OKX交易: ${配置.OKX交易滑点}%, 流动性: ${配置.流动性滑点}%`);
  }

  /**
   * 调用tick计算服务 - 将百分比转换为tick范围 (从备份文件迁移)
   */
  private async 调用tick计算服务(
    池地址: string, 
    下限百分比: number, 
    上限百分比: number
  ): Promise<{
    tickLower: number;
    tickUpper: number;
    tickSpacing: number;
  }> {
    try {
      console.log(`ℹ️ 调用tick计算服务: 池地址=${池地址}, 下限=${下限百分比}%, 上限=${上限百分比}%`);
      
      // 获取当前池状态以获取当前tick
      const 池状态 = await this.contractService.getPoolState(池地址);
      if (!池状态) {
        throw new Error('无法获取池状态');
      }
      
      const 当前tick = 池状态.tick;
      console.log(`ℹ️ 当前tick: ${当前tick}`);
      
      // 调用TickCalculatorService计算tick范围
      const 计算结果 = this.tickCalculatorService.calculateTickRange(
        当前tick,
        下限百分比,
        上限百分比,
        100 // 默认使用0.01%费率
      );
      
      console.log(`✅ tick计算服务调用成功`);
      
      return {
        tickLower: 计算结果.tickLower,
        tickUpper: 计算结果.tickUpper,
        tickSpacing: 计算结果.tickSpacing
      };
      
    } catch (error) {
      console.error(`❌ tick计算服务调用失败:`, error);
      throw new Error(`tick计算失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 生成唯一实例ID
   */
  生成实例ID(): string {
    return `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取阶段名称映射
   */
  private getStageNames() {
    return {
      1: '市场数据获取',
      2: '资产准备',
      3: '创建头寸',
      4: '开始监控'
    };
  }

  // 添加记录上次推送时间的属性
  private lastPushTimes = new Map<string, number>();
}