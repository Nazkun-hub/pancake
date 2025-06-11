# OKX DEX API 交易程序 (8000端口 - 真实区块链交易)

基于OKX DEX API的高级封装交易程序，支持多种EVM链的去中心化交易所操作。**这是策略引擎使用的真实交易服务。**

## 🔥 **重要说明：真实交易服务**

### 🎯 **8000端口 vs 8001端口的区别**

本服务是 **8000端口的真实交易服务**，与8001端口的模拟服务有重要区别：

| 特性 | 8000端口 (本服务) | 8001端口 (代理服务) |
|------|------------------|-------------------|
| **交易类型** | 🔥 真实区块链交易 | 🔄 模拟交易 |
| **服务类型** | 独立API服务 | 代理转发服务 |
| **授权处理** | ✅ 内置自动授权 | 需要手动分步授权 |
| **依赖关系** | 独立运行 | 依赖主程序4000端口 |
| **使用场景** | 实盘交易 | 测试和模拟 |
| **策略引擎使用** | ✅ 当前使用 | ❌ 不使用 |
| **Web界面** | ✅ 完整界面 | ❌ 无界面 |

### 🎯 **策略引擎集成**

**策略引擎使用本服务进行真实交易：**

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

**内置授权处理机制：**
```typescript
// 本服务自动处理授权，无需手动步骤
if (params.fromTokenAddress.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
  console.log('📋 检查代币授权...');
  await this.approveToken({
    tokenAddress: params.fromTokenAddress,
    amount: params.amount
  });
}
// 然后直接执行交换
const swapData = await this.okxClient.getSwapTransaction(swapParams);
```

## 🚀 快速开始

### 安装依赖
```bash
npm install
```

### 配置环境变量
复制 `env.example` 到 `.env` 并填入你的配置：
```bash
cp env.example .env
```

### 启动Web界面 (8000端口)
```bash
npm run web
```

Web界面将在 http://localhost:8000 启动

**注意：这是真实交易服务，需要真实的钱包配置和BSC代币余额。**

### 开发模式
```bash
npm run dev
```

### 构建项目
```bash
npm run build
npm start
```

## 📋 端口配置

- **🔥 OKX DEX API Web界面**: 8000端口 (真实交易服务)
- **🔄 OKX代理服务**: 8001端口 (模拟交易，转发到4000端口)
- **策略引擎API**: 4000端口
- **Demo演示程序**: 3000端口  
- **策略前端界面**: 6000端口

## 🔧 环境变量配置

| 变量名 | 说明 | 示例 | 重要性 |
|--------|------|------|--------|
| `OKX_API_KEY` | OKX API Key | `your_api_key` | 🔥 必需 |
| `OKX_SECRET_KEY` | OKX Secret Key | `your_secret_key` | 🔥 必需 |
| `OKX_API_PASSPHRASE` | OKX API Passphrase | `your_passphrase` | 🔥 必需 |
| `OKX_PROJECT_ID` | OKX Project ID | `your_project_id` | 🔥 必需 |
| `EVM_RPC_URL` | EVM RPC节点地址 | `https://bsc-dataseed.binance.org/` | 🔥 必需 |
| `EVM_WALLET_ADDRESS` | 钱包地址 | `0x...` | 🔥 必需 |
| `EVM_PRIVATE_KEY` | 私钥 (真实交易) | `without 0x prefix` | 🔥 必需 |
| `CHAIN_ID` | 链ID | `56` (BSC) | 🔥 必需 |
| `WEB_PORT` | Web服务端口 | `8000` | 可选 |

**⚠️ 警告：这些是真实交易配置，请确保私钥安全！**

## 🌐 Web界面功能

访问 http://localhost:8000 使用Web界面：

- **📊 配置管理**: 设置OKX API和BSC钱包配置 (真实钱包)
- **💰 账户信息**: 查看真实钱包余额和连接状态
- **🪙 代币管理**: 获取BSC链支持的代币列表
- **💹 交易报价**: 获取真实的BSC链交易报价
- **🔥 交易执行**: 执行真实的BSC链代币交换
- **📈 交易追踪**: 监控真实交易状态和哈希

## 📊 API接口 (真实交易)

### 基础端点
- `POST /api/config` - 设置BSC钱包配置
- `GET /api/config/status` - 获取配置状态
- `GET /api/account` - 获取真实账户信息

### 交易功能 (真实交易)
- `GET /api/tokens` - 获取BSC支持的代币
- `POST /api/quote` - 获取BSC真实交易报价
- `POST /api/approve` - BSC代币授权 (真实交易)
- `POST /api/swap` - 执行BSC交换 (真实交易，内置授权)
- `GET /api/track/:orderId` - 追踪BSC真实交易

### 高级功能
- `POST /api/analyze-route` - 分析BSC DEX路由
- `GET /api/balance/:token` - 获取真实代币余额
- `GET /api/token-info/:address` - 获取BSC代币信息
- `GET /api/transaction/:txHash` - 获取BSC交易历史

**所有交易都会在BSC区块链上执行，产生真实的Gas费用。**

## 🔐 安全配置 (极其重要)

1. **私钥安全**: 
   - ❌ 永远不要将私钥提交到代码仓库
   - ✅ 使用独立的交易钱包，不要使用主钱包
   - ✅ 定期轮换私钥
   
2. **API密钥**: 
   - ✅ 确保OKX API密钥安全存储
   - ✅ 设置API密钥权限最小化
   
3. **网络配置**: 
   - ✅ 使用可信的BSC RPC节点
   - ✅ 建议使用多个RPC节点做备份
   
4. **交易安全**:
   - ✅ 设置合理的滑点保护 (0.5%-2%)
   - ✅ 监控异常交易和Gas费用
   - ✅ 定期检查钱包余额

## 🛠️ 开发工具

### 测试 (使用测试网)
```bash
npm test
```

### 调试
访问 http://localhost:8000/debug 获取调试界面

### 构建
```bash
npm run build
npm run clean  # 清理构建文件
```

## 🔗 与其他服务集成

### 系统架构
```
策略引擎 → 8000端口 → OKX DEX API (本服务) → BSC区块链 (真实交易)
测试环境 → 8001端口 → OKX代理服务 → 4000端口 → 模拟交易
```

### 服务依赖
- **独立运行**: 不依赖其他本地服务
- **外部API**: 依赖OKX DEX API和BSC RPC节点
- **真实钱包**: 需要真实的BSC钱包和私钥
- **Web3集成**: 直接与BSC区块链交互

## 📝 开发说明

### 项目结构
```
okx_dex_api/
├── src/                 # 源码
│   ├── index.ts        # 主入口
│   ├── config/         # 配置管理
│   ├── web/            # Web服务器 (8000端口)
│   ├── auth/           # 认证管理
│   └── types/          # 类型定义
├── dist/               # 构建输出
├── test/               # 测试文件
└── docs/               # 文档
```

### 开发模式
使用 `npm run dev` 启动开发模式，支持热重载。

**⚠️ 注意：开发模式也会执行真实交易，请使用测试代币！**

### Web界面开发
Web界面位于 `src/web/public/`，使用原生HTML/CSS/JavaScript。

## 🐛 故障排除

### 常见问题

1. **端口冲突**: 确保8000端口未被占用
2. **API认证失败**: 检查OKX API配置和权限
3. **网络连接问题**: 验证BSC RPC节点连接
4. **交易失败**: 
   - 检查钱包BNB余额 (Gas费用)
   - 检查代币余额
   - 验证代币地址正确性
   - 检查滑点设置
5. **授权失败**: 本服务会自动处理授权，如果失败请检查钱包BNB余额

### 调试工具
- Web调试界面: http://localhost:8000/debug
- 控制台日志: 详细的BSC交易日志
- 错误报告: 结构化的交易错误信息
- BSC浏览器: https://bscscan.com 查看交易状态

## 💡 **与8001端口的对比使用**

### 真实交易 (8000端口 - 本服务)
```bash
# 启动真实交易服务
cd okx_dex_api && npm run web

# API调用示例
curl -X POST http://localhost:8000/api/swap \
  -H "Content-Type: application/json" \
  -d '{
    "fromTokenAddress": "0x55d398326f99059fF775485246999027B3197955",
    "toTokenAddress": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    "amount": "100000000000000000",
    "userWalletAddress": "your_wallet_address",
    "chainId": "56",
    "slippage": "0.5"
  }'
```

### 模拟交易 (8001端口 - 代理服务)
```bash
# 启动模拟交易服务
cd okx-proxy && npm start

# API调用示例
curl -X POST http://localhost:8001/api/okx/swap \
  -H "Content-Type: application/json" \
  -d '{"fromToken": "USDT", "toToken": "WBNB", "amount": "0.1"}'
```

## 📄 许可证

MIT License

---

**维护者**: OKX DEX API开发团队  
**版本**: v1.0.0  
**最后更新**: 2025年6月  
**⚠️ 重要提醒**: 本服务执行真实交易，请谨慎使用！ 