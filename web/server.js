const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 全局变量用于跟踪定时器和连接
let globalIntervals = [];
let connectedClients = new Map();
let isShuttingDown = false;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 检查服务器是否在关闭中的中间件
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.status(503).json({
      success: false,
      error: '服务器正在关闭中'
    });
    return;
  }
  next();
});

// PancakeSwap系统API基础URL
const PANCAKE_API_BASE = 'http://localhost:4000/api';

// 钱包管理API路由
app.get('/api/wallet/status', async (req, res) => {
    try {
        const response = await axios.get(`${PANCAKE_API_BASE}/wallet/status`);
        res.json(response.data);
    } catch (error) {
        console.error('获取钱包状态失败:', error.message);
        res.status(500).json({
            success: false,
            error: '获取钱包状态失败',
            hasWallet: false,
            isUnlocked: false
        });
    }
});

app.post('/api/wallet/create', async (req, res) => {
    try {
        const { privateKey, password } = req.body;
        
        if (!privateKey || !password) {
            return res.status(400).json({
                success: false,
                error: '私钥和密码不能为空'
            });
        }
        
        const response = await axios.post(`${PANCAKE_API_BASE}/wallet/create`, {
            privateKey,
            password
        });
        
        // 通知所有连接的客户端钱包状态变化
        io.emit('walletStatusChanged', {
            hasWallet: true,
            isUnlocked: false
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('创建钱包失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || '创建钱包失败'
        });
    }
});

app.post('/api/wallet/unlock', async (req, res) => {
    try {
        const { password } = req.body;
        
        if (!password) {
            return res.status(400).json({
                success: false,
                error: '密码不能为空'
            });
        }
        
        const response = await axios.post(`${PANCAKE_API_BASE}/wallet/unlock`, {
            password
        });
        
        // 通知所有连接的客户端钱包状态变化
        io.emit('walletStatusChanged', {
            hasWallet: true,
            isUnlocked: true
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('解锁钱包失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || '解锁钱包失败'
        });
    }
});

app.post('/api/wallet/lock', async (req, res) => {
    try {
        const response = await axios.post(`${PANCAKE_API_BASE}/wallet/lock`);
        
        // 通知所有连接的客户端钱包状态变化
        io.emit('walletStatusChanged', {
            hasWallet: true,
            isUnlocked: false
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('锁定钱包失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || '锁定钱包失败'
        });
    }
});

app.delete('/api/wallet/delete', async (req, res) => {
    try {
        const response = await axios.delete(`${PANCAKE_API_BASE}/wallet/delete`);
        
        // 通知所有连接的客户端钱包状态变化
        io.emit('walletStatusChanged', {
            hasWallet: false,
            isUnlocked: false
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('删除钱包失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || '删除钱包失败'
        });
    }
});

app.get('/api/wallet/info', async (req, res) => {
    try {
        const response = await axios.get(`${PANCAKE_API_BASE}/wallet/info`);
        res.json(response.data);
    } catch (error) {
        console.error('获取钱包信息失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || '获取钱包信息失败'
        });
    }
});

// 头寸管理API路由
app.post('/api/position/create', async (req, res) => {
    try {
        const positionData = req.body;
        
        const response = await axios.post(`${PANCAKE_API_BASE}/position/create`, positionData);
        res.json(response.data);
    } catch (error) {
        console.error('创建头寸失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || '创建头寸失败'
        });
    }
});

// 池子管理API路由
app.get('/api/pools', async (req, res) => {
    try {
        const response = await axios.get(`${PANCAKE_API_BASE}/pools`);
        res.json(response.data);
    } catch (error) {
        console.error('获取池子数据失败:', error.message);
        res.status(500).json({
            success: false,
            pools: [],
            error: '获取池子数据失败'
        });
    }
});

// 系统状态API路由
app.get('/api/system/status', async (req, res) => {
    try {
        const response = await axios.get(`${PANCAKE_API_BASE}/system/status`);
        res.json(response.data);
    } catch (error) {
        console.error('获取系统状态失败:', error.message);
        res.status(500).json({
            success: false,
            error: '获取系统状态失败'
        });
    }
});

// Web3相关API路由
app.post('/api/wallet/connect-web3', async (req, res) => {
    try {
        const response = await axios.post(`${PANCAKE_API_BASE}/wallet/connect-web3`);
        
        // 通知所有连接的客户端Web3连接状态变化
        io.emit('web3StatusChanged', {
            connected: true,
            walletInfo: response.data.walletInfo
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('Web3钱包连接失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || 'Web3钱包连接失败'
        });
    }
});

app.get('/api/wallet/network-info', async (req, res) => {
    try {
        const response = await axios.get(`${PANCAKE_API_BASE}/wallet/network-info`);
        res.json(response.data);
    } catch (error) {
        console.error('获取网络信息失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || '获取网络信息失败'
        });
    }
});

app.get('/api/wallet/balance/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const response = await axios.get(`${PANCAKE_API_BASE}/wallet/balance/${address}`);
        res.json(response.data);
    } catch (error) {
        console.error('获取余额失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || '获取余额失败'
        });
    }
});

// 池信息API路由
app.get('/api/pool-info/:poolAddress', async (req, res) => {
    try {
        const { poolAddress } = req.params;
        
        if (!poolAddress) {
            return res.status(400).json({
                success: false,
                error: '池地址参数不能为空'
            });
        }
        
        if (!/^0x[a-fA-F0-9]{40}$/.test(poolAddress)) {
            return res.status(400).json({
                success: false,
                error: '池地址格式不正确'
            });
        }
        
        const response = await axios.get(`${PANCAKE_API_BASE}/pool-info/${poolAddress}`);
        res.json(response.data);
    } catch (error) {
        console.error('获取池信息失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || '获取池信息失败'
        });
    }
});

// 流动性添加API路由
app.post('/api/add-liquidity', async (req, res) => {
    try {
        const liquidityData = req.body;
        const response = await axios.post(`${PANCAKE_API_BASE}/add-liquidity`, liquidityData);
        res.json(response.data);
    } catch (error) {
        console.error('添加流动性失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || '添加流动性失败'
        });
    }
});

// 头寸管理API路由
app.get('/api/positions/:userAddress', async (req, res) => {
    try {
        const { userAddress } = req.params;
        const response = await axios.get(`${PANCAKE_API_BASE}/positions/${userAddress}`);
        res.json(response.data);
    } catch (error) {
        console.error('获取用户头寸失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || '获取用户头寸失败'
        });
    }
});

app.delete('/api/positions/batch/:userAddress', async (req, res) => {
    try {
        const { userAddress } = req.params;
        const response = await axios.delete(`${PANCAKE_API_BASE}/positions/batch/${userAddress}`);
        res.json(response.data);
    } catch (error) {
        console.error('批量关闭头寸失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || '批量关闭头寸失败'
        });
    }
});

// 策略管理API路由
app.post('/api/strategy/instance/:instanceId/start', async (req, res) => {
    try {
        const { instanceId } = req.params;
        const response = await axios.post(`${PANCAKE_API_BASE}/strategy/instance/${instanceId}/start`);
        res.json(response.data);
    } catch (error) {
        console.error('启动策略实例失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || '启动策略实例失败'
        });
    }
});

app.post('/api/strategy/instance/:instanceId/stop', async (req, res) => {
    try {
        const { instanceId } = req.params;
        const response = await axios.post(`${PANCAKE_API_BASE}/strategy/instance/${instanceId}/stop`);
        res.json(response.data);
    } catch (error) {
        console.error('停止策略实例失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error || '停止策略实例失败'
        });
    }
});

// 静态文件路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io连接处理
io.on('connection', (socket) => {
  console.log('客户端已连接:', socket.id);
  
  // 发送欢迎消息
  socket.emit('systemLog', {
    source: 'Web服务器',
    message: '已连接到Web界面',
    level: 'info',
    timestamp: Date.now()
  });
  
  // 定期发送系统数据
  const intervals = {
    // 每30秒发送池子数据
    poolData: setInterval(async () => {
      if (isShuttingDown) return;
      try {
        const response = await axios.get(`${PANCAKE_API_BASE}/pools`);
        socket.emit('poolsUpdate', response.data);
      } catch (error) {
        console.error('获取池子数据失败:', error.message);
      }
    }, 30000),
    
    // 每60秒发送价格更新
    priceUpdate: setInterval(() => {
      if (isShuttingDown) return;
      const mockPriceData = {
        pools: [
          {
            name: 'WBNB/USDT',
            price: 300 + Math.random() * 20 - 10,
            timestamp: Date.now()
          },
          {
            name: 'CAKE/WBNB',
            price: 0.02 + Math.random() * 0.004 - 0.002,
            timestamp: Date.now()
          }
        ]
      };
      socket.emit('priceUpdate', mockPriceData);
    }, 60000),
    
    // 每5分钟发送系统日志
    systemLog: setInterval(() => {
      if (isShuttingDown) return;
      const logMessages = [
        '系统运行正常',
        '价格监控活跃',
        '池子状态检查完成',
        '风险评估正常',
        '网络连接稳定'
      ];
      
      const randomMessage = logMessages[Math.floor(Math.random() * logMessages.length)];
      socket.emit('systemLog', {
        source: 'PancakeSwap系统',
        message: randomMessage,
        level: 'info',
        timestamp: Date.now()
      });
    }, 300000)
  };
  
  // 将客户端连接和定时器添加到全局跟踪
  connectedClients.set(socket.id, {
    socket: socket,
    intervals: intervals
  });
  
  // 处理断开连接
  socket.on('disconnect', () => {
    console.log('客户端断开连接:', socket.id);
    
    // 清理该客户端的定时器
    const clientData = connectedClients.get(socket.id);
    if (clientData && clientData.intervals) {
      Object.values(clientData.intervals).forEach(interval => {
        if (interval) clearInterval(interval);
      });
    }
    
    // 从全局跟踪中移除
    connectedClients.delete(socket.id);
  });
  
  // 处理客户端请求
  socket.on('requestWalletStatus', async () => {
    if (isShuttingDown) return;
    try {
      const response = await axios.get(`${PANCAKE_API_BASE}/wallet/status`);
      socket.emit('walletStatusChanged', response.data);
    } catch (error) {
      console.error('获取钱包状态失败:', error.message);
      socket.emit('walletStatusChanged', {
        hasWallet: false,
        isUnlocked: false
      });
    }
  });
  
  socket.on('requestPoolsData', async () => {
    if (isShuttingDown) return;
    try {
      const response = await axios.get(`${PANCAKE_API_BASE}/pools`);
      socket.emit('poolsUpdate', response.data);
    } catch (error) {
      console.error('获取池子数据失败:', error.message);
      socket.emit('poolsUpdate', {
        success: false,
        pools: []
      });
    }
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    error: '内部服务器错误'
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '接口不存在'
  });
});

const PORT = process.env.PORT || 4001;

server.listen(PORT, () => {
  console.log('✅ 主程序前端启动成功!');
  console.log('=====================================================');
  console.log('🏠 PancakeSwap V3 主程序前端界面');
  console.log('=====================================================');
  console.log(`🌐 主程序前端界面: http://localhost:${PORT}`);
  console.log(`🔗 连接后端API: http://localhost:4000/api`);
  console.log(`🔌 WebSocket连接: ws://localhost:4000`);
  console.log('');
  console.log('🌐 相关系统服务:');
  console.log(`📡 主程序后端API: http://localhost:4000/api`);
  console.log(`   └─ 启动方式: npm run dev`);
  console.log(`📊 策略管理前端: http://localhost:5000`);
  console.log(`   └─ 启动方式: cd strategy-ui && npm start`);
  console.log(`🎮 OKX DEX API: http://localhost:8000`);
  console.log(`   └─ 启动方式: cd okx_dex_api && npm run web`);
  console.log('=====================================================');
});

// 清理资源函数
function cleanupResources() {
  console.log('🧹 正在清理资源...');
  
  // 设置关闭标志
  isShuttingDown = true;
  
  // 清理所有全局定时器
  globalIntervals.forEach(interval => {
    if (interval) {
      clearInterval(interval);
    }
  });
  globalIntervals = [];
  
  // 清理所有客户端连接和定时器
  connectedClients.forEach((clientData, socketId) => {
    if (clientData.intervals) {
      Object.values(clientData.intervals).forEach(interval => {
        if (interval) clearInterval(interval);
      });
    }
    if (clientData.socket) {
      clientData.socket.disconnect(true);
    }
  });
  connectedClients.clear();
  
  // 关闭Socket.io服务器
  if (io) {
    io.close();
  }
  
  console.log('✅ 资源清理完成');
}

// 优雅关闭函数
function gracefulShutdown(signal) {
  console.log(`\n📨 收到${signal}信号，开始优雅关闭...`);
  
  // 设置强制退出超时（3秒）
  const forceExitTimeout = setTimeout(() => {
    console.log('⚠️ 优雅关闭超时，强制退出...');
    process.exit(1);
  }, 3000);
  
  // 清理资源
  cleanupResources();
  
  // 关闭HTTP服务器
  server.close(() => {
    console.log('🔄 Web服务器已关闭');
    clearTimeout(forceExitTimeout);
    console.log('👋 服务器安全关闭！');
    process.exit(0);
  });
  
  // 如果server.close()没有调用回调，强制关闭所有连接
  setTimeout(() => {
    console.log('⚠️ 强制关闭所有连接...');
    // 检查是否支持closeAllConnections方法（Node.js 18.2.0+）
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    } else {
      // 对于较老版本的Node.js，手动断开所有socket连接
      console.log('⚠️ 使用兼容方法关闭连接...');
      if (server._connections) {
        server._connections = 0;
      }
      // 强制退出
      setTimeout(() => {
        console.log('⚠️ 强制终止进程...');
        process.exit(1);
      }, 1000);
    }
  }, 1000);
}

// 信号处理
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

// 异常处理
process.on('uncaughtException', (error) => {
  console.error('❌ 未处理的异常:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的Promise拒绝:', reason);
  console.error('Promise:', promise);
  gracefulShutdown('unhandledRejection');
});

// 清理退出处理
process.on('exit', (code) => {
  console.log(`🚪 进程退出，退出码: ${code}`);
}); 