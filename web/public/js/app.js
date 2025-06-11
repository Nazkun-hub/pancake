/**
 * PancakeSwap V3 流动性管理系统 - 前端应用
 */

// 全局变量
let socket;
let priceChart;
let walletStatus = {
    hasWallet: false,
    isUnlocked: false
};
let currentStrategies = [];
let currentInstances = [];
let currentExecutionHistory = [];

// 头寸配置管理系统
let currentPoolInfo = null;
let savedConfigs = JSON.parse(localStorage.getItem('positionConfigs') || '[]');

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 PancakeSwap 应用已加载');
    initSocket();
    initChart();
    checkWalletStatus();
    startSystemMonitoring();
    
    // 确保全局函数可用
    window.showCreateWallet = showCreateWallet;
    window.createWallet = createWallet;
    window.unlockWallet = unlockWallet;
    window.lockWallet = lockWallet;
    window.deleteWallet = deleteWallet;
    window.showWalletInfo = showWalletInfo;
    window.connectWeb3 = connectWeb3;
    window.refreshWalletInfo = refreshWalletInfo;
    window.copyToClipboard = copyToClipboard;
    window.togglePassword = togglePassword;
    window.showCreatePosition = showCreatePosition;
    window.createPosition = createPosition;
    window.clearLogs = clearLogs;
    
    // 头寸配置管理函数
    window.resetConfigForm = resetConfigForm;
    window.loadUserAddressFromWallet = loadUserAddressFromWallet;
    window.fetchPoolInfo = fetchPoolInfo;
    window.updatePricePreview = updatePricePreview;
    window.calculateTokenAmounts = calculateTokenAmounts;
    window.savePositionConfig = savePositionConfig;
    window.loadPositionConfig = loadPositionConfig;
    window.deletePositionConfig = deletePositionConfig;
    window.clearAllConfigs = clearAllConfigs;
    window.executeCreatePosition = executeCreatePosition;
    window.executeCloseAllPositions = executeCloseAllPositions;
    window.executeStartStrategy = executeStartStrategy;
    window.executeStopStrategy = executeStopStrategy;
    
    console.log('✅ 所有函数已绑定到window对象');
});

// Socket.io连接
function initSocket() {
    socket = io();
    
    socket.on('connect', function() {
        console.log('已连接到服务器');
        addLog('系统', '连接到服务器成功');
    });
    
    socket.on('disconnect', function() {
        console.log('与服务器断开连接');
        addLog('系统', '与服务器断开连接', 'error');
    });
    
    // 监听钱包相关事件
    socket.on('walletStatusChanged', function(data) {
        updateWalletStatus(data);
    });
    
    // 监听Web3状态变化
    socket.on('web3StatusChanged', function(data) {
        addLog('Web3', `连接状态变化: ${data.connected ? '已连接' : '已断开'}`);
        if (data.connected && data.walletInfo) {
            addLog('Web3', `钱包地址: ${data.walletInfo.address}, 余额: ${data.walletInfo.balance} BNB`);
        }
    });
    
    // 监听系统事件
    socket.on('systemLog', function(data) {
        addLog(data.source || '系统', data.message, data.level || 'info');
    });
    
    // 监听价格更新
    socket.on('priceUpdate', function(data) {
        updatePriceChart(data);
    });
}

// 初始化价格图表
function initChart() {
    const ctx = document.getElementById('priceChart').getContext('2d');
    
    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'WBNB/USDT',
                data: [],
                borderColor: '#ff6c37',
                backgroundColor: 'rgba(255, 108, 55, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }, {
                label: 'CAKE/WBNB',
                data: [],
                borderColor: '#1fc7d4',
                backgroundColor: 'rgba(31, 199, 212, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff'
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#b3b3b3'
                    },
                    grid: {
                        color: '#444'
                    }
                },
                y: {
                    ticks: {
                        color: '#b3b3b3'
                    },
                    grid: {
                        color: '#444'
                    }
                }
            }
        }
    });
    
    // 生成模拟价格数据
    generateMockPriceData();
}

// 生成模拟价格数据
function generateMockPriceData() {
    const now = new Date();
    const labels = [];
    const wbnbData = [];
    const cakeData = [];
    
    for (let i = 23; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60 * 60 * 1000);
        labels.push(time.getHours().toString().padStart(2, '0') + ':00');
        
        // WBNB/USDT 价格 (around 300)
        wbnbData.push(300 + Math.random() * 20 - 10);
        
        // CAKE/WBNB 价格 (around 0.02)
        cakeData.push(0.02 + Math.random() * 0.004 - 0.002);
    }
    
    priceChart.data.labels = labels;
    priceChart.data.datasets[0].data = wbnbData;
    priceChart.data.datasets[1].data = cakeData;
    priceChart.update();
}

// 更新价格图表
function updatePriceChart(data) {
    if (!priceChart) return;
    
    const now = new Date();
    const timeLabel = now.getHours().toString().padStart(2, '0') + ':' + 
                     now.getMinutes().toString().padStart(2, '0');
    
    // 添加新数据点
    priceChart.data.labels.push(timeLabel);
    if (priceChart.data.labels.length > 24) {
        priceChart.data.labels.shift();
    }
    
    // 更新数据
    priceChart.data.datasets.forEach((dataset, index) => {
        const newPrice = data.pools[index]?.price || dataset.data[dataset.data.length - 1];
        dataset.data.push(newPrice);
        if (dataset.data.length > 24) {
            dataset.data.shift();
        }
    });
    
    priceChart.update('none');
}

// 钱包管理功能
function checkWalletStatus() {
    fetch('/api/wallet/status')
        .then(response => response.json())
        .then(data => {
            walletStatus = data;
            updateWalletUI();
        })
        .catch(error => {
            console.error('检查钱包状态失败:', error);
            addLog('钱包', '检查钱包状态失败', 'error');
        });
}

function updateWalletUI() {
    const noWalletSection = document.getElementById('noWalletSection');
    const walletLockedSection = document.getElementById('walletLockedSection');
    const walletUnlockedSection = document.getElementById('walletUnlockedSection');
    const walletStatusElement = document.getElementById('walletStatus');
    
    // 隐藏所有section
    noWalletSection.style.display = 'none';
    walletLockedSection.style.display = 'none';
    walletUnlockedSection.style.display = 'none';
    
    if (!walletStatus.hasWallet) {
        // 没有钱包
        noWalletSection.style.display = 'block';
        walletStatusElement.className = 'wallet-status wallet-locked';
        walletStatusElement.innerHTML = '<i class="fas fa-wallet"></i><span>未创建钱包</span>';
    } else if (!walletStatus.isUnlocked) {
        // 钱包已锁定
        walletLockedSection.style.display = 'block';
        walletStatusElement.className = 'wallet-status wallet-locked';
        walletStatusElement.innerHTML = '<i class="fas fa-lock"></i><span>钱包已锁定</span>';
    } else {
        // 钱包已解锁
        walletUnlockedSection.style.display = 'block';
        walletStatusElement.className = 'wallet-status wallet-unlocked';
        walletStatusElement.innerHTML = '<i class="fas fa-unlock"></i><span>钱包已解锁</span>';
    }
}

function showCreateWallet() {
    console.log('🔓 showCreateWallet 函数被调用');
    
    const modal = new bootstrap.Modal(document.getElementById('createWalletModal'));
    console.log('📦 创建Modal实例:', modal);
    
    modal.show();
    console.log('✨ 显示模态对话框');
    
    // 清空表单
    const form = document.getElementById('createWalletForm');
    if (form) {
        form.reset();
        console.log('🧹 表单已重置');
    } else {
        console.error('❌ 未找到创建钱包表单');
    }
}

function createWallet() {
    console.log('🔒 createWallet 函数被调用');
    
    const privateKey = document.getElementById('privateKey');
    const password = document.getElementById('encryptPassword');
    const confirmPassword = document.getElementById('confirmPassword');
    
    console.log('🔍 检查表单元素:');
    console.log('- privateKey元素:', privateKey);
    console.log('- password元素:', password);
    console.log('- confirmPassword元素:', confirmPassword);
    
    if (!privateKey || !password || !confirmPassword) {
        console.error('❌ 缺少必要的表单元素');
        showNotification('表单元素缺失', 'error');
        return;
    }
    
    const privateKeyValue = privateKey.value;
    const passwordValue = password.value;
    const confirmPasswordValue = confirmPassword.value;
    
    console.log('📝 表单值:');
    console.log('- privateKey长度:', privateKeyValue.length);
    console.log('- password长度:', passwordValue.length);
    console.log('- confirmPassword长度:', confirmPasswordValue.length);
    
    // 验证输入
    if (!privateKeyValue || !passwordValue || !confirmPasswordValue) {
        console.log('⚠️ 有空字段');
        showNotification('请填写所有必填字段', 'error');
        return;
    }
    
    if (passwordValue !== confirmPasswordValue) {
        console.log('⚠️ 密码不匹配');
        showNotification('两次输入的密码不一致', 'error');
        return;
    }
    
    if (passwordValue.length < 6) {
        console.log('⚠️ 密码太短');
        showNotification('密码长度至少6位', 'error');
        return;
    }
    
    // 验证私钥格式
    const cleanKey = privateKeyValue.replace(/^0x/, '');
    if (!/^[a-fA-F0-9]{64}$/.test(cleanKey)) {
        console.log('⚠️ 私钥格式无效');
        showNotification('私钥格式无效，必须是64位十六进制字符串', 'error');
        return;
    }
    
    console.log('✅ 所有验证通过，准备发送请求');
    
    // 发送创建请求
    fetch('/api/wallet/create', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            privateKey: privateKeyValue,
            password: passwordValue
        })
    })
    .then(response => {
        console.log('📡 收到响应:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('📦 响应数据:', data);
        if (data.success) {
            showNotification('钱包创建成功', 'success');
            checkWalletStatus();
            bootstrap.Modal.getInstance(document.getElementById('createWalletModal')).hide();
            addLog('钱包', '钱包创建成功');
        } else {
            showNotification(data.error || '创建钱包失败', 'error');
        }
    })
    .catch(error => {
        console.error('❌ 创建钱包失败:', error);
        showNotification('创建钱包失败', 'error');
    });
}

function unlockWallet() {
    const password = document.getElementById('unlockPassword').value;
    
    if (!password) {
        showNotification('请输入密码', 'error');
        return;
    }
    
    fetch('/api/wallet/unlock', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('钱包解锁成功', 'success');
            checkWalletStatus();
            document.getElementById('unlockPassword').value = '';
            addLog('钱包', '钱包解锁成功');
        } else {
            showNotification(data.error || '解锁失败', 'error');
        }
    })
    .catch(error => {
        console.error('解锁钱包失败:', error);
        showNotification('解锁钱包失败', 'error');
    });
}

function lockWallet() {
    fetch('/api/wallet/lock', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('钱包已锁定', 'info');
            checkWalletStatus();
            addLog('钱包', '钱包已锁定');
        } else {
            showNotification(data.error || '锁定失败', 'error');
        }
    })
    .catch(error => {
        console.error('锁定钱包失败:', error);
        showNotification('锁定钱包失败', 'error');
    });
}

function deleteWallet() {
    if (!confirm('确定要删除钱包吗？此操作不可恢复！')) {
        return;
    }
    
    fetch('/api/wallet/delete', {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('钱包已删除', 'info');
            checkWalletStatus();
            addLog('钱包', '钱包已删除');
        } else {
            showNotification(data.error || '删除失败', 'error');
        }
    })
    .catch(error => {
        console.error('删除钱包失败:', error);
        showNotification('删除钱包失败', 'error');
    });
}

function showWalletInfo() {
    if (!walletStatus.isUnlocked) {
        showNotification('请先解锁钱包', 'warning');
        return;
    }
    
    // 获取钱包信息
    fetch('/api/wallet/info')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // 更新钱包信息模态框
                document.getElementById('walletAddress').value = data.info.address || '';
                document.getElementById('walletBalance').value = data.info.balance ? 
                    `${data.info.balance} BNB` : '0 BNB';
                document.getElementById('walletFilePath').value = data.info.filePath || '';
                
                // 更新连接状态
                const connectionStatus = document.getElementById('connectionStatus');
                const connectBtn = document.getElementById('connectWeb3Btn');
                
                if (data.info.isConnected) {
                    connectionStatus.textContent = '已连接';
                    connectionStatus.className = 'badge bg-success me-2';
                    connectBtn.textContent = '已连接Web3';
                    connectBtn.className = 'btn btn-success btn-sm';
                    connectBtn.disabled = true;
                } else {
                    connectionStatus.textContent = '未连接';
                    connectionStatus.className = 'badge bg-warning me-2';
                    connectBtn.innerHTML = '<i class="fas fa-plug me-2"></i>连接Web3';
                    connectBtn.className = 'btn btn-success btn-sm';
                    connectBtn.disabled = false;
                }
                
                // 获取网络信息
                fetch('/api/wallet/network-info')
                    .then(response => response.json())
                    .then(networkData => {
                        if (networkData.success) {
                            document.getElementById('networkName').value = 
                                `${networkData.networkInfo.networkName} (Chain ID: ${networkData.networkInfo.chainId})`;
                        }
                    })
                    .catch(error => console.error('获取网络信息失败:', error));
                
                // 显示模态框
                const modal = new bootstrap.Modal(document.getElementById('walletInfoModal'));
                modal.show();
            } else {
                showNotification(data.error || '获取钱包信息失败', 'error');
            }
        })
        .catch(error => {
            console.error('获取钱包信息失败:', error);
            showNotification('获取钱包信息失败', 'error');
        });
}

// 连接Web3钱包
function connectWeb3() {
    if (!walletStatus.isUnlocked) {
        showNotification('请先解锁钱包', 'warning');
        return;
    }
    
    const connectBtn = document.getElementById('connectWeb3Btn');
    const originalHtml = connectBtn.innerHTML;
    
    // 显示加载状态
    connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>连接中...';
    connectBtn.disabled = true;
    
    fetch('/api/wallet/connect-web3', {
        method: 'POST'
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Web3钱包连接成功', 'success');
                addLog('Web3', `钱包连接成功 - 地址: ${data.walletInfo.address}`);
                
                // 更新界面
                const connectionStatus = document.getElementById('connectionStatus');
                connectionStatus.textContent = '已连接';
                connectionStatus.className = 'badge bg-success me-2';
                
                connectBtn.textContent = '已连接Web3';
                connectBtn.className = 'btn btn-success btn-sm';
                connectBtn.disabled = true;
                
                // 更新余额显示
                document.getElementById('walletBalance').value = `${data.walletInfo.balance} BNB`;
                document.getElementById('walletAddress').value = data.walletInfo.address;
            } else {
                showNotification(data.error || 'Web3连接失败', 'error');
                connectBtn.innerHTML = originalHtml;
                connectBtn.disabled = false;
            }
        })
        .catch(error => {
            console.error('Web3连接失败:', error);
            showNotification('Web3连接失败', 'error');
            connectBtn.innerHTML = originalHtml;
            connectBtn.disabled = false;
        });
}

// 刷新钱包信息
function refreshWalletInfo() {
    showWalletInfo(); // 重新获取并显示钱包信息
}

// 复制到剪贴板
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    element.select();
    element.setSelectionRange(0, 99999); // For mobile devices
    
    try {
        document.execCommand('copy');
        showNotification('已复制到剪贴板', 'success');
    } catch (err) {
        console.error('复制失败:', err);
        showNotification('复制失败', 'error');
    }
}

// 密码显示/隐藏切换
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const toggle = input.nextElementSibling;
    
    if (input.type === 'password') {
        input.type = 'text';
        toggle.className = 'fas fa-eye-slash password-toggle';
    } else {
        input.type = 'password';
        toggle.className = 'fas fa-eye password-toggle';
    }
}

// 头寸配置管理系统
function showCreatePosition() {
    if (!walletStatus.isUnlocked) {
        showNotification('请先解锁钱包', 'warning');
        return;
    }
    
    const modal = new bootstrap.Modal(document.getElementById('createPositionModal'));
    modal.show();
    
    // 重置表单
    resetConfigForm();
    
    // 加载保存的配置列表
    loadSavedConfigsList();
    
    // 尝试从钱包获取用户地址
    loadUserAddressFromWallet();
}

function resetConfigForm() {
    document.getElementById('positionConfigForm').reset();
    document.getElementById('poolInfoSection').style.display = 'none';
    document.getElementById('pricePreviewSection').style.display = 'none';
    document.getElementById('slippagePercent').value = '1';
    currentPoolInfo = null;
}

// 从钱包获取用户地址
async function loadUserAddressFromWallet() {
    try {
        console.log('🔍 正在从钱包获取用户地址...');
        addLog('钱包', '正在获取用户地址...');
        
        const response = await fetch('/api/wallet/info');
        const data = await response.json();
        
        console.log('📦 钱包信息API响应:', data);
        
        if (data.success && data.info && data.info.address) {
            const address = data.info.address;
            document.getElementById('userAddress').value = address;
            addLog('钱包', `已加载用户地址: ${address}`);
            showNotification('用户地址获取成功', 'success');
            console.log('✅ 用户地址获取成功:', address);
        } else {
            const errorMsg = data.error || '钱包信息不完整';
            addLog('钱包', `获取用户地址失败: ${errorMsg}`, 'error');
            showNotification(`获取用户地址失败: ${errorMsg}`, 'error');
            console.error('❌ 获取用户地址失败:', data);
        }
    } catch (error) {
        console.error('❌ 获取钱包地址失败:', error);
        addLog('钱包', `获取用户地址失败: ${error.message}`, 'error');
        showNotification('获取钱包地址失败', 'error');
    }
}

// 获取池信息
async function fetchPoolInfo() {
    const poolAddress = document.getElementById('poolAddress').value.trim();
    
    if (!poolAddress) {
        showNotification('请输入池合约地址', 'warning');
        return;
    }
    
    if (!/^0x[a-fA-F0-9]{40}$/.test(poolAddress)) {
        showNotification('池地址格式不正确', 'error');
        return;
    }
    
    try {
        addLog('池查询', '正在获取池信息...');
        
        // 这里需要通过池地址反向获取token信息
        // 由于API需要token0、token1、fee参数，我们需要修改API或使用其他方式
        // 暂时使用一个临时的API调用来获取池信息
        const response = await fetch(`/api/pool-info/${poolAddress}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            currentPoolInfo = data.data;
            displayPoolInfo(currentPoolInfo);
            addLog('池查询', '池信息获取成功');
        } else {
            throw new Error(data.error || '获取池信息失败');
        }
        
    } catch (error) {
        console.error('获取池信息失败:', error);
        showNotification('获取池信息失败: ' + error.message, 'error');
        addLog('池查询', '获取池信息失败: ' + error.message, 'error');
    }
}

// 显示池信息
function displayPoolInfo(poolInfo) {
    // 显示池信息区域
    document.getElementById('poolInfoSection').style.display = 'block';
    
    // 填充池信息
    document.getElementById('token0Symbol').textContent = poolInfo.token0Info?.symbol || 'Token0';
    document.getElementById('token0Address').textContent = poolInfo.token0Info?.address || '-';
    document.getElementById('token1Symbol').textContent = poolInfo.token1Info?.symbol || 'Token1';
    document.getElementById('token1Address').textContent = poolInfo.token1Info?.address || '-';
    document.getElementById('currentPrice').textContent = poolInfo.poolState?.price || '-';
    document.getElementById('currentTick').textContent = poolInfo.poolState?.tick || '-';
    
    // 更新代币输入标签
    document.getElementById('token0InputLabel').textContent = poolInfo.token0Info?.symbol || 'Token0';
    document.getElementById('token1InputLabel').textContent = poolInfo.token1Info?.symbol || 'Token1';
    
    // 触发价格预览更新
    updatePricePreview();
}

// 更新价格范围预览
function updatePricePreview() {
    if (!currentPoolInfo || !currentPoolInfo.poolState) {
        document.getElementById('pricePreviewSection').style.display = 'none';
        return;
    }
    
    const lowerPercent = parseFloat(document.getElementById('lowerPercent').value);
    const upperPercent = parseFloat(document.getElementById('upperPercent').value);
    const currentPrice = parseFloat(currentPoolInfo.poolState.price);
    
    if (isNaN(lowerPercent) || isNaN(upperPercent) || isNaN(currentPrice)) {
        document.getElementById('pricePreviewSection').style.display = 'none';
        return;
    }
    
    if (lowerPercent >= upperPercent) {
        showNotification('下限百分比必须小于上限百分比', 'warning');
        return;
    }
    
    // 计算价格范围（这里是简化计算，实际应该通过tick计算）
    const lowerPrice = currentPrice * (1 + lowerPercent / 100);
    const upperPrice = currentPrice * (1 + upperPercent / 100);
    
    // 显示价格预览
    document.getElementById('pricePreviewSection').style.display = 'block';
    document.getElementById('previewLowerPrice').textContent = lowerPrice.toFixed(6);
    document.getElementById('previewCurrentPrice').textContent = currentPrice.toFixed(6);
    document.getElementById('previewUpperPrice').textContent = upperPrice.toFixed(6);
}

// 计算代币数量（互相关联）- 用于前端预览，实际创建头寸时只需填写一个代币数量
function calculateTokenAmounts(inputIndex) {
    if (!currentPoolInfo || !currentPoolInfo.poolState) {
        return;
    }
    
    const currentPrice = parseFloat(currentPoolInfo.poolState.price);
    if (isNaN(currentPrice)) return;
    
    if (inputIndex === 0) {
        // 用户输入了Token0数量，自动计算Token1数量（仅用于预览）
        const token0Amount = parseFloat(document.getElementById('token0Amount').value);
        if (!isNaN(token0Amount)) {
            const token1Amount = token0Amount * currentPrice;
            document.getElementById('token1Amount').value = token1Amount.toFixed(6);
        }
    } else {
        // 用户输入了Token1数量，自动计算Token0数量（仅用于预览）
        const token1Amount = parseFloat(document.getElementById('token1Amount').value);
        if (!isNaN(token1Amount)) {
            const token0Amount = token1Amount / currentPrice;
            document.getElementById('token0Amount').value = token0Amount.toFixed(6);
        }
    }
}

// 保存配置
function savePositionConfig() {
    const configName = document.getElementById('configName').value.trim();
    
    if (!configName) {
        showNotification('请输入配置名称', 'warning');
        return;
    }
    
    const config = {
        id: Date.now().toString(),
        name: configName,
        poolAddress: document.getElementById('poolAddress').value,
        lowerPercent: parseFloat(document.getElementById('lowerPercent').value),
        upperPercent: parseFloat(document.getElementById('upperPercent').value),
        token0Amount: parseFloat(document.getElementById('token0Amount').value),
        token1Amount: parseFloat(document.getElementById('token1Amount').value),
        slippagePercent: parseFloat(document.getElementById('slippagePercent').value),
        userAddress: document.getElementById('userAddress').value,
        strategyInstanceId: document.getElementById('strategyInstanceId').value,
        savedAt: new Date().toISOString()
    };
    
    // 检查是否有重名配置
    const existingIndex = savedConfigs.findIndex(c => c.name === configName);
    if (existingIndex >= 0) {
        if (!confirm('已存在同名配置，是否覆盖？')) {
            return;
        }
        savedConfigs[existingIndex] = config;
    } else {
        savedConfigs.push(config);
    }
    
    // 保存到localStorage
    localStorage.setItem('positionConfigs', JSON.stringify(savedConfigs));
    
    // 刷新配置列表
    loadSavedConfigsList();
    
    showNotification('配置保存成功', 'success');
    addLog('配置', `已保存配置: ${configName}`);
}

// 加载保存的配置列表
function loadSavedConfigsList() {
    const container = document.getElementById('savedConfigsList');
    
    if (savedConfigs.length === 0) {
        container.innerHTML = '<div class="text-muted text-center py-3">暂无保存的配置</div>';
        return;
    }
    
    container.innerHTML = savedConfigs.map(config => `
        <div class="list-group-item list-group-item-action bg-dark border-secondary">
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <h6 class="mb-1 text-white">${config.name}</h6>
                    <p class="mb-1 text-muted small">
                        池地址: ${config.poolAddress.substring(0, 10)}...
                    </p>
                    <small class="text-muted">
                        范围: ${config.lowerPercent}% ~ ${config.upperPercent}%
                    </small>
                </div>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="loadPositionConfig('${config.id}')">
                        <i class="fas fa-upload"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deletePositionConfig('${config.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// 加载指定配置
function loadPositionConfig(configId) {
    const config = savedConfigs.find(c => c.id === configId);
    if (!config) {
        showNotification('配置不存在', 'error');
        return;
    }
    
    // 填充表单
    document.getElementById('configName').value = config.name;
    document.getElementById('poolAddress').value = config.poolAddress;
    document.getElementById('lowerPercent').value = config.lowerPercent;
    document.getElementById('upperPercent').value = config.upperPercent;
    document.getElementById('token0Amount').value = config.token0Amount;
    document.getElementById('token1Amount').value = config.token1Amount;
    document.getElementById('slippagePercent').value = config.slippagePercent;
    document.getElementById('userAddress').value = config.userAddress;
    document.getElementById('strategyInstanceId').value = config.strategyInstanceId;
    
    // 重新获取池信息
    fetchPoolInfo();
    
    showNotification('配置加载成功', 'success');
    addLog('配置', `已加载配置: ${config.name}`);
}

// 删除配置
function deletePositionConfig(configId) {
    if (!confirm('确认删除此配置？')) {
        return;
    }
    
    savedConfigs = savedConfigs.filter(c => c.id !== configId);
    localStorage.setItem('positionConfigs', JSON.stringify(savedConfigs));
    
    loadSavedConfigsList();
    showNotification('配置删除成功', 'success');
}

// 清空所有配置
function clearAllConfigs() {
    if (!confirm('确认清空所有配置？此操作无法撤销！')) {
        return;
    }
    
    savedConfigs = [];
    localStorage.setItem('positionConfigs', JSON.stringify(savedConfigs));
    
    loadSavedConfigsList();
    showNotification('所有配置已清空', 'success');
}

// 执行操作函数
async function executeCreatePosition() {
    try {
        console.log('🚀 开始创建头寸...');
        
        // 获取所有必需的参数
        const poolAddress = document.getElementById('poolAddress').value;
        const userAddress = document.getElementById('userAddress').value;
        const lowerPercent = parseFloat(document.getElementById('lowerPercent').value);
        const upperPercent = parseFloat(document.getElementById('upperPercent').value);
        const token0Amount = parseFloat(document.getElementById('token0Amount').value);
        const token1Amount = parseFloat(document.getElementById('token1Amount').value);
        const slippagePercent = parseFloat(document.getElementById('slippagePercent').value);
        
        console.log('📋 参数检查:', {
            poolAddress,
            userAddress,
            lowerPercent,
            upperPercent,
            token0Amount,
            token1Amount,
            slippagePercent
        });
        
        // 详细的参数验证
        const validationErrors = [];
        
        if (!poolAddress) validationErrors.push('池地址');
        if (!userAddress) validationErrors.push('用户地址');
        if (isNaN(lowerPercent)) validationErrors.push('下限百分比');
        if (isNaN(upperPercent)) validationErrors.push('上限百分比');
        if (isNaN(slippagePercent)) validationErrors.push('滑点百分比');
        
        // 代币数量验证：只需要填写其中一个代币的数量
        const hasToken0Amount = !isNaN(token0Amount) && token0Amount > 0;
        const hasToken1Amount = !isNaN(token1Amount) && token1Amount > 0;
        
        if (!hasToken0Amount && !hasToken1Amount) {
            validationErrors.push('至少需要填写一个代币的数量（Token0或Token1）');
        }
        
        if (validationErrors.length > 0) {
            const errorMsg = `请填写以下配置信息: ${validationErrors.join(', ')}`;
            showNotification(errorMsg, 'warning');
            addLog('创建头寸', errorMsg, 'error');
            console.error('❌ 参数验证失败:', validationErrors);
            return;
        }
        
        // 范围验证
        if (lowerPercent >= upperPercent) {
            const errorMsg = '下限百分比必须小于上限百分比';
            showNotification(errorMsg, 'warning');
            addLog('创建头寸', errorMsg, 'error');
            return;
        }
        
        document.getElementById('createPositionBtn').disabled = true;
        addLog('创建头寸', '正在创建头寸...');
        
        // 构建请求数据 - 根据用户填写的代币决定使用哪个输入参数
        const requestData = {
            lowerPercent: lowerPercent,
            upperPercent: upperPercent,
            baseSlippagePercent: slippagePercent,
            // 🔴 构建完整的池子配置对象
            poolConfig: {
                poolAddress: poolAddress,
                token0Address: currentPoolInfo?.token0Info?.address || '',
                token1Address: currentPoolInfo?.token1Info?.address || '',
                fee: currentPoolInfo?.fee || 100  // 默认使用100（0.01%）
            }
        };
        
        // 🔴 验证池子配置是否完整
        if (!requestData.poolConfig.token0Address || !requestData.poolConfig.token1Address) {
            const errorMsg = '池子信息不完整，请先点击"获取池信息"按钮加载池子数据';
            showNotification(errorMsg, 'warning');
            addLog('创建头寸', errorMsg, 'error');
            document.getElementById('createPositionBtn').disabled = false;
            return;
        }
        
        // 只传递用户填写的代币数量，让后端自动计算另一个
        if (hasToken0Amount) {
            requestData.inputAmount = token0Amount.toString();
            // 根据当前池信息确定Token0的符号
            requestData.inputToken = currentPoolInfo?.token0Info?.symbol || 'USDT';
            console.log('📝 使用Token0数量:', token0Amount, '代币:', requestData.inputToken);
        } else if (hasToken1Amount) {
            requestData.inputAmount = token1Amount.toString();
            // 根据当前池信息确定Token1的符号
            requestData.inputToken = currentPoolInfo?.token1Info?.symbol || 'WBNB';
            console.log('📝 使用Token1数量:', token1Amount, '代币:', requestData.inputToken);
        }
        
        console.log('📤 发送请求数据:', requestData);
        
        const response = await fetch('/api/add-liquidity', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        console.log('📡 响应状态:', response.status);
        
        const data = await response.json();
        console.log('📦 响应数据:', data);
        
        if (data.success) {
            showNotification('头寸创建成功', 'success');
            addLog('创建头寸', '头寸创建成功');
        } else {
            throw new Error(data.error || '创建头寸失败');
        }
        
    } catch (error) {
        console.error('❌ 创建头寸失败:', error);
        showNotification('创建头寸失败: ' + error.message, 'error');
        addLog('创建头寸', '创建头寸失败: ' + error.message, 'error');
    } finally {
        document.getElementById('createPositionBtn').disabled = false;
    }
}

async function executeCloseAllPositions() {
    const userAddress = document.getElementById('userAddress').value;
    
    if (!userAddress) {
        showNotification('请先获取用户地址', 'warning');
        return;
    }
    
    if (!confirm('确认关闭所有头寸？此操作无法撤销！')) {
        return;
    }
    
    try {
        document.getElementById('closeAllBtn').disabled = true;
        addLog('关闭头寸', '正在关闭所有头寸...');
        
        const response = await fetch(`/api/positions/batch/${userAddress}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('所有头寸关闭成功', 'success');
            addLog('关闭头寸', '所有头寸关闭成功');
        } else {
            throw new Error(data.error || '关闭头寸失败');
        }
        
    } catch (error) {
        console.error('关闭头寸失败:', error);
        showNotification('关闭头寸失败: ' + error.message, 'error');
        addLog('关闭头寸', '关闭头寸失败: ' + error.message, 'error');
    } finally {
        document.getElementById('closeAllBtn').disabled = false;
    }
}

async function executeStartStrategy() {
    const instanceId = document.getElementById('strategyInstanceId').value;
    
    if (!instanceId) {
        showNotification('请输入策略实例ID', 'warning');
        return;
    }
    
    try {
        document.getElementById('startStrategyBtn').disabled = true;
        addLog('启动策略', `正在启动策略实例 ${instanceId}...`);
        
        const response = await fetch(`/api/strategy/instance/${instanceId}/start`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('策略启动成功', 'success');
            addLog('启动策略', `策略实例 ${instanceId} 启动成功`);
        } else {
            throw new Error(data.error || '启动策略失败');
        }
        
    } catch (error) {
        console.error('启动策略失败:', error);
        showNotification('启动策略失败: ' + error.message, 'error');
        addLog('启动策略', '启动策略失败: ' + error.message, 'error');
    } finally {
        document.getElementById('startStrategyBtn').disabled = false;
    }
}

async function executeStopStrategy() {
    showNotification('停止策略功能暂未实现', 'info');
    addLog('停止策略', '功能暂未实现');
}

// 原有的createPosition函数保持兼容
function createPosition() {
    // 重定向到新的创建头寸函数
    executeCreatePosition();
}

// 加载池子数据
async function loadPools() {
    try {
        const response = await fetch('/api/pools');
        const data = await response.json();
        
        if (data.success) {
            updatePoolsTable(data.pools);
            updateMetrics(data.pools);
        } else {
            console.error('加载池子数据失败:', data.error);
        }
    } catch (error) {
        console.error('加载池子数据失败:', error);
    }
}

function updatePoolsTable(pools) {
    const tbody = document.getElementById('poolsTableBody');
    
    if (pools.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">暂无池子数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = pools.map(pool => `
        <tr>
            <td>
                <strong>${pool.name}</strong><br>
                <small class="text-muted">${pool.address}</small>
            </td>
            <td>
                ${pool.minPrice} - ${pool.maxPrice}<br>
                <small class="text-muted">当前: ${pool.currentPrice}</small>
            </td>
            <td>
                $${pool.liquidity.toLocaleString()}<br>
                <small class="text-muted">${pool.tokenA.amount} ${pool.tokenA.symbol}</small><br>
                <small class="text-muted">${pool.tokenB.amount} ${pool.tokenB.symbol}</small>
            </td>
            <td>
                <span class="badge ${pool.inRange ? 'bg-success' : 'bg-warning'}">
                    ${pool.inRange ? '范围内' : '范围外'}
                </span>
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="managePosition('${pool.id}')">
                        <i class="fas fa-cog"></i>
                    </button>
                    <button class="btn btn-outline-success" onclick="collectFees('${pool.id}')">
                        <i class="fas fa-coins"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="removePosition('${pool.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updateMetrics(pools) {
    document.getElementById('totalPools').textContent = pools.length;
    document.getElementById('activePools').textContent = pools.filter(p => p.inRange).length;
    
    const totalValue = pools.reduce((sum, pool) => sum + pool.liquidity, 0);
    document.getElementById('totalValue').textContent = '$' + totalValue.toLocaleString();
}

// 加载和隐藏指示器函数
function showLoading(message) {
    // 简单的加载指示 - 在控制台显示
    console.log('🔄', message);
}

function hideLoading() {
    // 简单的加载完成指示
    console.log('✅ 加载完成');
}

// 系统监控
function startSystemMonitoring() {
    // 更新运行时间
    let startTime = Date.now();
    setInterval(() => {
        const uptime = Math.floor((Date.now() - startTime) / 1000 / 60 / 60);
        document.getElementById('systemUptime').textContent = uptime + 'h';
    }, 60000);
    
    // 定期加载数据
    loadPools();
    setInterval(loadPools, 30000); // 每30秒刷新一次
    
    // 模拟价格更新
    setInterval(() => {
        const mockData = {
            pools: [
                { price: 300 + Math.random() * 20 - 10 },
                { price: 0.02 + Math.random() * 0.004 - 0.002 }
            ]
        };
        updatePriceChart(mockData);
    }, 60000); // 每分钟更新价格
}

// 日志系统
function addLog(source, message, level = 'info') {
    const logContainer = document.getElementById('logContainer');
    const timestamp = new Date().toLocaleTimeString();
    
    const levelClass = {
        'info': 'text-info',
        'success': 'text-success',
        'warning': 'text-warning',
        'error': 'text-danger'
    }[level] || 'text-info';
    
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `
        <span class="log-timestamp">${timestamp}</span>
        <span class="${levelClass}">[${source}]</span>
        <span>${message}</span>
    `;
    
    logContainer.insertBefore(logEntry, logContainer.firstChild);
    
    // 限制日志条数
    const maxLogs = 100;
    while (logContainer.children.length > maxLogs) {
        logContainer.removeChild(logContainer.lastChild);
    }
    
    // 滚动到最新日志
    logContainer.scrollTop = 0;
}

function clearLogs() {
    document.getElementById('logContainer').innerHTML = '';
}

// 通知系统
function showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    
    const alertClass = {
        'success': 'alert-success',
        'error': 'alert-danger',
        'warning': 'alert-warning',
        'info': 'alert-info'
    }[type] || 'alert-info';
    
    const notification = document.createElement('div');
    notification.className = `alert ${alertClass} alert-dismissible fade show notification`;
    notification.innerHTML = `
        <strong>${message}</strong>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    container.appendChild(notification);
    
    // 自动移除通知
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// 头寸管理功能
function managePosition(positionId) {
    addLog('头寸', `管理头寸 ${positionId}`);
    // TODO: 实现头寸管理功能
}

function collectFees(positionId) {
    if (!walletStatus.isUnlocked) {
        showNotification('请先解锁钱包', 'warning');
        return;
    }
    
    addLog('头寸', `收取费用 ${positionId}`);
    // TODO: 实现费用收取功能
}

function removePosition(positionId) {
    if (!walletStatus.isUnlocked) {
        showNotification('请先解锁钱包', 'warning');
        return;
    }
    
    if (!confirm('确定要移除此头寸吗？')) {
        return;
    }
    
    addLog('头寸', `移除头寸 ${positionId}`);
    // TODO: 实现头寸移除功能
}

// ==================== 策略管理功能 ====================

/**
 * 打开策略管理模态框
 */
function openStrategyModal() {
    document.getElementById('strategyModal').style.display = 'block';
    showStrategyTab('strategies');
    refreshStrategies();
}

/**
 * 关闭策略管理模态框
 */
function closeStrategyModal() {
    document.getElementById('strategyModal').style.display = 'none';
}

/**
 * 显示策略管理标签页
 */
function showStrategyTab(tabName) {
    // 隐藏所有标签页
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // 移除所有按钮的活跃状态
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    // 显示选中的标签页
    document.getElementById(tabName + '-tab').classList.add('active');
    
    // 激活对应按钮
    event.target.classList.add('active');
    
    // 根据标签页加载数据
    switch(tabName) {
        case 'strategies':
            refreshStrategies();
            break;
        case 'instances':
            refreshInstances();
            break;
        case 'monitor':
            refreshExecutionHistory();
            loadInstancesForMonitor();
            break;
    }
}

/**
 * 刷新策略列表
 */
async function refreshStrategies() {
    try {
        showLoading('正在加载策略列表...');
        
        const response = await fetch('/api/strategy/list');
        const result = await response.json();
        
        if (result.success) {
            currentStrategies = result.data;
            updateStrategiesTable();
            addLog('✅ 策略列表加载成功', 'success');
        } else {
            throw new Error(result.error || '获取策略列表失败');
        }
    } catch (error) {
        console.error('刷新策略列表失败:', error);
        addLog(`❌ 刷新策略列表失败: ${error.message}`, 'error');
        showNotification('刷新策略列表失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 更新策略列表表格
 */
function updateStrategiesTable() {
    const tbody = document.querySelector('#strategiesTable tbody');
    tbody.innerHTML = '';
    
    if (currentStrategies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">暂无策略</td></tr>';
        return;
    }
    
    currentStrategies.forEach(strategy => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${strategy.id}</td>
            <td>${strategy.name}</td>
            <td>${strategy.description || '无描述'}</td>
            <td>
                <button class="btn btn-sm btn-primary me-1" onclick="createStrategyInstance('${strategy.id}')">
                    <i class="fas fa-plus"></i> 创建实例
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteStrategy('${strategy.id}')">
                    <i class="fas fa-trash"></i> 删除
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * 刷新策略实例列表
 */
async function refreshInstances() {
    try {
        showLoading('正在加载策略实例...');
        
        const response = await fetch('/api/strategy/instances');
        const result = await response.json();
        
        if (result.success) {
            currentInstances = result.data;
            updateInstancesTable();
            addLog('✅ 策略实例列表加载成功', 'success');
        } else {
            throw new Error(result.error || '获取策略实例失败');
        }
    } catch (error) {
        console.error('刷新策略实例失败:', error);
        addLog(`❌ 刷新策略实例失败: ${error.message}`, 'error');
        showNotification('刷新策略实例失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 更新策略实例表格
 */
function updateInstancesTable() {
    const tbody = document.querySelector('#instancesTable tbody');
    tbody.innerHTML = '';
    
    if (currentInstances.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">暂无策略实例</td></tr>';
        return;
    }
    
    currentInstances.forEach(instance => {
        const row = document.createElement('tr');
        const statusClass = getStatusClass(instance.status);
        const lastExecuted = instance.lastExecuted ? 
            new Date(instance.lastExecuted).toLocaleString() : '从未执行';
        
        row.innerHTML = `
            <td>${instance.instanceId}</td>
            <td>${instance.strategyId}</td>
            <td><span class="badge ${statusClass}">${instance.status}</span></td>
            <td>${new Date(instance.createdAt).toLocaleString()}</td>
            <td>${lastExecuted}</td>
            <td>
                <div class="btn-group" role="group">
                    ${getInstanceActionButtons(instance)}
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * 获取状态样式类
 */
function getStatusClass(status) {
    const statusMap = {
        'created': 'bg-secondary',
        'running': 'bg-success',
        'paused': 'bg-warning',
        'stopped': 'bg-danger',
        'error': 'bg-danger'
    };
    return statusMap[status] || 'bg-secondary';
}

/**
 * 获取实例操作按钮
 */
function getInstanceActionButtons(instance) {
    const buttons = [];
    
    switch(instance.status) {
        case 'created':
        case 'stopped':
            buttons.push(`<button class="btn btn-sm btn-success" onclick="startInstance('${instance.instanceId}')">
                <i class="fas fa-play"></i>
            </button>`);
            break;
        case 'running':
            buttons.push(`<button class="btn btn-sm btn-warning" onclick="pauseInstance('${instance.instanceId}')">
                <i class="fas fa-pause"></i>
            </button>`);
            buttons.push(`<button class="btn btn-sm btn-danger" onclick="stopInstance('${instance.instanceId}')">
                <i class="fas fa-stop"></i>
            </button>`);
            break;
        case 'paused':
            buttons.push(`<button class="btn btn-sm btn-success" onclick="resumeInstance('${instance.instanceId}')">
                <i class="fas fa-play"></i>
            </button>`);
            buttons.push(`<button class="btn btn-sm btn-danger" onclick="stopInstance('${instance.instanceId}')">
                <i class="fas fa-stop"></i>
            </button>`);
            break;
    }
    
    // 通用按钮
    buttons.push(`<button class="btn btn-sm btn-primary" onclick="executeInstance('${instance.instanceId}')">
        <i class="fas fa-bolt"></i>
    </button>`);
    buttons.push(`<button class="btn btn-sm btn-info" onclick="scheduleInstance('${instance.instanceId}')">
        <i class="fas fa-clock"></i>
    </button>`);
    buttons.push(`<button class="btn btn-sm btn-danger" onclick="deleteInstance('${instance.instanceId}')">
        <i class="fas fa-trash"></i>
    </button>`);
    
    return buttons.join('');
}

/**
 * 创建策略实例
 */
function createStrategyInstance(strategyId) {
    document.getElementById('instanceStrategyId').value = strategyId;
    document.getElementById('createInstanceModal').style.display = 'block';
}

/**
 * 关闭创建实例模态框
 */
function closeCreateInstanceModal() {
    document.getElementById('createInstanceModal').style.display = 'none';
    document.getElementById('createInstanceForm').reset();
}

/**
 * 启动策略实例
 */
async function startInstance(instanceId) {
    try {
        showLoading('正在启动策略实例...');
        
        const response = await fetch(`/api/strategy/instance/${instanceId}/start`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            addLog(`✅ 策略实例 ${instanceId} 启动成功`, 'success');
            showNotification('策略实例启动成功', 'success');
            refreshInstances();
        } else {
            throw new Error(result.error || '启动策略实例失败');
        }
    } catch (error) {
        console.error('启动策略实例失败:', error);
        addLog(`❌ 启动策略实例失败: ${error.message}`, 'error');
        showNotification('启动策略实例失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 暂停策略实例
 */
async function pauseInstance(instanceId) {
    try {
        showLoading('正在暂停策略实例...');
        
        const response = await fetch(`/api/strategy/instance/${instanceId}/pause`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            addLog(`✅ 策略实例 ${instanceId} 暂停成功`, 'success');
            showNotification('策略实例暂停成功', 'success');
            refreshInstances();
        } else {
            throw new Error(result.error || '暂停策略实例失败');
        }
    } catch (error) {
        console.error('暂停策略实例失败:', error);
        addLog(`❌ 暂停策略实例失败: ${error.message}`, 'error');
        showNotification('暂停策略实例失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 恢复策略实例
 */
async function resumeInstance(instanceId) {
    try {
        showLoading('正在恢复策略实例...');
        
        const response = await fetch(`/api/strategy/instance/${instanceId}/resume`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            addLog(`✅ 策略实例 ${instanceId} 恢复成功`, 'success');
            showNotification('策略实例恢复成功', 'success');
            refreshInstances();
        } else {
            throw new Error(result.error || '恢复策略实例失败');
        }
    } catch (error) {
        console.error('恢复策略实例失败:', error);
        addLog(`❌ 恢复策略实例失败: ${error.message}`, 'error');
        showNotification('恢复策略实例失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 停止策略实例
 */
async function stopInstance(instanceId) {
    try {
        showLoading('正在停止策略实例...');
        
        const response = await fetch(`/api/strategy/instance/${instanceId}/stop`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            addLog(`✅ 策略实例 ${instanceId} 停止成功`, 'success');
            showNotification('策略实例停止成功', 'success');
            refreshInstances();
        } else {
            throw new Error(result.error || '停止策略实例失败');
        }
    } catch (error) {
        console.error('停止策略实例失败:', error);
        addLog(`❌ 停止策略实例失败: ${error.message}`, 'error');
        showNotification('停止策略实例失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 执行策略实例
 */
async function executeInstance(instanceId) {
    try {
        showLoading('正在执行策略实例...');
        
        const response = await fetch(`/api/strategy/instance/${instanceId}/execute`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            addLog(`✅ 策略实例 ${instanceId} 执行成功`, 'success');
            showNotification('策略实例执行成功', 'success');
            refreshExecutionHistory();
        } else {
            throw new Error(result.error || '执行策略实例失败');
        }
    } catch (error) {
        console.error('执行策略实例失败:', error);
        addLog(`❌ 执行策略实例失败: ${error.message}`, 'error');
        showNotification('执行策略实例失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 调度策略实例
 */
async function scheduleInstance(instanceId) {
    try {
        showLoading('正在调度策略实例...');
        
        const response = await fetch(`/api/strategy/instance/${instanceId}/schedule`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            addLog(`✅ 策略实例 ${instanceId} 调度成功`, 'success');
            showNotification('策略实例调度成功', 'success');
            refreshExecutionHistory();
        } else {
            throw new Error(result.error || '调度策略实例失败');
        }
    } catch (error) {
        console.error('调度策略实例失败:', error);
        addLog(`❌ 调度策略实例失败: ${error.message}`, 'error');
        showNotification('调度策略实例失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 删除策略实例
 */
async function deleteInstance(instanceId) {
    try {
        showLoading('正在删除策略实例...');
        
        const response = await fetch(`/api/strategy/instance/${instanceId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.success) {
            addLog(`✅ 策略实例 ${instanceId} 删除成功`, 'success');
            showNotification('策略实例删除成功', 'success');
            refreshInstances();
        } else {
            throw new Error(result.error || '删除策略实例失败');
        }
    } catch (error) {
        console.error('删除策略实例失败:', error);
        addLog(`❌ 删除策略实例失败: ${error.message}`, 'error');
        showNotification('删除策略实例失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 刷新执行历史
 */
async function refreshExecutionHistory() {
    try {
        showLoading('正在加载执行历史...');
        
        const response = await fetch('/api/strategy/execution-history');
        const result = await response.json();
        
        if (result.success) {
            currentExecutionHistory = result.data;
            updateExecutionHistoryTable();
            addLog('✅ 执行历史加载成功', 'success');
        } else {
            throw new Error(result.error || '获取执行历史失败');
        }
    } catch (error) {
        console.error('刷新执行历史失败:', error);
        addLog(`❌ 刷新执行历史失败: ${error.message}`, 'error');
        showNotification('刷新执行历史失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 更新执行历史表格
 */
function updateExecutionHistoryTable() {
    const tbody = document.querySelector('#executionHistoryTable tbody');
    tbody.innerHTML = '';
    
    if (currentExecutionHistory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">暂无执行历史</td></tr>';
        return;
    }
    
    currentExecutionHistory.forEach(execution => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${execution.instanceId}</td>
            <td>${execution.strategyId}</td>
            <td>${execution.status}</td>
            <td>${new Date(execution.executedAt).toLocaleString()}</td>
            <td>${execution.result}</td>
            <td>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-primary" onclick="viewExecutionDetails('${execution.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteExecution('${execution.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * 查看执行详情
 */
function viewExecutionDetails(executionId) {
    // 实现查看执行详情功能
}

/**
 * 删除执行记录
 */
async function deleteExecution(executionId) {
    try {
        showLoading('正在删除执行记录...');
        
        const response = await fetch(`/api/strategy/execution/${executionId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.success) {
            addLog(`✅ 执行记录 ${executionId} 删除成功`, 'success');
            showNotification('执行记录删除成功', 'success');
            refreshExecutionHistory();
        } else {
            throw new Error(result.error || '删除执行记录失败');
        }
    } catch (error) {
        console.error('删除执行记录失败:', error);
        addLog(`❌ 删除执行记录失败: ${error.message}`, 'error');
        showNotification('删除执行记录失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 加载实例用于监控
 */
async function loadInstancesForMonitor() {
    try {
        showLoading('正在加载实例用于监控...');
        
        const response = await fetch('/api/strategy/instances-for-monitor');
        const result = await response.json();
        
        if (result.success) {
            currentInstances = result.data;
            updateInstancesTable();
            addLog('✅ 实例用于监控加载成功', 'success');
        } else {
            throw new Error(result.error || '获取实例用于监控失败');
        }
    } catch (error) {
        console.error('加载实例用于监控失败:', error);
        addLog(`❌ 加载实例用于监控失败: ${error.message}`, 'error');
        showNotification('加载实例用于监控失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 删除策略
 */
async function deleteStrategy(strategyId) {
    try {
        showLoading('正在删除策略...');
        
        const response = await fetch(`/api/strategy/${strategyId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.success) {
            addLog(`✅ 策略 ${strategyId} 删除成功`, 'success');
            showNotification('策略删除成功', 'success');
            refreshStrategies();
        } else {
            throw new Error(result.error || '删除策略失败');
        }
    } catch (error) {
        console.error('删除策略失败:', error);
        addLog(`❌ 删除策略失败: ${error.message}`, 'error');
        showNotification('删除策略失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}