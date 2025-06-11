# 策略管理前端界面

PancakeSwap流动性策略管理系统的专用前端界面。

## 🎯 项目概述

这是一个独立的前端应用，专门为策略模块第四阶段开发，提供直观的策略管理和监控界面。

### 主要功能

- 📋 **策略配置**：创建和编辑自动流动性策略
- 📊 **实时监控**：WebSocket实时策略状态监控
- 📈 **盈亏分析**：收益统计和图表展示
- 🎨 **现代界面**：响应式设计，支持深色/浅色主题

## 🏗️ 技术架构

### 系统集成
```
策略前端 (6000端口) ←→ 策略引擎API (4000端口)
        ↓                    ↓
    静态文件服务         策略引擎 + WebSocket

其他服务：
- Demo演示程序 (3000端口)
- OKX DEX API (独立端口)
```

### 技术栈
- **前端**: 原生HTML/CSS/JavaScript (ES6+ Modules)
- **服务器**: Express.js 静态文件服务器
- **实时通信**: Socket.io WebSocket
- **数据可视化**: Chart.js
- **响应式**: CSS Grid + Flexbox

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 启动服务
```bash
npm start
```

### 3. 访问界面
打开浏览器访问：http://localhost:6000

## 📁 项目结构

```
strategy-ui/
├── public/                  # 静态文件
│   ├── index.html          # 主页面
│   ├── css/                # 样式文件
│   │   ├── main.css        # 主样式
│   │   ├── components.css  # 组件样式
│   │   └── themes.css      # 主题样式
│   ├── js/                 # JavaScript模块
│   │   ├── app.js          # 主应用逻辑
│   │   ├── api.js          # API封装
│   │   ├── websocket.js    # WebSocket管理
│   │   ├── components/     # UI组件
│   │   └── utils/          # 工具函数
│   └── assets/             # 静态资源
├── server.js               # Express服务器
├── package.json            # 项目配置
└── README.md              # 本文档
```

## 🔧 配置说明

### 端口配置
- **策略前端服务**: 6000 (可通过环境变量 `STRATEGY_UI_PORT` 修改)
- **策略引擎API**: 4000 (策略管理后端服务)
- **Demo演示程序**: 3000 (演示界面)
- **OKX DEX API**: 独立端口

### 环境变量
```bash
# 可选：自定义前端端口
STRATEGY_UI_PORT=6000
```

## 🎨 界面功能

### 主要页面

1. **仪表盘** 📊
   - 策略总览统计
   - 快速操作面板
   - 最近活动记录

2. **创建策略** ➕
   - 池地址选择
   - 价格区间配置
   - 风险参数设置

3. **策略列表** 📋
   - 所有策略管理
   - 状态监控
   - 操作控制

4. **实时监控** 📈
   - 价格变化图表
   - 策略执行状态
   - 实时事件日志

5. **盈亏分析** 💰
   - 收益统计图表
   - 历史数据分析
   - 风险指标

### 特色功能

- **实时更新**: WebSocket推送策略状态变化
- **主题切换**: 支持深色/浅色主题
- **响应式**: 适配桌面和移动设备
- **模块化**: ES6模块化组件架构

## 🔌 API集成

### 后端服务依赖
本前端需要策略引擎服务（4000端口）正常运行，包含：
- 策略管理API
- WebSocket推送服务
- 池信息和价格数据

### API接口
- `GET /api/strategy/list` - 获取策略列表
- `POST /api/strategy/create` - 创建策略
- `POST /api/strategy/:id/start` - 启动策略
- `POST /api/strategy/:id/stop` - 停止策略
- `WebSocket /ws` - 实时数据推送

## 🐛 故障排除

### 常见问题

1. **无法连接策略引擎API**
   - 确认策略引擎服务在4000端口运行
   - 检查CORS配置

2. **WebSocket连接失败**
   - 确认策略引擎WebSocket服务正常
   - 检查防火墙设置

3. **页面无法加载**
   - 确认6000端口未被占用
   - 检查静态文件权限

### 健康检查
```bash
# 检查策略前端服务
curl http://localhost:6000/health

# 检查策略引擎服务
curl http://localhost:4000/health

# 检查demo演示程序
curl http://localhost:3000/health
```

## 📝 开发说明

### 添加新组件
1. 在 `public/js/components/` 创建组件文件
2. 实现组件类和render方法
3. 在主应用中动态加载

### 修改样式
- 主样式：`public/css/main.css`
- 组件样式：`public/css/components.css`
- 主题变量：`public/css/themes.css`

### API扩展
- 修改：`public/js/api.js`
- 添加新的接口方法
- 更新错误处理

## 🔐 安全考虑

- API请求通过CORS验证
- 输入数据前端验证
- 敏感信息不在前端存储
- WebSocket连接安全认证

## 📈 性能优化

- 静态资源缓存
- 懒加载组件
- WebSocket连接复用
- 数据分页加载

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交代码变更
4. 发起 Pull Request

## 📄 许可证

MIT License

---

**维护者**: PancakeSwap策略开发团队  
**版本**: v1.0.0  
**最后更新**: 2025年6月

如有问题或建议，请联系开发团队。 