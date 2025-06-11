# PancakeSwap V3 流动性管理系统

## 🎯 系统概述

PancakeSwap V3 自动化流动性管理系统，集成OKX DEX API交换功能，支持策略化流动性管理。采用微服务架构，支持真实交易和模拟交易两种模式。

## 🌐 系统架构与端口配置

### 🏗️ 服务架构图
```
策略引擎 → 8000端口 → OKX DEX API服务 (真实交易)
策略引擎 → 8001端口 → OKX代理服务 → 转发到4000端口 → 主系统OKX路由 (模拟交易)
```

### 📊 端口分配策略
```
🏠 主程序系统 (4xxx端口)
├── 4000 - 主程序后端API (核心服务)
│   ├── 流动性管理 API
│   ├── 头寸管理 API  
│   ├── 钱包管理 API
│   ├── 策略执行 API
│   └── OKX路由集成 (/api/okx/*)
└── 4001 - 主程序前端界面

📊 策略管理系统 (5xxx端口)  
└── 5000 - 策略管理前端界面

🎮 OKX系统 (8xxx端口) - **重要：两种不同的交易模式**
├── 8000 - 🔥 OKX DEX API服务 (真实区块链交易)
│   ├── 独立Web界面和API服务
│   ├── 直接BSC区块链交互
│   ├── 内置授权处理 (自动检查和执行代币授权)
│   ├── 真实交易执行 (Web3直接广播到BSC网络)
│   ├── 完整的用户界面
│   └── 🎯 策略引擎使用此端口进行真实交易
└── 8001 - 🔄 OKX交换代理服务 (模拟交易模式)
    ├── 透明转发到主系统4000端口
    ├── 主要用于模拟和测试
    ├── 需要手动授权步骤
    ├── 独立健康检查
    ├── 请求日志记录
    └── 架构解耦设计
```

### 🎯 **策略引擎交易模式说明**

**当前策略引擎使用 8000端口 进行真实交易：**

```typescript
// ExecutionStages.ts 中的实现
const response = await fetch('http://localhost:8000/api/swap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fromTokenAddress,
    toTokenAddress,
    amount,
    userWalletAddress,
    chainId: '56', // BSC链
    slippage: slippage.toString()
  })
});
```

**优势：**
- ✅ **真实区块链交易** - 所有交换都在BSC链上执行
- ✅ **内置授权处理** - 无需手动授权，自动检查和执行
- ✅ **智能回退机制** - 真实交易失败时自动回退到模拟交易
- ✅ **完整记录** - 所有交易都有真实的交易哈希可查

## 🔥 **8000端口 vs 8001端口 详细对比**

### 🎮 **8000端口：OKX DEX API 独立服务 (真实交易)**

**启动方式**：`cd okx_dex_api && npm run web`
**服务文件**：`okx_dex_api/src/web/server.ts`

#### 特性：
- ✅ **独立的OKX DEX服务** - 完整的Web界面和API
- ✅ **直接区块链交互** - 使用Web3直接与BSC链交互
- ✅ **内置授权处理** - 自动检查和执行代币授权
- ✅ **真实交易执行** - 直接广播交易到BSC网络
- ✅ **完整的用户界面** - 包含Web前端页面
- ✅ **独立配置管理** - 独立的钱包和API配置

#### 主要API端点：
```typescript
POST /api/config          - 设置BSC钱包配置
GET  /api/account         - 获取BSC账户信息  
GET  /api/tokens          - 获取BSC支持的代币
POST /api/quote           - 获取BSC交易报价
POST /api/approve         - 执行代币授权
POST /api/swap            - 执行BSC交换 (真实交易，内置授权)
GET  /api/track/:orderId  - 追踪BSC交易
```

### 🔄 **8001端口：OKX交换代理服务 (模拟交易)**

**启动方式**：`cd okx-proxy && npm start`
**服务文件**：`okx-proxy/proxy-server.js`

#### 特性：
- 🔄 **代理转发服务** - 将请求转发到主程序4000端口
- 🔄 **API格式兼容** - 提供兼容的API接口格式
- 🔄 **模拟交易模式** - 主要用于模拟和测试
- 🔄 **无独立界面** - 纯API代理服务
- 🔄 **依赖主程序** - 需要主程序4000端口运行
- 🔄 **手动授权步骤** - 需要分步执行授权和交换

#### 代理路由：
```javascript
GET  /api/okx/health   → http://localhost:4000/api/okx/health
POST /api/okx/quote    → http://localhost:4000/api/okx/quote  
POST /api/okx/approve  → http://localhost:4000/api/okx/approve
POST /api/okx/swap     → http://localhost:4000/api/okx/swap
GET  /api/okx/track/*  → http://localhost:4000/api/okx/track/*
```

## 🚀 快速启动

### 方式一：一键启动 (推荐)

```bash
# 启动所有服务 (包括新的OKX代理服务)
./scripts/simple-start.sh

# 检查服务状态
./scripts/check-ports.sh

# 停止所有服务
./scripts/stop-all-services.sh
```

**启动输出示例:**
```
🚀 PancakeSwap V3 简化启动器
===========================
🚀 1. 启动主程序后端服务...
✅ 主程序后端已启动 (PID: 12345)
🚀 2. 启动OKX交换代理服务...
✅ OKX交换代理已启动 (PID: 12346)
🚀 3. 检查主程序前端...
✅ 主程序前端已启动 (PID: 12347)
🚀 4. 检查策略管理前端...
✅ 策略管理前端已启动 (PID: 12348)
🚀 5. 检查OKX DEX API服务...
✅ OKX DEX API已启动 (PID: 12349)

🎉 启动完成！
=======================
✅ 主程序后端 (4000) 运行正常
✅ OKX交换代理 (8001) 运行正常
✅ 端口 4001 已监听
✅ 端口 5000 已监听
✅ 端口 8000 已监听
```

### 方式二：分步启动

```bash
# 1. 启动主程序后端 (必须先启动)
npm run dev

# 2. 启动OKX交换代理服务 (策略功能需要)
cd okx-proxy && npm start

# 3. 启动主程序前端
cd web && npm start

# 4. 启动策略管理前端
cd strategy-ui && npm start

# 5. 启动OKX DEX API (可选)
cd okx_dex_api && npm run web
```

## 🌐 访问地址

### 用户界面
- 🏠 **主程序前端**: http://localhost:4001
- 📊 **策略管理界面**: http://localhost:5000
- 🎮 **OKX DEX API**: http://localhost:8000

### API接口
- 📡 **主程序API**: http://localhost:4000/api
- 🔄 **OKX交换代理**: http://localhost:8001/api/okx
- 🔍 **系统健康检查**: http://localhost:4000/health
- 🔍 **代理健康检查**: http://localhost:8001/health

### WebSocket服务
- 📡 **实时数据推送**: ws://localhost:4000

## 🔧 功能特性

### 核心功能
- ✅ PancakeSwap V3 流动性管理
- ✅ 自动化策略引擎
- ✅ OKX DEX 代币交换集成
- ✅ 实时价格监控
- ✅ 智能头寸管理
- ✅ WebSocket实时状态推送

### 🆕 新增架构特性
- ✅ **OKX代理服务**: 8001端口透明转发
- ✅ **服务解耦**: 策略引擎与主系统独立
- ✅ **一键启动**: 自动化服务管理
- ✅ **健康监控**: 完整的服务状态检查
- ✅ **日志系统**: 分服务日志记录

### 技术特性
- ✅ 模块化架构设计
- ✅ 依赖注入容器
- ✅ TypeScript 类型安全
- ✅ WebSocket 实时通信
- ✅ 自动化测试脚本
- ✅ 代理服务透明转发

## 📋 系统要求

- Node.js >= 16.0.0
- npm >= 8.0.0
- BSC 网络连接
- OKX API 密钥 (可选)

## 🛠️ 安装配置

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd pancake
   ```

2. **安装依赖**
   ```bash
   npm install
   
   # 安装OKX代理服务依赖
   cd okx-proxy && npm install
   ```

3. **配置环境变量**
   ```bash
   cp env.example .env
   # 编辑 .env 文件配置相关参数
   # 确保包含 OKX_SERVICE_URL=http://localhost:8001
   ```

4. **启动系统**
   ```bash
   ./scripts/simple-start.sh
   ```

## 🔄 OKX代理服务详解

### 服务目的
为策略引擎提供8001端口的OKX API访问，通过代理转发的方式实现系统架构的独立性。

### 工作原理
- **监听端口**: 8001
- **转发目标**: http://localhost:4000/api/okx/*
- **转发路径**: 所有 `/api/okx/*` 请求
- **日志记录**: 详细的请求转发日志

### 使用方式
```bash
# 策略引擎调用方式
curl http://localhost:8001/api/okx/health
curl -X POST http://localhost:8001/api/okx/quote -d '{"fromToken":"WBNB","toToken":"USDT","amount":"1"}'

# 健康检查
curl http://localhost:8001/health
```

## 📚 API接口文档

### 🔄 OKX交换API (通过代理服务)
- `GET /api/okx/health` - OKX服务健康检查
- `POST /api/okx/quote` - 获取交换报价
- `POST /api/okx/swap` - 执行代币交换
- `POST /api/okx/approve` - 代币授权
- `GET /api/okx/track/:orderId` - 追踪交易状态

### 💧 流动性管理API
- `POST /api/add-liquidity` - 添加流动性
- `GET /api/positions/:userAddress` - 获取头寸
- `DELETE /api/positions/:tokenId` - 关闭头寸

### 🔐 钱包管理API
- `POST /api/wallet/unlock` - 解锁钱包
- `GET /api/wallet/info` - 获取钱包信息
- `POST /api/wallet/connect-web3` - 连接Web3

### 📊 策略管理API
- `POST /api/strategy/create` - 创建策略
- `POST /api/strategy/:instanceId/start` - 启动策略
- `GET /api/strategy/instances` - 获取策略列表

## 📚 文档

- [项目开发规则](pancakeswap-project-guide.mdc)
- [OKX代理服务说明](okx-proxy/README.md)
- [策略引擎API集成重构总结](docs/策略引擎API集成重构总结.md)
- [系统架构文档](pancakeswap-architecture.mdc)

## 🔍 故障排查

### 服务状态检查
```bash
# 检查所有端口状态
./scripts/check-ports.sh

# 健康检查
curl http://localhost:4000/health  # 主系统
curl http://localhost:8001/health  # OKX代理
```

### 日志查看
```bash
# 查看各服务日志
tail -f logs/backend.log      # 主程序后端
tail -f logs/okx-proxy.log    # OKX代理服务
tail -f logs/frontend.log     # 前端服务
tail -f logs/strategy.log     # 策略管理
```

### 端口冲突解决
```bash
# 检查端口占用
lsof -i :4000
lsof -i :8001

# 停止所有服务后重启
./scripts/stop-all-services.sh
./scripts/simple-start.sh
```

### 常见问题
1. **代理转发失败**: 确认主系统(4000端口)已启动
2. **策略无法调用OKX**: 检查8001端口代理服务状态
3. **端口冲突**: 使用停止脚本后重新启动

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进项目。

## 📄 许可证

MIT License

---

**更新时间**: 2024年12月  
**版本**: v2.1.0  
**主要变更**: 
- ✅ 新增OKX代理服务 (8001端口)
- ✅ 系统架构解耦优化
- ✅ 一键启动脚本完善
- ✅ 完整的健康监控体系 