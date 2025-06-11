/**
 * 🛠️ 工具方法模块 - 策略引擎的通用工具和常量
 */

export class Utils {
  /**
   * 常量定义
   */
  static readonly CONSTANTS = {
    // 阶段名称
    STAGE_NAMES: {
      1: '市场数据获取',
      2: '资产准备',
      3: '创建头寸',
      4: '开始监控'
    } as const,
    
    // 状态图标
    STAGE_ICONS: {
      start: '🚀',
      complete: '✅',
      error: '❌',
      retry: '🔄',
      info: 'ℹ️',
      warn: '⚠️'
    } as const,
    
    // 时间相关
    TRANSACTION_TIMEOUT: 1800, // 30分钟
  };

  /**
   * 统一日志记录方法
   */
  static log(type: keyof typeof Utils.CONSTANTS.STAGE_ICONS, message: string, details?: any) {
    const icon = Utils.CONSTANTS.STAGE_ICONS[type];
    console.log(`[STRATEGY] ${icon} ${message}`);
    if (details) {
      if (typeof details === 'object') {
        console.log(JSON.stringify(details, null, 2));
      } else {
        console.log(details);
      }
    }
  }

  /**
   * 阶段日志记录
   */
  static logStage(stage: number, action: 'start' | 'complete', 实例ID?: string, details?: string[]) {
    const stageName = Utils.CONSTANTS.STAGE_NAMES[stage as keyof typeof Utils.CONSTANTS.STAGE_NAMES];
    const icon = action === 'start' ? '🚀' : '✅';
    const actionText = action === 'start' ? '准备执行' : '执行完成';
    const suffix = 实例ID ? ` - ${实例ID}` : '';
    
    console.log(`[STRATEGY] ${icon} 阶段${stage}: ${actionText}${stageName}${suffix}`);
    
    if (details && details.length > 0) {
      details.forEach(detail => console.log(`[STRATEGY]   ${detail}`));
    }
  }

  /**
   * 验证依赖服务
   */
  static async 验证依赖服务(services: { [key: string]: any }): Promise<void> {
    const requiredServices = ['liquidityManager', 'contractService', 'web3Service'];
    
    for (const serviceName of requiredServices) {
      if (!services[serviceName]) {
        throw new Error(`依赖服务未初始化: ${serviceName}`);
      }
    }
    
    console.log('✅ 所有依赖服务验证通过');
  }

  /**
   * 处理策略错误的通用方法
   */
  static async 处理策略错误(实例ID: string, error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.log(`[STRATEGY] ❌ 策略${实例ID}执行失败:`, errorMessage);
    
    // 这里可以添加更多错误处理逻辑
    // 比如发送通知、记录错误日志等
  }

  /**
   * 格式化时间戳
   */
  static formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString('zh-CN');
  }

  /**
   * 计算百分比
   */
  static calculatePercentage(value: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((value / total) * 100 * 100) / 100; // 保留两位小数
  }

  /**
   * 睡眠函数
   */
  static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 重试执行函数
   */
  static async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
    backoffMultiplier: number = 2
  ): Promise<T> {
    let lastError: any;
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (i === maxRetries) {
          break; // 最后一次尝试失败
        }
        
        const currentDelay = delay * Math.pow(backoffMultiplier, i);
        console.log(`操作失败，${currentDelay}ms后重试 (${i + 1}/${maxRetries + 1})`);
        await Utils.sleep(currentDelay);
      }
    }
    
    throw lastError;
  }

  /**
   * 验证以太坊地址格式
   */
  static isValidEthereumAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * 格式化代币数量显示
   */
  static formatTokenAmount(amount: number, decimals: number = 6): string {
    return amount.toFixed(decimals);
  }

  /**
   * 安全的JSON解析
   */
  static safeJsonParse<T>(jsonString: string, defaultValue: T): T {
    try {
      return JSON.parse(jsonString);
    } catch {
      return defaultValue;
    }
  }

  /**
   * 深度克隆对象
   */
  static deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * 生成随机字符串
   */
  static generateRandomString(length: number = 8): string {
    return Math.random().toString(36).substr(2, length);
  }
} 