/**
 * 配置管理类
 */
class ConfigManager {
    static STORAGE_KEY = 'okx_dex_encrypted_config';
    static isUnlocked = false;
    static currentConfig = null;
    
    // 保存加密配置
    static async saveEncryptedConfig(config, password) {
        try {
            // 过滤敏感信息
            const sensitiveConfig = {
                okxApiKey: config.okxApiKey,
                okxSecretKey: config.okxSecretKey,
                okxPassphrase: config.okxPassphrase,
                okxProjectId: config.okxProjectId,
                privateKey: config.privateKey,
                walletAddress: config.walletAddress,
                rpcUrl: config.rpcUrl,
                chainId: config.chainId,
                savedAt: new Date().toISOString()
            };
            
            const encrypted = await CryptoUtils.encrypt(sensitiveConfig, password);
            localStorage.setItem(this.STORAGE_KEY, encrypted);
            return true;
        } catch (error) {
            console.error('保存配置失败:', error);
            return false;
        }
    }
    
    // 加载并解密配置
    static async loadEncryptedConfig(password) {
        try {
            const encrypted = localStorage.getItem(this.STORAGE_KEY);
            if (!encrypted) {
                throw new Error('没有找到保存的配置');
            }
            
            const config = await CryptoUtils.decrypt(encrypted, password);
            this.isUnlocked = true;
            this.currentConfig = config;
            return config;
        } catch (error) {
            this.isUnlocked = false;
            this.currentConfig = null;
            throw error;
        }
    }
    
    // 检查是否有保存的配置
    static hasEncryptedConfig() {
        return localStorage.getItem(this.STORAGE_KEY) !== null;
    }
    
    // 删除保存的配置
    static clearEncryptedConfig() {
        localStorage.removeItem(this.STORAGE_KEY);
        this.isUnlocked = false;
        this.currentConfig = null;
    }
    
    // 锁定配置
    static lock() {
        this.isUnlocked = false;
        this.currentConfig = null;
        // 清空表单
        this.clearForm();
        // 显示解锁界面
        this.showUnlockInterface();
    }
    
    // 清空表单
    static clearForm() {
        ['okxApiKey', 'okxSecretKey', 'okxPassphrase', 'okxProjectId', 
         'privateKey', 'walletAddress', 'rpcUrl'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.value = '';
        });
    }
    
    // 填充表单
    static async fillForm(config) {
        console.log('🔄 开始填充表单配置...');
        
        // 首先验证RPC端点是否可用
        if (config.rpcUrl) {
            console.log(`测试RPC端点: ${config.rpcUrl}`);
            const isWorking = await this.testRPCEndpoint(config.rpcUrl);
            if (!isWorking) {
                console.warn(`保存的RPC端点不可用: ${config.rpcUrl}`);
                const bestRPC = await this.selectBestRPCEndpoint();
                console.log(`自动切换到可用端点: ${bestRPC}`);
                config.rpcUrl = bestRPC;
            } else {
                console.log('✅ RPC端点测试通过');
            }
        }
        
        // 填充所有配置字段
        const fieldsToFill = [
            'okxApiKey', 'okxSecretKey', 'okxPassphrase', 'okxProjectId',
            'rpcUrl', 'walletAddress', 'privateKey', 'chainId'
        ];
        
        fieldsToFill.forEach(key => {
            const element = document.getElementById(key);
            if (element && config[key]) {
                element.value = config[key];
                console.log(`✅ 填充字段 ${key}: ${key.includes('Key') || key.includes('private') ? '[已隐藏]' : config[key]}`);
            } else if (element) {
                console.warn(`⚠️ 配置中缺少字段: ${key}`);
            } else {
                console.warn(`⚠️ 未找到表单元素: ${key}`);
            }
        });
        
        // 更新链配置
        if (config.chainId) {
            document.getElementById('chainId').value = config.chainId;
            console.log(`🔗 设置链ID: ${config.chainId}`);
            if (window.updateChainConfig && typeof window.updateChainConfig === 'function') {
                try {
                    window.updateChainConfig();
                    console.log('✅ 链配置已更新');
                } catch (error) {
                    console.warn('⚠️ 链配置更新失败:', error.message);
                }
            } else {
                console.log('⚠️ updateChainConfig函数不可用，跳过链配置更新');
            }
        }
        
        console.log('✅ 表单填充完成');
    }
    
    // 显示解锁界面
    static showUnlockInterface() {
        const hasConfig = this.hasEncryptedConfig();
        const unlockSection = document.getElementById('unlockSection');
        const configSection = document.getElementById('configSection');
        
        if (hasConfig) {
            unlockSection.style.display = 'block';
            configSection.style.display = 'none';
        } else {
            unlockSection.style.display = 'none';
            configSection.style.display = 'block';
        }
    }
    
    // 显示配置界面
    static showConfigInterface() {
        const unlockSection = document.getElementById('unlockSection');
        const configSection = document.getElementById('configSection');
        
        unlockSection.style.display = 'none';
        configSection.style.display = 'block';
    }
    
    // 获取BSC备用RPC端点列表
    static getBSCRPCEndpoints() {
        return [
            // 新增测试节点 - 测试过连接稳定，优先使用
            'https://rpc.48.club/',
            // Binance官方节点
            'https://bsc-dataseed.binance.org/',
            'https://bsc-dataseed2.binance.org/',
            'https://bsc-dataseed3.binance.org/',
            'https://bsc-dataseed4.binance.org/',
            'https://rpc.ankr.com/bsc', // 需要API key
            'https://bsc.nodereal.io', // 可能需要API key
            'https://bsc-rpc.gateway.pokt.network/'
        ];
    }

    // 测试RPC端点连接性
    static async testRPCEndpoint(rpcUrl) {
        try {
            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_blockNumber',
                    params: [],
                    id: 1
                })
            });
            
            if (!response.ok) {
                return false;
            }
            
            const data = await response.json();
            return !!(data.result && data.result.startsWith('0x'));
        } catch (error) {
            return false;
        }
    }

    // 自动选择可用的RPC端点
    static async selectBestRPCEndpoint() {
        const endpoints = this.getBSCRPCEndpoints();
        
        for (const endpoint of endpoints) {
            console.log(`测试RPC端点: ${endpoint}`);
            const isWorking = await this.testRPCEndpoint(endpoint);
            if (isWorking) {
                console.log(`✅ 找到可用端点: ${endpoint}`);
                return endpoint;
            }
        }
        
        // 如果都不可用，返回第一个作为默认值
        console.warn('所有RPC端点都不可用，使用默认端点');
        return endpoints[0];
    }
}

// 确保ConfigManager类在全局scope中可用
window.ConfigManager = ConfigManager;