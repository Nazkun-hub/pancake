/**
 * 策略管理前端 - 独立静态文件服务器
 * 端口: 5000 (避免浏览器安全限制和与主程序4001端口冲突)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.STRATEGY_UI_PORT || 5000;

// 中间件配置
app.use(cors({
  origin: [
    'http://localhost:4000',  // 主程序后端API服务
    'http://localhost:4001',  // 主程序前端服务
    'http://localhost:5000',  // 本服务
    'http://localhost:8000',  // OKX DEX API服务
    '*'  // 开发环境允许所有来源
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 路由配置
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API代理 - 将API请求转发到主程序后端服务
app.use('/api', (req, res) => {
  // 这里可以添加API代理逻辑，或者直接在前端通过CORS调用主程序后端API
  res.json({
    message: 'API请求应直接调用主程序后端服务 http://localhost:4000/api',
    redirect: `http://localhost:4000${req.originalUrl}`
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    service: 'strategy-ui',
    status: 'healthy',
    port: PORT,
    timestamp: new Date().toISOString(),
    mainBackendAPI: 'http://localhost:4000/api',
    mainFrontend: 'http://localhost:4001',
    websocket: 'ws://localhost:4000',
    okxDexAPI: 'http://localhost:8000'
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    error: '内部服务器错误',
    message: err.message
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log('✅ 策略管理前端启动成功!');
  console.log('=====================================================');
  console.log('📊 策略管理系统前端界面');
  console.log('=====================================================');
  console.log(`🌐 策略前端界面: http://localhost:${PORT}`);
  console.log(`🔗 连接后端API: http://localhost:4000/api`);
  console.log(`🔌 WebSocket连接: ws://localhost:4000`);
  console.log('');
  console.log('🌐 相关系统服务:');
  console.log(`📡 主程序后端API: http://localhost:4000/api`);
  console.log(`   └─ 启动方式: npm run dev`);
  console.log(`🏠 主程序前端: http://localhost:4001`);
  console.log(`   └─ 启动方式: cd web && npm start`);
  console.log(`🎮 OKX DEX API: http://localhost:8000`);
  console.log(`   └─ 启动方式: cd okx_dex_api && npm run web`);
  console.log('=====================================================');
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('🛑 收到SIGTERM信号，正在关闭策略前端服务...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 收到SIGINT信号，正在关闭策略前端服务...');
  process.exit(0);
}); 