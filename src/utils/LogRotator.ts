/**
 * 轻量化日志轮转工具
 * 拦截控制台输出并写入到轮转文件
 */
import fs from 'fs';
import path from 'path';

export class LogRotator {
  private maxSize: number; // 最大文件大小(字节)
  private maxFiles: number; // 最大文件数量
  private logDir: string; // 日志目录
  private originalConsole: any = {}; // 原始console方法

  constructor(maxSizeMB: number = 5, maxFiles: number = 5, logDir: string = './logs') {
    this.maxSize = maxSizeMB * 1024 * 1024; // 转换为字节
    this.maxFiles = maxFiles;
    this.logDir = logDir;
    
    // 确保日志目录存在
    this.ensureLogDir();
  }

  /**
   * 启动日志轮转
   */
  start(): void {
    console.log('🔄 启动日志轮转功能...');
    console.log(`📁 日志目录: ${this.logDir}`);
    console.log(`📏 单文件限制: ${this.maxSize / (1024 * 1024)}MB`);
    console.log(`📊 最大文件数: ${this.maxFiles}`);

    // 备份原始console方法
    this.originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug
    };

    // 重写console方法
    console.log = (...args) => this.writeLog('backend.log', ...args);
    console.info = (...args) => this.writeLog('backend.log', ...args);
    console.warn = (...args) => this.writeLog('backend.log', ...args);
    console.error = (...args) => this.writeLog('backend.log', ...args);
    console.debug = (...args) => this.writeLog('backend.log', ...args);

    // 输出确认信息到原始console
    this.originalConsole.log('✅ 日志轮转功能已启动');
  }

  /**
   * 停止日志轮转
   */
  stop(): void {
    // 恢复原始console方法
    console.log = this.originalConsole.log;
    console.info = this.originalConsole.info;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;

    console.log('⏹️ 日志轮转功能已停止');
  }

  /**
   * 写入日志
   */
  private writeLog(filename: string, ...args: any[]): void {
    // 将参数转换为字符串，保持原始格式 (支持BigInt序列化)
    const message = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg, (key, value) => 
            typeof value === 'bigint' ? value.toString() : value, 2);
        } catch (error) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    
    // 🕐 新增：生成时间戳（格式：月/日/小时/分钟/秒）
    const now = new Date();
    const timestamp = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    // 🔧 修改：为文件写入添加时间戳，但控制台输出保持原样
    const logLineForFile = `[${timestamp}] ${message}\n`;
    const logLineForConsole = message;

    // 同时输出到原始控制台（不包含时间戳）
    this.originalConsole.log(...args);

    // 🔧 新增：根据前缀决定写入哪个日志文件
    let targetFile = filename;
    
    if (message.includes('[STRATEGY]')) {
      targetFile = 'strategy-execution.log';
    } else if (message.includes('[MONITOR]')) {
      targetFile = 'price-monitoring.log';
    }
    // 其他日志（系统、API等）仍写入backend.log

    // 写入文件（包含时间戳）
    const logFile = path.join(this.logDir, targetFile);
    
    try {
      // 检查文件大小，如果超过限制则轮转
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > this.maxSize) {
          this.rotateFile(targetFile);
        }
      }

      // 追加写入日志（文件版本包含时间戳）
      fs.appendFileSync(logFile, logLineForFile, 'utf8');
    } catch (error) {
      // 如果写入失败，至少保证控制台有输出
      this.originalConsole.error('❌ 写入日志失败:', error);
    }
  }

  /**
   * 轮转文件
   */
  private rotateFile(filename: string): void {
    const baseName = path.parse(filename).name;
    const ext = path.parse(filename).ext;
    
    try {
      // 删除最旧的文件
      const oldestFile = path.join(this.logDir, `${baseName}.${this.maxFiles}${ext}`);
      if (fs.existsSync(oldestFile)) {
        fs.unlinkSync(oldestFile);
      }

      // 重命名现有文件
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const currentFile = path.join(this.logDir, `${baseName}.${i}${ext}`);
        const nextFile = path.join(this.logDir, `${baseName}.${i + 1}${ext}`);
        
        if (fs.existsSync(currentFile)) {
          fs.renameSync(currentFile, nextFile);
        }
      }

      // 将当前文件重命名为.1
      const currentFile = path.join(this.logDir, filename);
      const firstRotatedFile = path.join(this.logDir, `${baseName}.1${ext}`);
      
      if (fs.existsSync(currentFile)) {
        fs.renameSync(currentFile, firstRotatedFile);
      }

      this.originalConsole.log(`🔄 日志文件已轮转: ${filename}`);
    } catch (error) {
      this.originalConsole.error('❌ 日志轮转失败:', error);
    }
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 创建专用日志文件写入器
   */
  createLogger(filename: string) {
    return {
      log: (...args: any[]) => this.writeLog(filename, ...args),
      info: (...args: any[]) => this.writeLog(filename, ...args),
      warn: (...args: any[]) => this.writeLog(filename, ...args),
      error: (...args: any[]) => this.writeLog(filename, ...args),
      debug: (...args: any[]) => this.writeLog(filename, ...args)
    };
  }
} 