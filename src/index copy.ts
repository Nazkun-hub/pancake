import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { diContainer } from './di/container.js';
import { TYPES } from './types/interfaces.js';
import router from './api/routes.js';
import type { 
  IEventBus, 
  IConfigManager, 
  IPoolManager, 
  IDataStorage 
} from './types/interfaces.js';

/**
 * PancakeSwap V3 流动性管理系统
 * 高度模块化的DeFi流动性管理平台
 */
class PancakeSwapV3Manager {
  private isInitialized = false;
  private isRunning = false;
  private webServer?: express.Application;

  /**
   * 应用程序初始化
   */
  async initialize(): Promise<void> {
    try {
      console.log('🎯 PancakeSwap V3 流动性管理系统启动中...');
      console.log('='.repeat(50));
      
      // 1. 初始化依赖注入容器
      console.log('📦 初始化依赖注入容器...');
      diContainer.initialize();
      
      // 2. 验证容器健康状态
      const isHealthy = await diContainer.validateContainer();
      if (!isHealthy) {
        throw new Error('依赖注入容器健康检查失败');
      }
      
      // 3. 获取核心服务
      const eventBus = diContainer.getService<IEventBus>(TYPES.EventBus);
      const configManager = diContainer.getService<IConfigManager>(TYPES.ConfigManager);
      const dataStorage = diContainer.getService<IDataStorage>(TYPES.DataStorage);
      
      // 4. 初始化核心服务
      console.log('⚙️ 初始化核心服务...');
      
      await eventBus.initialize({});
      await configManager.initialize({
        configDir: './config',
        dataDir: './data/config'
      });
      await dataStorage.initialize({
        dataDir: './data',
        enableAutoBackup: true,
        backupInterval: 24 * 60 * 60 * 1000 // 24小时
      });
      
      // 5. 启动核心服务
      console.log('🚀 启动核心服务...');
      await eventBus.start();
      await configManager.start();
      await dataStorage.start();
      
      // 6. 发布系统启动事件
      await eventBus.publish({
        type: 'SystemStarted',
        data: {
          timestamp: Date.now(),
          version: '1.0.0',
          modules: diContainer.getRegisteredServices()
        },
        timestamp: Date.now(),
        source: 'PancakeSwapV3Manager'
      });
      
      this.isInitialized = true;
      console.log('✅ 系统初始化完成');
      
    } catch (error) {
      console.error('❌ 系统初始化失败:', error);
      throw error;
    }
  }

  /**
   * 启动应用程序
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log('🏃 启动应用程序服务...');
      
      // 获取业务层服务
      const poolManager = diContainer.getService<IPoolManager>(TYPES.PoolManager);
      const eventBus = diContainer.getService<IEventBus>(TYPES.EventBus);
      
      // 获取Web3服务并初始化
      const web3Service = diContainer.getService<any>(TYPES.Web3Service);
      await web3Service.initialize({});
      await web3Service.start();
      
      // 获取合约服务并初始化
      const contractService = diContainer.getService<any>(TYPES.ContractService);
      await contractService.initialize({});
      await contractService.start();
      
      // 启动业务层服务
      await poolManager.initialize({
        maxPools: 10,
        monitoringInterval: 30000
      });
      await poolManager.start();
      
      // 设置信号处理
      this.setupSignalHandlers();
      
      // 启动Web服务器
      await this.startWebServer();
      
      // 发布系统就绪事件
      await eventBus.publish({
        type: 'SystemReady',
        data: {
          timestamp: Date.now(),
          port: process.env.API_PORT || 4000
        },
        timestamp: Date.now(),
        source: 'PancakeSwapV3Manager'
      });
      
      this.isRunning = true;
      
      console.log('🎉 PancakeSwap V3 流动性管理系统已启动');
      console.log(`📍 访问地址: http://localhost:${process.env.API_PORT || 4000}`);
      console.log('='.repeat(50));
      
    } catch (error) {
      console.error('❌ 应用程序启动失败:', error);
      throw error;
    }
  }

  /**
   * 停止应用程序
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      console.log('⏹️ 正在停止系统...');
      
      const eventBus = diContainer.getService<IEventBus>(TYPES.EventBus);
      
      // 发布系统停止事件
      await eventBus.publish({
        type: 'SystemStopping',
        data: { timestamp: Date.now() },
        timestamp: Date.now(),
        source: 'PancakeSwapV3Manager'
      });
      
      // 停止所有服务（按相反顺序）
      const poolManager = diContainer.getService<IPoolManager>(TYPES.PoolManager);
      const configManager = diContainer.getService<IConfigManager>(TYPES.ConfigManager);
      const dataStorage = diContainer.getService<IDataStorage>(TYPES.DataStorage);
      
      await poolManager.stop();
      await dataStorage.stop();
      await configManager.stop();
      await eventBus.stop();
      
      // 清理依赖注入容器
      diContainer.dispose();
      
      this.isRunning = false;
      this.isInitialized = false;
      
      console.log('✅ 系统已安全停止');
      
    } catch (error) {
      console.error('❌ 系统停止时发生错误:', error);
      throw error;
    }
  }

  /**
   * 启动Web服务器
   */
  private async startWebServer(): Promise<void> {
    try {
      this.webServer = express();
      
      // 中间件
      this.webServer.use(cors());
      this.webServer.use(express.json());
      this.webServer.use(express.urlencoded({ extended: true }));
      
      // 🌐 添加静态文件服务（需要在API路由之前）
      this.webServer.use('/test', express.static(path.join(process.cwd(), 'test')));
      this.webServer.use('/public', express.static(path.join(process.cwd(), 'public')));
      this.webServer.use('/web', express.static(path.join(process.cwd(), 'web')));
      this.webServer.use('/', express.static(path.join(process.cwd(), 'web/public')));
      
      // 健康检查（需要在静态文件之前）
      this.webServer.get('/health', (req, res) => {
        res.json({
          status: 'ok',
          timestamp: Date.now(),
          uptime: process.uptime(),
          system: 'PancakeSwap V3 Manager'
        });
      });
      
      // API路由
      this.webServer.use('/api', router);
      
      // 注册API路由到Express应用
      
      // 默认首页路由
      this.webServer.get('/', (req, res) => {
        res.send(`
          <html>
            <head><title>PancakeSwap V3 流动性管理系统</title></head>
            <body style="font-family: Arial, sans-serif; margin: 40px; line-height: 1.6;">
              <h1>🥞 PancakeSwap V3 流动性管理系统</h1>
              <p>欢迎使用PancakeSwap V3流动性管理系统！</p>
              <h2>📋 可用测试页面:</h2>
              <ul>
                <li><a href="/test/test-new-mint.html">🆕 创建流动性头寸测试</a></li>
                <li><a href="/api/wallet/status">🔍 钱包状态API</a></li>
                <li><a href="/health">💚 健康检查</a></li>
              </ul>
              <h2>📊 系统状态:</h2>
              <p>✅ API服务器运行中 (端口 ${process.env.API_PORT || 4000})</p>
              <p>✅ 静态文件服务已启用</p>
              <p>📖 <a href="https://docs.pancakeswap.finance/">PancakeSwap V3 文档</a></p>
            </body>
          </html>
        `);
      });
      
      // 错误处理
      this.webServer.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
        console.error('HTTP服务器错误:', err);
        res.status(500).json({
          success: false,
          error: 'Internal Server Error'
        });
      });
      
      // 404处理
      this.webServer.use((req: express.Request, res: express.Response) => {
        res.status(404).json({
          success: false,
          error: 'API endpoint not found'
        });
      });
      
      const port = process.env.API_PORT || 4000;
      
      // 启动服务器
      this.webServer.listen(port, () => {
        console.log(`🌐 HTTP API服务器已启动`);
        console.log(`📍 API地址: http://localhost:${port}/api`);
        console.log(`🔍 健康检查: http://localhost:${port}/health`);
        console.log(`📋 测试页面: http://localhost:${port}/test/`);
        console.log(`🏠 静态文件: http://localhost:${port}/`);
      });
      
    } catch (error) {
      console.error('❌ Web服务器启动失败:', error);
      throw error;
    }
  }

  /**
   * 设置信号处理器
   */
  private setupSignalHandlers(): void {
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n📨 收到关闭信号: ${signal}`);
      console.log('🔄 开始优雅关闭...');
      
      try {
        // 设置强制退出超时
        const forceExitTimeout = setTimeout(() => {
          console.log('⚠️ 优雅关闭超时，强制退出...');
          process.exit(1);
        }, 5000); // 5秒超时
        
        await this.stop();
        clearTimeout(forceExitTimeout);
        
        console.log('👋 系统已安全关闭！');
        process.exit(0);
      } catch (error) {
        console.error('❌ 优雅关闭失败:', error);
        process.exit(1);
      }
    };

    // 监听各种退出信号
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

    // 监听未捕获的异常
    process.on('uncaughtException', (error) => {
      console.error('❌ 未捕获的异常:', error);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ 未处理的Promise拒绝:', reason);
      console.error('Promise:', promise);
      gracefulShutdown('unhandledRejection');
    });
  }

  /**
   * 获取系统状态
   */
  async getSystemStatus(): Promise<{
    initialized: boolean;
    running: boolean;
    services: Array<{
      name: string;
      status: string;
      uptime: number;
    }>;
  }> {
    const services = [];
    
    if (this.isInitialized) {
      try {
        const serviceTypes = [
          TYPES.EventBus,
          TYPES.ConfigManager,
          TYPES.DataStorage,
          TYPES.PoolManager
        ];

        for (const serviceType of serviceTypes) {
          try {
            const service = diContainer.getService<any>(serviceType);
            const health = await service.healthCheck();
            const metrics = service.getMetrics();
            
            services.push({
              name: service.name,
              status: health.status,
              uptime: metrics.uptime
            });
          } catch (error) {
            services.push({
              name: serviceType.toString(),
              status: 'error',
              uptime: 0
            });
          }
        }
      } catch (error) {
        console.error('获取系统状态失败:', error);
      }
    }

    return {
      initialized: this.isInitialized,
      running: this.isRunning,
      services
    };
  }
}

// 主函数
async function main() {
  const app = new PancakeSwapV3Manager();
  
  try {
    await app.start();
  } catch (error) {
    console.error('❌ 应用程序启动失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件，则启动应用程序
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { PancakeSwapV3Manager }; 