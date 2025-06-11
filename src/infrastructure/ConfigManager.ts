import { injectable } from 'tsyringe';
import { promises as fs } from 'fs';
import path from 'path';
import { 
  IConfigManager, 
  ConfigChangeCallback, 
  ConfigSchema, 
  ModuleConfig, 
  ModuleHealth, 
  ModuleMetrics 
} from '../types/interfaces.js';

/**
 * 配置管理器实现
 * 提供分层配置管理、热更新和配置验证功能
 */
@injectable()
export class ConfigManager implements IConfigManager {
  public readonly name = 'ConfigManager';
  public readonly version = '1.0.0';
  public readonly dependencies: string[] = [];

  private configs = new Map<string, any>();
  private watchers = new Map<string, ConfigChangeCallback[]>();
  private isStarted = false;
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private lastActivity = Date.now();
  private configDir = './config';
  private dataDir = './data/config';

  /**
   * 初始化配置管理器
   */
  async initialize(config: ModuleConfig): Promise<void> {
    console.log('🔄 初始化配置管理器...');
    
    this.configDir = config.configDir || './config';
    this.dataDir = config.dataDir || './data/config';
    
    // 确保配置目录存在
    await this.ensureDirectoriesExist();
    
    // 加载默认配置
    await this.loadDefaultConfigs();
    
    console.log('✅ 配置管理器初始化完成');
  }

  /**
   * 启动配置管理器
   */
  async start(): Promise<void> {
    this.isStarted = true;
    this.startTime = Date.now();
    console.log('🚀 配置管理器已启动');
  }

  /**
   * 停止配置管理器
   */
  async stop(): Promise<void> {
    this.isStarted = false;
    this.configs.clear();
    this.watchers.clear();
    console.log('⏹️ 配置管理器已停止');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ModuleHealth> {
    return {
      status: this.isStarted ? 'healthy' : 'error',
      message: this.isStarted ? '配置管理器运行正常' : '配置管理器未启动',
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
   * 获取配置
   */
  async getConfig<T>(moduleName: string): Promise<T> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      // 如果内存中有缓存，直接返回
      if (this.configs.has(moduleName)) {
        return this.configs.get(moduleName) as T;
      }

      // 尝试从文件加载
      const config = await this.loadConfigFromFile<T>(moduleName);
      this.configs.set(moduleName, config);
      
      console.log(`📖 加载配置: ${moduleName}`);
      return config;
    } catch (error) {
      this.errorCount++;
      console.error(`❌ 获取配置失败 [${moduleName}]:`, error);
      throw error;
    }
  }

  /**
   * 设置配置
   */
  async setConfig<T>(moduleName: string, config: T): Promise<void> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      // 验证配置
      if (!this.validateConfigStructure(config)) {
        throw new Error(`配置结构验证失败: ${moduleName}`);
      }

      // 更新内存配置
      this.configs.set(moduleName, config);

      // 保存到文件
      await this.saveConfigToFile(moduleName, config);

      // 通知观察者
      await this.notifyWatchers(moduleName, config);

      console.log(`💾 保存配置: ${moduleName}`);
    } catch (error) {
      this.errorCount++;
      console.error(`❌ 设置配置失败 [${moduleName}]:`, error);
      throw error;
    }
  }

  /**
   * 监听配置变化
   */
  watchConfig(moduleName: string, callback: ConfigChangeCallback): string {
    if (!this.watchers.has(moduleName)) {
      this.watchers.set(moduleName, []);
    }

    this.watchers.get(moduleName)!.push(callback);
    
    const watchId = `watch_${moduleName}_${Date.now()}`;
    console.log(`👀 监听配置变化: ${moduleName} (ID: ${watchId})`);
    
    return watchId;
  }

  /**
   * 验证配置
   */
  validateConfig<T>(config: T, schema: ConfigSchema): boolean {
    try {
      // 简单的结构验证
      if (typeof config !== 'object' || config === null) {
        return false;
      }

      // 检查必需字段
      for (const [key, requirement] of Object.entries(schema)) {
        if (requirement.required && !(key in (config as any))) {
          console.error(`❌ 配置验证失败: 缺少必需字段 ${key}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('❌ 配置验证异常:', error);
      return false;
    }
  }

  /**
   * 获取所有配置模块名称
   */
  getConfigModules(): string[] {
    return Array.from(this.configs.keys());
  }

  /**
   * 重新加载配置
   */
  async reloadConfig(moduleName: string): Promise<void> {
    try {
      this.configs.delete(moduleName);
      await this.getConfig(moduleName);
      console.log(`🔄 重新加载配置: ${moduleName}`);
    } catch (error) {
      console.error(`❌ 重新加载配置失败 [${moduleName}]:`, error);
      throw error;
    }
  }

  /**
   * 从文件加载配置
   */
  private async loadConfigFromFile<T>(moduleName: string): Promise<T> {
    const configPath = path.join(this.dataDir, `${moduleName}.json`);
    const defaultPath = path.join(this.configDir, `${moduleName}.json`);

    try {
      // 优先尝试用户配置
      if (await this.fileExists(configPath)) {
        const content = await fs.readFile(configPath, 'utf-8');
        return JSON.parse(content) as T;
      }

      // 回退到默认配置
      if (await this.fileExists(defaultPath)) {
        const content = await fs.readFile(defaultPath, 'utf-8');
        return JSON.parse(content) as T;
      }

      // 返回空配置
      console.warn(`⚠️ 配置文件不存在: ${moduleName}，使用空配置`);
      return {} as T;
    } catch (error) {
      console.error(`❌ 读取配置文件失败 [${moduleName}]:`, error);
      throw error;
    }
  }

  /**
   * 保存配置到文件
   */
  private async saveConfigToFile<T>(moduleName: string, config: T): Promise<void> {
    const configPath = path.join(this.dataDir, `${moduleName}.json`);
    
    try {
      const content = JSON.stringify(config, null, 2);
      await fs.writeFile(configPath, content, 'utf-8');
    } catch (error) {
      console.error(`❌ 保存配置文件失败 [${moduleName}]:`, error);
      throw error;
    }
  }

  /**
   * 通知配置观察者
   */
  private async notifyWatchers(moduleName: string, config: any): Promise<void> {
    const callbacks = this.watchers.get(moduleName) || [];
    
    const promises = callbacks.map(async (callback) => {
      try {
        await callback(config);
      } catch (error) {
        console.error(`❌ 配置变化通知失败 [${moduleName}]:`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * 确保目录存在
   */
  private async ensureDirectoriesExist(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      console.error('❌ 创建配置目录失败:', error);
      throw error;
    }
  }

  /**
   * 加载默认配置
   */
  private async loadDefaultConfigs(): Promise<void> {
    const defaultConfigs = {
      system: {
        rpcUrls: [
          'https://bsc-dataseed1.binance.org/',
          'https://bsc-dataseed2.binance.org/'
        ],
        chainId: 56,
        gasSettings: {
          maxGasPrice: '10000000000',
          gasMultiplier: 1.1
        },
        contracts: {
          positionManager: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
          swapRouter: '0x1b81D678ffb9C0263b24A97847620C99d213eB14'
        }
      },
      gas: {
        bsc: {
          defaultGasPrice: '5',
          fastGasPrice: '8',
          instantGasPrice: '12',
          gasLimits: {
            mint: '300000',
            burn: '200000',
            collect: '150000',
            multicall: '500000'
          },
          autoAdjustment: {
            enabled: true,
            maxRetries: 3,
            multiplierOnFailure: 1.2
          },
          userPreferences: {
            preferredSpeed: 'fast',
            maxGasPrice: '20',
            confirmBeforeHighGas: true
          }
        }
      },
      monitoring: {
        priceUpdateInterval: 5000,
        positionCheckInterval: 30000,
        alertThreshold: 0.05,
        maxHistoryDays: 30
      }
    };

    for (const [name, config] of Object.entries(defaultConfigs)) {
      if (!this.configs.has(name)) {
        this.configs.set(name, config);
      }
    }
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
   * 验证配置结构
   */
  private validateConfigStructure(config: any): boolean {
    return typeof config === 'object' && config !== null;
  }
} 