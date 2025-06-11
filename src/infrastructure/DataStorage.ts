import { injectable } from 'tsyringe';
import { promises as fs } from 'fs';
import path from 'path';
import { 
  IDataStorage, 
  ModuleConfig, 
  ModuleHealth, 
  ModuleMetrics 
} from '../types/interfaces.js';

/**
 * 数据存储实现
 * 提供JSON文件存储、批量操作和数据备份功能
 */
@injectable()
export class DataStorage implements IDataStorage {
  public readonly name = 'DataStorage';
  public readonly version = '1.0.0';
  public readonly dependencies: string[] = [];

  private isStarted = false;
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private lastActivity = Date.now();
  private dataDir = './data';
  private backupDir = './data/backups';

  /**
   * 初始化数据存储
   */
  async initialize(config: ModuleConfig): Promise<void> {
    console.log('🔄 初始化数据存储...');
    
    this.dataDir = config.dataDir || './data';
    this.backupDir = config.backupDir || './data/backups';
    
    // 确保数据目录存在
    await this.ensureDirectoriesExist();
    
    // 设置自动备份
    if (config.enableAutoBackup) {
      this.setupAutoBackup(config.backupInterval || 24 * 60 * 60 * 1000); // 默认每24小时
    }
    
    console.log('✅ 数据存储初始化完成');
  }

  /**
   * 启动数据存储
   */
  async start(): Promise<void> {
    this.isStarted = true;
    this.startTime = Date.now();
    console.log('🚀 数据存储已启动');
  }

  /**
   * 停止数据存储
   */
  async stop(): Promise<void> {
    this.isStarted = false;
    console.log('⏹️ 数据存储已停止');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ModuleHealth> {
    try {
      // 检查数据目录是否可写
      const testFile = path.join(this.dataDir, '.health_check');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);

      return {
        status: this.isStarted ? 'healthy' : 'error',
        message: this.isStarted ? '数据存储运行正常' : '数据存储未启动',
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        status: 'error',
        message: `数据存储健康检查失败: ${error}`,
        timestamp: Date.now()
      };
    }
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
   * 保存数据
   */
  async save<T>(key: string, data: T): Promise<void> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      const filePath = this.getFilePath(key);
      const content = JSON.stringify(data, null, 2);
      
      // 确保目录存在
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      
      // 原子写入（先写临时文件，再重命名）
      const tempPath = filePath + '.tmp';
      await fs.writeFile(tempPath, content, 'utf-8');
      await fs.rename(tempPath, filePath);
      
      console.log(`💾 保存数据: ${key}`);
    } catch (error) {
      this.errorCount++;
      console.error(`❌ 保存数据失败 [${key}]:`, error);
      throw error;
    }
  }

  /**
   * 加载数据
   */
  async load<T>(key: string): Promise<T | null> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      const filePath = this.getFilePath(key);
      
      if (!(await this.fileExists(filePath))) {
        return null;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as T;
      
      console.log(`📖 加载数据: ${key}`);
      return data;
    } catch (error) {
      this.errorCount++;
      console.error(`❌ 加载数据失败 [${key}]:`, error);
      return null;
    }
  }

  /**
   * 删除数据
   */
  async delete(key: string): Promise<void> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      const filePath = this.getFilePath(key);
      
      if (await this.fileExists(filePath)) {
        await fs.unlink(filePath);
        console.log(`🗑️ 删除数据: ${key}`);
      }
    } catch (error) {
      this.errorCount++;
      console.error(`❌ 删除数据失败 [${key}]:`, error);
      throw error;
    }
  }

  /**
   * 列出匹配的键
   */
  async list(pattern: string): Promise<string[]> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      const keys: string[] = [];
      await this.scanDirectory(this.dataDir, '', pattern, keys);
      
      console.log(`📋 列出数据: ${pattern} (${keys.length} 项)`);
      return keys;
    } catch (error) {
      this.errorCount++;
      console.error(`❌ 列出数据失败 [${pattern}]:`, error);
      throw error;
    }
  }

  /**
   * 批量保存数据
   */
  async saveBatch(items: Array<{key: string, data: any}>): Promise<void> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      const promises = items.map(item => this.save(item.key, item.data));
      await Promise.all(promises);
      
      console.log(`💾 批量保存数据: ${items.length} 项`);
    } catch (error) {
      this.errorCount++;
      console.error('❌ 批量保存数据失败:', error);
      throw error;
    }
  }

  /**
   * 批量加载数据
   */
  async loadBatch<T>(keys: string[]): Promise<Array<T | null>> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      const promises = keys.map(key => this.load<T>(key));
      const results = await Promise.all(promises);
      
      console.log(`📖 批量加载数据: ${keys.length} 项`);
      return results;
    } catch (error) {
      this.errorCount++;
      console.error('❌ 批量加载数据失败:', error);
      throw error;
    }
  }

  /**
   * 备份数据
   */
  async backup(key?: string): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.backupDir, `backup_${timestamp}`);
      
      if (key) {
        // 备份单个文件
        const sourcePath = this.getFilePath(key);
        const targetPath = path.join(backupPath, `${key}.json`);
        
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(sourcePath, targetPath);
        
        console.log(`📦 备份数据: ${key} -> ${backupPath}`);
      } else {
        // 备份整个数据目录
        await this.copyDirectory(this.dataDir, backupPath);
        console.log(`📦 全量备份: ${this.dataDir} -> ${backupPath}`);
      }
      
      return backupPath;
    } catch (error) {
      this.errorCount++;
      console.error(`❌ 备份数据失败 [${key}]:`, error);
      throw error;
    }
  }

  /**
   * 还原数据
   */
  async restore(backupPath: string, key?: string): Promise<void> {
    try {
      if (key) {
        // 还原单个文件
        const sourcePath = path.join(backupPath, `${key}.json`);
        const targetPath = this.getFilePath(key);
        
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(sourcePath, targetPath);
        
        console.log(`📥 还原数据: ${key} <- ${backupPath}`);
      } else {
        // 还原整个数据目录
        await this.copyDirectory(backupPath, this.dataDir);
        console.log(`📥 全量还原: ${this.dataDir} <- ${backupPath}`);
      }
    } catch (error) {
      this.errorCount++;
      console.error(`❌ 还原数据失败 [${key}]:`, error);
      throw error;
    }
  }

  /**
   * 获取存储统计信息
   */
  async getStorageStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    lastModified: number;
  }> {
    try {
      let totalFiles = 0;
      let totalSize = 0;
      let lastModified = 0;

      await this.scanDirectoryStats(this.dataDir, (stats) => {
        totalFiles++;
        totalSize += stats.size;
        lastModified = Math.max(lastModified, stats.mtimeMs);
      });

      return { totalFiles, totalSize, lastModified };
    } catch (error) {
      console.error('❌ 获取存储统计失败:', error);
      return { totalFiles: 0, totalSize: 0, lastModified: 0 };
    }
  }

  /**
   * 获取文件路径
   */
  private getFilePath(key: string): string {
    // 安全处理key，防止目录遍历攻击
    const sanitizedKey = key.replace(/[<>:"/\\|?*]/g, '_');
    return path.join(this.dataDir, `${sanitizedKey}.json`);
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 确保目录存在
   */
  private async ensureDirectoriesExist(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      console.error('❌ 创建数据目录失败:', error);
      throw error;
    }
  }

  /**
   * 扫描目录
   */
  private async scanDirectory(dir: string, prefix: string, pattern: string, keys: string[]): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const keyPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        
        if (entry.isDirectory()) {
          await this.scanDirectory(fullPath, keyPath, pattern, keys);
        } else if (entry.name.endsWith('.json')) {
          const key = keyPath.replace('.json', '');
          if (this.matchesPattern(key, pattern)) {
            keys.push(key);
          }
        }
      }
    } catch (error) {
      // 忽略无法访问的目录
    }
  }

  /**
   * 扫描目录统计信息
   */
  private async scanDirectoryStats(dir: string, callback: (stats: any) => void): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await this.scanDirectoryStats(fullPath, callback);
        } else {
          const stats = await fs.stat(fullPath);
          callback(stats);
        }
      }
    } catch (error) {
      // 忽略无法访问的目录
    }
  }

  /**
   * 复制目录
   */
  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.mkdir(target, { recursive: true });
    
    const entries = await fs.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  /**
   * 模式匹配
   */
  private matchesPattern(text: string, pattern: string): boolean {
    // 简单的通配符匹配
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
    return regex.test(text);
  }

  /**
   * 设置自动备份
   */
  private setupAutoBackup(interval: number): void {
    setInterval(async () => {
      try {
        const backupPath = await this.backup();
        console.log(`🔄 自动备份完成: ${backupPath}`);
        
        // 清理旧备份（保留最新10个）
        await this.cleanupOldBackups(10);
      } catch (error) {
        console.error('❌ 自动备份失败:', error);
      }
    }, interval);
  }

  /**
   * 清理旧备份
   */
  private async cleanupOldBackups(keepCount: number): Promise<void> {
    try {
      const entries = await fs.readdir(this.backupDir, { withFileTypes: true });
      const backups = entries
        .filter(entry => entry.isDirectory() && entry.name.startsWith('backup_'))
        .map(entry => ({
          name: entry.name,
          path: path.join(this.backupDir, entry.name)
        }))
        .sort((a, b) => b.name.localeCompare(a.name)); // 按时间倒序

      if (backups.length > keepCount) {
        const toDelete = backups.slice(keepCount);
        
        for (const backup of toDelete) {
          await fs.rm(backup.path, { recursive: true, force: true });
          console.log(`🗑️ 清理旧备份: ${backup.name}`);
        }
      }
    } catch (error) {
      console.error('❌ 清理旧备份失败:', error);
    }
  }
} 