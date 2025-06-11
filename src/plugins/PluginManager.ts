import { EventEmitter } from './EventEmitter.js';
import { ProfitLossPlugin } from './ProfitLossPlugin.js';

/**
 * 🎛️ 插件接口
 */
export interface IPlugin {
  名称: string;
  版本?: string;
  启动(): void;
  停止(): void;
  处理事件?(事件名: string, 事件数据: any): void;
}

/**
 * 🔧 插件管理器
 * 统一管理所有插件的生命周期和事件分发
 */
export class PluginManager extends EventEmitter {
  private static instance: PluginManager;
  private 已注册插件: Map<string, IPlugin> = new Map();
  private 已启动插件: Set<string> = new Set();
  private 事件映射: Map<string, string[]> = new Map();

  private constructor() {
    super();
    this.初始化事件映射();
  }

  /**
   * 🏗️ 获取单例实例
   */
  static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  /**
   * 🎯 初始化事件映射
   */
  private 初始化事件映射(): void {
    // 定义事件到插件方法的映射
    this.事件映射.set('strategy.started', ['处理策略开始']);
    this.事件映射.set('position.created', ['处理头寸创建']);
    this.事件映射.set('swap.executed', ['处理代币交换']);
    this.事件映射.set('strategy.ended', ['处理策略结束']);
    this.事件映射.set('position.closed', ['处理头寸关闭']);
  }

  /**
   * 📝 注册插件
   */
  注册插件(插件名: string, 插件实例: IPlugin): void {
    if (this.已注册插件.has(插件名)) {
      console.warn(`[PLUGIN] 插件 ${插件名} 已存在，将覆盖现有插件`);
      this.停止插件(插件名);
    }

    this.已注册插件.set(插件名, 插件实例);
    console.log(`[PLUGIN] 插件 ${插件名} 注册成功`);
  }

  /**
   * 🗑️ 注销插件
   */
  注销插件(插件名: string): boolean {
    if (this.已注册插件.has(插件名)) {
      this.停止插件(插件名);
      this.已注册插件.delete(插件名);
      console.log(`[PLUGIN] 插件 ${插件名} 注销成功`);
      return true;
    }
    return false;
  }

  /**
   * 🚀 启动插件
   */
  启动插件(插件名: string): boolean {
    const 插件 = this.已注册插件.get(插件名);
    if (插件 && !this.已启动插件.has(插件名)) {
      try {
        插件.启动();
        this.已启动插件.add(插件名);
        console.log(`[PLUGIN] 插件 ${插件名} 启动成功`);
        return true;
      } catch (error) {
        console.error(`[PLUGIN] 插件 ${插件名} 启动失败:`, error);
      }
    }
    return false;
  }

  /**
   * ⏹️ 停止插件
   */
  停止插件(插件名: string): boolean {
    const 插件 = this.已注册插件.get(插件名);
    if (插件 && this.已启动插件.has(插件名)) {
      try {
        插件.停止();
        this.已启动插件.delete(插件名);
        console.log(`[PLUGIN] 插件 ${插件名} 停止成功`);
        return true;
      } catch (error) {
        console.error(`[PLUGIN] 插件 ${插件名} 停止失败:`, error);
      }
    }
    return false;
  }

  /**
   * 🎯 启动所有插件
   */
  启动所有插件(): void {
    for (const 插件名 of this.已注册插件.keys()) {
      this.启动插件(插件名);
    }
  }

  /**
   * ⏹️ 停止所有插件
   */
  停止所有插件(): void {
    for (const 插件名 of this.已启动插件) {
      this.停止插件(插件名);
    }
  }

  /**
   * 📡 分发事件到插件
   */
  分发事件(事件名: string, 事件数据: any): void {
    console.log(`[PLUGIN] 📡 收到事件分发请求: ${事件名}`);
    console.log(`[PLUGIN] 📊 当前已注册插件: ${Array.from(this.已注册插件.keys()).join(', ')}`);
    console.log(`[PLUGIN] 📊 当前已启动插件: ${Array.from(this.已启动插件).join(', ')}`);
    
    const 目标方法列表 = this.事件映射.get(事件名);
    console.log(`[PLUGIN] 🎯 事件 ${事件名} 对应的目标方法: ${目标方法列表?.join(', ') || '无映射'}`);
    
    if (!目标方法列表) {
      console.log(`[PLUGIN] ⚠️ 事件 ${事件名} 没有映射的处理方法，静默忽略`);
      return; // 没有映射的事件，静默忽略
    }

    for (const [插件名, 插件实例] of this.已注册插件) {
      console.log(`[PLUGIN] 🔍 检查插件: ${插件名}, 是否已启动: ${this.已启动插件.has(插件名)}`);
      
      if (this.已启动插件.has(插件名)) {
        for (const 方法名 of 目标方法列表) {
          try {
            const 方法 = (插件实例 as any)[方法名];
            console.log(`[PLUGIN] 🎯 在插件 ${插件名} 中查找方法 ${方法名}, 找到: ${typeof 方法 === 'function' ? '是' : '否'}`);
            
            if (typeof 方法 === 'function') {
              console.log(`[PLUGIN] 🚀 调用插件 ${插件名} 的方法 ${方法名}`);
              方法.call(插件实例, 事件数据);
              console.log(`[PLUGIN] ✅ 插件 ${插件名} 的方法 ${方法名} 调用成功`);
            }
          } catch (error) {
            console.error(`[PLUGIN] ❌ 插件 ${插件名} 处理事件 ${事件名} 失败:`, error);
          }
        }
      }
    }

    // 发射管理器级别的事件（供其他组件监听）
    this.emit(事件名, 事件数据);
  }

  /**
   * 📋 获取插件状态
   */
  获取插件状态(): { [插件名: string]: { 已注册: boolean; 已启动: boolean; 版本?: string } } {
    const 状态: any = {};
    
    for (const [插件名, 插件实例] of this.已注册插件) {
      状态[插件名] = {
        已注册: true,
        已启动: this.已启动插件.has(插件名),
        版本: 插件实例.版本 || '未知'
      };
    }

    return 状态;
  }

  /**
   * 🔍 获取插件实例
   */
  获取插件<T = IPlugin>(插件名: string): T | undefined {
    return this.已注册插件.get(插件名) as T;
  }

  /**
   * 📊 获取运行统计
   */
  获取运行统计(): {
    总插件数: number;
    运行中插件数: number;
    事件映射数: number;
    已注册插件列表: string[];
    运行中插件列表: string[];
  } {
    return {
      总插件数: this.已注册插件.size,
      运行中插件数: this.已启动插件.size,
      事件映射数: this.事件映射.size,
      已注册插件列表: Array.from(this.已注册插件.keys()),
      运行中插件列表: Array.from(this.已启动插件)
    };
  }

  /**
   * 🎛️ 初始化默认插件
   */
  初始化默认插件(): void {
    // 注册盈亏统计插件
    const 盈亏插件 = new ProfitLossPlugin();
    // 将插件实例适配为IPlugin接口
    const 适配插件: IPlugin = {
      名称: '盈亏统计插件',
      版本: '1.0.0',
      启动: () => 盈亏插件.启动(),
      停止: () => 盈亏插件.停止(),
      处理策略开始: (事件数据: any) => 盈亏插件.处理策略开始(事件数据),
      处理头寸创建: (事件数据: any) => 盈亏插件.处理头寸创建(事件数据),
      处理代币交换: (事件数据: any) => 盈亏插件.处理代币交换(事件数据),
      处理策略结束: (事件数据: any) => 盈亏插件.处理策略结束(事件数据),
      处理头寸关闭: (事件数据: any) => 盈亏插件.处理头寸关闭(事件数据)
    } as any;

    this.注册插件('profit-loss', 适配插件);
    this.启动插件('profit-loss');

    // 将盈亏插件实例保存到管理器，方便外部访问
    (this as any).盈亏插件 = 盈亏插件;

    console.log('[PLUGIN] 默认插件初始化完成');
  }

  /**
   * 🎯 获取盈亏插件实例
   */
  获取盈亏插件(): ProfitLossPlugin | undefined {
    return (this as any).盈亏插件;
  }
}

// 导出全局插件管理器实例
export const 插件管理器 = PluginManager.getInstance(); 