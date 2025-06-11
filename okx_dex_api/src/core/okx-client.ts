import axios, { AxiosInstance } from 'axios';
import { AuthManager } from '../auth';
import { OKXGasService } from '../services/gas-service';
import { 
  OKXConfig, 
  SwapQuote, 
  SwapTransaction, 
  APIResponse, 
  TransactionTrackResult,
  TransactionStatus,
  SwapParams,
  ApprovalParams
} from '../types';

/**
 * OKX DEX API 客户端
 * 专注于BSC链的报价和交易数据获取
 */
export class OKXClient {
  private axios: AxiosInstance;
  private auth: AuthManager;
  private gasService: OKXGasService;
  private baseUrl: string;

  constructor(config: OKXConfig) {
    // 使用测试成功的API端点
    this.baseUrl = config.baseUrl || 'https://www.okx.com/api/v5';
    this.auth = new AuthManager(config);
    this.gasService = new OKXGasService(config);
    
    this.axios = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
  }

  /**
   * 获取支持的链列表
   */
  public async getSupportedChains(): Promise<any[]> {
    const path = '/dex/aggregator/supported/chain';
    const fullPath = '/api/v5' + path;
    const timestamp = this.auth.generateTimestamp();
    const headers = this.auth.getHeaders(timestamp, 'GET', fullPath);

    const response = await this.axios.get(path, { headers });
    return this.handleResponse(response.data);
  }

  /**
   * 获取代币列表
   */
  public async getTokens(chainId: string): Promise<any[]> {
    const path = '/dex/aggregator/all-tokens';
    const fullPath = '/api/v5' + path;
    const params = { chainId };
    const queryString = '?' + new URLSearchParams(params).toString();
    
    const timestamp = this.auth.generateTimestamp();
    const headers = this.auth.getHeaders(timestamp, 'GET', fullPath, queryString);

    const response = await this.axios.get(path, { params, headers });
    return this.handleResponse(response.data);
  }

  /**
   * 获取交易报价 - 使用测试成功的实现
   */
  public async getQuote(params: SwapParams): Promise<SwapQuote> {
    const path = '/dex/aggregator/swap';
    const fullPath = '/api/v5' + path;
    
    // 确保使用BSC链ID
    const chainId = params.chainId || params.chainIndex || '56';
    
    const queryParams = {
      chainId: chainId,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      userWalletAddress: params.userWalletAddress,
      slippage: params.slippage || '0.5'
    };
    
    const cleanParams: Record<string, string> = {};
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== undefined) {
        cleanParams[key] = value;
      }
    });
    
    const queryString = new URLSearchParams(cleanParams).toString();
    const timestamp = this.auth.generateTimestamp();
    const headers = this.auth.getHeaders(timestamp, 'GET', fullPath, queryString ? '?' + queryString : '');

    console.log('🔍 OKX报价请求详情:');
    console.log(`链ID: ${chainId} (BSC)`);
    console.log(`交易对: ${queryParams.fromTokenAddress} → ${queryParams.toTokenAddress}`);
    console.log(`数量: ${queryParams.amount}`);
    console.log(`滑点: ${queryParams.slippage}`);

    const response = await this.axios.get(path, { 
      params: cleanParams, 
      headers 
    });
    
    const data = this.handleResponse(response.data);
    console.log('✅ 报价获取成功');
    return data[0] as SwapQuote;
  }

  /**
   * 获取授权交易数据
   */
  public async getApprovalTransaction(params: ApprovalParams & { chainId: string }): Promise<any> {
    const path = '/dex/aggregator/approve-transaction';
    const fullPath = '/api/v5' + path;
    
    // 确保使用BSC链ID
    const chainId = params.chainId || '56';
    
    const requestParams = {
      chainId: chainId,
      tokenContractAddress: params.tokenAddress,
      approveAmount: params.amount
    };
    
    const queryString = '?' + new URLSearchParams(requestParams).toString();
    const timestamp = this.auth.generateTimestamp();
    const headers = this.auth.getHeaders(timestamp, 'GET', fullPath, queryString);

    console.log('🔍 获取授权交易数据:', requestParams);

    const response = await this.axios.get(path, { 
      params: requestParams, 
      headers 
    });
    
    const data = this.handleResponse(response.data);
    console.log('✅ 授权交易数据获取成功');
    return data[0];
  }

  /**
   * 获取交换交易数据 - 使用测试成功的实现
   */
  public async getSwapTransaction(params: SwapParams): Promise<{
    routerResult: any;
    tx: SwapTransaction;
  }> {
    const path = '/dex/aggregator/swap';
    const fullPath = '/api/v5' + path;
    
    // 🔧 新增：代币地址验证和保护
    const validateTokenAddress = (address: string, paramName: string): string => {
      if (!address) {
        throw new Error(`[OKXClient] ${paramName} 不能为空`);
      }
      
      // 确保地址为字符串格式
      const addrStr = String(address).toLowerCase();
      
      // 检查是否为有效的以太坊地址格式
      if (!addrStr.startsWith('0x') || addrStr.length !== 42) {
        throw new Error(`[OKXClient] ${paramName} 格式无效: ${address}。必须为42位十六进制地址`);
      }
      
      // 检查是否被错误转换为BigInt（巨大数字）
      if (address.toString().length > 50) {
        throw new Error(`[OKXClient] ${paramName} 似乎被错误转换为BigInt: ${address}`);
      }
      
      return addrStr;
    };
    
    // 验证代币地址
    const validatedFromToken = validateTokenAddress(params.fromTokenAddress, 'fromTokenAddress');
    const validatedToToken = validateTokenAddress(params.toTokenAddress, 'toTokenAddress');
    
    console.log('🔍 [OKXClient] 地址验证通过:');
    console.log(`  fromTokenAddress: ${validatedFromToken}`);
    console.log(`  toTokenAddress: ${validatedToToken}`);
    
    // 确保使用BSC链ID
    const chainId = params.chainId || params.chainIndex || '56';
    
    const queryParams = {
      chainId: chainId,
      fromTokenAddress: validatedFromToken,  // 🔧 使用验证后的地址
      toTokenAddress: validatedToToken,      // 🔧 使用验证后的地址
      amount: params.amount,
      userWalletAddress: params.userWalletAddress,
      slippage: params.slippage || '0.5'
    };
    
    const cleanParams: Record<string, string> = {};
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== undefined) {
        cleanParams[key] = value;
      }
    });
    
    const queryString = '?' + new URLSearchParams(cleanParams).toString();
    const timestamp = this.auth.generateTimestamp();
    const headers = this.auth.getHeaders(timestamp, 'GET', fullPath, queryString);

    console.log('🔍 获取交换交易数据:', queryParams);

    const response = await this.axios.get(path, { 
      params: cleanParams, 
      headers 
    });
    
    const data = this.handleResponse(response.data);
    console.log('✅ 交换交易数据获取成功');
    
    const responseData = data[0] as any;
    return {
      routerResult: responseData.routerResult,
      tx: responseData.tx
    };
  }

  /**
   * 获取Gas限制 - 委托给GasService处理
   */
  public async getGasLimit(
    fromAddress: string,
    toAddress: string,
    txAmount: string = '0',
    inputData: string = '',
    chainId: string = '56'
  ): Promise<string> {
    console.log('🔍 [OKXClient] 委托GasService获取Gas Limit...');
    
    const result = await this.gasService.getGasLimit({
      fromAddress,
      toAddress,
      txAmount,
      inputData,
      chainId
    });
    
    if (result.code === '0' && result.data.length > 0) {
      const gasLimit = result.data[0].gasLimit;
      console.log(`✅ [OKXClient] Gas Limit获取成功: ${gasLimit}`);
      return gasLimit;
    } else {
      console.warn(`⚠️ [OKXClient] Gas Limit API失败: ${result.msg}`);
      // 返回默认值
      return '21000';
    }
  }

  /**
   * 获取Gas价格 - 委托给GasService处理
   */
  public async getGasPrice(chainId: string = '56'): Promise<{
    min: string;
    normal: string;
    max: string;
    supportEip1559: boolean;
    eip1559Protocol?: any;
  }> {
    console.log('🔍 [OKXClient] 委托GasService获取Gas Price...');
    
    const result = await this.gasService.getGasPrice(chainId);
    
    if (result.code === '0' && result.data.length > 0) {
      const gasData = result.data[0];
      console.log(`✅ [OKXClient] Gas Price获取成功 - 标准: ${parseInt(gasData.normal)/1e9} Gwei`);
      
      return {
        min: gasData.min,
        normal: gasData.normal,
        max: gasData.max,
        supportEip1559: gasData.supportEip1559 || false,
        eip1559Protocol: gasData.eip1559Protocol
      };
    } else {
      console.warn(`⚠️ [OKXClient] Gas Price API失败: ${result.msg}`);
      
      // 返回默认值
      return {
        min: '80000000',      // 0.08 Gwei
        normal: '100000000',  // 0.1 Gwei  
        max: '150000000',     // 0.15 Gwei
        supportEip1559: false
      };
    }
  }

  /**
   * 获取完整Gas信息 - 新增便捷方法
   */
  public async getGasInfo(params: {
    fromAddress: string;
    toAddress: string;
    txAmount?: string;
    inputData?: string;
    chainId?: string;
  }): Promise<{
    gasPrice: {
      min: string;
      normal: string;
      max: string;
      supportEip1559: boolean;
      eip1559Protocol?: any;
    };
    gasLimit: string;
    success: boolean;
    errors: string[];
  }> {
    console.log('🔍 [OKXClient] 获取完整Gas信息...');
    
    const result = await this.gasService.getGasInfo(params);
    const errors: string[] = [];
    
    // 处理Gas Price结果
    let gasPrice = {
      min: '80000000',      // 0.08 Gwei
      normal: '100000000',  // 0.1 Gwei  
      max: '150000000',     // 0.15 Gwei
      supportEip1559: false,
      eip1559Protocol: undefined as any
    };
    
    if (result.gasPrice.code === '0' && result.gasPrice.data.length > 0) {
      const priceData = result.gasPrice.data[0];
      gasPrice = {
        min: priceData.min,
        normal: priceData.normal,
        max: priceData.max,
        supportEip1559: priceData.supportEip1559 || false,
        eip1559Protocol: priceData.eip1559Protocol
      };
    } else {
      errors.push(`Gas Price: ${result.gasPrice.msg}`);
    }
    
    // 处理Gas Limit结果
    let gasLimit = '21000';
    if (result.gasLimit.code === '0' && result.gasLimit.data.length > 0) {
      gasLimit = result.gasLimit.data[0].gasLimit;
    } else {
      errors.push(`Gas Limit: ${result.gasLimit.msg}`);
    }
    
    const success = result.gasPrice.code === '0' && result.gasLimit.code === '0';
    
    if (success) {
      console.log('✅ [OKXClient] 完整Gas信息获取成功');
    } else {
      console.warn('⚠️ [OKXClient] 部分Gas API失败，使用默认值');
      console.log('   错误详情:', errors);
    }
    
    return {
      gasPrice,
      gasLimit,
      success,
      errors
    };
  }

  /**
   * 监控交易状态 - 保留但标记可能需要替换
   * 如果此方法有问题，将被Web3方式替换
   */
  public async trackTransaction(
    orderId: string,
    chainId: string = '56',
    address: string
  ): Promise<TransactionTrackResult> {
    try {
      const path = '/dex/pre-transaction/track-transaction';
      const fullPath = '/api/v5' + path;
      const body = {
        orderId,
        chainIndex: chainId,
        address
      };

      const timestamp = this.auth.generateTimestamp();
      const bodyString = JSON.stringify(body);
      const headers = this.auth.getHeaders(timestamp, 'POST', fullPath, bodyString);

      const response = await this.axios.post(path, body, { headers });
      const data = this.handleResponse(response.data);
      
      return data[0] as TransactionTrackResult;
    } catch (error) {
      // 如果OKX监控失败，标记需要使用Web3替换
      console.warn('⚠️ OKX交易监控失败，建议使用Web3方式:', error);
      throw new Error('OKX交易监控不可用，需要使用Web3方式替换');
    }
  }

  /**
   * 获取交易历史 - 保留但简化
   */
  public async getTransactionHistory(
    chainId: string = '56',
    txHash: string
  ): Promise<any> {
    try {
      const path = '/dex/transaction/get-transaction-history';
      const fullPath = '/api/v5' + path;
      const params = {
        chainIndex: chainId,
        txHashList: [txHash]
      };

      const timestamp = this.auth.generateTimestamp();
      const bodyString = JSON.stringify(params);
      const headers = this.auth.getHeaders(timestamp, 'POST', fullPath, bodyString);

      const response = await this.axios.post(path, params, { headers });
      const data = this.handleResponse(response.data);
      
      return data[0];
    } catch (error) {
      console.warn('⚠️ OKX交易历史查询失败:', error);
      return null;
    }
  }

  /**
   * 获取Gas服务实例 - 便于外部直接访问
   */
  public getGasService(): OKXGasService {
    return this.gasService;
  }

  /**
   * 错误处理 - 保持不变
   */
  private handleResponse<T>(response: APIResponse<T>): T[] {
    if (response.code !== '0') {
      throw new Error(`OKX API错误: ${response.msg} (代码: ${response.code})`);
    }
    return response.data;
  }
} 