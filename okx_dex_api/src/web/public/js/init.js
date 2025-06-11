/**
 * 🚀 OKX DEX 初始化脚本
 * 确保所有类和功能正确加载
 */

// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 OKX DEX 前端初始化开始...');
    
    // 检查必需的类是否加载
    const requiredClasses = ['CryptoUtils', 'ConfigManager', 'APIClient', 'Utils'];
    const missingClasses = [];
    
    requiredClasses.forEach(className => {
        if (typeof window[className] !== 'undefined') {
            console.log(`✅ ${className} 类已加载`);
        } else {
            console.error(`❌ ${className} 类未加载`);
            missingClasses.push(className);
        }
    });
    
    if (missingClasses.length === 0) {
        console.log('✅ 所有必需类已正确加载');
        
        // 初始化应用
        try {
            if (typeof OKXDEXApp !== 'undefined') {
                if (!window.app) {
                    window.app = new OKXDEXApp();
                    window.app.init();
                    console.log('✅ OKX DEX 应用初始化成功');
                } else {
                    console.log('ℹ️ 应用实例已存在，跳过初始化');
                }
            } else {
                console.error('❌ OKXDEXApp 类未找到');
            }
        } catch (error) {
            console.error('❌ 应用初始化失败:', error);
        }
        
        // 测试关键功能
        testEssentialFunctions();
        
    } else {
        console.error('❌ 缺少必需的类，应用可能无法正常工作:', missingClasses);
        
        // 尝试手动重新加载脚本
        retryLoadingScripts(missingClasses);
    }
});

// 测试关键功能
function testEssentialFunctions() {
    console.log('🧪 测试关键功能...');
    
    // 测试CryptoUtils
    if (window.CryptoUtils) {
        try {
            // 简单测试
            console.log('✅ CryptoUtils 可用');
        } catch (error) {
            console.error('❌ CryptoUtils 测试失败:', error);
        }
    }
    
    // 测试ConfigManager
    if (window.ConfigManager) {
        try {
            const hasConfig = ConfigManager.hasEncryptedConfig();
            console.log(`✅ ConfigManager 可用 - 本地配置: ${hasConfig ? '存在' : '不存在'}`);
        } catch (error) {
            console.error('❌ ConfigManager 测试失败:', error);
        }
    }
    
    // 测试localStorage访问
    try {
        localStorage.setItem('okx_test', 'test');
        localStorage.removeItem('okx_test');
        console.log('✅ localStorage 可用');
    } catch (error) {
        console.error('❌ localStorage 不可用:', error);
    }
    
    // 测试Web Crypto API
    if (window.crypto && window.crypto.subtle) {
        console.log('✅ Web Crypto API 可用');
    } else {
        console.error('❌ Web Crypto API 不可用');
    }
}

// 尝试重新加载脚本
function retryLoadingScripts(missingClasses) {
    console.log('🔄 尝试重新加载缺失的脚本...');
    
    const scriptMap = {
        'CryptoUtils': 'js/crypto-utils.js',
        'ConfigManager': 'js/config-manager.js',
        'APIClient': 'js/api-client.js',
        'Utils': 'js/utils.js'
    };
    
    missingClasses.forEach(className => {
        const scriptSrc = scriptMap[className];
        if (scriptSrc) {
            const script = document.createElement('script');
            script.src = scriptSrc;
            script.onload = () => {
                console.log(`✅ ${className} 重新加载成功`);
                
                // 检查是否所有类都已加载
                setTimeout(() => {
                    const stillMissing = missingClasses.filter(c => typeof window[c] === 'undefined');
                    if (stillMissing.length === 0) {
                        console.log('🎉 所有类重新加载完成，尝试初始化应用...');
                        if (typeof OKXDEXApp !== 'undefined' && !window.app) {
                            window.app = new OKXDEXApp();
                            window.app.init();
                            console.log('✅ 应用重新初始化成功');
                        }
                    }
                }, 500);
            };
            script.onerror = () => {
                console.error(`❌ ${className} 重新加载失败`);
            };
            document.head.appendChild(script);
        }
    });
}

// 全局错误处理
window.addEventListener('error', function(event) {
    console.error('🚨 JavaScript错误:', event.error);
    console.error('文件:', event.filename);
    console.error('行号:', event.lineno);
});

// 检查解锁配置功能
window.debugUnlockConfig = function() {
    console.log('🔍 调试解锁配置功能...');
    
    if (!window.ConfigManager) {
        console.error('❌ ConfigManager 未加载');
        return;
    }
    
    if (!window.CryptoUtils) {
        console.error('❌ CryptoUtils 未加载');
        return;
    }
    
    const hasConfig = ConfigManager.hasEncryptedConfig();
    console.log(`本地配置状态: ${hasConfig ? '存在' : '不存在'}`);
    
    if (hasConfig) {
        console.log('💡 尝试输入解锁密码来测试解密功能');
        console.log('💡 或者调用 debugClearConfig() 清除配置重新开始');
    } else {
        console.log('💡 没有保存的配置，请先设置并保存配置');
    }
};

// 清除配置调试功能
window.debugClearConfig = function() {
    if (confirm('确定要清除保存的配置吗？此操作不可恢复！')) {
        if (window.ConfigManager) {
            ConfigManager.clearEncryptedConfig();
            console.log('✅ 配置已清除');
            // 刷新页面
            location.reload();
        } else {
            console.error('❌ ConfigManager 未加载');
        }
    }
};

console.log('📋 调试命令:');
console.log('  debugUnlockConfig() - 调试解锁配置');
console.log('  debugClearConfig() - 清除保存的配置'); 