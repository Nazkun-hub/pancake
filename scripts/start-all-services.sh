#!/bin/bash

# PancakeSwap V3 系统服务启动脚本
# 包含端口统一配置 (主系统4xxx, OKX系统8xxx)

echo "🚀 PancakeSwap V3 系统服务启动器"
echo "================================="

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
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${YELLOW}⚠️  端口 $port ($service_name) 已被占用${NC}"
        echo "是否要杀死占用进程？(y/n)"
        read -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            lsof -Pi :$port -sTCP:LISTEN -t | xargs kill -9
            echo -e "${GREEN}✅ 端口 $port 已释放${NC}"
        else
            echo -e "${RED}❌ 取消启动，请手动处理端口冲突${NC}"
            exit 1
        fi
    fi
}

# 启动服务的函数
start_service() {
    local name=$1
    local command=$2
    local port=$3
    local directory=${4:-"."}
    
    echo -e "${BLUE}📦 启动 $name (端口:$port)...${NC}"
    
    if [ "$directory" != "." ]; then
        cd "$directory" || {
            echo -e "${RED}❌ 无法进入目录: $directory${NC}"
            return 1
        }
    fi
    
    # 在后台启动服务
    local service_name_lower=$(echo "$name" | tr '[:upper:]' '[:lower:]')
    nohup $command > "logs/${service_name_lower}.log" 2>&1 &
    local pid=$!
    
    echo "PID: $pid" > "pids/${service_name_lower}.pid"
    
    # 等待服务启动
    sleep 3
    
    # 检查服务是否成功启动
    if ps -p $pid > /dev/null; then
        echo -e "${GREEN}✅ $name 启动成功 (PID: $pid)${NC}"
        return 0
    else
        echo -e "${RED}❌ $name 启动失败${NC}"
        return 1
    fi
}

# 创建日志和PID目录
mkdir -p logs pids

echo -e "${BLUE}🔍 检查端口占用情况...${NC}"

# 检查主要端口
check_port 4000 "主程序后端"
check_port 4001 "主程序前端" 
check_port 5000 "策略管理前端"
check_port 8000 "OKX DEX API"
check_port 8001 "OKX交换代理"

echo -e "${BLUE}🚀 开始启动服务...${NC}"

# 1. 启动主程序后端 (必须先启动)
echo -e "${YELLOW}1/5 启动主程序后端服务...${NC}"
start_service "MainBackend" "npm run dev" 4000 "." || {
    echo -e "${RED}❌ 主程序后端启动失败，停止启动流程${NC}"
    exit 1
}

# 等待主程序完全启动
echo "⏳ 等待主程序后端完全启动..."
sleep 10

# 2. 启动OKX交换代理服务 (策略功能需要)
echo -e "${YELLOW}2/5 启动OKX交换代理服务...${NC}"
if [ -d "okx-dex-api" ]; then
    start_service "OKXProxy" "npm start" 8001 "okx-dex-api"
else
    echo -e "${YELLOW}⚠️  okx-dex-api 目录不存在，跳过OKX交换代理服务${NC}"
fi

# 3. 启动主程序前端
echo -e "${YELLOW}3/5 启动主程序前端...${NC}"
if [ -d "web" ]; then
    start_service "MainFrontend" "npm start" 4001 "web"
else
    echo -e "${YELLOW}⚠️  web 目录不存在，跳过主程序前端${NC}"
fi

# 4. 启动策略管理前端
echo -e "${YELLOW}4/5 启动策略管理前端...${NC}"
if [ -d "strategy-ui" ]; then
    start_service "StrategyUI" "npm start" 5000 "strategy-ui"
else
    echo -e "${YELLOW}⚠️  strategy-ui 目录不存在，跳过策略管理前端${NC}"
fi

# 5. 启动OKX DEX API (可选)
echo -e "${YELLOW}5/5 启动OKX DEX API服务...${NC}"
if [ -d "okx_dex_api" ]; then
    start_service "OKXAPI" "npm run web" 8000 "okx_dex_api"
else
    echo -e "${YELLOW}⚠️  okx_dex_api 目录不存在，跳过OKX DEX API服务${NC}"
fi

echo ""
echo -e "${GREEN}🎉 服务启动完成！${NC}"
echo "================================="
echo -e "${BLUE}📍 访问地址:${NC}"
echo "  🏠 主程序前端:     http://localhost:4001"
echo "  📊 策略管理界面:   http://localhost:5000" 
echo "  🎮 OKX DEX API:   http://localhost:8000"
echo ""
echo -e "${BLUE}🔧 API接口:${NC}"
echo "  📡 主程序API:      http://localhost:4000/api"
echo "  🔄 OKX交换代理:    http://localhost:8001/api/okx"
echo ""
echo -e "${BLUE}🏥 健康检查:${NC}"
echo "  curl http://localhost:4000/health"
echo "  curl http://localhost:8001/api/okx/health"
echo ""
echo -e "${YELLOW}💡 提示:${NC}"
echo "  - 查看日志: tail -f logs/<service>.log"
echo "  - 停止服务: ./scripts/stop-all-services.sh"
echo "  - 查看进程: ps aux | grep node"

# 检查服务状态
echo ""
echo -e "${BLUE}🔍 最终服务状态检查...${NC}"
sleep 5

services=(
    "4000:主程序后端"
    "8001:OKX交换代理" 
    "4001:主程序前端"
    "5000:策略管理前端"
    "8000:OKX DEX API"
)

for service in "${services[@]}"; do
    port="${service%%:*}"
    name="${service##*:}"
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null; then
        echo -e "${GREEN}✅ $name (端口:$port) 运行正常${NC}"
    else
        echo -e "${RED}❌ $name (端口:$port) 未启动${NC}"
    fi
done

echo ""
echo -e "${GREEN}🎉 系统启动完成！准备就绪！${NC}" 