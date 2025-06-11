/**
 * 👁️ 价格监控器 - 实时监控池子价格变化
 * 
 * 功能特性：
 * - 实时tick监控
 * - 范围判断
 * - 超时计时
 * - 事件通知
 */

import { EventEmitter } from 'events';
import { injectable, inject } from 'tsyringe';
import { I价格监控器, TYPES } from '../types/interfaces.js';
import { ContractService } from '../services/ContractService.js';

export class 价格监控器 extends EventEmitter implements I价格监控器 {
  public readonly 轮询间隔 = 3000; // 3秒
  
  private 监控定时器: NodeJS.Timeout | null = null;
  private 超时定时器: NodeJS.Timeout | null = null;
  private 当前池地址 = '';
  private 目标tick范围 = { 下限: 0, 上限: 0 };
  private 当前tick = 0;
  private 在范围内 = true;
  private 超时时间 = 10000; // 10秒
  private lastLogTime: number | null = null;
  private 策略实例ID: string; // 🔧 新增：策略实例ID标识
  
  constructor(
    private contractService: ContractService,
    超时时间?: number,
    策略实例ID?: string // 🔧 新增：策略实例ID参数
  ) {
    super();
    this.策略实例ID = 策略实例ID || 'unknown'; // 设置默认值
    if (超时时间) {
      this.超时时间 = 超时时间 * 1000; // 转换为毫秒
    }
  }

  开始监控(池地址: string, tick范围: { 下限: number; 上限: number }): void {
    console.log(`[MONITOR] 👁️ [${this.策略实例ID}] 开始价格监控 - 池: ${池地址}, 范围: ${tick范围.下限} ~ ${tick范围.上限}`);
    
    this.当前池地址 = 池地址;
    this.目标tick范围 = tick范围;
    
    // 启动监控定时器
    this.监控定时器 = setInterval(async () => {
      try {
        await this.检查价格();
      } catch (error) {
        console.error(`[MONITOR] ❌ [${this.策略实例ID}] 价格监控错误:`, error);
        this.emit('监控错误', error);
      }
    }, this.轮询间隔);
    
    console.log(`[MONITOR] ✅ [${this.策略实例ID}] 价格监控已启动，间隔: ${this.轮询间隔}ms`);
    this.emit('监控开始', { 池地址, tick范围 });
  }

  停止监控(): void {
    console.log(`[MONITOR] 🛑 [${this.策略实例ID}] 停止价格监控`);
    
    if (this.监控定时器) {
      clearInterval(this.监控定时器);
      this.监控定时器 = null;
    }
    
    if (this.超时定时器) {
      clearTimeout(this.超时定时器);
      this.超时定时器 = null;
    }
    
    this.emit('监控停止');
  }

  是否在范围内(): boolean {
    return this.在范围内;
  }

  async 获取当前tick(): Promise<number> {
    if (!this.当前池地址) {
      throw new Error('未设置监控池地址');
    }
    
    const poolState = await this.contractService.getPoolState(this.当前池地址);
    return poolState.tick;
  }

  private async 检查价格(): Promise<void> {
    try {
      this.当前tick = await this.获取当前tick();
      const 之前在范围内 = this.在范围内;
      this.在范围内 = this.当前tick >= this.目标tick范围.下限 && this.当前tick <= this.目标tick范围.上限;
      
      // 添加调试日志 - 每120秒打印一次状态
      const 当前时间 = Date.now();
      if (!this.lastLogTime || 当前时间 - this.lastLogTime > 120000) { // 120秒打印一次
        console.log(`[MONITOR] ️ [${this.策略实例ID}] 监控状态: tick=${this.当前tick} 范围=[${this.目标tick范围.下限},${this.目标tick范围.上限}] 在范围内=${this.在范围内 ? '✅' : '❌'}`);
        this.lastLogTime = 当前时间;
      }
      
      // 发出价格变化事件
      this.emit('价格变化', {
        当前tick: this.当前tick,
        在范围内: this.在范围内,
        目标范围: this.目标tick范围
      });
      
      // 检查范围状态变化
      if (之前在范围内 && !this.在范围内) {
        // 刚刚超出范围
        console.log(`[MONITOR] ⚠️ [${this.策略实例ID}] 价格超出范围: 当前tick ${this.当前tick}, 目标范围 [${this.目标tick范围.下限}, ${this.目标tick范围.上限}]`);
        this.启动超时计时();
        this.emit('超出范围', {
          当前tick: this.当前tick,
          目标范围: this.目标tick范围
        });
        
      } else if (!之前在范围内 && this.在范围内) {
        // 重新进入范围
        console.log(`[MONITOR] ✅ [${this.策略实例ID}] 价格重新进入范围: 当前tick ${this.当前tick}`);
        this.清除超时计时();
        this.emit('重新进入', {
          当前tick: this.当前tick,
          目标范围: this.目标tick范围
        });
      }
      
    } catch (error) {
      console.error(`[MONITOR] ❌ [${this.策略实例ID}] 获取价格失败:`, error);
      this.emit('监控错误', error);
    }
  }

  private 启动超时计时(): void {
    // 清除现有计时器
    this.清除超时计时();
    
    console.log(`[MONITOR] ⏰ [${this.策略实例ID}] 启动超时计时: ${this.超时时间}ms`);
    this.超时定时器 = setTimeout(() => {
      console.log(`[MONITOR] ⏰ [${this.策略实例ID}] 超时触发: 价格持续 ${this.超时时间}ms 超出范围`);
      this.emit('超时触发', {
        当前tick: this.当前tick,
        目标范围: this.目标tick范围,
        超时时间: this.超时时间
      });
    }, this.超时时间);
  }

  private 清除超时计时(): void {
    if (this.超时定时器) {
      console.log(`[MONITOR] ⏰ [${this.策略实例ID}] 清除超时计时器`);
      clearTimeout(this.超时定时器);
      this.超时定时器 = null;
    }
  }
} 