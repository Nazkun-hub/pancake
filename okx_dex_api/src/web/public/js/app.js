/**
 * 主应用类
 */
class OKXDEXApp {
    constructor() {
        this.tokenInfoTimeouts = {};
        this.chainConfig = this.getChainConfig();
        this.currentChainId = '56'; // 默认BSC
        this.currentTokenInput = 'from'; // 当前焦点的输入框
        this.customTokens = this.loadCustomTokens(); // 自定义代币列表
        // 不在构造函数中自动初始化，由init.js控制
        console.log('📱 OKXDEXApp 实例已创建，等待手动初始化...');
    }

    init() {
        console.log('🚀 开始初始化 OKXDEXApp...');
        this.bindEvents();
        this.updateChainConfig();
        
        // 先检查服务器配置状态
        this.checkServerConfigStatus();
        
        // 添加键盘事件监听
        this.bindKeyboardEvents();
        
        console.log('✅ OKXDEXApp 初始化完成');
    }

    // 🔧 新增：状态提示管理方法
    showStatusHint(message, type = 'info', persistent = false) {
        const hint = document.createElement('div');
        hint.className = `status ${type} status-hint`;
        hint.innerHTML = message;
        hint.style.margin = '10px 0';
        hint.style.fontSize = '14px';
        hint.style.fontWeight = 'bold';
        hint.style.textAlign = 'center';
        hint.style.padding = '12px';
        hint.style.borderRadius = '8px';
        
        // 找到合适的容器
        const unlockSection = document.getElementById('unlockSection');
        const configSection = document.getElementById('configSection');
        
        if (unlockSection && unlockSection.style.display !== 'none') {
            unlockSection.insertBefore(hint, unlockSection.firstChild);
        } else if (configSection) {
            configSection.insertBefore(hint, configSection.firstChild);
        }
        
        // 如果不是持久提示，则自动删除
        if (!persistent) {
            setTimeout(() => {
                if (hint.parentNode) {
                    hint.remove();
                }
            }, persistent ? 0 : 8000); // 8秒后自动删除
        }
        
        return hint;
    }
    
    clearStatusHints() {
        const hints = document.querySelectorAll('.status-hint');
        hints.forEach(hint => hint.remove());
    }

    // 检查服务器配置状态
    async checkServerConfigStatus() {
        console.log('🔍 检查服务器配置状态...');
        
        // 🔧 添加：清除之前的状态提示
        this.clearStatusHints();
        
        // 🔧 修复：优先检查本地配置，确保页面刷新后能正确恢复
        console.log('🔍 优先检查本地加密配置...');
        if (ConfigManager.hasEncryptedConfig()) {
            console.log('🔒 检测到本地加密配置，显示解锁界面');
            ConfigManager.showUnlockInterface();
            this.showStatusHint('🔒 检测到本地保存的加密配置，请输入密码解锁', 'info');
            this.loadAccountInfo();
            return; // 有本地配置时，优先使用本地配置流程
        }
        
        try {
            // 检查服务器是否已有配置
            const serverStatus = await APIClient.checkConfigStatus();
            
            if (serverStatus.success && serverStatus.data.hasConfig && serverStatus.data.isConnected) {
                console.log('✅ 服务器已有有效配置，但本地无加密配置');
                // 服务器已有配置但本地无加密配置，显示配置界面（可能是第一次访问）
                ConfigManager.showConfigInterface();
                document.getElementById('configControls').style.display = 'block';
                
                this.showStatusHint('✅ 服务器已有配置，建议点击"💾 保存"按钮将配置加密保存到本地，下次访问时可自动恢复', 'success');
                
                // 尝试从sessionStorage恢复临时数据
                try {
                    const tempUnlocked = sessionStorage.getItem('okx_temp_unlocked');
                    if (tempUnlocked) {
                        const config = JSON.parse(tempUnlocked);
                        console.log('🔄 从会话存储恢复表单数据');
                        await ConfigManager.fillForm(config);
                    }
                } catch (error) {
                    console.log('恢复表单数据失败:', error);
                }
                
                this.loadAccountInfo();
                return;
            } else if (serverStatus.success && serverStatus.data.hasConfig && !serverStatus.data.isConnected) {
                console.log('⚠️ 服务器有配置但连接失败，可能需要重新配置');
            }
        } catch (error) {
            console.log('检查服务器配置状态失败，继续正常流程:', error);
        }

        // 服务器无配置且本地也无配置，显示新建配置界面
        console.log('🆕 无本地和服务器配置，显示新建配置界面');
        
        // 设置动态默认值
        this.setDefaultValues();
        ConfigManager.showConfigInterface();
        
        // 🔧 修复：显示控制按钮和状态提示
        document.getElementById('configControls').style.display = 'block';
        
        // 添加新用户提示
        this.showStatusHint('🎯 首次使用：请填写完整的OKX API配置和钱包信息，然后点击"💾 保存"按钮进行加密保存', 'info', true);
        
        this.loadAccountInfo();
    }

    // 绑定键盘事件
    bindKeyboardEvents() {
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                // 关闭所有打开的对话框
                this.closeEditTokensDialog();
                if (window.closeSavePasswordDialog) {
                    window.closeSavePasswordDialog();
                }
            }
        });
    }

    // 加载自定义代币列表
    loadCustomTokens() {
        const saved = localStorage.getItem('customTokens');
        return saved ? JSON.parse(saved) : [];
    }

    // 保存自定义代币列表
    saveCustomTokens() {
        localStorage.setItem('customTokens', JSON.stringify(this.customTokens));
    }

    // 设置默认配置值
    async setDefaultValues() {
        try {
            // 获取最佳可用的RPC端点
            const bestRPC = await ConfigManager.selectBestRPCEndpoint();
            const rpcUrlInput = document.getElementById('rpcUrl');
            if (rpcUrlInput && !rpcUrlInput.value) {
                rpcUrlInput.value = bestRPC;
            }
            
            // 设置其他默认值
            const chainIdInput = document.getElementById('chainId');
            if (chainIdInput && !chainIdInput.value) {
                chainIdInput.value = '56'; // BSC链
            }
        } catch (error) {
            console.warn('设置默认值时出错:', error);
            // 如果获取最佳RPC失败，使用备用默认值
            const rpcUrlInput = document.getElementById('rpcUrl');
            if (rpcUrlInput && !rpcUrlInput.value) {
                rpcUrlInput.value = 'https://bsc-dataseed.binance.org/';
            }
        }
    }

    // 链配置信息
    getChainConfig() {
        return {
            '56': {
                name: 'BSC',
                nativeToken: {
                    symbol: 'BNB',
                    name: 'BNB',
                    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
                    decimals: 18
                },
                rpcUrl: 'https://bsc-dataseed.binance.org/',
                commonTokens: [
                    { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955' },
                    { symbol: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' },
                    { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' },
                    { symbol: 'BUSD', address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56' }
                ]
            }
        };
    }

    // 绑定事件
    bindEvents() {
        // 金额输入变化
        const amountInput = document.getElementById('amount');
        const unitSelect = document.getElementById('amountUnit');
        if (amountInput) amountInput.addEventListener('input', () => this.updateAmountConversion());
        if (unitSelect) unitSelect.addEventListener('change', () => this.updateAmountConversion());

        // 链选择变化
        const chainSelect = document.getElementById('chainId');
        if (chainSelect) chainSelect.addEventListener('change', () => this.updateChainConfig());

        // 代币输入防抖和焦点跟踪
        const fromTokenInput = document.getElementById('fromToken');
        const toTokenInput = document.getElementById('toToken');
        
        if (fromTokenInput) {
            fromTokenInput.addEventListener('input', Utils.debounce(() => this.getTokenInfo('from'), 500));
            fromTokenInput.addEventListener('focus', () => this.setCurrentTokenInput('from'));
        }
        if (toTokenInput) {
            toTokenInput.addEventListener('input', Utils.debounce(() => this.getTokenInfo('to'), 500));
            toTokenInput.addEventListener('focus', () => this.setCurrentTokenInput('to'));
        }
    }

    // 设置当前焦点的输入框
    setCurrentTokenInput(type) {
        this.currentTokenInput = type;
        this.updateTokenButtonsHighlight();
    }

    // 更新按钮高亮状态
    updateTokenButtonsHighlight() {
        const tokenButtons = document.querySelector('.token-buttons');
        if (!tokenButtons) return;

        // 移除所有高亮
        tokenButtons.querySelectorAll('.token-btn').forEach(btn => {
            btn.classList.remove('active-target');
        });

        // 添加当前目标指示器
        const indicator = tokenButtons.querySelector('.target-indicator');
        if (indicator) {
            indicator.textContent = this.currentTokenInput === 'from' ? '选择源代币 →' : '选择目标代币 →';
        }
    }

    // 快速选择代币 - 智能选择输入框
    selectToken(address, symbol = null) {
        const inputId = this.currentTokenInput === 'from' ? 'fromToken' : 'toToken';
        document.getElementById(inputId).value = address;
        this.getTokenInfo(this.currentTokenInput, address);
    }

    // 显示编辑代币对话框
    showEditTokensDialog() {
        const dialog = document.getElementById('editTokensDialog');
        if (dialog) {
            dialog.style.display = 'flex';
            this.refreshCustomTokensList();
        }
    }

    // 关闭编辑代币对话框
    closeEditTokensDialog() {
        const dialog = document.getElementById('editTokensDialog');
        if (dialog) {
            dialog.style.display = 'none';
        }
    }

    // 添加自定义代币
    addCustomToken() {
        const symbol = document.getElementById('newTokenSymbol').value.trim();
        const address = document.getElementById('newTokenAddress').value.trim();
        
        if (!symbol || !address) {
            Utils.showResult('editTokenResult', { success: false, message: '请填写代币符号和地址' }, false);
            return;
        }

        if (address.length !== 42 || !address.startsWith('0x')) {
            Utils.showResult('editTokenResult', { success: false, message: '代币地址格式不正确' }, false);
            return;
        }

        // 检查是否已存在
        if (this.customTokens.find(token => token.address.toLowerCase() === address.toLowerCase())) {
            Utils.showResult('editTokenResult', { success: false, message: '该代币已存在' }, false);
            return;
        }

        // 添加到列表
        this.customTokens.push({ symbol, address });
        this.saveCustomTokens();
        this.refreshCustomTokensList();
        this.updateNativeTokenButton(this.chainConfig[this.currentChainId]);
        
        // 清空输入框
        document.getElementById('newTokenSymbol').value = '';
        document.getElementById('newTokenAddress').value = '';
        
        Utils.showResult('editTokenResult', { success: true, message: '代币添加成功' }, false);
    }

    // 删除自定义代币
    removeCustomToken(index) {
        if (confirm('确定要删除这个代币吗？')) {
            this.customTokens.splice(index, 1);
            this.saveCustomTokens();
            this.refreshCustomTokensList();
            this.updateNativeTokenButton(this.chainConfig[this.currentChainId]);
        }
    }

    // 刷新自定义代币列表显示
    refreshCustomTokensList() {
        const list = document.getElementById('customTokensList');
        if (!list) return;

        list.innerHTML = '';
        
        this.customTokens.forEach((token, index) => {
            const item = document.createElement('div');
            item.className = 'custom-token-item';
            item.innerHTML = `
                <span class="token-symbol">${token.symbol}</span>
                <span class="token-address">${token.address}</span>
                <button class="btn btn-small btn-warning" onclick="app.removeCustomToken(${index})">删除</button>
            `;
            list.appendChild(item);
        });

        if (this.customTokens.length === 0) {
            list.innerHTML = '<p class="no-tokens">暂无自定义代币</p>';
        }
    }

    // 获取代币信息
    async getTokenInfo(type, address = null) {
        const inputId = type === 'from' ? 'fromToken' : 'toToken';
        const infoId = type === 'from' ? 'fromTokenInfo' : 'toTokenInfo';
        
        if (!address) {
            address = document.getElementById(inputId).value;
        }
        
        const infoElement = document.getElementById(infoId);
        
        if (!address || address.length < 42) {
            infoElement.className = 'token-info';
            infoElement.innerHTML = '';
            return;
        }
        
        try {
            infoElement.className = 'token-info show';
            infoElement.innerHTML = '<span class="loading"></span>获取代币信息中...';
            
            const result = await APIClient.getTokenInfo(address);
            
            if (result.success) {
                infoElement.className = 'token-info show success';
                infoElement.innerHTML = `
                    <strong>${result.data.symbol}</strong> - ${result.data.name}<br>
                    <small>精度: ${result.data.decimals} 位</small>
                `;
            } else {
                infoElement.className = 'token-info show error';
                infoElement.innerHTML = `❌ ${result.message}`;
            }
        } catch (error) {
            infoElement.className = 'token-info show error';
            infoElement.innerHTML = `❌ 获取代币信息失败: ${error.message}`;
        }
    }

    // 更新金额转换显示
    updateAmountConversion() {
        const amountInput = document.getElementById('amount');
        const unitSelect = document.getElementById('amountUnit');
        const conversionDiv = document.getElementById('amountConversion');
        
        if (!amountInput || !unitSelect || !conversionDiv) return;
        
        const value = amountInput.value;
        const unit = unitSelect.value;
        
        if (!value || isNaN(value) || parseFloat(value) <= 0) {
            conversionDiv.textContent = '';
            return;
        }
        
        if (unit === 'ether') {
            const weiValue = Utils.parseUnits(value, 18);
            const weiNumber = BigInt(weiValue);
            if (weiNumber >= BigInt('1000000000000000000')) {
                const ethValue = Number(weiNumber) / 1e18;
                conversionDiv.textContent = `= ${ethValue.toExponential(2)} wei`;
            } else {
                conversionDiv.textContent = `= ${weiValue} wei`;
            }
        } else {
            const etherValue = Utils.formatUnits(value, 18);
            conversionDiv.textContent = `= ${etherValue} 代币单位`;
        }
    }

    // 更新链配置
    updateChainConfig() {
        const chainId = document.getElementById('chainId').value;
        this.currentChainId = chainId;
        const chainConfig = this.chainConfig[chainId];
        
        if (chainConfig) {
            this.updateNativeTokenButton(chainConfig);
        }
    }

    // 更新原生代币按钮
    updateNativeTokenButton(chainConfig) {
        const tokenButtons = document.querySelector('.token-buttons');
        if (tokenButtons && chainConfig) {
            tokenButtons.innerHTML = '';
            
            // 添加当前目标指示器
            const indicator = document.createElement('div');
            indicator.className = 'target-indicator';
            indicator.textContent = this.currentTokenInput === 'from' ? '选择源代币 →' : '选择目标代币 →';
            tokenButtons.appendChild(indicator);
            
            // 添加原生代币按钮
            const nativeButton = document.createElement('button');
            nativeButton.className = 'token-btn native-token-btn';
            nativeButton.textContent = chainConfig.nativeToken.symbol;
            nativeButton.onclick = () => this.selectToken(chainConfig.nativeToken.address, chainConfig.nativeToken.symbol);
            tokenButtons.appendChild(nativeButton);
            
            // 添加常用代币按钮
            chainConfig.commonTokens.forEach(token => {
                const button = document.createElement('button');
                button.className = 'token-btn';
                button.textContent = token.symbol;
                button.onclick = () => this.selectToken(token.address, token.symbol);
                tokenButtons.appendChild(button);
            });

            // 添加自定义代币按钮
            this.customTokens.forEach(token => {
                const button = document.createElement('button');
                button.className = 'token-btn custom-token-btn';
                button.textContent = token.symbol;
                button.onclick = () => this.selectToken(token.address, token.symbol);
                tokenButtons.appendChild(button);
            });

            // 添加编辑按钮
            const editButton = document.createElement('button');
            editButton.className = 'token-btn edit-btn';
            editButton.textContent = '✏️ 编辑';
            editButton.onclick = () => this.showEditTokensDialog();
            tokenButtons.appendChild(editButton);
        }
    }

    // 加载账户信息
    async loadAccountInfo() {
        const result = await APIClient.getAccountInfo();
        
        if (result.success) {
            document.getElementById('connectionStatus').textContent = result.data.connected ? '已连接' : '未连接';
            document.getElementById('connectionStatus').className = `status ${result.data.connected ? 'connected' : 'disconnected'}`;
            document.getElementById('ethBalance').textContent = result.data.ethBalance;
            document.getElementById('currentAddress').textContent = result.data.walletAddress;
        }
    }

    // 设置配置
    async setConfig() {
        const config = {
            okxApiKey: document.getElementById('okxApiKey').value,
            okxSecretKey: document.getElementById('okxSecretKey').value,
            okxPassphrase: document.getElementById('okxPassphrase').value,
            okxProjectId: document.getElementById('okxProjectId').value,
            rpcUrl: document.getElementById('rpcUrl').value,
            chainId: document.getElementById('chainId').value,
            walletAddress: document.getElementById('walletAddress').value,
            privateKey: document.getElementById('privateKey').value
        };

        const btn = document.querySelector('button[onclick="setConfigWithSave()"]');
        
        if (!btn.getAttribute('data-original-text')) {
            btn.setAttribute('data-original-text', btn.innerHTML);
        }
        
        const requiredFields = Object.values(config);
        if (requiredFields.some(field => !field)) {
            Utils.showResult('configResult', { success: false, message: '请填写所有配置项' }, false);
            return;
        }

        Utils.setLoading(btn);
        
        const result = await APIClient.setConfig(config);

        Utils.setLoading(btn, false);
        Utils.showResult('configResult', result);
        
        if (result.success) {
            this.loadAccountInfo();
        }
    }

    // 获取报价
    async getQuote() {
        if (!Utils.checkConfigurationReady()) {
            Utils.showResult('quoteResult', { 
                success: false, 
                message: '请先完成配置设置：填写完整的 OKX API 配置、网络配置和钱包信息，然后点击"设置配置"按钮' 
            }, false);
            return;
        }

        const fromTokenAddress = document.getElementById('fromToken').value;
        const toTokenAddress = document.getElementById('toToken').value;
        const amount = Utils.getFinalAmount();
        const slippage = document.getElementById('slippage').value;
        const chainId = document.getElementById('chainId').value;
        const btn = document.querySelector('button[onclick="getQuote()"]');
        
        if (!btn.getAttribute('data-original-text')) {
            btn.setAttribute('data-original-text', btn.innerHTML);
        }

        if (!fromTokenAddress || !toTokenAddress) {
            Utils.showResult('quoteResult', { success: false, message: '请选择要交换的代币' }, false);
            return;
        }

        if (!amount || amount === '0') {
            Utils.showResult('quoteResult', { success: false, message: '请输入有效的数量' }, false);
            return;
        }

        Utils.setLoading(btn);

        const result = await APIClient.getQuote({
            fromTokenAddress,
            toTokenAddress,
            amount,
            slippage,
            chainIndex: chainId,
            chainId: chainId,
            userWalletAddress: document.getElementById('walletAddress').value
        });

        Utils.setLoading(btn, false);
        Utils.showResult('quoteResult', result);
    }

    // 代币授权
    async approveToken() {
        if (!Utils.checkConfigurationReady()) {
            Utils.showResult('approveResult', { 
                success: false, 
                message: '请先完成配置设置' 
            }, false);
            return;
        }

        const fromTokenAddress = document.getElementById('fromToken').value;
        const amount = Utils.getFinalAmount();
        const btn = document.querySelector('button[onclick="approveToken()"]');
        
        if (!btn.getAttribute('data-original-text')) {
            btn.setAttribute('data-original-text', btn.innerHTML);
        }

        if (!fromTokenAddress) {
            Utils.showResult('approveResult', { success: false, message: '请选择要授权的代币' }, false);
            return;
        }

        if (fromTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
            Utils.showResult('approveResult', { success: false, message: 'BNB 不需要授权，可以直接交换' }, false);
            return;
        }

        if (!amount || amount === '0') {
            Utils.showResult('approveResult', { success: false, message: '请输入有效的授权数量' }, false);
            return;
        }

        if (!confirm('确定要授权代币吗？这将花费少量Gas费用。')) {
            return;
        }

        Utils.setLoading(btn);

        const result = await APIClient.approveToken({
            tokenAddress: fromTokenAddress,
            amount: amount
        });

        Utils.setLoading(btn, false);
        Utils.showResult('approveResult', result);
    }

    // 执行交换
    async executeSwap() {
        if (!Utils.checkConfigurationReady()) {
            Utils.showResult('swapResult', { 
                success: false, 
                message: '请先完成配置设置' 
            }, false);
            return;
        }

        const fromTokenAddress = document.getElementById('fromToken').value;
        const toTokenAddress = document.getElementById('toToken').value;
        const amount = Utils.getFinalAmount();
        const slippage = document.getElementById('slippage').value;
        const chainId = document.getElementById('chainId').value;
        const btn = document.querySelector('button[onclick="executeSwap()"]');
        
        if (!btn.getAttribute('data-original-text')) {
            btn.setAttribute('data-original-text', btn.innerHTML);
        }

        if (!amount || amount === '0') {
            Utils.showResult('swapResult', { success: false, message: '请输入有效的数量' }, false);
            return;
        }

        if (!confirm('确定要执行交换吗？这将花费真实的代币和Gas费用。')) {
            return;
        }

        Utils.setLoading(btn);

        const result = await APIClient.executeSwap({
            fromTokenAddress,
            toTokenAddress,
            amount,
            slippage,
            chainIndex: chainId,
            chainId: chainId,
            userWalletAddress: document.getElementById('walletAddress').value
        });

        Utils.setLoading(btn, false);
        Utils.showResult('swapResult', result);
        
        if (result.success && result.data && result.data.orderId) {
            document.getElementById('orderId').value = result.data.orderId;
        }
    }

    // 追踪交易
    async trackTransaction() {
        const orderId = document.getElementById('orderId').value;
        const btn = document.querySelector('button[onclick="trackTransaction()"]');
        
        if (!btn.getAttribute('data-original-text')) {
            btn.setAttribute('data-original-text', btn.innerHTML);
        }

        if (!orderId) {
            Utils.showResult('trackResult', { success: false, message: '请输入订单ID' }, false);
            return;
        }

        Utils.setLoading(btn);

        const result = await APIClient.trackTransaction(orderId);

        Utils.setLoading(btn, false);
        Utils.showResult('trackResult', result);
    }

    // 验证OKX API
    async validateOKXAPI() {
        const config = {
            okxApiKey: document.getElementById('okxApiKey').value,
            okxSecretKey: document.getElementById('okxSecretKey').value,
            okxPassphrase: document.getElementById('okxPassphrase').value,
            okxProjectId: document.getElementById('okxProjectId').value
        };

        const btn = document.querySelector('button[onclick="validateOKXAPI()"]');
        
        if (Object.values(config).some(field => !field)) {
            Utils.showResult('validateResult', { 
                success: false, 
                message: '请先填写完整的OKX API配置信息' 
            }, false);
            return;
        }
        
        if (!btn.getAttribute('data-original-text')) {
            btn.setAttribute('data-original-text', btn.innerHTML);
        }
        
        Utils.setLoading(btn);
        
        const result = await APIClient.validateOKXAPI(config);
        
        Utils.setLoading(btn, false);
        Utils.showResult('validateResult', result);
    }
}

// 全局应用实例
let app;

// 移除自动初始化，由init.js统一管理
// document.addEventListener('DOMContentLoaded', function() {
//     app = new OKXDEXApp();
//     app.init();
// });

// 全局函数暴露（保持与HTML的兼容性）
window.selectToken = (type, address) => {
    if (window.app && typeof window.app.selectToken === 'function') {
        return window.app.selectToken(type, address);
    }
};
window.getQuote = () => {
    if (window.app && typeof window.app.getQuote === 'function') {
        return window.app.getQuote();
    }
};
window.approveToken = () => {
    if (window.app && typeof window.app.approveToken === 'function') {
        return window.app.approveToken();
    }
};
window.executeSwap = () => {
    if (window.app && typeof window.app.executeSwap === 'function') {
        return window.app.executeSwap();
    }
};
window.trackTransaction = () => {
    if (window.app && typeof window.app.trackTransaction === 'function') {
        return window.app.trackTransaction();
    }
};
window.setConfigWithSave = () => {
    if (window.app && typeof window.app.setConfig === 'function') {
        return window.app.setConfig();
    }
};
window.loadAccountInfo = () => {
    if (window.app && typeof window.app.loadAccountInfo === 'function') {
        return window.app.loadAccountInfo();
    }
};
window.validateOKXAPI = () => {
    if (window.app && typeof window.app.validateOKXAPI === 'function') {
        return window.app.validateOKXAPI();
    }
};
window.updateChainConfig = () => {
    if (window.app && typeof window.app.updateChainConfig === 'function') {
        return window.app.updateChainConfig();
    } else {
        console.warn('app实例不存在或updateChainConfig方法不可用');
    }
};

// 配置管理相关函数
window.testRPCConnection = async () => {
    const rpcUrl = document.getElementById('rpcUrl').value;
    const btn = document.querySelector('button[onclick="testRPCConnection()"]');
    const resultDiv = document.getElementById('rpcTestResult');
    
    if (!rpcUrl) {
        Utils.showResult('rpcTestResult', { success: false, message: '请输入RPC URL' }, false);
        return;
    }
    
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="loading"></span>测试中...';
    btn.disabled = true;
    
    try {
        const isWorking = await ConfigManager.testRPCEndpoint(rpcUrl);
        
        if (isWorking) {
            Utils.showResult('rpcTestResult', { 
                success: true, 
                message: '✅ RPC端点连接成功，网络正常' 
            }, true);
        } else {
            // 尝试获取最佳备用端点
            const bestEndpoint = await ConfigManager.selectBestRPCEndpoint();
            Utils.showResult('rpcTestResult', { 
                success: false, 
                message: `❌ 当前RPC端点无法连接，建议使用: ${bestEndpoint}` 
            }, false);
            
            // 自动填入可用的端点
            if (bestEndpoint !== rpcUrl) {
                document.getElementById('rpcUrl').value = bestEndpoint;
            }
        }
    } catch (error) {
        Utils.showResult('rpcTestResult', { 
            success: false, 
            message: `❌ 测试失败: ${error.message}` 
        }, false);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.unlockConfig = async () => {
    const password = document.getElementById('unlockPassword').value;
    const btn = document.querySelector('button[onclick="unlockConfig()"]');
    
    if (!password) {
        Utils.showResult('unlockResult', { success: false, message: '请输入解锁密码' }, false);
        return;
    }
    
    Utils.setLoading(btn);
    
    try {
        // 1. 解密并获取配置
        const config = await ConfigManager.loadEncryptedConfig(password);
        
        // 2. 填充表单（包括RPC端点验证）
        await ConfigManager.fillForm(config);
        
        // 3. 显示配置界面
        ConfigManager.showConfigInterface();
        document.getElementById('configControls').style.display = 'block';
        document.getElementById('unlockPassword').value = '';
        
        // 4. 保存配置到会话存储（用于页面刷新后恢复）
        try {
            sessionStorage.setItem('okx_temp_unlocked', JSON.stringify(config));
            console.log('✅ 配置已保存到会话存储');
        } catch (error) {
            console.warn('保存到会话存储失败:', error);
        }
        
        // 5. 自动将配置发送到服务器
        console.log('🔄 自动同步配置到服务器...');
        const serverResult = await APIClient.setConfig({
            okxApiKey: config.okxApiKey,
            okxSecretKey: config.okxSecretKey,
            okxPassphrase: config.okxPassphrase,
            okxProjectId: config.okxProjectId,
            rpcUrl: config.rpcUrl,
            chainId: config.chainId,
            walletAddress: config.walletAddress,
            privateKey: config.privateKey
        });
        
        Utils.setLoading(btn, false);
        
        if (serverResult.success) {
            Utils.showResult('unlockResult', { 
                success: true, 
                message: `✅ 配置解锁成功！已自动同步到服务器。保存时间: ${new Date(config.savedAt).toLocaleString()}` 
            }, true);
            
            // 6. 刷新账户信息
            console.log('🔄 刷新账户信息...');
            if (window.app && typeof window.app.loadAccountInfo === 'function') {
                await window.app.loadAccountInfo();
            } else {
                console.warn('app实例不存在，跳过账户信息刷新');
            }
            
            // 7. 更新代币按钮
            if (window.app && typeof window.app.updateChainConfig === 'function') {
                window.app.updateChainConfig();
            } else {
                console.warn('app实例不存在，跳过代币按钮更新');
            }
            
        } else {
            Utils.showResult('unlockResult', { 
                success: true, 
                message: `⚠️ 配置解锁成功！但同步到服务器失败: ${serverResult.message}` 
            }, false);
        }
        
        setTimeout(() => {
            document.getElementById('unlockResult').style.display = 'none';
        }, 3000);
        
    } catch (error) {
        Utils.setLoading(btn, false);
        Utils.showResult('unlockResult', { success: false, message: error.message }, false);
    }
};

window.showNewConfigForm = () => {
    if (confirm('这将清除当前保存的配置，确定要新建配置吗？')) {
        ConfigManager.clearEncryptedConfig();
        ConfigManager.showConfigInterface();
        document.getElementById('configControls').style.display = 'none';
    }
};

window.confirmClearConfig = () => {
    if (confirm('确定要清除保存的配置吗？此操作不可恢复！')) {
        // 清除会话存储
        sessionStorage.removeItem('okx_temp_unlocked');
        console.log('🗑️ 已清除会话存储');
        
        ConfigManager.clearEncryptedConfig();
        ConfigManager.showConfigInterface();
        document.getElementById('configControls').style.display = 'none';
        Utils.showResult('unlockResult', { success: true, message: '配置已清除' }, true);
        setTimeout(() => {
            document.getElementById('unlockResult').style.display = 'none';
        }, 2000);
    }
};

window.lockConfig = () => {
    if (confirm('确定要锁定配置吗？需要重新输入密码才能解锁。')) {
        // 清除会话存储
        sessionStorage.removeItem('okx_temp_unlocked');
        console.log('🔒 已清除会话存储');
        
        ConfigManager.lock();
    }
};

window.showSavePasswordDialog = () => {
    document.getElementById('savePasswordDialog').style.display = 'flex';
    document.getElementById('savePassword').focus();
};

window.closeSavePasswordDialog = () => {
    document.getElementById('savePasswordDialog').style.display = 'none';
    document.getElementById('savePassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('savePasswordResult').style.display = 'none';
};

window.confirmSaveConfig = async () => {
    const password = document.getElementById('savePassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (!password || !confirmPassword) {
        Utils.showResult('savePasswordResult', { success: false, message: '请填写所有密码字段' }, false);
        return;
    }
    
    if (password.length < 8) {
        Utils.showResult('savePasswordResult', { success: false, message: '密码长度至少8位' }, false);
        return;
    }
    
    if (password !== confirmPassword) {
        Utils.showResult('savePasswordResult', { success: false, message: '两次输入的密码不一致' }, false);
        return;
    }
    
    const config = {
        okxApiKey: document.getElementById('okxApiKey').value,
        okxSecretKey: document.getElementById('okxSecretKey').value,
        okxPassphrase: document.getElementById('okxPassphrase').value,
        okxProjectId: document.getElementById('okxProjectId').value,
        rpcUrl: document.getElementById('rpcUrl').value,
        chainId: document.getElementById('chainId').value,
        walletAddress: document.getElementById('walletAddress').value,
        privateKey: document.getElementById('privateKey').value
    };
    
    try {
        const success = await ConfigManager.saveEncryptedConfig(config, password);
        
        if (success) {
            Utils.showResult('savePasswordResult', { 
                success: true, 
                message: '配置保存成功！已加密存储到本地。' 
            }, true);
            
            setTimeout(() => {
                window.closeSavePasswordDialog();
                document.getElementById('configControls').style.display = 'block';
            }, 2000);
        } else {
            Utils.showResult('savePasswordResult', { success: false, message: '保存配置失败' }, false);
        }
    } catch (error) {
        Utils.showResult('savePasswordResult', { success: false, message: '保存失败: ' + error.message }, false);
    }
};

// 确保OKXDEXApp类在全局scope中可用
window.OKXDEXApp = OKXDEXApp; 