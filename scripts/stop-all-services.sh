#!/bin/bash

# PancakeSwap V3 系统服务停止脚本

echo "🛑 PancakeSwap V3 系统服务停止器"
echo "================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 停止端口上的服务
stop_port() {
    local port=$1
    local service_name=$2
    
    echo -e "${BLUE}🔍 检查端口 $port ($service_name)...${NC}"
    
    local pids=$(lsof -Pi :$port -sTCP:LISTEN -t 2>/dev/null)
    
    if [ -n "$pids" ]; then
        echo -e "${YELLOW}⏹️  停止 $service_name (端口:$port)...${NC}"
        echo "$pids" | xargs kill -9 2>/dev/null
        
        # 验证是否停止成功
        sleep 2
        local remaining_pids=$(lsof -Pi :$port -sTCP:LISTEN -t 2>/dev/null)
        
        if [ -z "$remaining_pids" ]; then
            echo -e "${GREEN}✅ $service_name 已停止${NC}"
        else
            echo -e "${RED}❌ $service_name 停止失败${NC}"
        fi
    else
        echo -e "${BLUE}ℹ️  $service_name 未运行${NC}"
    fi
}

# 清理PID文件
cleanup_pids() {
    echo -e "${BLUE}🧹 清理PID文件...${NC}"
    
    if [ -d "pids" ]; then
        rm -f pids/*.pid
        echo -e "${GREEN}✅ PID文件已清理${NC}"
    fi
}

echo -e "${BLUE}🛑 开始停止所有服务...${NC}"

# 按端口停止服务
stop_port 5000 "策略管理前端"
stop_port 4001 "主程序前端"
stop_port 8001 "OKX交换代理"
stop_port 8000 "OKX DEX API"
stop_port 4000 "主程序后端"

# 清理PID文件
cleanup_pids

# 额外安全检查 - 停止所有相关node进程
echo -e "${BLUE}🔍 额外安全检查...${NC}"

# 查找可能遗留的node进程
node_processes=$(ps aux | grep node | grep -v grep | grep -E "(pancake|okx|strategy)" | awk '{print $2}' 2>/dev/null)

if [ -n "$node_processes" ]; then
    echo -e "${YELLOW}⚠️  发现遗留的Node.js进程，正在清理...${NC}"
    echo "$node_processes" | xargs kill -9 2>/dev/null
    echo -e "${GREEN}✅ 遗留进程已清理${NC}"
fi

echo ""
echo -e "${GREEN}🎉 所有服务已停止！${NC}"
echo "================================="

# 最终验证
echo -e "${BLUE}🔍 最终状态验证...${NC}"

ports=(4000 4001 5000 8000 8001)
all_stopped=true

for port in "${ports[@]}"; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${RED}❌ 端口 $port 仍有进程在监听${NC}"
        all_stopped=false
    else
        echo -e "${GREEN}✅ 端口 $port 已释放${NC}"
    fi
done

if [ "$all_stopped" = true ]; then
    echo ""
    echo -e "${GREEN}🎯 所有端口已成功释放！${NC}"
    echo -e "${BLUE}💡 现在可以重新启动服务: ./scripts/start-all-services.sh${NC}"
else
    echo ""
    echo -e "${YELLOW}⚠️  部分端口可能仍被其他进程占用${NC}"
    echo -e "${BLUE}💡 请手动检查: lsof -i :<port>${NC}"
fi 