import { injectable } from 'tsyringe';
import { 
  IEventBus, 
  Event, 
  EventHandler, 
  Timeframe, 
  ModuleConfig, 
  ModuleHealth, 
  ModuleMetrics 
} from '../types/interfaces.js';

/**
 * 事件总线实现
 * 提供模块间松耦合的事件通信机制
 */
@injectable()
export class EventBus implements IEventBus {
  public readonly name = 'EventBus';
  public readonly version = '1.0.0';
  public readonly dependencies: string[] = [];

  private subscribers = new Map<string, EventHandler[]>();
  private subscriptionIds = new Map<string, string>();
  private eventHistory = new Map<string, Event[]>();
  private isStarted = false;
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private lastActivity = Date.now();

  /**
   * 初始化事件总线
   */
  async initialize(config: ModuleConfig): Promise<void> {
    console.log('🔄 初始化事件总线...');
    
    // 设置事件历史保留策略
    const maxHistoryPerType = config.maxHistoryPerType || 1000;
    const cleanupInterval = config.cleanupInterval || 60000; // 1分钟

    // 定期清理过期事件
    setInterval(() => {
      this.cleanupExpiredEvents(maxHistoryPerType);
    }, cleanupInterval);

    console.log('✅ 事件总线初始化完成');
  }

  /**
   * 启动事件总线
   */
  async start(): Promise<void> {
    this.isStarted = true;
    this.startTime = Date.now();
    console.log('🚀 事件总线已启动');
  }

  /**
   * 停止事件总线
   */
  async stop(): Promise<void> {
    this.isStarted = false;
    this.subscribers.clear();
    this.subscriptionIds.clear();
    console.log('⏹️ 事件总线已停止');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ModuleHealth> {
    return {
      status: this.isStarted ? 'healthy' : 'error',
      message: this.isStarted ? '事件总线运行正常' : '事件总线未启动',
      timestamp: Date.now()
    };
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
   * 发布事件
   */
  async publish(event: Event): Promise<void> {
    if (!this.isStarted) {
      throw new Error('事件总线未启动');
    }

    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      // 存储事件到历史记录
      this.storeEvent(event);

      // 获取订阅者
      const handlers = this.subscribers.get(event.type) || [];
      
      if (handlers.length === 0) {
        console.log(`⚠️ 事件 ${event.type} 没有订阅者`);
        return;
      }

      // 并行通知所有订阅者
      const promises = handlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          this.errorCount++;
          console.error(`❌ 事件处理器执行失败 [${event.type}]:`, error);
        }
      });

      await Promise.allSettled(promises);
      
      console.log(`📢 事件已发布: ${event.type} (${handlers.length} 个订阅者)`);
    } catch (error) {
      this.errorCount++;
      console.error('❌ 事件发布失败:', error);
      throw error;
    }
  }

  /**
   * 订阅事件
   */
  subscribe(eventType: string, handler: EventHandler): string {
    const subscriptionId = this.generateSubscriptionId();
    
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    
    this.subscribers.get(eventType)!.push(handler);
    this.subscriptionIds.set(subscriptionId, eventType);
    
    console.log(`📝 已订阅事件: ${eventType} (订阅ID: ${subscriptionId})`);
    return subscriptionId;
  }

  /**
   * 取消订阅
   */
  unsubscribe(subscriptionId: string): void {
    const eventType = this.subscriptionIds.get(subscriptionId);
    if (!eventType) {
      console.warn(`⚠️ 未找到订阅ID: ${subscriptionId}`);
      return;
    }

    const handlers = this.subscribers.get(eventType);
    if (handlers && handlers.length > 0) {
      // 这里简化处理，实际应该记录handler和subscriptionId的映射
      this.subscribers.set(eventType, handlers.slice(0, -1));
    }

    this.subscriptionIds.delete(subscriptionId);
    console.log(`❌ 已取消订阅: ${eventType} (订阅ID: ${subscriptionId})`);
  }

  /**
   * 获取事件历史
   */
  async getEventHistory(eventType: string, timeframe: Timeframe): Promise<Event[]> {
    const events = this.eventHistory.get(eventType) || [];
    const cutoffTime = this.calculateCutoffTime(timeframe);
    
    return events.filter(event => event.timestamp >= cutoffTime);
  }

  /**
   * 获取所有事件类型
   */
  getEventTypes(): string[] {
    return Array.from(this.subscribers.keys());
  }

  /**
   * 获取订阅者数量
   */
  getSubscriberCount(eventType: string): number {
    const handlers = this.subscribers.get(eventType);
    return handlers ? handlers.length : 0;
  }

  /**
   * 存储事件到历史记录
   */
  private storeEvent(event: Event): void {
    if (!this.eventHistory.has(event.type)) {
      this.eventHistory.set(event.type, []);
    }
    
    const events = this.eventHistory.get(event.type)!;
    events.push({
      ...event,
      timestamp: event.timestamp || Date.now()
    });
    
    // 限制每种事件类型的历史记录数量
    const maxEvents = 1000;
    if (events.length > maxEvents) {
      events.splice(0, events.length - maxEvents);
    }
  }

  /**
   * 生成唯一的订阅ID
   */
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 计算时间范围的截止时间
   */
  private calculateCutoffTime(timeframe: Timeframe): number {
    const now = Date.now();
    const milliseconds = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000
    };
    
    return now - (timeframe.value * milliseconds[timeframe.unit]);
  }

  /**
   * 清理过期事件
   */
  private cleanupExpiredEvents(maxEventsPerType: number): void {
    for (const [eventType, events] of this.eventHistory.entries()) {
      if (events.length > maxEventsPerType) {
        const excessCount = events.length - maxEventsPerType;
        events.splice(0, excessCount);
        console.log(`🧹 清理事件历史: ${eventType} (删除 ${excessCount} 条记录)`);
      }
    }
  }
} 