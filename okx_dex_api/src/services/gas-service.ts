import axios, { AxiosInstance } from 'axios';
import { AuthManager } from '../auth';
import { OKXConfig, APIResponse } from '../types';

/**
 * Gas限制响应数据
 */
interface GasLimitData {
  gasLimit: string;
}

/**
 * Gas价格响应数据
 */
interface GasPriceData {
  min: string;
  normal: string;
  max: string;
  supportEip1559?: boolean;
  eip1559Protocol?: any;
}

/**
 * OKX Gas服务 - 专门处理Gas相关的API调用
 * 获取Gas价格 + 智能默认Gas限制
 */
export class OKXGasService {
  private axios: AxiosInstance;
  private auth: AuthManager;
  private baseUrl: string;

  constructor(config: OKXConfig) {
    this.baseUrl = config.baseUrl || 'https://web3.okx.com/api/v5';
    this.auth = new AuthManager(config);
    
    this.axios = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
  }

  /**
   * 获取Gas限制 - 直接使用智能默认值
   * 简单、可靠、快速
   */
  public async getGasLimit(params: {
    fromAddress: string;
    toAddress: string;
    txAmount?: string;
    inputData?: string;
    chainId?: string;
  }): Promise<APIResponse<GasLimitData>> {
    const gasLimit = this.getDefaultGasLimit(params.inputData);
    console.log(`⚡ 使用智能默认Gas限制: ${gasLimit}`);
    
    return {
      code: '0',
      msg: 'smart default gas limit',
      data: [{ gasLimit }]
    };
  }

  /**
   * 获取Gas价格 - 直接调用OKX API
   * GET https://web3.okx.com/api/v5/dex/pre-transaction/gas-price
   */
  public async getGasPrice(chainId: string = '56'): Promise<APIResponse<GasPriceData>> {
    try {
      const endpoint = '/dex/pre-transaction/gas-price';
      const fullPath = '/api/v5' + endpoint;
      const queryString = `?chainIndex=${chainId}`;
      
      console.log('🔧 Gas Price API 请求参数:', { chainIndex: chainId });

      const timestamp = this.auth.generateTimestamp();
      const headers = this.auth.getHeaders(timestamp, 'GET', fullPath + queryString, '');
      
      const response = await this.axios.get(`${endpoint}${queryString}`, { headers });
      
      return {
        code: response.data.code,
        msg: response.data.msg,
        data: response.data.data
      };
    } catch (error: any) {
      console.error('❌ Gas Price API 调用失败:');
      if (error.response) {
        console.error('   HTTP状态:', error.response.status);
        console.error('   响应数据:', JSON.stringify(error.response.data, null, 2));
        console.error('   响应头:', error.response.headers);
      } else {
        console.error('   错误信息:', error.message);
      }
      return {
        code: '1',
        msg: error.response?.data?.msg || error.message,
        data: []
      };
    }
  }

  /**
   * 获取完整的Gas信息（价格+限制）
   * 简化版本：只调用gas price API + 智能默认gas limit
   */
  public async getGasInfo(params: {
    fromAddress: string;
    toAddress: string;
    txAmount?: string;
    inputData?: string;
    chainId?: string;
  }): Promise<{
    gasPrice: APIResponse<GasPriceData>;
    gasLimit: APIResponse<GasLimitData>;
  }> {
    const chainId = params.chainId || '56';
    
    // 并行获取（只有gas price需要网络调用）
    const [gasPrice, gasLimit] = await Promise.all([
      this.getGasPrice(chainId),
      this.getGasLimit(params)
    ]);

    return { gasPrice, gasLimit };
  }

  /**
   * 获取默认Gas限制 - 修复SafeERC20错误
   */
  private getDefaultGasLimit(inputData?: string): string {
    if (inputData && inputData.length > 200) {
      // 复杂交易（如DEX聚合器）- 提高到500k
      return '500000';
    } else if (inputData && inputData.length > 10) {
      // 普通合约调用 - 提高到250k
      return '250000';
    } else {
      // 简单交易（如代币转账）- 提高到100k
      return '100000';
    }
  }

  /**
   * 获取默认Gas价格 - 基于BSC网络实际情况
   */
  private getDefaultGasPrice() {
    return {
      min: '100000000',     // 0.1 Gwei - BSC网络最低合理值
      normal: '100000000', // 0.1 Gwei - BSC当前标准值  
      max: '150000000',    // 0.15 Gwei - BSC快速确认值
      supportEip1559: false
    };
  }

  /**
   * 统一的响应处理
   */
  private handleResponse<T>(response: APIResponse<T>): T[] {
    if (response.code !== '0') {
      throw new Error(`OKX API错误: ${response.msg} (代码: ${response.code})`);
    }
    return response.data;
  }
}

/**
 * 静态工厂方法 - 便于在其他地方快速创建Gas服务实例
 */
export function createOKXGasService(config: OKXConfig): OKXGasService {
  return new OKXGasService(config);
} 