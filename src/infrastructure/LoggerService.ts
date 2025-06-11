import { injectable } from 'tsyringe';
import { 
  ModuleConfig, 
  ModuleHealth, 
  ModuleMetrics 
} from '../types/interfaces.js';

/**
 * 日志服务接口
 */
export interface ILoggerService {
  readonly name: string;
  readonly version: string;
  readonly dependencies: string[];
  
  initialize(config: ModuleConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<ModuleHealth>;
  getMetrics(): ModuleMetrics;
  
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  critical(message: string, meta?: any): void;
}

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

/**
 * 日志条目接口
 */
export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  meta?: any;
  source: string;
}

/**
 * 日志服务实现
 * 提供结构化日志、多级别日志和持久化功能
 */
@injectable()
export class LoggerService implements ILoggerService {
  public readonly name = 'LoggerService';
  public readonly version = '1.0.0';
  public readonly dependencies: string[] = [];

  private isStarted = false;
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private lastActivity = Date.now();
  private logLevel = LogLevel.INFO;
  private logHistory: LogEntry[] = [];
  private maxHistorySize = 1000;

  /**
   * 初始化日志服务
   */
  async initialize(config: ModuleConfig): Promise<void> {
    console.log('🔄 初始化日志服务...');
    
    this.logLevel = config.logLevel || LogLevel.INFO;
    this.maxHistorySize = config.maxHistorySize || 1000;
    
    // 设置定期清理
    setInterval(() => {
      this.cleanupOldLogs();
    }, 60000); // 每分钟清理一次
    
    console.log('✅ 日志服务初始化完成');
  }

  /**
   * 启动日志服务
   */
  async start(): Promise<void> {
    this.isStarted = true;
    this.startTime = Date.now();
    this.info('日志服务已启动', { 
      logLevel: LogLevel[this.logLevel],
      maxHistorySize: this.maxHistorySize 
    });
  }

  /**
   * 停止日志服务
   */
  async stop(): Promise<void> {
    this.info('日志服务即将停止');
    this.isStarted = false;
    console.log('⏹️ 日志服务已停止');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ModuleHealth> {
    return {
      status: this.isStarted ? 'healthy' : 'error',
      message: this.isStarted ? 
        `日志服务运行正常 (${this.logHistory.length} 条日志)` : 
        '日志服务未启动',
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
   * 调试级别日志
   */
  debug(message: string, meta?: any): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  /**
   * 信息级别日志
   */
  info(message: string, meta?: any): void {
    this.log(LogLevel.INFO, message, meta);
  }

  /**
   * 警告级别日志
   */
  warn(message: string, meta?: any): void {
    this.log(LogLevel.WARN, message, meta);
  }

  /**
   * 错误级别日志
   */
  error(message: string, meta?: any): void {
    this.errorCount++;
    this.log(LogLevel.ERROR, message, meta);
  }

  /**
   * 严重错误级别日志
   */
  critical(message: string, meta?: any): void {
    this.errorCount++;
    this.log(LogLevel.CRITICAL, message, meta);
  }

  /**
   * 获取日志历史
   */
  getLogHistory(level?: LogLevel, limit?: number): LogEntry[] {
    let logs = this.logHistory;
    
    if (level !== undefined) {
      logs = logs.filter(log => log.level >= level);
    }
    
    if (limit) {
      logs = logs.slice(-limit);
    }
    
    return logs;
  }

  /**
   * 设置日志级别
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.info('日志级别已更新', { newLevel: LogLevel[level] });
  }

  /**
   * 核心日志方法
   */
  private log(level: LogLevel, message: string, meta?: any): void {
    if (level < this.logLevel) {
      return;
    }

    this.requestCount++;
    this.lastActivity = Date.now();

    const logEntry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      meta,
      source: this.name
    };

    // 添加到历史记录
    this.logHistory.push(logEntry);

    // 限制历史记录大小
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }

    // 输出到控制台
    this.outputToConsole(logEntry);
  }

  /**
   * 输出到控制台
   */
  private outputToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const levelStr = LogLevel[entry.level].padEnd(8);
    const message = `[${timestamp}] ${levelStr} ${entry.message}`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(message, entry.meta || '');
        break;
      case LogLevel.INFO:
        console.info(message, entry.meta || '');
        break;
      case LogLevel.WARN:
        console.warn(message, entry.meta || '');
        break;
      case LogLevel.ERROR:
        console.error(message, entry.meta || '');
        break;
      case LogLevel.CRITICAL:
        console.error(`🚨 ${message}`, entry.meta || '');
        break;
    }
  }

  /**
   * 清理旧日志
   */
  private cleanupOldLogs(): void {
    const maxAge = 24 * 60 * 60 * 1000; // 24小时
    const cutoffTime = Date.now() - maxAge;
    
    const originalLength = this.logHistory.length;
    this.logHistory = this.logHistory.filter(log => log.timestamp > cutoffTime);
    
    const cleaned = originalLength - this.logHistory.length;
    if (cleaned > 0) {
      this.debug(`清理了 ${cleaned} 条过期日志`);
    }
  }
} 