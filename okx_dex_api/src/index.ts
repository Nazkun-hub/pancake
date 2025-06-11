/**
 * OKX DEX API 主入口文件
 * 提供简洁的API供外部程序调用
 */

import { config } from './config';
import { OKXClient } from './core/okx-client';
import { NetworkManager } from './network';
import { SwapAPI } from './api/swap-api';
import { 
  SwapParams, 
  SwapResult, 
  SwapQuote, 
  ApprovalParams,
  AppConfig,
  OKXConfig,
  EVMConfig
} from './types';

/**
 * OKX DEX 交易客户端 - 集成多节点故障转移
 * 对外提供的主要接口类
 */
export class OKXDEXClient {
  private swapAPI: SwapAPI;
  private okxClient: OKXClient;
  private networkManager: NetworkManager;
  private isInitialized: boolean = false;

  constructor(customConfig?: Partial<AppConfig>) {
    // 如果提供了自定义配置，直接使用
    if (customConfig && customConfig.okx && customConfig.evm) {
      // 验证自定义配置的完整性
      if (!this.validateCustomConfig(customConfig)) {
        throw new Error('传入的配置不完整或无效');
      }

      // 使用自定义配置初始化客户端
      this.okxClient = new OKXClient(customConfig.okx);
      this.networkManager = new NetworkManager(customConfig.evm);
      this.swapAPI = new SwapAPI(this.okxClient, this.networkManager);
      
      // 自动初始化多节点系统
      this.initializeAsync();
      return;
    }

    // 如果提供了部分自定义配置，则合并配置
    if (customConfig) {
      if (customConfig.okx) {
        Object.assign(config.getOKXConfig(), customConfig.okx);
      }
      if (customConfig.evm) {
        if (customConfig.evm.privateKey) {
          config.setPrivateKey(customConfig.evm.privateKey);
        }
        if (customConfig.evm.walletAddress) {
          config.setWalletAddress(customConfig.evm.walletAddress);
        }
      }
    }

    // 验证配置
    if (!config.validateConfig()) {
      throw new Error('配置无效，请检查环境变量或传入的配置参数');
    }

    // 初始化客户端
    this.okxClient = new OKXClient(config.getOKXConfig());
    this.networkManager = new NetworkManager(config.getEVMConfig());
    this.swapAPI = new SwapAPI(this.okxClient, this.networkManager);
    
    // 自动初始化多节点系统
    this.initializeAsync();
  }

  /**
   * 异步初始化多节点系统
   */
  private async initializeAsync(): Promise<void> {
    try {
      console.log('🚀 [OKXDEXClient] 正在初始化多节点故障转移系统...');
      await this.swapAPI.initialize();
      this.isInitialized = true;
      console.log('✅ [OKXDEXClient] 多节点故障转移系统初始化完成');
    } catch (error) {
      console.warn('⚠️ [OKXDEXClient] 多节点系统初始化失败:', error);
      // 不抛出错误，允许客户端继续工作，但可能会有性能问题
    }
  }

  /**
   * 确保客户端已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      console.log('🔄 [OKXDEXClient] 等待多节点系统初始化...');
      await this.swapAPI.initialize();
      this.isInitialized = true;
    }
  }

  /**
   * 验证自定义配置
   */
  private validateCustomConfig(customConfig: Partial<AppConfig>): boolean {
    const okx = customConfig.okx;
    const evm = customConfig.evm;

    if (!okx || !evm) {
      return false;
    }

    // 验证OKX配置
    if (!okx.apiKey || !okx.secretKey || !okx.apiPassphrase || !okx.projectId) {
      return false;
    }

    // 验证EVM配置
    if (!evm.rpcUrl || !evm.walletAddress || !evm.privateKey) {
      return false;
    }

    // 验证地址格式
    if (!evm.walletAddress.startsWith('0x') || evm.walletAddress.length !== 42) {
      return false;
    }

    return true;
  }

  /**
   * 获取交易报价
   */
  public async getQuote(params: SwapParams): Promise<SwapQuote> {
    await this.ensureInitialized();
    return await this.swapAPI.getQuote(params);
  }

  /**
   * 执行代币交换 - 使用多节点故障转移
   */
  public async swap(params: SwapParams): Promise<SwapResult> {
    await this.ensureInitialized();
    return await this.swapAPI.executeSwap(params);
  }

  /**
   * 授权代币 - 使用多节点故障转移
   */
  public async approve(params: ApprovalParams): Promise<{
    needApproval: boolean;
    txHash?: string;
    orderId?: string;
  }> {
    await this.ensureInitialized();
    return await this.swapAPI.approveToken(params);
  }

  /**
   * 授权代币 (别名方法，为了兼容Web API)
   */
  public async approveToken(tokenAddress: string, amount: string): Promise<{
    needApproval: boolean;
    txHash?: string;
    orderId?: string;
  }> {
    await this.ensureInitialized();
    return await this.approve({
      tokenAddress,
      amount
    });
  }

  /**
   * 监控交易状态
   */
  public async trackTransaction(orderId: string): Promise<{
    status: string;
    txHash?: string;
    failReason?: string;
  }> {
    await this.ensureInitialized();
    return await this.swapAPI.monitorTransaction(orderId);
  }

  /**
   * 获取支持的代币列表
   */
  public async getSupportedTokens(): Promise<any[]> {
    return await this.swapAPI.getSupportedTokens();
  }

  /**
   * 获取支持的链列表
   */
  public async getSupportedChains(): Promise<any[]> {
    return await this.swapAPI.getSupportedChains();
  }

  /**
   * 获取交易历史
   */
  public async getTransactionHistory(txHash: string): Promise<any> {
    return await this.swapAPI.getTransactionHistory(txHash);
  }

  /**
   * 获取账户ETH余额 - 使用多节点故障转移
   */
  public async getETHBalance(address?: string): Promise<string> {
    await this.ensureInitialized();
    return await this.networkManager.getETHBalance(address);
  }

  /**
   * 获取代币余额 - 使用多节点故障转移
   */
  public async getTokenBalance(tokenAddress: string, walletAddress?: string): Promise<string> {
    await this.ensureInitialized();
    const balance = await this.networkManager.getTokenBalance(tokenAddress, walletAddress);
    return balance.toString();
  }

  /**
   * 检查网络连接 - 使用多节点故障转移
   */
  public async checkConnection(): Promise<boolean> {
    await this.ensureInitialized();
    return await this.networkManager.checkConnection();
  }

  /**
   * 设置私钥 (动态设置，支持外部程序传入)
   */
  public setPrivateKey(privateKey: string): void {
    config.setPrivateKey(privateKey);
    // 重新初始化网络管理器
    this.networkManager = new NetworkManager(config.getEVMConfig());
    this.swapAPI = new SwapAPI(this.okxClient, this.networkManager);
  }

  /**
   * 设置钱包地址
   */
  public setWalletAddress(address: string): void {
    config.setWalletAddress(address);
    // 重新初始化网络管理器
    this.networkManager = new NetworkManager(config.getEVMConfig());
    this.swapAPI = new SwapAPI(this.okxClient, this.networkManager);
  }

  /**
   * 获取代币信息
   */
  public async getTokenInfo(tokenAddress: string): Promise<{
    symbol: string;
    name: string;
    decimals: number;
  }> {
    return await this.networkManager.getTokenInfo(tokenAddress);
  }

  /**
   * 获取当前钱包地址
   */
  public getWalletAddress(): string {
    return this.networkManager.getEVMConfig().walletAddress;
  }

  /**
   * 验证代币地址
   */
  public isValidTokenAddress(address: string): boolean {
    return this.networkManager.isValidTokenAddress(address);
  }
}

/**
 * 创建客户端实例的快捷函数
 */
export function createOKXDEXClient(config?: Partial<AppConfig>): OKXDEXClient {
  return new OKXDEXClient(config);
}

/**
 * 基础示例函数 - 演示如何使用
 */
export async function exampleSwap(): Promise<void> {
  try {
    const client = new OKXDEXClient();

    // 检查连接
    const isConnected = await client.checkConnection();
    if (!isConnected) {
      throw new Error('网络连接失败');
    }

    // 示例：ETH转USDC
    const swapParams: SwapParams = {
      fromTokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
      toTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',   // USDC
      amount: '1000000000000000',  // 0.001 ETH
      slippage: '0.5',
      chainIndex: '1', // 以太坊主网
      chainId: '1',    // 兼容参数
      userWalletAddress: client.getWalletAddress() // 必需的钱包地址参数
    };

    // 获取报价
    console.log('获取报价中...');
    const quote = await client.getQuote(swapParams);
    console.log('报价信息:', quote);

    // 执行交换
    console.log('执行交换中...');
    const result = await client.swap(swapParams);
    console.log('交换结果:', result);

    if (result.success) {
      console.log(`交换成功! 交易哈希: ${result.txHash}`);
    } else {
      console.log(`交换失败: ${result.error}`);
    }

  } catch (error) {
    console.error('示例执行失败:', error);
  }
}

// 导出类型定义
export * from './types';

// 导出默认客户端实例 (如果环境变量齐全)
let defaultClient: OKXDEXClient | null = null;

try {
  defaultClient = new OKXDEXClient();
} catch (error) {
  // 如果环境变量不完整，defaultClient 为 null
  console.warn('无法创建默认客户端实例，请手动传入配置参数');
}

export { defaultClient };

// 命令行执行示例
if (require.main === module) {
  exampleSwap().catch(console.error);
} 