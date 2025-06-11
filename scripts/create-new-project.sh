#!/bin/bash

# 🚀 基于PancakeSwap V3架构的新项目创建脚本
# 使用方法: ./create-new-project.sh <project-name> <project-type>
# 项目类型: solana-dlmm | ethereum-uniswap | bsc-pancake | custom

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_message() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 检查参数
if [ $# -lt 2 ]; then
    print_error "使用方法: $0 <project-name> <project-type>"
    echo "项目类型选项:"
    echo "  solana-dlmm      - Solana DLMM项目"
    echo "  ethereum-uniswap - Ethereum Uniswap V3项目"
    echo "  bsc-pancake      - BSC PancakeSwap V3项目"
    echo "  custom           - 自定义项目"
    exit 1
fi

PROJECT_NAME=$1
PROJECT_TYPE=$2
CURRENT_DIR=$(pwd)
PROJECT_DIR="$CURRENT_DIR/$PROJECT_NAME"

print_message "🚀 开始创建新项目: $PROJECT_NAME (类型: $PROJECT_TYPE)"

# 检查项目目录是否已存在
if [ -d "$PROJECT_DIR" ]; then
    print_error "项目目录 $PROJECT_DIR 已存在！"
    exit 1
fi

# 创建项目目录结构
print_step "📁 创建项目目录结构..."
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# 创建标准目录结构
mkdir -p src/{business,services,infrastructure,api,adapters,contracts,utils,types,constants,di}
mkdir -p src/business/{core,strategy-engine}
mkdir -p src/services/{blockchain,external,internal}
mkdir -p src/infrastructure/{database,cache,network}
mkdir -p src/api/{routes,middlewares,validators}
mkdir -p src/adapters/{protocols,exchanges}
mkdir -p web/public/{css,js}
mkdir -p test/{unit,integration,e2e}
mkdir -p docs
mkdir -p config
mkdir -p scripts
mkdir -p logs

print_message "✅ 目录结构创建完成"

# 根据项目类型设置特定配置
print_step "⚙️ 配置项目特定设置..."

case $PROJECT_TYPE in
    "solana-dlmm")
        CHAIN_NAME="Solana"
        MAIN_DEPENDENCIES='"@solana/web3.js": "^1.98.2", "@meteora-ag/dlmm": "^1.4.0", "@coral-xyz/anchor": "^0.28.0"'
        PROTOCOL_ADAPTER="MeteoraAdapter"
        ;;
    "ethereum-uniswap")
        CHAIN_NAME="Ethereum"
        MAIN_DEPENDENCIES='"ethers": "^6.14.3", "@uniswap/v3-sdk": "^3.10.0", "@uniswap/sdk-core": "^4.0.7"'
        PROTOCOL_ADAPTER="UniswapV3Adapter"
        ;;
    "bsc-pancake")
        CHAIN_NAME="BSC"
        MAIN_DEPENDENCIES='"ethers": "^6.14.3"'
        PROTOCOL_ADAPTER="PancakeSwapV3Adapter"
        ;;
    "custom")
        CHAIN_NAME="Custom"
        MAIN_DEPENDENCIES='"ethers": "^6.14.3"'
        PROTOCOL_ADAPTER="CustomAdapter"
        ;;
    *)
        print_error "不支持的项目类型: $PROJECT_TYPE"
        exit 1
        ;;
esac

# 创建package.json
print_step "📦 创建package.json..."
cat > package.json << EOF
{
  "name": "$PROJECT_NAME",
  "version": "1.0.0",
  "description": "$CHAIN_NAME DeFi流动性管理系统",
  "main": "dist/app.js",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "npm run build && node dist/app.js",
    "dev": "tsx src/app.ts",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "docs": "typedoc src --out docs/api",
    "clean": "rimraf dist"
  },
  "keywords": [
    "defi",
    "liquidity",
    "management",
    "${PROJECT_TYPE}",
    "modular",
    "typescript"
  ],
  "author": "$PROJECT_NAME Team",
  "license": "MIT",
  "dependencies": {
    "axios": "^1.9.0",
    "cors": "^2.8.5",
    "crypto-js": "^4.2.0",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "helmet": "^7.1.0",
    "joi": "^17.11.0",
    "reflect-metadata": "^0.1.13",
    "socket.io": "^4.7.4",
    "tsyringe": "^4.8.0",
    "winston": "^3.11.0",
    $MAIN_DEPENDENCIES
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.8",
    "@types/node": "^20.10.0",
    "@typescript-eslint/eslint-plugin": "^6.13.1",
    "@typescript-eslint/parser": "^6.13.1",
    "eslint": "^8.54.0",
    "jest": "^29.7.0",
    "rimraf": "^5.0.5",
    "ts-jest": "^29.1.1",
    "tsx": "^4.6.0",
    "typedoc": "^0.25.4",
    "typescript": "^5.3.2"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
EOF

# 创建TypeScript配置
print_step "🔧 创建TypeScript配置..."
cat > tsconfig.json << EOF
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "allowJs": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "removeComments": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitThis": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "moduleDetection": "force",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "test"
  ]
}
EOF

# 创建环境变量模板
print_step "🔐 创建环境变量模板..."
cat > .env.example << EOF
# 应用配置
NODE_ENV=development
PORT=4000
LOG_LEVEL=info

# 区块链配置
RPC_URL=https://your-rpc-endpoint
PRIVATE_KEY=your-private-key-here
WALLET_ADDRESS=your-wallet-address

# API配置
API_TIMEOUT=30000
MAX_RETRIES=3

# 安全配置
ENCRYPTION_KEY=your-encryption-key
JWT_SECRET=your-jwt-secret

# 监控配置
ENABLE_METRICS=true
METRICS_PORT=9090
EOF

# 复制核心架构文件
print_step "📋 复制核心架构文件..."

# 复制依赖注入容器
if [ -f "$CURRENT_DIR/src/di/container.ts" ]; then
    cp "$CURRENT_DIR/src/di/container.ts" src/di/
    print_message "✅ 复制依赖注入容器"
else
    print_warning "⚠️ 未找到依赖注入容器文件，将创建模板"
    cat > src/di/container.ts << 'EOF'
import 'reflect-metadata';
import { container } from 'tsyringe';
import { TYPES } from '../types/interfaces.js';

export class DIContainer {
  private static _instance: DIContainer;
  private _initialized = false;

  static getInstance(): DIContainer {
    if (!DIContainer._instance) {
      DIContainer._instance = new DIContainer();
    }
    return DIContainer._instance;
  }

  initialize(): void {
    if (this._initialized) return;

    // 注册基础服务
    // container.register(TYPES.EventBus, { useClass: EventBus });
    // container.register(TYPES.Logger, { useClass: WinstonLogger });
    
    // 注册业务服务
    // container.register(TYPES.StrategyEngine, { useClass: StrategyEngine });
    
    this._initialized = true;
  }

  getService<T>(type: symbol): T {
    return container.resolve<T>(type);
  }

  isInitialized(): boolean {
    return this._initialized;
  }
}

export const diContainer = DIContainer.getInstance();
EOF
fi

# 复制类型定义
if [ -f "$CURRENT_DIR/src/types/interfaces.ts" ]; then
    cp "$CURRENT_DIR/src/types/interfaces.ts" src/types/
    print_message "✅ 复制类型定义"
else
    print_warning "⚠️ 未找到类型定义文件，将创建模板"
    cat > src/types/interfaces.ts << 'EOF'
export const TYPES = {
  // 基础服务
  EventBus: Symbol.for('EventBus'),
  Logger: Symbol.for('Logger'),
  ConfigManager: Symbol.for('ConfigManager'),
  
  // 区块链服务
  Web3Service: Symbol.for('Web3Service'),
  ContractService: Symbol.for('ContractService'),
  WalletService: Symbol.for('WalletService'),
  
  // 业务服务
  PositionManager: Symbol.for('PositionManager'),
  LiquidityManager: Symbol.for('LiquidityManager'),
  StrategyEngine: Symbol.for('StrategyEngine')
};

export interface IService {
  name: string;
  version: string;
  dependencies: string[];
  
  initialize(config: any): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<{ status: string; message: string; }>;
}
EOF
fi

# 创建应用入口文件
print_step "🚀 创建应用入口文件..."
cat > src/app.ts << 'EOF'
import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { diContainer } from './di/container.js';

// 配置环境变量
dotenv.config();

async function startApplication() {
  try {
    console.log('🚀 启动应用程序...');
    
    // 1. 初始化依赖注入容器
    console.log('📦 初始化依赖注入容器...');
    diContainer.initialize();
    
    // 2. 创建Express应用
    const app = express();
    
    // 3. 设置中间件
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // 4. 健康检查端点
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });
    
    // 5. 启动服务
    const port = process.env.PORT || 4000;
    app.listen(port, () => {
      console.log(`✅ 服务器已启动: http://localhost:${port}`);
      console.log(`📊 健康检查: http://localhost:${port}/health`);
    });
    
  } catch (error) {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  }
}

startApplication();
EOF

# 创建README文件
print_step "📝 创建README文件..."
cat > README.md << EOF
# $PROJECT_NAME

基于PancakeSwap V3架构的$CHAIN_NAME DeFi流动性管理系统

## 🏗️ 架构特点

- 🔧 **依赖注入**: 使用TSyringe实现IoC容器
- 📦 **模块化设计**: 高度模块化的架构
- 🎭 **接口驱动**: 面向接口编程
- 📡 **事件驱动**: 事件总线实现模块间通信
- 🧪 **测试优先**: 完整的测试覆盖

## 🚀 快速开始

### 1. 安装依赖
\`\`\`bash
npm install
\`\`\`

### 2. 配置环境变量
\`\`\`bash
cp .env.example .env
# 编辑 .env 文件，填入您的配置
\`\`\`

### 3. 启动开发服务器
\`\`\`bash
npm run dev
\`\`\`

### 4. 构建生产版本
\`\`\`bash
npm run build
npm start
\`\`\`

## 📋 可用脚本

- \`npm run dev\` - 启动开发服务器
- \`npm run build\` - 构建生产版本
- \`npm run test\` - 运行测试
- \`npm run lint\` - 代码检查
- \`npm run docs\` - 生成API文档

## 📁 项目结构

\`\`\`
src/
├── business/              # 业务逻辑层
├── services/             # 服务层
├── infrastructure/       # 基础设施层
├── api/                  # API层
├── adapters/             # 适配器层
├── contracts/            # 合约交互层
├── utils/                # 工具函数
├── types/                # 类型定义
├── constants/            # 常量定义
├── di/                   # 依赖注入配置
└── app.ts               # 应用入口
\`\`\`

## 🔧 开发指南

请参考 [通用模块化架构指南](docs/universal-architecture-guide.md) 了解详细的开发规范和最佳实践。

## 📊 监控和日志

- 健康检查: \`GET /health\`
- 日志级别: 通过 \`LOG_LEVEL\` 环境变量配置

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (\`git checkout -b feature/AmazingFeature\`)
3. 提交更改 (\`git commit -m 'Add some AmazingFeature'\`)
4. 推送到分支 (\`git push origin feature/AmazingFeature\`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情
EOF

# 创建基础测试文件
print_step "🧪 创建测试模板..."
mkdir -p test/unit
cat > test/unit/app.test.ts << 'EOF'
import request from 'supertest';

describe('Application', () => {
  it('should respond to health check', async () => {
    // TODO: 实现应用测试
    expect(true).toBe(true);
  });
});
EOF

# 创建Jest配置
cat > jest.config.js << 'EOF'
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};
EOF

# 创建ESLint配置
cat > .eslintrc.json << 'EOF'
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "@typescript-eslint/recommended"
  ],
  "plugins": ["@typescript-eslint"],
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "prefer-const": "error",
    "no-var": "error"
  },
  "env": {
    "node": true,
    "es2022": true
  }
}
EOF

# 创建gitignore
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build outputs
dist/
build/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Temporary files
*.tmp
*.temp
EOF

print_step "📦 安装依赖包..."
npm install

print_message "🎉 项目创建完成！"
print_message ""
print_message "📁 项目位置: $PROJECT_DIR"
print_message "🔧 项目类型: $PROJECT_TYPE"
print_message ""
print_message "🚀 下一步操作:"
print_message "  1. cd $PROJECT_NAME"
print_message "  2. cp .env.example .env"
print_message "  3. 编辑 .env 文件配置您的环境变量"
print_message "  4. npm run dev"
print_message ""
print_message "📖 更多信息请查看: README.md"
print_message "📋 架构指南请查看: docs/universal-architecture-guide.md"

# 复制架构指南到新项目
if [ -f "$CURRENT_DIR/docs/universal-architecture-guide.md" ]; then
    cp "$CURRENT_DIR/docs/universal-architecture-guide.md" docs/
    print_message "✅ 已复制架构指南到项目文档"
fi

print_message "✨ 项目 $PROJECT_NAME 创建成功！" 