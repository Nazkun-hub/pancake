/**
 * API路由 - PancakeSwap V3操作接口
 * 使用新的LiquidityManager和PositionManager，并包含所有钱包和策略功能
 */

import express from 'express';
import cors from 'cors';
// 🗑️ 删除不存在的模块引用 - 现在只使用第一套OKX服务（8000端口）
import { DIContainer } from '../di/container.js';
import { TYPES } from '../types/interfaces.js';
import { ethers } from 'ethers';
import profitLossRoutes from './profit-loss-routes.js';

const router = express.Router();

// WebSocket连接存储 - 用于实时推送策略状态
let wsConnections = new Map<string, any>();

// 全局WebSocket IO实例 - 在主入口文件中设置
let globalIO: any = null;

// 设置全局IO实例
export function setGlobalIO(io: any) {
  globalIO = io;
  console.log('🌐 全局WebSocket IO实例已设置');
}

// 设置WebSocket连接管理器
export function setupWebSocketManager(io: any) {
  console.log('🔌 初始化WebSocket策略状态推送服务');
  
  io.on('connection', (socket: any) => {
    console.log(`📱 客户端连接: ${socket.id}`);
    wsConnections.set(socket.id, socket);
    
    // 发送连接确认
    socket.emit('strategy:connected', {
      message: '策略状态推送服务已连接',
      timestamp: Date.now()
    });
    
    // 处理客户端订阅策略状态
    socket.on('strategy:subscribe', (instanceId: string) => {
      console.log(`📊 客户端 ${socket.id} 订阅策略状态: ${instanceId}`);
      socket.join(`strategy:${instanceId}`);
      socket.emit('strategy:subscribed', { instanceId });
    });
    
    // 处理客户端取消订阅
    socket.on('strategy:unsubscribe', (instanceId: string) => {
      console.log(`🚫 客户端 ${socket.id} 取消订阅策略状态: ${instanceId}`);
      socket.leave(`strategy:${instanceId}`);
      socket.emit('strategy:unsubscribed', { instanceId });
    });
    
    // 处理断开连接
    socket.on('disconnect', () => {
      console.log(`📱 客户端断开连接: ${socket.id}`);
      wsConnections.delete(socket.id);
    });
  });
}

// 推送策略状态更新
export function broadcastStrategyUpdate(instanceId: string, strategyData: any, io?: any) {
  if (!io && wsConnections.size === 0) return;
  
  const updateData = {
    instanceId,
    strategyData,
    timestamp: Date.now(),
    type: 'strategy:update'
  };
  
  if (io) {
    // 向订阅此策略的所有客户端推送
    io.to(`strategy:${instanceId}`).emit('strategy:update', updateData);
    
    // 同时向所有连接推送策略列表更新
    io.emit('strategy:list_update', {
      instanceId,
      status: strategyData.状态,
      timestamp: Date.now()
    });
  }
  
  console.log(`📢 策略状态已推送: ${instanceId} - ${strategyData.状态}`);
}

// 推送策略执行进度
export function broadcastStrategyProgress(instanceId: string, progressData: any, io?: any) {
  if (!io && wsConnections.size === 0) return;
  
  const progressUpdate = {
    instanceId,
    progress: progressData,
    timestamp: Date.now(),
    type: 'strategy:progress'
  };
  
  if (io) {
    io.to(`strategy:${instanceId}`).emit('strategy:progress', progressUpdate);
  }
  
  console.log(`📈 策略进度已推送: ${instanceId} - ${progressData.阶段描述}`);
}

// 🔗 延迟获取服务实例的辅助函数 - 只在实际调用时才解析
function getServices() {
  // 🔧 修复：在函数内部获取DIContainer实例，避免模块加载时的循环依赖
  const diContainer = DIContainer.getInstance();
  diContainer.initialize();
  
  const contract = diContainer.getService<any>(TYPES.ContractService);
  const web3 = diContainer.getService<any>(TYPES.Web3Service);
  const position = diContainer.getService<any>(TYPES.PositionManager);
  const crypto = diContainer.getService<any>(TYPES.CryptoService);
    
    return {
    contractService: contract,
    web3Service: web3,
    positionManager: position,
      liquidityManager: diContainer.getService<any>(TYPES.LiquidityManager),
    tickCalculatorService: diContainer.getService<any>(TYPES.TickCalculatorService),
      策略引擎: diContainer.getService<any>(TYPES.策略引擎),
      cryptoService: crypto
    };
}

// 添加API调用频率控制
const apiCallLog = new Map<string, number>();

/**
 * 💧 流动性添加路由
 */

/**
 * 添加流动性
 * POST /api/add-liquidity
 */
router.post('/add-liquidity', async (req, res): Promise<void> => {
  try {
    console.log('💧 API: 添加流动性请求');
    
    const { liquidityManager } = getServices();
    
    // 验证必需参数
    const { 
      inputAmount, 
      inputToken, 
      lowerPercent, 
      upperPercent, 
      baseSlippagePercent,
      poolConfig // 🔴 现在为必需参数
    } = req.body;
    
    if (!inputAmount || !inputToken || typeof lowerPercent !== 'number' || typeof upperPercent !== 'number') {
      res.status(400).json({
        success: false,
        error: '缺少必需参数: inputAmount, inputToken, lowerPercent, upperPercent'
      });
      return;
    }

    // 🔴 强制要求提供池子配置
    if (!poolConfig) {
      res.status(400).json({
        success: false,
        error: '必须提供poolConfig参数，指定要操作的池子配置'
      });
      return;
    }

    // 🔴 验证池子配置的完整性
    if (!poolConfig.poolAddress || !poolConfig.token0Address || !poolConfig.token1Address || typeof poolConfig.fee !== 'number') {
      res.status(400).json({
        success: false,
        error: 'poolConfig参数不完整，必须包含: poolAddress, token0Address, token1Address, fee'
      });
      return;
    }

    // 🔴 验证地址格式 (以太坊地址格式)
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(poolConfig.poolAddress) || 
        !addressRegex.test(poolConfig.token0Address) || 
        !addressRegex.test(poolConfig.token1Address)) {
      res.status(400).json({
        success: false,
        error: '池子地址或代币地址格式无效，必须是有效的以太坊地址格式'
      });
      return;
    }

    console.log('🎯 使用用户指定的池子配置:', poolConfig);

    // 构建参数
    const params: any = {
      inputAmount: inputAmount.toString(),
      inputToken: inputToken as 'WBNB' | 'USDT',
      lowerPercent: Number(lowerPercent),
      upperPercent: Number(upperPercent),
      baseSlippagePercent: Number(baseSlippagePercent) || 1,
      poolConfig: poolConfig || undefined // 🔴 传递池子配置
    };

    // 调用LiquidityManager创建头寸
    const result = await liquidityManager.createLiquidityPosition(params);

    // 处理BigInt序列化问题 - 递归转换所有BigInt
    const safeResult = JSON.parse(JSON.stringify(result, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }));

    res.json({
      success: true,
      data: safeResult,
      message: '流动性添加成功'
    });

  } catch (error) {
    console.error('❌ 添加流动性失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '添加流动性失败'
    });
  }
});

/**
 * 🎯 头寸管理路由
 */

/**
 * 获取用户头寸
 * GET /api/positions/:userAddress
 */
router.get('/positions/:userAddress', async (req, res): Promise<void> => {
  try {
    console.log('🔍 API: 获取用户头寸请求');
    
    const { positionManager } = getServices();
    const { userAddress } = req.params;
    
    if (!userAddress) {
      res.status(400).json({
        success: false,
        error: '用户地址不能为空'
      });
      return;
    }

    // 调用PositionManager获取头寸
    const result = await positionManager.getUserPositions(userAddress);

    res.json(result);

  } catch (error) {
    console.error('❌ 获取用户头寸失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取头寸失败'
    });
  }
});

/**
 * 关闭单个头寸
 * DELETE /api/positions/:tokenId
 */
router.delete('/positions/:tokenId', async (req, res): Promise<void> => {
  try {
    console.log('🗑️ API: 关闭单个头寸请求');
    
    const { positionManager } = getServices();
    const { tokenId } = req.params;
    
    if (!tokenId) {
      res.status(400).json({
        success: false,
        error: 'Token ID不能为空'
      });
      return;
    }

    // 调用PositionManager关闭头寸
    const result = await positionManager.closeSinglePosition(tokenId);

    res.json(result);

  } catch (error) {
    console.error('❌ 关闭单个头寸失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '关闭头寸失败'
    });
  }
});

/**
 * 批量关闭所有头寸
 * DELETE /api/positions/batch/:userAddress
 */
router.delete('/positions/batch/:userAddress', async (req, res): Promise<void> => {
  try {
    console.log('🗑️ API: 批量关闭所有头寸请求');
    
    const { positionManager } = getServices();
    const { userAddress } = req.params;
    
    if (!userAddress) {
      res.status(400).json({
        success: false,
        error: '用户地址不能为空'
      });
      return;
    }

    // 调用PositionManager批量关闭头寸
    const result = await positionManager.closeAllPositions(userAddress);

    res.json(result);

  } catch (error) {
    console.error('❌ 批量关闭头寸失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '批量关闭头寸失败'
    });
  }
});

/**
 * 🔐 钱包管理路由
 */
    
    /**
     * 获取钱包状态
 * GET /api/wallet/status
     */
router.get('/wallet/status', async (req, res): Promise<void> => {
        try {
            console.log('📋 API: 获取钱包状态');
    const cryptoService = getServices().cryptoService;
    
    // 检查服务是否有getWalletStatus方法
    if (typeof cryptoService.getWalletStatus !== 'function') {
      res.json({
        success: true,
        hasWallet: false,
        isUnlocked: false,
        filePath: null
      });
      return;
    }
    
            const status = cryptoService.getWalletStatus();
            
            res.json({
                success: true,
      hasWallet: status?.hasWalletFile || false,
      isUnlocked: status?.isUnlocked || false,
      filePath: status?.walletFilePath || null
            });
        } catch (error) {
            console.error('❌ 获取钱包状态失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : '获取钱包状态失败',
                hasWallet: false,
                isUnlocked: false
            });
        }
});
    
    /**
     * 创建钱包
 * POST /api/wallet/create
     */
router.post('/wallet/create', async (req, res): Promise<void> => {
        try {
            console.log('🔐 API: 创建钱包');
            const { privateKey, password } = req.body;
            
            if (!privateKey || !password) {
                res.status(400).json({
                    success: false,
                    error: '私钥和密码不能为空'
                });
                return;
            }
            
    const cryptoService = getServices().cryptoService;
    
    // 检查服务方法是否存在
    if (typeof cryptoService.encryptPrivateKey !== 'function' || 
        typeof cryptoService.saveEncryptedWallet !== 'function') {
      res.status(500).json({
        success: false,
        error: 'CryptoService方法不可用'
      });
      return;
    }
    
            // 加密私钥
            const encryptedData = cryptoService.encryptPrivateKey(privateKey, password);
            
            // 保存到文件
            const filePath = cryptoService.saveEncryptedWallet(encryptedData);
            
            res.json({
                success: true,
                message: '钱包创建成功',
                filePath: filePath
            });
        } catch (error) {
            console.error('❌ 创建钱包失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : '创建钱包失败'
            });
        }
});
    
    /**
     * 解锁钱包
 * POST /api/wallet/unlock
     */
router.post('/wallet/unlock', async (req, res): Promise<void> => {
        try {
            console.log('🔓 API: 解锁钱包');
            const { password } = req.body;
            
            if (!password) {
                res.status(400).json({
                    success: false,
                    error: '密码不能为空'
                });
                return;
            }
            
    const cryptoService = getServices().cryptoService;
    
    // 检查服务方法是否存在
    if (typeof cryptoService.unlockWallet !== 'function') {
      res.status(500).json({
        success: false,
        error: 'CryptoService.unlockWallet方法不可用'
      });
      return;
    }
    
            // 解锁钱包
            const success = await cryptoService.unlockWallet(password);
            
            if (success) {
                try {
                    // 自动连接Web3钱包
        const walletInfo = await getServices().web3Service.connectWallet();
                    
                res.json({
                    success: true,
                        message: '钱包解锁成功并已连接Web3',
                        walletInfo: {
                            address: walletInfo.address,
                            balance: walletInfo.balance,
                            isConnected: walletInfo.isConnected
                        }
                    });
                } catch (web3Error) {
                    res.json({
                        success: true,
                        message: '钱包解锁成功，但Web3连接失败',
                        warning: web3Error instanceof Error ? web3Error.message : '未知错误'
                });
                }
            } else {
                res.status(400).json({
                    success: false,
                    error: '解锁失败'
                });
            }
        } catch (error) {
            console.error('❌ 解锁钱包失败:', error);
            res.status(400).json({
                success: false,
                error: error instanceof Error ? error.message : '解锁钱包失败'
            });
        }
});
    
    /**
     * 锁定钱包
 * POST /api/wallet/lock
     */
router.post('/wallet/lock', async (req, res) => {
        try {
            console.log('🔒 API: 锁定钱包');
    const cryptoService = getServices().cryptoService;
    
    if (typeof cryptoService.lockWallet === 'function') {
            cryptoService.lockWallet();
    }
            
            res.json({
                success: true,
                message: '钱包已锁定'
            });
        } catch (error) {
            console.error('❌ 锁定钱包失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : '锁定钱包失败'
            });
        }
});
    
    /**
     * 删除钱包
 * DELETE /api/wallet/delete
     */
router.delete('/wallet/delete', async (req, res) => {
        try {
            console.log('🗑️ API: 删除钱包');
    const cryptoService = getServices().cryptoService;
    
    let success = false;
    if (typeof cryptoService.deleteWalletFile === 'function') {
      success = cryptoService.deleteWalletFile();
    }
            
            if (success) {
                res.json({
                    success: true,
                    message: '钱包已删除'
                });
            } else {
                res.status(404).json({
                    success: false,
        error: '钱包文件不存在或删除失败'
                });
            }
        } catch (error) {
            console.error('❌ 删除钱包失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : '删除钱包失败'
            });
        }
});
    
    /**
     * 获取钱包信息
 * GET /api/wallet/info
     */
router.get('/wallet/info', async (req, res): Promise<void> => {
        try {
            console.log('ℹ️ API: 获取钱包信息');
    const cryptoService = getServices().cryptoService;
            
    // 检查钱包是否解锁
    if (typeof cryptoService.isWalletUnlocked !== 'function' || 
        !cryptoService.isWalletUnlocked()) {
                res.status(400).json({
                    success: false,
                    error: '钱包未解锁'
                });
                return;
            }
            
            try {
                // 尝试连接Web3钱包获取真实信息
      const walletInfo = await getServices().web3Service.execute({ operation: 'connectWallet' });
                
                res.json({
                    success: true,
                    info: {
                        address: walletInfo.address,
                        balance: walletInfo.balance,
                        nonce: walletInfo.nonce,
          filePath: typeof cryptoService.getWalletFilePath === 'function' ? 
                    cryptoService.getWalletFilePath() : null,
          isUnlocked: typeof cryptoService.isWalletUnlocked === 'function' ? 
                      cryptoService.isWalletUnlocked() : false,
                        isConnected: walletInfo.isConnected
                    }
                });
            } catch (web3Error) {
      // 如果Web3连接失败，使用本地信息
      let address = null;
      if (typeof cryptoService.getCurrentPrivateKey === 'function') {
                const privateKey = cryptoService.getCurrentPrivateKey();
        if (privateKey) {
          address = '0x' + privateKey.slice(-40);
        }
      }
      
      if (!address) {
                    res.status(400).json({
                        success: false,
                        error: '无法获取私钥'
                    });
                    return;
                }
                
                res.json({
                    success: true,
                    info: {
                        address: address,
                        balance: '0.0',
                        nonce: 0,
          filePath: typeof cryptoService.getWalletFilePath === 'function' ? 
                    cryptoService.getWalletFilePath() : null,
          isUnlocked: typeof cryptoService.isWalletUnlocked === 'function' ? 
                      cryptoService.isWalletUnlocked() : false,
                        isConnected: false
                    }
                });
            }
        } catch (error) {
            console.error('❌ 获取钱包信息失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : '获取钱包信息失败'
            });
        }
});

    /**
     * 连接Web3钱包
 * POST /api/wallet/connect-web3
     */
router.post('/wallet/connect-web3', async (req, res): Promise<void> => {
        try {
            console.log('🌐 API: 连接Web3钱包');
    const cryptoService = getServices().cryptoService;
            
    if (typeof cryptoService.isWalletUnlocked !== 'function' || 
        !cryptoService.isWalletUnlocked()) {
                res.status(400).json({
                    success: false,
                    error: '钱包未解锁，请先解锁钱包'
                });
                return;
            }
            
    const walletInfo = await getServices().web3Service.execute({ operation: 'connectWallet' });
            
            res.json({
                success: true,
                message: 'Web3钱包连接成功',
                walletInfo: walletInfo
            });
        } catch (error) {
            console.error('❌ Web3钱包连接失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Web3钱包连接失败'
            });
  }
});
    
    /**
     * 获取地址余额
 * GET /api/wallet/balance/:address
     */
router.get('/wallet/balance/:address', async (req, res): Promise<void> => {
        try {
            console.log('💰 API: 获取地址余额');
            const { address } = req.params;
            
            if (!address) {
                res.status(400).json({
                    success: false,
                    error: '地址参数不能为空'
                });
                return;
            }
            
    const balance = await getServices().web3Service.execute({ 
                operation: 'getBalance', 
                address: address 
            });
            
            res.json({
                success: true,
                address: address,
                balance: balance,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('❌ 获取余额失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : '获取余额失败'
            });
        }
});

/**
 * 获取钱包地址
 * GET /api/wallet/address
 */
router.get('/wallet/address', async (req, res): Promise<void> => {
  try {
    console.log('📋 API: 获取钱包地址');
    
    const { web3Service } = getServices();
    const wallet = web3Service.getWallet();
    
    if (!wallet) {
      res.status(400).json({
        success: false,
        error: '钱包未连接'
      });
      return;
    }
    
    res.json({
      success: true,
      address: wallet.address
    });
  } catch (error) {
    console.error('❌ 获取钱包地址失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取钱包地址失败'
    });
  }
});

/**
 * 获取代币余额
 * GET /api/balance/:walletAddress/:tokenAddress
 */
router.get('/balance/:walletAddress/:tokenAddress', async (req, res): Promise<void> => {
  try {
    console.log('🪙 API: 获取代币余额');
    const { walletAddress, tokenAddress } = req.params;
    
    if (!walletAddress || !tokenAddress) {
      res.status(400).json({
        success: false,
        error: '钱包地址和代币地址不能为空'
      });
      return;
    }
    
    const { web3Service, contractService } = getServices();
    
    try {
      // 获取代币基本信息
      const tokenInfo = await contractService.getTokenInfo(tokenAddress);
      console.log(`✅ 代币信息获取成功: ${tokenInfo.symbol}`);
      
      // 获取代币余额
      const balanceResult = await web3Service.getTokenBalance(walletAddress, tokenAddress);
      
      console.log(`✅ 代币余额获取成功: ${balanceResult.formatted}`);
      res.json({
        success: true,
        walletAddress: walletAddress,
        tokenAddress: tokenAddress,
        balance: balanceResult.formatted,
        balanceRaw: balanceResult.raw,
        symbol: tokenInfo.symbol,
        decimals: tokenInfo.decimals,
        timestamp: Date.now()
      });
      
    } catch (innerError) {
      console.error('❌ 代币余额获取失败:', innerError);
      res.status(500).json({
        success: false,
        error: innerError instanceof Error ? innerError.message : '代币余额获取失败'
      });
    }
  } catch (error) {
    console.error('❌ 获取代币余额失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取代币余额失败'
    });
  }
});

/**
 * 🎯 策略管理API - 新策略模块
 */

/**
 * 创建策略配置
 * POST /api/strategy/create
 */
router.post('/strategy/create', async (req, res): Promise<void> => {
  try {
    console.log('🆕 API: 创建策略配置');
    
    const { 策略引擎: strategyEngine } = getServices();
    if (!strategyEngine || typeof strategyEngine.创建策略实例 !== 'function') {
      res.status(503).json({
        success: false,
        error: '策略引擎服务不可用'
      });
      return;
    }
    
    const 配置 = req.body;
    const 实例ID = await strategyEngine.创建策略实例(配置);
    
    // 获取创建后的策略状态并推送
    try {
      const 策略状态 = await strategyEngine.获取策略状态(实例ID);
      broadcastStrategyUpdate(实例ID, 策略状态, globalIO);
    } catch (error) {
      console.warn('⚠️ 推送策略创建状态失败:', error);
    }
    
    res.json({
      success: true,
      data: { 实例ID },
      message: '策略配置创建成功'
    });
    
  } catch (error) {
    console.error('❌ 创建策略配置失败:');
    console.error('  错误类型:', typeof error);
    console.error('  错误消息:', error instanceof Error ? error.message : String(error));
    console.error('  错误堆栈:', error instanceof Error ? error.stack : '无堆栈信息');
    console.error('  完整错误对象:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '创建策略配置失败'
    });
  }
});

/**
 * 启动策略实例
 * POST /api/strategy/:instanceId/start
 */
router.post('/strategy/:instanceId/start', async (req, res): Promise<void> => {
  try {
    console.log('🚀 API: 启动策略实例');
    
    const { instanceId } = req.params;
    if (!instanceId) {
      res.status(400).json({
        success: false,
        error: '实例ID不能为空'
      });
      return;
    }
    
    const { 策略引擎: strategyEngine } = getServices();
    if (!strategyEngine || typeof strategyEngine.启动策略 !== 'function') {
      res.status(503).json({
        success: false,
        error: '策略引擎服务不可用'
      });
      return;
    }
    
    await strategyEngine.启动策略(instanceId);
    
    // 推送策略启动状态
    try {
      const 策略状态 = await strategyEngine.获取策略状态(instanceId);
      broadcastStrategyUpdate(instanceId, 策略状态, globalIO);
    } catch (error) {
      console.warn('⚠️ 推送策略启动状态失败:', error);
    }
    
    res.json({
      success: true,
      message: '策略实例启动成功'
    });
    
  } catch (error) {
    console.error('❌ 启动策略实例失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '启动策略实例失败'
    });
  }
});

/**
 * 停止策略实例
 * POST /api/strategy/:instanceId/stop
 */
router.post('/strategy/:instanceId/stop', async (req, res): Promise<void> => {
  try {
    console.log('🛑 API: 停止策略实例');
    
    const { instanceId } = req.params;
    if (!instanceId) {
      res.status(400).json({
        success: false,
        error: '实例ID不能为空'
      });
      return;
    }
    
    const { 策略引擎: strategyEngine } = getServices();
    if (!strategyEngine || typeof strategyEngine.停止策略 !== 'function') {
      res.status(503).json({
        success: false,
        error: '策略引擎服务不可用'
      });
      return;
    }
    
    await strategyEngine.停止策略(instanceId);
    
    // 推送策略停止状态
    try {
      const 策略状态 = await strategyEngine.获取策略状态(instanceId);
      broadcastStrategyUpdate(instanceId, 策略状态, globalIO);
    } catch (error) {
      console.warn('⚠️ 推送策略停止状态失败:', error);
    }
    
    res.json({
      success: true,
      message: '策略实例停止成功'
    });
    
  } catch (error) {
    console.error('❌ 停止策略实例失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '停止策略实例失败'
    });
  }
});

/**
 * 删除策略实例
 * DELETE /api/strategy/:instanceId
 */
router.delete('/strategy/:instanceId', async (req, res): Promise<void> => {
  try {
    console.log('🗑️ API: 删除策略实例');
    
    const { instanceId } = req.params;
    if (!instanceId) {
      res.status(400).json({
        success: false,
        error: '实例ID不能为空'
      });
      return;
    }
    
    const { 策略引擎: strategyEngine } = getServices();
    if (!strategyEngine || typeof strategyEngine.删除策略 !== 'function') {
      res.status(503).json({
        success: false,
        error: '策略引擎服务不可用'
      });
      return;
    }
    
    await strategyEngine.删除策略(instanceId);
    
    // 推送策略删除通知
    if (globalIO) {
      globalIO.emit('strategy:deleted', {
        instanceId,
        timestamp: Date.now()
      });
    }
    
    res.json({
      success: true,
      message: '策略实例删除成功'
    });
    
  } catch (error) {
    console.error('❌ 删除策略实例失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '删除策略实例失败'
    });
  }
});

/**
 * 重置策略状态
 * POST /api/strategy/:instanceId/reset
 */
router.post('/strategy/:instanceId/reset', async (req, res): Promise<void> => {
  try {
    console.log('🔄 API: 重置策略状态');
    
    const { instanceId } = req.params;
    if (!instanceId) {
      res.status(400).json({
        success: false,
        error: '实例ID不能为空'
      });
      return;
    }
    
    const { 策略引擎: strategyEngine } = getServices();
    if (!strategyEngine || typeof strategyEngine.重置策略状态 !== 'function') {
      res.status(503).json({
        success: false,
        error: '策略引擎服务不可用'
      });
      return;
    }
    
    await strategyEngine.重置策略状态(instanceId);
    
    // 推送策略重置状态
    try {
      const 策略状态 = await strategyEngine.获取策略状态(instanceId);
      broadcastStrategyUpdate(instanceId, 策略状态, globalIO);
    } catch (error) {
      console.warn('⚠️ 推送策略重置状态失败:', error);
    }
    
    res.json({
      success: true,
      message: '策略状态重置成功，现在可以重新启动'
    });
    
  } catch (error) {
    console.error('❌ 重置策略状态失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '重置策略状态失败'
    });
  }
});

/**
 * 获取策略状态
 * GET /api/strategy/:instanceId/status
 */
router.get('/strategy/:instanceId/status', async (req, res): Promise<void> => {
  try {
    console.log('📊 API: 获取策略状态');
    
    const { instanceId } = req.params;
    if (!instanceId) {
      res.status(400).json({
        success: false,
        error: '实例ID不能为空'
      });
      return;
    }
    
    const { 策略引擎: strategyEngine } = getServices();
    if (!strategyEngine || typeof strategyEngine.获取策略状态 !== 'function') {
      res.status(503).json({
        success: false,
        error: '策略引擎服务不可用'
      });
      return;
    }
    
    const 策略实例 = await strategyEngine.获取策略状态(instanceId);
    
    res.json({
      success: true,
      data: 策略实例
    });
    
  } catch (error) {
    console.error('❌ 获取策略状态失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取策略状态失败'
    });
  }
});

/**
 * 获取所有策略实例
 * GET /api/strategy/instances
 */
router.get('/strategy/instances', async (req, res): Promise<void> => {
  try {
    // 🔧 减少重复日志：只在距离上次调用超过30秒时打印
    const lastCallTime = apiCallLog.get('strategy/instances') || 0;
    const now = Date.now();
    if (now - lastCallTime > 30000) {
      console.log('📋 API: 获取所有策略实例');
      apiCallLog.set('strategy/instances', now);
    }
    
    const { 策略引擎: strategyEngine } = getServices();
    if (!strategyEngine || typeof strategyEngine.获取所有策略实例 !== 'function') {
      res.status(503).json({
        success: false,
        error: '策略引擎服务不可用'
      });
      return;
    }
    
    const 策略实例列表 = await strategyEngine.获取所有策略实例();
    
    res.json({
      success: true,
      data: 策略实例列表
    });
    
  } catch (error) {
    console.error('❌ 获取策略实例列表失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取策略实例列表失败'
    });
  }
});

/**
 * WebSocket实时状态推送API
 * GET /api/strategy/ws/status
 */
router.get('/strategy/ws/status', async (req, res): Promise<void> => {
  try {
    const wsStatus = {
      connected: wsConnections.size > 0,
      activeConnections: wsConnections.size,
      hasGlobalIO: !!globalIO,
      timestamp: Date.now()
    };
    
    res.json({
      success: true,
      data: wsStatus,
      message: 'WebSocket状态查询成功'
    });
    
  } catch (error) {
    console.error('❌ 获取WebSocket状态失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取WebSocket状态失败'
    });
  }
});

/**
 * 🔧 工具和状态路由
 */

/**
 * 计算tick范围 - 基于百分比
 * POST /api/calculate-tick-range
 */
router.post('/calculate-tick-range', async (req, res): Promise<void> => {
  try {
    console.log('🧮 API: 计算tick范围');
    
    const { poolAddress, lowerPercent, upperPercent, fee } = req.body;
    
    if (!poolAddress || typeof lowerPercent !== 'number' || typeof upperPercent !== 'number') {
      res.status(400).json({
        success: false,
        error: '缺少必需参数: poolAddress, lowerPercent, upperPercent'
      });
      return;
    }

    // 获取池子当前状态
    const poolState = await getServices().contractService.getPoolState(poolAddress);
    if (!poolState) {
      res.status(404).json({
        success: false,
        error: '池子不存在或无法获取状态'
      });
      return;
    }

    // 获取TickCalculatorService (需要先注册到容器)
    try {
      const tickCalculator = getServices().tickCalculatorService;
      
      // 计算tick范围
      const result = tickCalculator.calculateTickRange(
        poolState.tick, 
        lowerPercent, 
        upperPercent, 
        fee || 100
      );
      
      // 验证tick范围
      const validation = tickCalculator.validateTickRange(
        result.tickLower, 
        result.tickUpper, 
        poolState.tick
      );

      res.json({
        success: true,
        data: {
          currentTick: poolState.tick,
          tickRange: result,
          validation: validation,
          poolState: poolState
        }
      });

    } catch (error) {
      console.error('❌ 获取TickCalculatorService失败:', error);
      res.status(500).json({
        success: false,
        error: 'TickCalculatorService不可用'
      });
    }

  } catch (error) {
    console.error('❌ 计算tick范围失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '计算tick范围失败'
    });
  }
});

/**
 * 批量计算多个tick范围
 * POST /api/calculate-multiple-tick-ranges
 */
router.post('/calculate-multiple-tick-ranges', async (req, res): Promise<void> => {
  try {
    console.log('🧮 API: 批量计算tick范围');
    
    const { poolAddress, percentRanges } = req.body;
    
    if (!poolAddress || !Array.isArray(percentRanges)) {
      res.status(400).json({
        success: false,
        error: '缺少必需参数: poolAddress, percentRanges (数组)'
      });
      return;
    }

    // 获取池子当前状态
    const poolState = await getServices().contractService.getPoolState(poolAddress);
    if (!poolState) {
      res.status(404).json({
        success: false,
        error: '池子不存在或无法获取状态'
      });
      return;
    }

    try {
      const tickCalculator = getServices().tickCalculatorService;
      
      // 批量计算
      const results = tickCalculator.calculateMultipleTickRanges(
        poolState.tick, 
        percentRanges
      );

      res.json({
        success: true,
        data: {
          currentTick: poolState.tick,
          results: results,
          poolState: poolState
        }
      });

    } catch (error) {
      console.error('❌ 获取TickCalculatorService失败:', error);
      res.status(500).json({
        success: false,
        error: 'TickCalculatorService不可用'
      });
    }

  } catch (error) {
    console.error('❌ 批量计算tick范围失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '批量计算tick范围失败'
    });
  }
});

/**
 * 健康检查
 * GET /api/health
 */
router.get('/health', async (req, res) => {
  try {
    const healthChecks = await Promise.allSettled([
      getServices().web3Service.healthCheck(),
      getServices().contractService.healthCheck(),
      getServices().liquidityManager.healthCheck(),
      getServices().positionManager.healthCheck()
    ]);

    const services = {
      web3: healthChecks[0].status === 'fulfilled' ? 
            healthChecks[0].value : { status: 'error', message: 'Health check failed' },
      contract: healthChecks[1].status === 'fulfilled' ? 
                healthChecks[1].value : { status: 'error', message: 'Health check failed' },
      liquidity: healthChecks[2].status === 'fulfilled' ? 
                 healthChecks[2].value : { status: 'error', message: 'Health check failed' },
      position: healthChecks[3].status === 'fulfilled' ? 
                healthChecks[3].value : { status: 'error', message: 'Health check failed' }
    };

    const allHealthy = Object.values(services).every(health => health.status === 'healthy');

    res.status(allHealthy ? 200 : 503).json({
      success: allHealthy,
      timestamp: Date.now(),
      services: services
    });

        } catch (error) {
            res.status(500).json({
                success: false,
      error: error instanceof Error ? error.message : '健康检查失败'
    });
  }
});

/**
 * 获取系统指标
 * GET /api/metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      web3: getServices().web3Service.getMetrics ? getServices().web3Service.getMetrics() : { error: 'Method not available' },
      contract: getServices().contractService.getMetrics ? getServices().contractService.getMetrics() : { error: 'Method not available' },
      liquidity: getServices().liquidityManager.getMetrics ? getServices().liquidityManager.getMetrics() : { error: 'Method not available' },
      position: getServices().positionManager.getMetrics ? getServices().positionManager.getMetrics() : { error: 'Method not available' },
      timestamp: Date.now()
    };
            
            res.json({
                success: true,
      data: metrics
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
      error: error instanceof Error ? error.message : '获取指标失败'
    });
  }
});

/**
 * 获取池子信息
 * GET /api/pool/:token0/:token1/:fee
 */
router.get('/pool/:token0/:token1/:fee', async (req, res): Promise<void> => {
  try {
    const { token0, token1, fee } = req.params;
    
    if (!token0 || !token1 || !fee) {
                res.status(400).json({
                    success: false,
        error: '缺少参数: token0, token1, fee'
                });
                return;
            }

    // 获取池子地址和状态
    const poolAddress = await getServices().contractService.getPoolAddress(
                token0,
                token1,
      parseInt(fee)
    );
    
    const poolState = await getServices().contractService.getPoolState(poolAddress);
    
    // 获取代币信息
    const [token0Info, token1Info] = await Promise.all([
      getServices().contractService.getTokenInfo(token0),
      getServices().contractService.getTokenInfo(token1)
    ]);

            res.json({
                success: true,
      data: {
        poolAddress,
        poolState,
        token0Info,
        token1Info
      }
    });

        } catch (error) {
    console.error('❌ 获取池子信息失败:', error);
            res.status(500).json({
                success: false,
      error: error instanceof Error ? error.message : '获取池子信息失败'
    });
  }
});

/**
 * 通过池地址获取池信息
 * GET /api/pool-info/:poolAddress
 */
router.get('/pool-info/:poolAddress', async (req, res): Promise<void> => {
  try {
    const { poolAddress } = req.params;
    
    if (!poolAddress) {
                res.status(400).json({
                    success: false,
        error: '缺少参数: poolAddress'
                });
                return;
            }

    if (!/^0x[a-fA-F0-9]{40}$/.test(poolAddress)) {
                res.status(400).json({
                    success: false,
        error: '池地址格式不正确'
                });
                return;
            }

    // 获取池状态
    const poolState = await getServices().contractService.getPoolState(poolAddress);
    
    // 通过池合约获取token地址（使用ethers直接调用）
    const provider = getServices().web3Service.getProvider();
    if (!provider) {
      throw new Error('Provider未初始化');
    }
    
    const { POOL_ABI } = await import('../types/contracts.js');
    const poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
    const [token0Address, token1Address] = await Promise.all([
      poolContract.token0(),
      poolContract.token1()
    ]);
    
    // 获取代币信息
    const [token0Info, token1Info] = await Promise.all([
      getServices().contractService.getTokenInfo(token0Address),
      getServices().contractService.getTokenInfo(token1Address)
    ]);
            
            res.json({
                success: true,
      data: {
        poolAddress,
        poolState,
        token0Info,
        token1Info
      }
    });

        } catch (error) {
    console.error('❌ 通过池地址获取池信息失败:', error);
            res.status(500).json({
                success: false,
      error: error instanceof Error ? error.message : '获取池信息失败'
            });
        }
});

    /**
 * 代币授权
 * POST /api/approve
     */
router.post('/approve', async (req, res): Promise<void> => {
        try {
    const { tokenAddress, amount } = req.body;
            
    if (!tokenAddress || !amount) {
                res.status(400).json({
                    success: false,
        error: '缺少参数: tokenAddress, amount'
                });
                return;
            }

    const txHash = await getServices().contractService.approveToken(tokenAddress, amount);
            
            res.json({
                success: true,
      data: { txHash },
      message: '代币授权成功'
    });

        } catch (error) {
    console.error('❌ 代币授权失败:', error);
            res.status(500).json({
                success: false,
      error: error instanceof Error ? error.message : '代币授权失败'
    });
  }
});

/**
 * 检查代币授权额度
 * GET /api/allowance/:tokenAddress/:ownerAddress
 */
router.get('/allowance/:tokenAddress/:ownerAddress', async (req, res): Promise<void> => {
  try {
    const { tokenAddress, ownerAddress } = req.params;
    
    if (!tokenAddress || !ownerAddress) {
                res.status(400).json({
                    success: false,
        error: '缺少参数: tokenAddress, ownerAddress'
                });
                return;
            }

    const allowance = await getServices().contractService.checkAllowance(tokenAddress, ownerAddress);

    res.json({
      success: true,
      data: { allowance }
    });

        } catch (error) {
    console.error('❌ 检查授权额度失败:', error);
            res.status(500).json({
                success: false,
      error: error instanceof Error ? error.message : '检查授权额度失败'
    });
  }
});

/**
 * 获取池子列表（前端兼容性）
 * GET /api/pools
 */
router.get('/pools', async (req, res): Promise<void> => {
  try {
    // 返回模拟的池子数据，避免前端404错误
    const mockPools = [
      {
        id: '1',
        name: 'WBNB/USDT',
        address: '0x36696169c63e42cd08ce11f5deebbcebae652050',
        tokenA: { symbol: 'WBNB', amount: '100.5' },
        tokenB: { symbol: 'USDT', amount: '30150.75' },
        minPrice: 250.5,
        maxPrice: 350.8,
        currentPrice: 301.2,
        liquidity: 50000,
        inRange: true
      },
      {
        id: '2', 
        name: 'CAKE/WBNB',
        address: '0x0ed7e52944161450477ee417de9cd3a859b14fd0',
        tokenA: { symbol: 'CAKE', amount: '1500.0' },
        tokenB: { symbol: 'WBNB', amount: '30.25' },
        minPrice: 0.018,
        maxPrice: 0.025,
        currentPrice: 0.0202,
        liquidity: 25000,
        inRange: false
      }
    ];
    
    res.json({
      success: true,
      pools: mockPools
    });

  } catch (error) {
    console.error('❌ 获取池子列表失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取池子列表失败'
    });
  }
});

/**
 * 🚨 强制退出策略实例
 * POST /api/strategy/:instanceId/force-exit
 */
router.post('/strategy/:instanceId/force-exit', async (req, res): Promise<void> => {
  try {
    console.log('🚨 API: 强制退出策略实例');
    
    const { instanceId } = req.params;
    if (!instanceId) {
      res.status(400).json({
        success: false,
        error: '实例ID不能为空'
      });
      return;
    }
    
    const { 策略引擎: strategyEngine, web3Service } = getServices();
    if (!strategyEngine || typeof strategyEngine.获取策略状态 !== 'function') {
      res.status(503).json({
        success: false,
        error: '策略引擎服务不可用'
      });
      return;
    }
    
    // 1. 获取策略实例信息
    let 策略实例: any;
    try {
      策略实例 = await strategyEngine.获取策略状态(instanceId);
    } catch (error) {
      res.status(404).json({
        success: false,
        error: `策略实例不存在: ${instanceId}`
      });
      return;
    }
    
    // 2. 验证策略状态（只有运行中或监控中的策略才能强制退出）
    const 当前状态 = 策略实例.状态;
    const 允许强制退出的状态 = ['运行中', '监控中', '准备中', '错误'];
    
    if (!允许强制退出的状态.includes(当前状态)) {
      res.status(400).json({
        success: false,
        error: `策略状态"${当前状态}"不允许强制退出，只有运行中、监控中、准备中或错误状态的策略可以强制退出`
      });
      return;
    }
    
    // 3. 动态导入强制退出管理器并执行强制退出
    try {
      const { ForceExitManager } = await import('../business/strategy-engine/ForceExitManager.js');
      const forceExitManager = new ForceExitManager(web3Service);
      
      console.log(`[STRATEGY] 🚨 开始对策略 ${instanceId} 执行强制退出...`);
      console.log(`[STRATEGY] 📊 当前状态: ${当前状态}`);
      
      // 执行强制退出
      const 退出结果 = await forceExitManager.executeForceExit(策略实例);
      
      if (退出结果.success) {
        // 4. 更新策略状态为已退出
        try {
          策略实例.状态 = '已退出';
          策略实例.退出时间 = Date.now();
          策略实例.退出原因 = '用户主动强制退出';
          
          // 推送策略状态更新
          broadcastStrategyUpdate(instanceId, 策略实例, globalIO);
          
          console.log(`[STRATEGY] ✅ 策略 ${instanceId} 强制退出成功`);
        } catch (updateError) {
          console.warn(`⚠️ 更新策略状态失败:`, updateError);
        }
        
        res.json({
          success: true,
          message: '策略强制退出成功',
          data: {
            instanceId,
            exitDetails: 退出结果.details,
            status: '已退出',
            exitTime: Date.now(),
            exitReason: '用户主动强制退出'
          }
        });
        
      } else {
        console.error(`[STRATEGY] ❌ 策略 ${instanceId} 强制退出失败:`, 退出结果.error);
        
        res.status(500).json({
          success: false,
          error: `强制退出执行失败: ${退出结果.error}`,
          details: 退出结果.details
        });
      }
      
    } catch (importError) {
      console.error('❌ 导入强制退出管理器失败:', importError);
      res.status(500).json({
        success: false,
        error: '强制退出管理器不可用'
      });
    }
    
  } catch (error) {
    console.error('❌ 强制退出策略实例失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '强制退出策略实例失败'
    });
  }
});

// 🎯 注册盈亏统计路由
router.use('/profit-loss', profitLossRoutes);

export default router; 