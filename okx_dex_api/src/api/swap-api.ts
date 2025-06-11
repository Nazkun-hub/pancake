import { OKXClient } from '../core/okx-client';
import { NetworkManager } from '../network';
import { 
  SwapParams, 
  SwapResult, 
  ApprovalParams, 
  TransactionStatus,
  SwapQuote,
  SwapTransaction 
} from '../types';

/**
 * 高级交换API - 使用Web3直接广播的BSC专用实现 + 多节点故障转移
 */
export class SwapAPI {
  private okxClient: OKXClient;
  private networkManager: NetworkManager;
  private chainId: string;

  // BSC链上的OKX DEX路由合约地址
  private readonly OKX_ROUTER_ADDRESS = '0x9b9efa5Efa731EA9Bbb0369E91fA17Abf249CFD4';

  /**
   * 获取本地时间戳字符串
   */
  private getLocalTimeString(): string {
    const now = new Date();
    return now.getFullYear() + '-' + 
      String(now.getMonth() + 1).padStart(2, '0') + '-' + 
      String(now.getDate()).padStart(2, '0') + ' ' + 
      String(now.getHours()).padStart(2, '0') + ':' + 
      String(now.getMinutes()).padStart(2, '0') + ':' + 
      String(now.getSeconds()).padStart(2, '0');
  }

  constructor(okxClient: OKXClient, networkManager: NetworkManager) {
    this.okxClient = okxClient;
    this.networkManager = networkManager;
    this.chainId = this.networkManager.getChainId() || '56'; // 默认BSC
  }

  /**
   * 初始化 SwapAPI - 确保网络管理器已初始化
   */
  async initialize(): Promise<void> {
    await this.networkManager.initialize();
    console.log('✅ SwapAPI 初始化完成，多节点故障转移已启用');
  }

  /**
   * 获取交易报价
   * @param params 交易参数
   * @returns 交易报价信息
   */
  public async getQuote(params: SwapParams): Promise<SwapQuote> {
    try {
      const quoteParams = {
        ...params,
        chainIndex: '56', // 强制使用BSC链
        chainId: '56',
        userWalletAddress: params.userWalletAddress || this.networkManager.getEVMConfig().walletAddress,
        slippage: params.slippage || '0.5'
      };

      console.log('🔍 获取BSC链报价...');
      const quote = await this.okxClient.getQuote(quoteParams);
      
      // 添加DEX路由信息（如果可用）
      if ((quote as any).routerResult) {
        console.log('📊 DEX路由信息:');
        const routerResult = (quote as any).routerResult;
        if (routerResult.dexRouterList) {
          routerResult.dexRouterList.forEach((route: any, index: number) => {
            console.log(`路由 ${index + 1}: ${route.percentage || 100}%`);
            if (route.subRouterList) {
              route.subRouterList.forEach((subRoute: any) => {
                if (subRoute.dexProtocol) {
                  subRoute.dexProtocol.forEach((protocol: any) => {
                    console.log(`  └─ ${protocol.dexName} (${protocol.dexAddress})`);
                  });
                }
              });
            }
          });
        }
      }
      
      return quote;
    } catch (error) {
      throw new Error(`获取报价失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 检查并执行代币授权 - 使用多节点故障转移和重试机制
   * @param params 授权参数
   * @returns 是否需要授权以及授权结果
   */
  public async approveToken(params: ApprovalParams): Promise<{
    needApproval: boolean;
    txHash?: string;
    orderId?: string;
  }> {
    return await this.retryWithFailover(
      async () => {
        // BNB不需要授权
        if (params.tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
          return { needApproval: false };
        }

        const walletAddress = this.networkManager.getEVMConfig().walletAddress;

        console.log('🔍 检查代币授权状态...');

        // 检查当前授权额度 - 使用故障转移
        const currentAllowance = await this.networkManager.checkAllowance(
          params.tokenAddress,
          this.OKX_ROUTER_ADDRESS,
          walletAddress
        );

        const requiredAmount = BigInt(params.amount);

        if (currentAllowance >= requiredAmount) {
          console.log('✅ 代币已充分授权');
          return { needApproval: false };
        }

        console.log('⚠️ 需要授权代币，获取授权交易数据...');

        // 获取授权交易数据
        const approvalData = await this.okxClient.getApprovalTransaction({
          ...params,
          chainId: '56'
        });

        // 构建授权交易
        console.log('⛽ 获取OKX动态Gas设置...');
        const [okxGasData, okxGasLimit, nonce] = await Promise.all([
          this.okxClient.getGasPrice('56'),
          this.okxClient.getGasLimit(
            walletAddress,
            params.tokenAddress,
            '0',
            approvalData.data,
            '56'
          ),
          this.networkManager.getNonce()
        ]);

        const txObject = {
          from: walletAddress,
          to: params.tokenAddress,
          data: approvalData.data,
          value: '0',
          gas: okxGasLimit,
          gasPrice: okxGasData.max,
          nonce
        };

        console.log(`📊 Gas设置 - Price: ${parseInt(okxGasData.max)/1e9}Gwei, Limit: ${okxGasLimit}`);
        console.log('📝 签名授权交易...');

        // 使用多节点故障转移发送交易
        const txHash = await this.networkManager.signAndSendTransaction(txObject);

        console.log(`✅ 授权交易成功: ${txHash}`);

        return {
          needApproval: true,
          txHash: txHash,
          orderId: txHash
        };
      },
      '代币授权',
      3, // 最大重试3次
      2000 // 2秒延迟
    );
  }

  /**
   * 执行代币交换 - 使用多节点故障转移和重试机制
   * @param params 交换参数
   * @returns 交换结果
   */
  public async executeSwap(params: SwapParams): Promise<SwapResult> {
    return await this.retryWithFailover(
      async () => {
        const walletAddress = this.networkManager.getEVMConfig().walletAddress;
        
        console.log('🚀 开始执行BSC链代币交换...');
        
        // 显示当前使用的RPC节点信息
        const currentNode = this.networkManager.getCurrentRPCNode();
        if (currentNode) {
          console.log(`🌐 [交易] 使用RPC节点: ${currentNode.name}`);
          console.log(`🔗 [交易] 节点地址: ${currentNode.url}`);
        }

        // 🔧 新增：代币地址验证和保护
        const validateAndNormalizeAddress = (address: string, paramName: string): string => {
          if (!address) {
            throw new Error(`${paramName} 不能为空`);
          }
          
          // 确保地址为字符串格式
          const addrStr = String(address).toLowerCase();
          
          // 检查是否为有效的以太坊地址格式
          if (!addrStr.startsWith('0x') || addrStr.length !== 42) {
            throw new Error(`${paramName} 格式无效: ${address}。必须为42位十六进制地址`);
          }
          
          // 检查是否被错误转换为BigInt（巨大数字）
          if (address.toString().length > 50) {
            throw new Error(`${paramName} 似乎被错误转换为BigInt: ${address}`);
          }
          
          return addrStr;
        };
        
        // 验证和规范化代币地址
        const normalizedFromToken = validateAndNormalizeAddress(params.fromTokenAddress, 'fromTokenAddress');
        const normalizedToToken = validateAndNormalizeAddress(params.toTokenAddress, 'toTokenAddress');
        
        console.log('🔍 地址验证通过:');
        console.log(`  fromTokenAddress: ${normalizedFromToken}`);
        console.log(`  toTokenAddress: ${normalizedToToken}`);

        // 1. 强制执行无限授权（针为非BNB代币）
        if (normalizedFromToken !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
          console.log('🔐 强制执行代币无限授权...');
          await this.forceUnlimitedApproval(normalizedFromToken);
        }

        // 2. 获取交换数据
        const swapParams = {
          ...params,
          fromTokenAddress: normalizedFromToken,  // 🔧 使用验证后的地址
          toTokenAddress: normalizedToToken,      // 🔧 使用验证后的地址
          chainIndex: '56', // 强制BSC链
          chainId: '56',
          userWalletAddress: params.userWalletAddress || walletAddress,
          slippage: params.slippage || '0.5'
        };

        console.log('📊 获取交换交易数据...');
        console.log('🔍 最终交换参数:', {
          fromTokenAddress: swapParams.fromTokenAddress,
          toTokenAddress: swapParams.toTokenAddress,
          amount: swapParams.amount,
          slippage: swapParams.slippage
        });
        
        const swapData = await this.okxClient.getSwapTransaction(swapParams);
        const { routerResult: quote, tx: txData } = swapData;

        // 3. 构建交换交易
        console.log('⛽ 获取OKX动态Gas设置...');
        const [okxGasData, okxGasLimit, nonce] = await Promise.all([
          this.okxClient.getGasPrice('56'),
          this.okxClient.getGasLimit(
            walletAddress,
            txData.to,
            txData.value || '0',
            txData.data,
            '56'
          ),
          this.networkManager.getNonce()
        ]);

        const txObject = {
          from: walletAddress,
          to: txData.to,
          data: txData.data,
          value: txData.value || '0',
          gas: okxGasLimit,
          gasPrice: okxGasData.max,
          nonce
        };

        console.log(`📊 Gas设置 - Price: ${parseInt(okxGasData.max)/1e9}Gwei, Limit: ${okxGasLimit}`);
        console.log('📝 签名交换交易...');

        // 4. 使用多节点故障转移发送交易
        const txHash = await this.networkManager.signAndSendTransaction(txObject);

        console.log(`✅ 交换交易成功: ${txHash}`);

        // 5. 等待确认 - 使用多节点故障转移
        console.log('⏳ 等待交易确认...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // 减少到2秒

        const finalReceipt = await this.networkManager.waitForTransaction(txHash);

        return {
          success: Number(finalReceipt.status) === 1,
          txHash: txHash,
          orderId: txHash,
          quote: quote,
          transaction: txData
        };
      },
      '代币交换',
      2, // 最大重试2次
      3000 // 3秒延迟
    );
  }

  /**
   * 监控交易状态 - 使用Web3方式替换OKX监控
   * @param orderId 交易哈希（在我们的实现中就是txHash）
   * @param maxAttempts 最大重试次数
   * @param intervalMs 重试间隔
   * @returns 交易状态
   */
  public async monitorTransaction(
    orderId: string,
    maxAttempts: number = 30,
    intervalMs: number = 2000
  ): Promise<{
    status: TransactionStatus;
    txHash?: string;
    failReason?: string;
  }> {
    const web3 = this.networkManager.getWeb3();
    const txHash = orderId; // 在我们的实现中，orderId就是txHash

    console.log(`🔍 监控交易状态: ${txHash}`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const receipt = await web3.eth.getTransactionReceipt(txHash);
        
        if (receipt) {
          const success = Number(receipt.status) === 1;
          console.log(`✅ 交易${success ? '成功' : '失败'}: ${txHash}`);
          
          return {
            status: success ? TransactionStatus.SUCCESS : TransactionStatus.FAILED,
            txHash: txHash,
            failReason: success ? undefined : '交易执行失败'
          };
        }

        // 如果还没有确认，等待后重试
        if (attempt < maxAttempts) {
          console.log(`⏳ 等待交易确认... (${attempt}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      } catch (error) {
        console.warn(`⚠️ 查询交易状态失败 (尝试 ${attempt}/${maxAttempts}):`, error);
        
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      }
    }

    // 超时未确认
    console.log('⏰ 交易监控超时');
    return {
      status: TransactionStatus.PENDING,
      txHash: txHash,
      failReason: '交易确认超时'
    };
  }

  /**
   * 获取支持的代币列表
   */
  public async getSupportedTokens(): Promise<any[]> {
    try {
      return await this.okxClient.getTokens('56'); // BSC链
    } catch (error) {
      console.warn('获取代币列表失败:', error);
      return [];
    }
  }

  /**
   * 获取支持的链列表
   */
  public async getSupportedChains(): Promise<any[]> {
    try {
      return await this.okxClient.getSupportedChains();
    } catch (error) {
      console.warn('获取链列表失败:', error);
      return [];
    }
  }

  /**
   * 获取交易历史
   */
  public async getTransactionHistory(txHash: string): Promise<any> {
    try {
      // 优先使用Web3查询
      const web3 = this.networkManager.getWeb3();
      const receipt = await web3.eth.getTransactionReceipt(txHash);
      
      if (receipt) {
        return {
          txHash: receipt.transactionHash.toString(),
          status: receipt.status,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          from: receipt.from.toString(),
          to: receipt.to?.toString()
        };
      }

      // 如果Web3查询失败，尝试OKX API
      return await this.okxClient.getTransactionHistory('56', txHash);
    } catch (error) {
      console.warn('获取交易历史失败:', error);
      return null;
    }
  }

  /**
   * 分析DEX路由信息 - 新增功能
   */
  public async analyzeDEXRoute(params: SwapParams): Promise<{
    bestRoute: any;
    allRoutes: any[];
    riskAssessment: string;
  }> {
    try {
      const quote = await this.getQuote(params);
      const routerResult = (quote as any).routerResult;

      if (!routerResult) {
        throw new Error('无法获取路由信息');
      }

      const analysis = {
        bestRoute: routerResult.dexRouterList?.[0] || null,
        allRoutes: routerResult.quoteCompareList || [],
        riskAssessment: this.assessTransactionRisk(routerResult)
      };

      console.log('📊 DEX路由分析完成');
      return analysis;
    } catch (error) {
      throw new Error(`DEX路由分析失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 评估交易风险
   */
  private assessTransactionRisk(routerResult: any): string {
    let risk = '低风险';
    
    try {
      // 检查价格影响
      const priceImpact = parseFloat(routerResult.priceImpactPercentage || '0');
      if (priceImpact > 5) {
        risk = '高风险';
      } else if (priceImpact > 1) {
        risk = '中等风险';
      }

      // 检查DEX数量
      const dexCount = routerResult.dexRouterList?.length || 1;
      if (dexCount > 2) {
        risk = risk === '低风险' ? '中等风险' : '高风险';
      }
    } catch (error) {
      console.warn('风险评估失败:', error);
    }

    return risk;
  }

  /**
   * 获取BSC DEX路由器地址
   */
  private getDEXRouterAddress(): string {
    return this.OKX_ROUTER_ADDRESS;
  }

  /**
   * 强制执行无限授权 - 使用多节点故障转移和重试机制
   * @param tokenAddress 代币合约地址
   */
  private async forceUnlimitedApproval(tokenAddress: string): Promise<void> {
    return await this.retryWithFailover(
      async () => {
        // BNB不需要授权
        if (tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
          return;
        }

        const walletAddress = this.networkManager.getEVMConfig().walletAddress;

        console.log(`[${this.getLocalTimeString()}] 🔐 强制无限授权代币: ${tokenAddress}`);

        // 获取无限授权交易数据
        const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
        
        const approvalData = await this.okxClient.getApprovalTransaction({
          tokenAddress,
          amount: MAX_UINT256,
          chainId: '56'
        });

        // 构建授权交易 - 并行获取Gas信息
        const [okxGasData, okxGasLimit, nonce] = await Promise.all([
          this.okxClient.getGasPrice('56'),
          this.okxClient.getGasLimit(
            walletAddress,
            tokenAddress,
            '0',
            approvalData.data,
            '56'
          ),
          this.networkManager.getNonce()
        ]);

        const txObject = {
          from: walletAddress,
          to: tokenAddress,
          data: approvalData.data,
          value: '0',
          gas: okxGasLimit,
          gasPrice: okxGasData.max,
          nonce
        };

        console.log(`[${this.getLocalTimeString()}] 📝 签名无限授权交易...`);

        // 使用多节点故障转移发送交易
        const txHash = await this.networkManager.signAndSendTransaction(txObject);

        console.log(`[${this.getLocalTimeString()}] ✅ 无限授权交易成功: ${txHash}`);
        
        // 等待授权确认 - 减少等待时间
        console.log(`[${this.getLocalTimeString()}] ⏳ 等待授权确认...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // 减少到2秒
      },
      '强制代币授权',
      3, // 最大重试3次
      2000 // 2秒延迟
    );
  }

  /**
   * 通用重试机制 - 支持多节点故障转移
   */
  private async retryWithFailover<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3,
    delayMs: number = 20000,
    backoffMultiplier: number = 2.0
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[${this.getLocalTimeString()}] 🔄 [SwapAPI] 执行${operationName} (尝试 ${attempt}/${maxRetries})`);
        
        const result = await operation();
        
        if (attempt > 1) {
          console.log(`[${this.getLocalTimeString()}] ✅ [SwapAPI] ${operationName}在第${attempt}次尝试后成功`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMsg = lastError.message;
        
        console.warn(`[${this.getLocalTimeString()}] ⚠️ [SwapAPI] ${operationName}失败 (尝试 ${attempt}/${maxRetries}): ${errorMsg}`);
        
        // 检查是否是网络错误
        if (this.isNetworkError(errorMsg)) {
          console.log(`[${this.getLocalTimeString()}] 🔄 [SwapAPI] 检测到网络错误，将通过多节点机制自动切换节点`);
          
          // 获取当前节点状态
          const nodeReport = this.networkManager.getNodeStatusReport();
          console.log(`[${this.getLocalTimeString()}] 📊 [SwapAPI] 当前节点: ${nodeReport.currentNode}, 健康节点: ${nodeReport.healthyNodes}/${nodeReport.totalNodes}`);
        }
        
        // 如果不是最后一次尝试，等待后重试
        if (attempt < maxRetries) {
          // 🔧 固定延迟模式：第1次失败后20秒，第2次失败后30秒，第3次失败后不等待
          let delay: number;
          if (attempt === 1) {
            delay = 15000; // 第1次失败后等待15秒
          } else if (attempt === 2) {
            delay = 25000; // 第2次失败后等待25秒
          } else {
            delay = 0; // 第3次及以后失败后不等待
          }
          
          if (delay > 0) {
            console.log(`[${this.getLocalTimeString()}] ⏳ [SwapAPI] ${delay}ms(${delay/1000}秒)后进行第${attempt + 1}次重试...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            console.log(`[${this.getLocalTimeString()}] 🔄 [SwapAPI] 立即进行第${attempt + 1}次重试...`);
          }
        }
      }
    }
    
    // 所有重试都失败了
    console.error(`[${this.getLocalTimeString()}] ❌ [SwapAPI] ${operationName}在${maxRetries}次重试后仍然失败`);
    
    // 输出节点状态报告用于调试
    const nodeReport = this.networkManager.getNodeStatusReport();
    console.error(`[${this.getLocalTimeString()}] 📊 [SwapAPI] 最终节点状态: ${JSON.stringify(nodeReport, null, 2)}`);
    
    throw new Error(`${operationName}失败: ${lastError?.message || '所有重试都已用尽'}`);
  }

  /**
   * 判断是否为网络错误
   */
  private isNetworkError(errorMessage: string): boolean {
    const networkErrorKeywords = [
      'network socket disconnected',
      'connection refused',
      'timeout',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'socket hang up',
      'TLS connection',
      'failed, reason:'
    ];

    return networkErrorKeywords.some(keyword => 
      errorMessage.toLowerCase().includes(keyword.toLowerCase())
    );
  }
} 