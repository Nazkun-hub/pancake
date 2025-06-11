#!/bin/bash

# PancakeSwap V3 简化启动脚本
# 只启动实际存在的服务

echo "🚀 PancakeSwap V3 简化启动器"
echo "==========================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查端口是否被占用
check_port() {
    local port=$1
    local service_name=$2
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  端口 $port ($service_name) 已被占用${NC}"
        echo "是否要杀死占用进程？(y/n)"
        read -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            lsof -Pi :$port -sTCP:LISTEN -t | xargs kill -9 2>/dev/null
            echo -e "${GREEN}✅ 端口 $port 已释放${NC}"
        else
            echo -e "${RED}❌ 取消启动，请手动处理端口冲突${NC}"
            exit 1
        fi
    fi
}

# 启动主程序后端 (必须)
echo -e "${BLUE}🚀 1. 启动主程序后端服务...${NC}"
check_port 4000 "主程序后端"

echo "📦 启动主程序后端 (端口:4000)..."
nohup npm run dev > logs/backend.log 2>&1 &
BACKEND_PID=$!

echo "PID: $BACKEND_PID" > pids/backend.pid
echo -e "${GREEN}✅ 主程序后端已启动 (PID: $BACKEND_PID)${NC}"

# 等待后端启动
echo "⏳ 等待主程序后端完全启动..."
sleep 10

# 启动OKX交换代理服务 (策略引擎需要)
echo -e "${BLUE}🚀 2. 启动OKX交换代理服务...${NC}"
if [ -d "okx-proxy" ]; then
    check_port 8001 "OKX交换代理"
    
    echo "📦 启动OKX交换代理 (端口:8001)..."
    cd okx-proxy
    
    # 检查是否需要安装依赖
    if [ ! -d "node_modules" ]; then
        echo "📥 安装OKX代理服务依赖..."
        npm install --silent
    fi
    
    nohup npm start > ../logs/okx-proxy.log 2>&1 &
    OKX_PROXY_PID=$!
    cd ..
    
    echo "PID: $OKX_PROXY_PID" > pids/okx-proxy.pid
    echo -e "${GREEN}✅ OKX交换代理已启动 (PID: $OKX_PROXY_PID)${NC}"
else
    echo -e "${YELLOW}⚠️  okx-proxy目录不存在，跳过OKX代理启动${NC}"
fi

# 检查主程序前端是否存在
echo -e "${BLUE}🚀 3. 检查主程序前端...${NC}"
if [ -d "web" ]; then
    check_port 4001 "主程序前端"
    
    echo "📦 启动主程序前端 (端口:4001)..."
    cd web
    nohup npm start > ../logs/frontend.log 2>&1 &
    FRONTEND_PID=$!
    cd ..
    
    echo "PID: $FRONTEND_PID" > pids/frontend.pid
    echo -e "${GREEN}✅ 主程序前端已启动 (PID: $FRONTEND_PID)${NC}"
else
    echo -e "${YELLOW}⚠️  web目录不存在，跳过前端启动${NC}"
fi

# 检查策略管理前端
echo -e "${BLUE}🚀 4. 检查策略管理前端...${NC}"
if [ -d "strategy-ui" ]; then
    check_port 5000 "策略管理前端"
    
    echo "📦 启动策略管理前端 (端口:5000)..."
    cd strategy-ui
    nohup npm start > ../logs/strategy.log 2>&1 &
    STRATEGY_PID=$!
    cd ..
    
    echo "PID: $STRATEGY_PID" > pids/strategy.pid
    echo -e "${GREEN}✅ 策略管理前端已启动 (PID: $STRATEGY_PID)${NC}"
else
    echo -e "${YELLOW}⚠️  strategy-ui目录不存在，跳过策略前端启动${NC}"
fi

# 检查OKX DEX API服务
echo -e "${BLUE}🚀 5. 检查OKX DEX API服务...${NC}"
if [ -d "okx_dex_api" ]; then
    check_port 8000 "OKX DEX API"
    
    echo "📦 启动OKX DEX API (端口:8000)..."
    cd okx_dex_api
    nohup npm run web > ../logs/okx-api.log 2>&1 &
    OKX_API_PID=$!
    cd ..
    
    echo "PID: $OKX_API_PID" > pids/okx-api.pid
    echo -e "${GREEN}✅ OKX DEX API已启动 (PID: $OKX_API_PID)${NC}"
else
    echo -e "${YELLOW}⚠️  okx_dex_api目录不存在，跳过OKX API启动${NC}"
fi

echo ""
echo -e "${GREEN}🎉 启动完成！${NC}"
echo "======================="

# 最终状态检查
echo -e "${BLUE}🔍 检查服务状态...${NC}"
sleep 3

# 检查主程序后端
if curl -s http://localhost:4000/health >/dev/null 2>&1; then
    echo -e "${GREEN}✅ 主程序后端 (4000) 运行正常${NC}"
else
    echo -e "${RED}❌ 主程序后端 (4000) 未响应${NC}"
fi

# 检查OKX代理服务
if curl -s http://localhost:8001/health >/dev/null 2>&1; then
    echo -e "${GREEN}✅ OKX交换代理 (8001) 运行正常${NC}"
else
    echo -e "${YELLOW}⚠️  OKX交换代理 (8001) 未启动${NC}"
fi

# 检查其他端口
for port in 4001 5000 8000; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${GREEN}✅ 端口 $port 已监听${NC}"
    else
        echo -e "${YELLOW}⚠️  端口 $port 未启动${NC}"
    fi
done

echo ""
echo -e "${BLUE}📍 访问地址:${NC}"
echo "  🏠 主程序: http://localhost:4000"
if [ -d "web" ]; then
    echo "  🌐 前端界面: http://localhost:4001"
fi
if [ -d "strategy-ui" ]; then
    echo "  📊 策略管理: http://localhost:5000"
fi
if [ -d "okx_dex_api" ]; then
    echo "  🎮 OKX DEX API: http://localhost:8000"
fi

echo ""
echo -e "${BLUE}🔧 API服务:${NC}"
echo "  📡 主程序API: http://localhost:4000/api"
if [ -d "okx-proxy" ]; then
    echo "  🔄 OKX交换代理: http://localhost:8001/api/okx"
fi

echo ""
echo -e "${BLUE}💡 管理命令:${NC}"
echo "  📊 查看日志: tail -f logs/backend.log"
echo "  🛑 停止服务: ./scripts/stop-all-services.sh"
echo "  📋 查看进程: ps aux | grep node" 