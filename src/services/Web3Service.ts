/**
 * Web3服务 - 区块链连接和钱包管理
 * 基于ethers.js v6实现BSC网络连接
 */

import { ethers } from 'ethers';
import { inject, injectable } from 'tsyringe';
import { TYPES, IService, ModuleConfig, ModuleHealth, ModuleMetrics } from '../types/interfaces.js';
import { CryptoService } from './CryptoService.js';
import { IEventBus } from '../types/interfaces.js';

export interface Web3Config {
  rpcUrls: string[];
  chainId: number;
  networkName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface WalletInfo {
  address: string;
  balance: string;
  nonce: number;
  isConnected: boolean;
}

@injectable()
export class Web3Service implements IService {
  readonly name = 'Web3Service';
  readonly version = '1.0.0';
  readonly dependencies = ['CryptoService', 'EventBus'];

  private provider: ethers.JsonRpcProvider | null = null;
  private wallet: ethers.Wallet | null = null;
  private config: Web3Config | null = null;
  private isInitialized = false;
  private metrics: ModuleMetrics;

  constructor(
    @inject(TYPES.CryptoService) private cryptoService: CryptoService,
    @inject(TYPES.EventBus) private eventBus: IEventBus
  ) {
    this.metrics = {
      uptime: 0,
      requestCount: 0,
      errorCount: 0,
      lastActivity: Date.now()
    };
  }

  /**
   * 初始化Web3服务
   */
  async initialize(config: ModuleConfig): Promise<void> {
    try {
      console.log('🌐 初始化Web3服务...');

      // 默认BSC配置 - 按稳定性排序，优先使用测试过的稳定节点
      this.config = config.web3 || {
        rpcUrls: [
          // 新增测试节点 - 测试过连接稳定，放在第一位
          'https://rpc.48.club/',
          // Binance官方节点
          'https://bsc-dataseed1.binance.org/',
          'https://bsc-dataseed2.binance.org/',
          'https://bsc-dataseed3.binance.org/',
          // 备用稳定节点
          'https://bsc.rpc.blxrbdn.com/'
        ],
        chainId: 56,
        networkName: 'BSC Mainnet',
        nativeCurrency: {
          name: 'BNB',
          symbol: 'BNB',
          decimals: 18
        }
      };

      // 初始化Provider
      await this.initializeProvider();

      this.isInitialized = true;
      console.log('✅ Web3服务初始化完成');

      // 发布初始化事件
      await this.eventBus.publish({
        type: 'Web3ServiceInitialized',
        data: { 
          chainId: this.config!.chainId,
          networkName: this.config!.networkName
        },
        timestamp: Date.now(),
        source: this.name
      });

    } catch (error) {
      console.error('❌ Web3服务初始化失败:', error);
      throw error;
    }
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Web3服务未初始化');
    }

    console.log('🚀 Web3服务已启动');
    this.metrics.uptime = Date.now();
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    if (this.wallet) {
      this.wallet = null;
    }
    if (this.provider) {
      this.provider = null;
    }
    console.log('⏹️ Web3服务已停止');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ModuleHealth> {
    try {
      if (!this.provider) {
        return {
          status: 'error',
          message: 'Provider未初始化',
          timestamp: Date.now()
        };
      }

      // 检查网络连接
      const network = await this.provider.getNetwork();
      if (Number(network.chainId) !== this.config!.chainId) {
        return {
          status: 'warning',
          message: `网络ID不匹配: 期望${this.config!.chainId}, 实际${network.chainId}`,
          timestamp: Date.now()
        };
      }

      return {
        status: 'healthy',
        message: '服务正常',
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : '健康检查失败',
        timestamp: Date.now()
      };
    }
  }

  /**
   * 获取指标
   */
  getMetrics(): ModuleMetrics {
    return {
      ...this.metrics,
      uptime: this.metrics.uptime ? Date.now() - this.metrics.uptime : 0
    };
  }

  /**
   * 执行操作
   */
  async execute(params: any): Promise<any> {
    this.metrics.requestCount++;
    this.metrics.lastActivity = Date.now();

    try {
      const { operation, ...operationParams } = params;

      switch (operation) {
        case 'connectWallet':
          return await this.connectWallet();
        case 'getWalletInfo':
          return await this.getWalletInfo();
        case 'getBalance':
          return await this.getBalance(operationParams.address);
        case 'getTokenBalance':
          return await this.getTokenBalance(operationParams.address, operationParams.tokenAddress);
        case 'approveToken':
          return await this.approveToken(operationParams.tokenAddress, operationParams.spender, operationParams.amount);
        case 'getGasPrice':
          return await this.getGasPrice();
        case 'getBlockNumber':
          return await this.getBlockNumber();
        default:
          throw new Error(`不支持的操作: ${operation}`);
      }
    } catch (error) {
      this.metrics.errorCount++;
      throw error;
    }
  }

  /**
   * 验证参数
   */
  validate(params: any): boolean {
    return params && typeof params.operation === 'string';
  }

  /**
   * 初始化Provider - 改进版本，增加超时控制和重试机制
   */
  private async initializeProvider(): Promise<void> {
    try {
      console.log('🔗 连接BSC网络...');
      
      let lastError: Error | null = null;
      
      // 尝试连接到RPC节点
      for (let i = 0; i < this.config!.rpcUrls.length; i++) {
        const rpcUrl = this.config!.rpcUrls[i];
        
        try {
          console.log(`🔄 尝试连接节点 ${i + 1}/${this.config!.rpcUrls.length}: ${rpcUrl}`);
          
          // 创建带超时控制的Provider
          this.provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
            staticNetwork: true,
            polling: true,
            pollingInterval: 4000,
            batchMaxCount: 100,
            batchStallTime: 50
          });
          
          // 设置超时测试连接
          const connectionPromise = this.testConnection(this.provider);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('连接超时')), 8000)
          );
          
          const network = await Promise.race([connectionPromise, timeoutPromise]);
          
          console.log(`✅ 连接成功: ${rpcUrl}`);
          console.log(`📡 网络: ${network.name} (Chain ID: ${network.chainId})`);
          
          return; // 连接成功，退出函数
          
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(`⚠️ RPC连接失败 ${i + 1}/${this.config!.rpcUrls.length}: ${rpcUrl}`, {
            error: lastError.message,
            code: (lastError as any).code
          });
          
          // 清理失败的provider
          this.provider = null;
          
          // 如果不是最后一个节点，等待一下再尝试下一个
          if (i < this.config!.rpcUrls.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      // 所有节点都失败了
      throw new Error(`无法连接到任何BSC RPC节点 (尝试了${this.config!.rpcUrls.length}个节点)。最后错误: ${lastError?.message}`);

    } catch (error) {
      console.error('❌ Provider初始化失败:', error);
      throw error;
    }
  }

  /**
   * 测试连接是否正常
   */
  private async testConnection(provider: ethers.JsonRpcProvider): Promise<any> {
    // 执行多个测试以确保连接稳定
    const [network, blockNumber] = await Promise.all([
      provider.getNetwork(),
      provider.getBlockNumber()
    ]);
    
    // 验证链ID是否正确
    if (Number(network.chainId) !== this.config!.chainId) {
      throw new Error(`链ID不匹配: 期望${this.config!.chainId}, 实际${network.chainId}`);
    }
    
    // 验证能获取到最新区块
    if (!blockNumber || blockNumber <= 0) {
      throw new Error('无法获取有效的区块号');
    }
    
    return network;
  }

  /**
   * 连接钱包
   */
  async connectWallet(): Promise<WalletInfo> {
    try {
      console.log('🔐 连接钱包...');

      if (!this.cryptoService.isWalletUnlocked()) {
        throw new Error('钱包未解锁，请先解锁钱包');
      }

      const privateKey = this.cryptoService.getCurrentPrivateKey();
      if (!privateKey) {
        throw new Error('无法获取私钥');
      }

      if (!this.provider) {
        throw new Error('Provider未初始化');
      }

      // 创建钱包实例
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      
      const walletInfo = await this.getWalletInfo();
      
      console.log('✅ 钱包连接成功:', walletInfo.address);

      // 发布钱包连接事件
      await this.eventBus.publish({
        type: 'WalletConnected',
        data: walletInfo,
        timestamp: Date.now(),
        source: this.name
      });

      return walletInfo;

    } catch (error) {
      console.error('❌ 钱包连接失败:', error);
      throw error;
    }
  }

  /**
   * 获取钱包信息
   */
  async getWalletInfo(): Promise<WalletInfo> {
    if (!this.wallet) {
      throw new Error('钱包未连接');
    }

    try {
      const [balance, nonce] = await Promise.all([
        this.provider!.getBalance(this.wallet.address),
        this.provider!.getTransactionCount(this.wallet.address)
      ]);

      return {
        address: this.wallet.address,
        balance: ethers.formatEther(balance),
        nonce,
        isConnected: true
      };
    } catch (error) {
      console.error('❌ 获取钱包信息失败:', error);
      throw error;
    }
  }

  /**
   * 获取地址余额
   */
  async getBalance(address: string): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider未初始化');
    }

    try {
      const balance = await this.provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('❌ 获取余额失败:', error);
      throw error;
    }
  }

  /**
   * 获取当前Gas价格
   */
  async getGasPrice(): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider未初始化');
    }

    try {
      const gasPrice = await this.provider.getFeeData();
      return ethers.formatUnits(gasPrice.gasPrice || 0, 'gwei');
    } catch (error) {
      console.error('❌ 获取Gas价格失败:', error);
      throw error;
    }
  }

  /**
   * 获取当前区块号
   */
  async getBlockNumber(): Promise<number> {
    if (!this.provider) {
      throw new Error('Provider未初始化');
    }

    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      console.error('❌ 获取区块号失败:', error);
      throw error;
    }
  }

  /**
   * 获取代币余额
   */
  async getTokenBalance(address: string, tokenAddress: string): Promise<{raw: string, formatted: string}> {
    if (!this.provider) {
      throw new Error('Provider未初始化');
    }

    try {
      console.log(`🔍 获取代币余额: ${tokenAddress} for ${address}`);
      
      // ERC20代币的balanceOf方法ABI
      const erc20Abi = [
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)'
      ];
      
      // 创建合约实例
      const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, this.provider);
      
      console.log(`📞 调用合约方法...`);
      
      // 分别获取信息，便于错误定位
      let balance: bigint;
      let decimals: number;
      
      try {
        console.log(`   正在获取余额...`);
        balance = await tokenContract.balanceOf(address);
        console.log(`   余额获取成功: ${balance.toString()}`);
      } catch (balanceError) {
        console.error(`   ❌ 余额获取失败:`, balanceError);
        throw new Error(`获取余额失败: ${balanceError instanceof Error ? balanceError.message : String(balanceError)}`);
      }
      
      try {
        console.log(`   正在获取decimals...`);
        decimals = await tokenContract.decimals();
        console.log(`   decimals获取成功: ${decimals}`);
      } catch (decimalsError) {
        console.error(`   ❌ decimals获取失败:`, decimalsError);
        console.warn(`   ⚠️ 使用默认decimals: 18`);
        decimals = 18; // 使用默认值
      }
      
      // 转换为可读格式
      const formatted = ethers.formatUnits(balance, decimals);
      
      console.log(`✅ 代币余额获取完成: ${formatted}`);
      
      return {
        raw: balance.toString(),
        formatted: formatted
      };
    } catch (error) {
      console.error('❌ 获取代币余额失败:', error);
      
      // 增强错误信息
      if (error instanceof Error) {
        if (error.message.includes('could not decode result data')) {
          throw new Error(`代币合约调用失败，可能是无效的代币地址或网络问题: ${tokenAddress}`);
        }
        if (error.message.includes('network')) {
          throw new Error(`网络连接问题: ${error.message}`);
        }
      }
      
      throw error;
    }
  }

  /**
   * 授权代币
   */
  async approveToken(tokenAddress: string, spender: string, amount: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('钱包未连接');
    }

    try {
      // ERC20代币的approve方法ABI
      const erc20Abi = [
        'function approve(address spender, uint256 amount) returns (bool)',
        'function decimals() view returns (uint8)'
      ];
      
      // 创建合约实例
      const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, this.wallet);
      
      // 获取代币小数位数
      const decimals = await tokenContract.decimals();
      
      // 转换金额为wei格式
      const amountWei = ethers.parseUnits(amount, decimals);
      
      console.log(`🔐 授权代币: ${amount} -> ${spender}`);
      
      // 执行授权
      const tx = await tokenContract.approve(spender, amountWei);
      console.log(`🔄 授权交易已发送: ${tx.hash}`);
      
      // 等待交易确认
      const receipt = await tx.wait();
      console.log(`✅ 授权交易已确认: ${receipt.hash}`);
      
      return receipt.hash;
    } catch (error) {
      console.error('❌ 代币授权失败:', error);
      throw error;
    }
  }

  /**
   * 断开钱包连接
   */
  disconnectWallet(): void {
    if (this.wallet) {
      this.wallet = null;
      console.log('🔌 钱包已断开连接');
    }
  }

  /**
   * 检查钱包是否已连接
   */
  isWalletConnected(): boolean {
    return this.wallet !== null;
  }

  /**
   * 获取当前连接的网络信息
   */
  getNetworkInfo(): Web3Config | null {
    return this.config;
  }

  /**
   * 获取Provider实例
   */
  getProvider(): ethers.JsonRpcProvider | null {
    return this.provider;
  }

  /**
   * 获取Wallet实例
   */
  getWallet(): ethers.Wallet | null {
    return this.wallet;
  }
} 