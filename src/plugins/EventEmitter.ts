/**
 * 🎯 事件发射器基类
 * 为插件系统提供事件通信能力
 */
export class EventEmitter {
  private listeners: Map<string, Function[]> = new Map();

  /**
   * 监听事件
   */
  on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  /**
   * 移除事件监听
   */
  off(event: string, listener: Function): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 发射事件
   */
  emit(event: string, data?: any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`[EVENT] 事件监听器错误 ${event}:`, error);
        }
      });
    }
  }

  /**
   * 一次性监听事件
   */
  once(event: string, listener: Function): void {
    const onceListener = (data: any) => {
      listener(data);
      this.off(event, onceListener);
    };
    this.on(event, onceListener);
  }

  /**
   * 获取事件监听器数量
   */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.length || 0;
  }

  /**
   * 移除所有监听器
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
} 