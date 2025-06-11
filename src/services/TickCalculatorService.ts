/**
 * Tick计算服务 - 从LiquidityManager.ts提取的Uniswap V3官方计算方法
 * 提供tick和价格相关的精确计算功能
 */

import { injectable, inject } from 'tsyringe';
import { IService, ModuleConfig, ModuleHealth, ModuleMetrics, TYPES } from '../types/interfaces.js';

@injectable()
export class TickCalculatorService implements IService {
  readonly name = 'TickCalculatorService';
  readonly version = '1.0.0';
  readonly dependencies: string[] = ['LiquidityManager'];

  private readonly metrics: ModuleMetrics = {
    uptime: 0,
    requestCount: 0,
    errorCount: 0,
    lastActivity: Date.now()
  };

  constructor(
    @inject(TYPES.LiquidityManager) private liquidityManager: any
  ) {}

  async initialize(config: ModuleConfig): Promise<void> {
    console.log('🧮 初始化TickCalculatorService...');
    this.metrics.uptime = Date.now();
    console.log('✅ TickCalculatorService初始化完成');
  }

  async start(): Promise<void> {
    console.log('🚀 TickCalculatorService已启动');
  }

  async stop(): Promise<void> {
    console.log('🛑 TickCalculatorService已停止');
  }

  async healthCheck(): Promise<ModuleHealth> {
    return {
      status: 'healthy',
      message: 'TickCalculatorService运行正常',
      timestamp: Date.now()
    };
  }

  getMetrics(): ModuleMetrics {
    return {
      ...this.metrics,
      uptime: this.metrics.uptime ? Date.now() - this.metrics.uptime : 0
    };
  }

  async execute(params: any): Promise<any> {
    throw new Error('通用execute方法未实现，请使用具体的计算方法');
  }

  validate(params: any): boolean {
    return typeof params === 'object' && params !== null;
  }

  /**
   * 计算tick范围 - 使用正确的价格百分比转换
   * 来源：LiquidityManager.ts 的 calculateTickRange 方法
   * 参考：real_multicall_direct_test_fixed_v5.js 的 calculateTickRange 函数
   */
  calculateTickRange(currentTick: number, lowerPercent: number, upperPercent: number, fee: number = 100): {
    tickLower: number;
    tickUpper: number;
    tickSpacing: number;
  } {
    this.metrics.requestCount++;
    this.metrics.lastActivity = Date.now();

    try {
      console.log('🎯 === 精确Tick范围计算 (修复版) ===');
      console.log('📊 当前Tick:', currentTick);
      console.log('📊 价格区间:', `${lowerPercent}% ~ ${upperPercent}%`);
      
      // 获取tick间距
      const tickSpacing = this.getTickSpacing(fee);
      
      // 使用正确的百分比到tick转换
      // 在BSC V3中，每个tick大约对应0.01%的价格变化
      const ticksPerPercent = 100; // 1% ≈ 100 ticks
      
      const lowerTickOffset = Math.floor(lowerPercent * ticksPerPercent);
      const upperTickOffset = Math.floor(upperPercent * ticksPerPercent);
      
      let tickLower = currentTick + lowerTickOffset;
      let tickUpper = currentTick + upperTickOffset;
      
      console.log('📊 计算前Tick:', `${tickLower} ~ ${tickUpper}`);
      
      // 对齐到tickSpacing
      tickLower = Math.floor(tickLower / tickSpacing) * tickSpacing;
      tickUpper = Math.floor(tickUpper / tickSpacing) * tickSpacing;
      
      // 确保范围有效
      if (tickLower >= tickUpper) {
        tickUpper = tickLower + tickSpacing;
      }
      
      console.log('📊 对齐后Tick:', `${tickLower} ~ ${tickUpper}`);
      console.log('📊 Tick间距:', tickSpacing);
      console.log('📊 实际价格范围:', {
        lowerTickOffset,
        upperTickOffset,
        tickRange: tickUpper - tickLower,
        priceRangePercent: (tickUpper - tickLower) / ticksPerPercent
      });

      return { 
        tickLower, 
        tickUpper, 
        tickSpacing 
      };

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ Tick范围计算失败:', error);
      throw error;
    }
  }

  /**
   * Uniswap V3官方：Tick转SqrtRatioX96
   * 来源：LiquidityManager.ts 的 getSqrtRatioAtTick 方法
   * 参考：@uniswap/v3-sdk
   */
  getSqrtRatioAtTick(tick: number): bigint {
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
   * 来源：LiquidityManager.ts 的 getTickAtSqrtRatio 方法
   */
  getTickAtSqrtRatio(sqrtRatioX96: bigint): number {
    const Q96 = 2n ** 96n;
    const sqrtPrice = Number(sqrtRatioX96) / Number(Q96);
    const price = sqrtPrice * sqrtPrice;
    const tick = Math.log(price) / Math.log(1.0001);
    return Math.round(tick);
  }

  /**
   * 获取tick间距
   * 来源：LiquidityManager.ts 的 getTickSpacing 方法
   */
  getTickSpacing(fee: number): number {
    switch (fee) {
        case 100: return 1;
        case 500: return 10;
        case 2500: return 50;
        case 10000: return 200;
        default: return 10;
    }
  }

  /**
   * 批量计算多个价格百分比对应的tick值
   */
  calculateMultipleTickRanges(currentTick: number, percentRanges: Array<{
    lowerPercent: number;
    upperPercent: number;
    fee?: number;
  }>): Array<{
    lowerPercent: number;
    upperPercent: number;
    tickLower: number;
    tickUpper: number;
    tickSpacing: number;
  }> {
    return percentRanges.map(range => {
      const result = this.calculateTickRange(
        currentTick, 
        range.lowerPercent, 
        range.upperPercent, 
        range.fee || 100
      );
      
      return {
        lowerPercent: range.lowerPercent,
        upperPercent: range.upperPercent,
        ...result
      };
    });
  }

  /**
   * 验证tick范围的有效性
   */
  validateTickRange(tickLower: number, tickUpper: number, currentTick: number): {
    valid: boolean;
    reason?: string;
  } {
    // 基本范围检查
    if (tickLower >= tickUpper) {
      return { valid: false, reason: 'tick下限必须小于上限' };
    }

    // 检查当前价格是否在范围内
    if (currentTick < tickLower || currentTick > tickUpper) {
      return { 
        valid: false, 
        reason: `当前tick(${currentTick})不在设定范围[${tickLower}, ${tickUpper}]内` 
      };
    }

    // 检查范围是否过窄（小于10个tick可能无法有效提供流动性）
    const rangeWidth = tickUpper - tickLower;
    if (rangeWidth < 10) {
      return { 
        valid: false, 
        reason: `价格范围过窄(${rangeWidth}个tick)，建议至少10个tick` 
      };
    }

    // 检查范围是否过宽（超过2000个tick可能风险过大）
    if (rangeWidth > 2000) {
      return { 
        valid: false, 
        reason: `价格范围过宽(${rangeWidth}个tick)，建议不超过2000个tick` 
      };
    }

    return { valid: true };
  }

  /**
   * 计算代币需求量 - 直接使用LiquidityManager的公共方法，避免代码重复
   * 专门为ExecutionStages提供的公共接口
   */
  calculateTokenRequirements(参数: {
    inputAmount: number;
    inputTokenType: 'token0' | 'token1';
    currentTick: number;
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
  }): {
    token0需求量: number;
    token1需求量: number;
    计算说明: string;
  } {
    this.metrics.requestCount++;
    this.metrics.lastActivity = Date.now();

    try {
      console.log('🔄 [TickCalculatorService] 委托给LiquidityManager计算...');
      
      // 🎯 直接使用LiquidityManager的官方算法，避免代码重复
      return this.liquidityManager.calculateTokenRequirements(参数);

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 代币需求量计算失败:', error);
      throw error;
    }
  }
} 