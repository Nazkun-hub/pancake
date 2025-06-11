import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// 配置环境变量
dotenv.config();

// 🔄 启动日志轮转功能
import { LogRotator } from './utils/LogRotator.js';
const logRotator = new LogRotator(5, 5, './logs'); // 5MB, 5个文件, ./logs目录
logRotator.start();

import { diContainer } from './di/container.js';
import { TYPES } from './types/interfaces.js';
import routes, { setupWebSocketManager, setGlobalIO } from './api/routes.js';

// ES模块的__dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 全局变量跟踪关闭状态
let isShuttingDown = false;

async function startServer() {
  try {
    console.log('🚀 启动PancakeSwap流动性管理服务器...');
    
    // 初始化依赖注入容器
    console.log('📦 初始化依赖注入容器...');
    diContainer.initialize();
    
    // 验证容器健康状态
    const isHealthy = await diContainer.validateContainer();
    if (!isHealthy) {
      throw new Error('依赖注入容器健康检查失败');
    }
    
    // 手动初始化关键服务
    console.log('⚙️ 初始化关键服务...');
    
    // 首先启动事件总线
    const eventBus = diContainer.getService(TYPES.EventBus) as any;
    await eventBus.initialize({});
    await eventBus.start();
    console.log('✅ 事件总线已启动');
    
    // 获取Web3服务并初始化
    const web3Service = diContainer.getService(TYPES.Web3Service) as any;
    await web3Service.initialize({});
    await web3Service.start();
    
    // 获取合约服务并初始化
    const contractService = diContainer.getService(TYPES.ContractService) as any;
    await contractService.initialize({});
    await contractService.start();
    
    console.log('✅ 关键服务初始化完成');
    
    // 创建Express应用
    const app = express();
    const server = createServer(app);
    
    // 创建Socket.IO服务器
    const io = new SocketIOServer(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "*",
        methods: ["GET", "POST"]
      }
    });
    
    // 设置全局IO实例
    setGlobalIO(io);
    
    // 设置WebSocket管理器
    setupWebSocketManager(io);
    
    // 连接策略引擎的WebSocket推送
    try {
      const 策略引擎 = diContainer.getService(TYPES.策略引擎) as any;
      if (策略引擎 && typeof 策略引擎.setWebSocketIO === 'function') {
        策略引擎.setWebSocketIO(io);
        console.log('✅ 策略引擎WebSocket推送已连接');
        
        // 🔧 新增：初始化策略引擎以加载持久化数据
        if (typeof 策略引擎.initialize === 'function') {
          console.log('🔄 初始化策略引擎...');
          await 策略引擎.initialize({});
          console.log('✅ 策略引擎初始化完成');
        }
        
        // 🔧 新增：启动策略引擎
        if (typeof 策略引擎.start === 'function') {
          console.log('🚀 启动策略引擎...');
          await 策略引擎.start();
          console.log('✅ 策略引擎已启动');
        }
      } else {
        console.warn('⚠️ 策略引擎WebSocket推送连接失败 - 方法不存在');
      }
    } catch (error) {
      console.warn('⚠️ 策略引擎WebSocket推送连接失败:', error);
    }
    
    // 中间件
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // 请求日志
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
    
    // API路由
    app.use('/api', routes);
    
    // 静态文件服务（用于前端）
    app.use(express.static(path.join(__dirname, '../web/public')));
    
    // 默认路由
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../web/public/index.html'));
    });
    
    // 健康检查端点
    app.get('/health', async (req, res) => {
      try {
        const serviceHealthChecks = [];
        const registeredServices = diContainer.getRegisteredServices();
        
        // 检查关键服务的健康状态
        const keyServices = [
          { name: 'Web3Service', type: TYPES.Web3Service },
          { name: 'ContractService', type: TYPES.ContractService },
          { name: '策略引擎', type: TYPES.策略引擎 }
        ];
        
        for (const serviceInfo of keyServices) {
          try {
            const service = diContainer.getService(serviceInfo.type) as any;
            if (service && typeof service.healthCheck === 'function') {
              const health = await service.healthCheck();
              serviceHealthChecks.push({
                name: serviceInfo.name,
                status: health.status || 'unknown',
                message: health.message || 'No message',
                timestamp: health.timestamp || Date.now()
              });
            } else {
              serviceHealthChecks.push({
                name: serviceInfo.name,
                status: 'unknown',
                message: 'Service found but no healthCheck method',
                timestamp: Date.now()
              });
            }
          } catch (error) {
            serviceHealthChecks.push({
              name: serviceInfo.name,
              status: 'error',
              message: error instanceof Error ? error.message : 'Unknown error',
              timestamp: Date.now()
            });
          }
        }
        
        // 检查整体状态
        const hasErrors = serviceHealthChecks.some(check => check.status === 'error');
        const overallStatus = hasErrors ? 'unhealthy' : 'healthy';
        
        res.json({
          status: overallStatus,
          timestamp: new Date().toISOString(),
          modules: registeredServices,
          services: serviceHealthChecks,
          websocket: {
            connected: true,
            activeConnections: io.engine.clientsCount
          }
        });
      } catch (error) {
        res.status(500).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
    
    // 错误处理中间件
    app.use((err: any, req: any, res: any, next: any) => {
      console.error('❌ 服务器错误:', err);
      res.status(500).json({
        success: false,
        error: '内部服务器错误',
        message: err.message
      });
    });
    
    // 启动服务器
    const PORT = process.env.API_PORT || 4000;
    server.listen(PORT, () => {
      console.log('✅ 服务器启动成功!');
      console.log('=====================================================');
      console.log('🎯 PancakeSwap V3 流动性管理系统');
      console.log('=====================================================');
      console.log(`📡 主程序后端API: http://localhost:${PORT}/api`);
      console.log(`🔌 WebSocket服务: ws://localhost:${PORT}`);
      console.log(`🔍 健康检查: http://localhost:${PORT}/health`);
      console.log(`📋 测试页面: http://localhost:${PORT}/test/`);
      console.log('');
      console.log('🌐 其他系统服务:');
      console.log(`📊 策略管理前端: http://localhost:5000`);
      console.log(`   └─ 启动方式: cd strategy-ui && npm start`);
      console.log(`🏠 主程序前端: http://localhost:4001`);
      console.log(`   └─ 启动方式: cd web && npm start`);
      console.log(`🎮 OKX DEX API: http://localhost:8000`);
      console.log(`   └─ 启动方式: cd okx_dex_api && npm run web`);
      console.log('=====================================================');
    });
    
    // 优雅关闭处理
    const gracefulShutdown = async (signal: string) => {
      if (isShuttingDown) {
        console.log('🔄 关闭中，忽略信号:', signal);
        return;
      }
      
      isShuttingDown = true;
      console.log(`📡 收到信号 ${signal}，开始优雅关闭...`);
      
      try {
        // 停止接受新连接
        server.close(() => {
          console.log('🌐 HTTP服务器已关闭');
        });
        
        // 关闭WebSocket连接
        io.close();
        console.log('📡 WebSocket服务器已关闭');
        
        // 关闭所有服务
        console.log('🛑 关闭所有服务...');
        diContainer.dispose();
        
        // 🔄 停止日志轮转
        logRotator.stop();
        
        console.log('✅ 所有服务已安全关闭');
        process.exit(0);
      } catch (error) {
        console.error('❌ 关闭过程中发生错误:', error);
        // 🔄 确保停止日志轮转
        logRotator.stop();
        process.exit(1);
      }
    };
    
    // 只注册一次信号处理器
    if (!process.listeners('SIGTERM').length) {
      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    }
    if (!process.listeners('SIGINT').length) {
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    }
    if (!process.listeners('SIGHUP').length) {
      process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));
    }
    
    // 未捕获异常处理
    if (!process.listeners('uncaughtException').length) {
      process.on('uncaughtException', (error) => {
        console.error('❌ 未捕获异常:', error);
        gracefulShutdown('uncaughtException');
      });
    }
    
    if (!process.listeners('unhandledRejection').length) {
      process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ 未处理的Promise拒绝:', reason);
        console.error('Promise:', promise);
        gracefulShutdown('unhandledRejection');
      });
    }
    
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

// 启动服务器
startServer().catch(console.error); 