/**
 * 策略WebSocket连接管理类
 * 负责实时数据通信和事件处理 (连接到4000端口策略引擎)
 */

export class StrategyWebSocket {
  constructor(url = 'ws://localhost:4000') {
    this.url = url;
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 5000;
    this.callbacks = {
      onConnect: null,
      onDisconnect: null,
      onError: null,
      onStrategyUpdate: null
    };
    this.subscriptions = new Set();
  }

  /**
   * 连接WebSocket
   */
  async connect(callbacks = {}) {
    // 保存回调函数
    this.callbacks = { ...this.callbacks, ...callbacks };

    return new Promise((resolve, reject) => {
      try {
        // 检查是否有Socket.IO库
        if (typeof io === 'undefined') {
          // 如果没有，尝试从CDN加载
          this.loadSocketIO().then(() => {
            this.establishConnection(resolve, reject);
          }).catch(reject);
        } else {
          this.establishConnection(resolve, reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 加载Socket.IO库
   */
  async loadSocketIO() {
    if (typeof io !== 'undefined') return;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
      script.onload = () => {
        console.log('✅ Socket.IO库加载成功');
        resolve();
      };
      script.onerror = () => {
        reject(new Error('Socket.IO库加载失败'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * 建立连接
   */
  establishConnection(resolve, reject) {
    try {
      console.log('🔌 连接WebSocket:', this.url);

      this.socket = io(this.url, {
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: true
      });

      // 连接成功
      this.socket.on('connect', () => {
        console.log('✅ WebSocket连接成功');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        if (this.callbacks.onConnect) {
          this.callbacks.onConnect();
        }
        
        resolve();
      });

      // 连接断开
      this.socket.on('disconnect', (reason) => {
        console.log('❌ WebSocket连接断开:', reason);
        this.isConnected = false;
        
        if (this.callbacks.onDisconnect) {
          this.callbacks.onDisconnect(reason);
        }

        // 自动重连
        if (reason !== 'io client disconnect') {
          this.attemptReconnect();
        }
      });

      // 连接错误
      this.socket.on('connect_error', (error) => {
        console.error('❌ WebSocket连接错误:', error);
        
        if (this.callbacks.onError) {
          this.callbacks.onError(error);
        }

        if (!this.isConnected) {
          reject(error);
        }
      });

      // 策略状态更新
      this.socket.on('strategyUpdate', (data) => {
        console.log('📊 策略状态更新:', data);
        
        if (this.callbacks.onStrategyUpdate) {
          this.callbacks.onStrategyUpdate(data);
        }
      });

      // 策略创建事件
      this.socket.on('strategyCreated', (data) => {
        console.log('🎯 策略创建:', data);
        this.handleStrategyEvent('created', data);
      });

      // 策略启动事件
      this.socket.on('strategyStarted', (data) => {
        console.log('🚀 策略启动:', data);
        this.handleStrategyEvent('started', data);
      });

      // 策略停止事件
      this.socket.on('strategyStopped', (data) => {
        console.log('⏹️ 策略停止:', data);
        this.handleStrategyEvent('stopped', data);
      });

      // 策略完成事件
      this.socket.on('strategyCompleted', (data) => {
        console.log('✅ 策略完成:', data);
        this.handleStrategyEvent('completed', data);
      });

      // 策略错误事件
      this.socket.on('strategyError', (data) => {
        console.log('❌ 策略错误:', data);
        this.handleStrategyEvent('error', data);
      });

      // 价格更新事件
      this.socket.on('priceUpdate', (data) => {
        console.log('💹 价格更新:', data);
        this.handlePriceUpdate(data);
      });

    } catch (error) {
      reject(error);
    }
  }

  /**
   * 处理策略事件
   */
  handleStrategyEvent(eventType, data) {
    const event = {
      type: eventType,
      strategyId: data.instanceId || data.strategyId,
      data: data,
      timestamp: Date.now()
    };

    if (this.callbacks.onStrategyUpdate) {
      this.callbacks.onStrategyUpdate(event);
    }

    // 触发自定义事件
    window.dispatchEvent(new CustomEvent('strategyEvent', { detail: event }));
  }

  /**
   * 处理价格更新
   */
  handlePriceUpdate(data) {
    const event = {
      type: 'priceUpdate',
      poolAddress: data.poolAddress,
      price: data.price,
      tick: data.tick,
      timestamp: data.timestamp || Date.now()
    };

    // 触发自定义事件
    window.dispatchEvent(new CustomEvent('priceUpdate', { detail: event }));
  }

  /**
   * 尝试重连
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('⚠️ 达到最大重连次数，停止WebSocket重连');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);

    console.log(`🔄 ${Math.round(delay/1000)}秒后尝试第${this.reconnectAttempts}次WebSocket重连...`);

    setTimeout(() => {
      if (!this.isConnected && this.socket) {
        this.socket.connect();
      }
    }, delay);
  }

  /**
   * 订阅策略更新
   */
  subscribeStrategy(strategyId) {
    if (!this.isConnected || !this.socket) {
      console.warn('WebSocket未连接，无法订阅策略');
      return false;
    }

    console.log(`📝 订阅策略: ${strategyId}`);
    this.socket.emit('subscribe', { strategyId });
    this.subscriptions.add(strategyId);
    return true;
  }

  /**
   * 取消订阅策略
   */
  unsubscribeStrategy(strategyId) {
    if (!this.isConnected || !this.socket) {
      console.warn('WebSocket未连接，无法取消订阅');
      return false;
    }

    console.log(`❌ 取消订阅策略: ${strategyId}`);
    this.socket.emit('unsubscribe', { strategyId });
    this.subscriptions.delete(strategyId);
    return true;
  }

  /**
   * 订阅价格更新
   */
  subscribePriceUpdates(poolAddress) {
    if (!this.isConnected || !this.socket) {
      console.warn('WebSocket未连接，无法订阅价格更新');
      return false;
    }

    console.log(`📈 订阅价格更新: ${poolAddress}`);
    this.socket.emit('subscribePriceUpdates', { poolAddress });
    return true;
  }

  /**
   * 取消价格更新订阅
   */
  unsubscribePriceUpdates(poolAddress) {
    if (!this.isConnected || !this.socket) {
      console.warn('WebSocket未连接，无法取消价格订阅');
      return false;
    }

    console.log(`📉 取消价格更新订阅: ${poolAddress}`);
    this.socket.emit('unsubscribePriceUpdates', { poolAddress });
    return true;
  }

  /**
   * 发送心跳包
   */
  sendHeartbeat() {
    if (this.isConnected && this.socket) {
      this.socket.emit('heartbeat', { timestamp: Date.now() });
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.socket) {
      console.log('🔌 断开WebSocket连接');
      this.isConnected = false;
      this.socket.disconnect();
      this.socket = null;
      this.subscriptions.clear();
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      subscriptions: Array.from(this.subscriptions)
    };
  }

  /**
   * 添加事件监听器
   */
  addEventListener(eventType, callback) {
    window.addEventListener(eventType, callback);
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(eventType, callback) {
    window.removeEventListener(eventType, callback);
  }

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * 重新连接
   */
  reconnect() {
    this.disconnect();
    this.reconnectAttempts = 0;
    return this.connect(this.callbacks);
  }
} 