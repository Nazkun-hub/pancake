import * as dotenv from 'dotenv';
import { AppConfig, OKXConfig, EVMConfig } from '../types';

// 加载环境变量
dotenv.config();

/**
 * 配置管理类
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * 从环境变量加载配置
   */
  private loadConfig(): AppConfig {
    // 环境变量现在都是可选的，支持Web界面后续配置
    console.log('🔧 正在加载配置...');
    
    // 尝试从环境变量加载，如果不存在则使用默认值
    const okxConfig: OKXConfig = {
      apiKey: process.env.OKX_API_KEY || '',
      secretKey: process.env.OKX_SECRET_KEY || '',
      apiPassphrase: process.env.OKX_API_PASSPHRASE || '',
      projectId: process.env.OKX_PROJECT_ID || '',
      baseUrl: process.env.API_BASE_URL || 'https://web3.okx.com/api/v5'
    };

    const evmConfig: EVMConfig = {
      rpcUrl: process.env.EVM_RPC_URL || 'https://bsc-dataseed.binance.org/',
      walletAddress: process.env.EVM_WALLET_ADDRESS || '',
      privateKey: process.env.EVM_PRIVATE_KEY || '',
      chainId: process.env.CHAIN_ID || '56'
    };

    // 检查是否有环境变量配置
    const hasEnvConfig = okxConfig.apiKey && okxConfig.secretKey && 
                        okxConfig.apiPassphrase && okxConfig.projectId &&
                        evmConfig.walletAddress && evmConfig.privateKey;

    if (hasEnvConfig) {
      console.log('✅ 从环境变量加载配置成功');
    } else {
      console.log('⚠️  环境变量配置不完整，将使用Web界面配置');
    }

    return {
      okx: okxConfig,
      evm: evmConfig,
      webPort: parseInt(process.env.WEB_PORT || '8000', 10)
    };
  }

  /**
   * 获取OKX配置
   */
  public getOKXConfig(): OKXConfig {
    return this.config.okx;
  }

  /**
   * 获取EVM配置
   */
  public getEVMConfig(): EVMConfig {
    return this.config.evm;
  }

  /**
   * 获取Web端口
   */
  public getWebPort(): number {
    return this.config.webPort || 8000;
  }

  /**
   * 获取完整配置
   */
  public getConfig(): AppConfig {
    return this.config;
  }

  /**
   * 从外部设置私钥 (支持外部程序传入)
   */
  public setPrivateKey(privateKey: string): void {
    this.config.evm.privateKey = privateKey;
  }

  /**
   * 从外部设置钱包地址
   */
  public setWalletAddress(address: string): void {
    this.config.evm.walletAddress = address;
  }

  /**
   * 动态设置OKX配置 (支持Web界面配置)
   */
  public setOKXConfig(okxConfig: Partial<OKXConfig>): void {
    this.config.okx = { ...this.config.okx, ...okxConfig };
  }

  /**
   * 动态设置EVM配置 (支持Web界面配置)
   */
  public setEVMConfig(evmConfig: Partial<EVMConfig>): void {
    this.config.evm = { ...this.config.evm, ...evmConfig };
  }

  /**
   * 设置完整配置 (支持Web界面一次性配置)
   */
  public setConfig(newConfig: {
    okxApiKey?: string;
    okxSecretKey?: string;
    okxPassphrase?: string;
    okxProjectId?: string;
    rpcUrl?: string;
    walletAddress?: string;
    privateKey?: string;
    chainId?: string;
  }): void {
    if (newConfig.okxApiKey) this.config.okx.apiKey = newConfig.okxApiKey;
    if (newConfig.okxSecretKey) this.config.okx.secretKey = newConfig.okxSecretKey;
    if (newConfig.okxPassphrase) this.config.okx.apiPassphrase = newConfig.okxPassphrase;
    if (newConfig.okxProjectId) this.config.okx.projectId = newConfig.okxProjectId;
    if (newConfig.rpcUrl) this.config.evm.rpcUrl = newConfig.rpcUrl;
    if (newConfig.walletAddress) this.config.evm.walletAddress = newConfig.walletAddress;
    if (newConfig.privateKey) this.config.evm.privateKey = newConfig.privateKey;
    if (newConfig.chainId) this.config.evm.chainId = newConfig.chainId;
    
    console.log('🔧 配置已更新');
  }

  /**
   * 验证配置是否完整
   */
  public validateConfig(): boolean {
    try {
      const { okx, evm } = this.config;
      
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
    } catch (error) {
      return false;
    }
  }
}

// 导出单例实例
export const config = ConfigManager.getInstance(); 