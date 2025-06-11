#!/bin/bash

# PancakeSwap V3 端口状态检查脚本

echo "🔍 PancakeSwap V3 端口状态检查"
echo "=============================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查单个端口状态
check_port_status() {
    local port=$1
    local service_name=$2
    local expected_url=$3
    
    echo -e "${BLUE}🔍 检查 $service_name (端口:$port)${NC}"
    
    # 检查端口是否被监听
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        local pid=$(lsof -Pi :$port -sTCP:LISTEN -t | head -1)
        echo -e "  ${GREEN}✅ 端口 $port 已监听 (PID: $pid)${NC}"
        
        # 如果有URL，尝试健康检查
        if [ -n "$expected_url" ]; then
            echo -e "  ${BLUE}🏥 健康检查: $expected_url${NC}"
            
            if curl -s --max-time 5 "$expected_url" >/dev/null 2>&1; then
                echo -e "  ${GREEN}✅ 服务响应正常${NC}"
            else
                echo -e "  ${YELLOW}⚠️  服务无响应或检查失败${NC}"
            fi
        fi
        
        # 显示进程信息
        local process_info=$(ps -p $pid -o pid,ppid,command --no-headers 2>/dev/null)
        if [ -n "$process_info" ]; then
            echo -e "  ${BLUE}📋 进程信息: $process_info${NC}"
        fi
        
        return 0
    else
        echo -e "  ${RED}❌ 端口 $port 未被监听${NC}"
        return 1
    fi
}

echo -e "${BLUE}🚀 开始检查各服务端口...${NC}"
echo ""

# 定义所有服务
services=(
    "4000:主程序后端:http://localhost:4000/health"
    "8001:OKX交换代理:http://localhost:8001/api/okx/health"
    "4001:主程序前端:http://localhost:4001"
    "5000:策略管理前端:http://localhost:5000"
    "8000:OKX DEX API:http://localhost:8000"
)

running_count=0
total_count=${#services[@]}

for service in "${services[@]}"; do
    IFS=':' read -ra PARTS <<< "$service"
    port="${PARTS[0]}"
    name="${PARTS[1]}"
    url="${PARTS[2]:-}"
    
    if check_port_status "$port" "$name" "$url"; then
        ((running_count++))
    fi
    echo ""
done

# 汇总状态
echo "=============================="
echo -e "${BLUE}📊 状态汇总:${NC}"
echo -e "  运行中: ${GREEN}$running_count${NC}/$total_count"

if [ $running_count -eq $total_count ]; then
    echo -e "  ${GREEN}🎉 所有服务运行正常！${NC}"
elif [ $running_count -eq 0 ]; then
    echo -e "  ${RED}❌ 所有服务均未启动${NC}"
    echo -e "  ${BLUE}💡 使用以下命令启动: ./scripts/start-all-services.sh${NC}"
else
    echo -e "  ${YELLOW}⚠️  部分服务未启动${NC}"
    echo -e "  ${BLUE}💡 检查启动日志或重新启动服务${NC}"
fi

# 显示常用命令
echo ""
echo -e "${BLUE}💡 常用操作:${NC}"
echo "  📊 查看所有端口: netstat -an | grep LISTEN | grep -E '(4000|4001|5000|8000|8001)'"
echo "  🚀 启动所有服务: ./scripts/start-all-services.sh"
echo "  🛑 停止所有服务: ./scripts/stop-all-services.sh"
echo "  📋 查看Node进程: ps aux | grep node"

# 网络连接检查
echo ""
echo -e "${BLUE}🌐 网络连接检查:${NC}"

active_connections=$(netstat -an | grep LISTEN | grep -E '(4000|4001|5000|8000|8001)' | wc -l)
echo "  活跃监听端口数: $active_connections"

if [ $active_connections -gt 0 ]; then
    echo "  详细端口状态:"
    netstat -an | grep LISTEN | grep -E '(4000|4001|5000|8000|8001)' | while read line; do
        echo "    $line"
    done
fi 