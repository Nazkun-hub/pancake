import { injectable } from 'tsyringe';
import { 
  ITransactionService,
  Transaction,
  GasEstimate,
  TransactionResult,
  TransactionReceipt,
  RetryConfig,
  Operation,
  ModuleConfig,
  ModuleHealth,
  ModuleMetrics
} from '../types/interfaces.js';

/**
 * 交易服务实现
 * 处理交易构建、发送、监控和重试逻辑
 */
@injectable()
export class TransactionService implements ITransactionService {
  public readonly name = 'TransactionService';
  public readonly version = '1.0.0';
  public readonly dependencies: string[] = [];

  private isStarted = false;
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private lastActivity = Date.now();
  
  // 交易状态跟踪
  private pendingTransactions = new Map<string, TransactionResult>();

  /**
   * 初始化交易服务
   */
  async initialize(config: ModuleConfig): Promise<void> {
    console.log('🔄 初始化交易服务...');
    console.log('✅ 交易服务初始化完成');
  }

  /**
   * 启动交易服务
   */
  async start(): Promise<void> {
    this.isStarted = true;
    this.startTime = Date.now();
    console.log('🚀 交易服务已启动');
  }

  /**
   * 停止交易服务
   */
  async stop(): Promise<void> {
    this.isStarted = false;
    console.log('⏹️ 交易服务已停止');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ModuleHealth> {
    const pendingCount = this.pendingTransactions.size;
    
    return {
      status: this.isStarted ? 'healthy' : 'error',
      message: this.isStarted ? 
        `交易服务运行正常 (${pendingCount} 个待处理交易)` : 
        '交易服务未启动',
      timestamp: Date.now()
    };
  }

  /**
   * 获取模块指标
   */
  getMetrics(): ModuleMetrics {
    return {
      uptime: Date.now() - this.startTime,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      lastActivity: this.lastActivity
    };
  }

  /**
   * 执行操作（通用接口）
   */
  async execute(params: any): Promise<any> {
    this.requestCount++;
    this.lastActivity = Date.now();
    
    throw new Error('通用execute方法需要具体实现');
  }

  /**
   * 验证参数
   */
  validate(params: any): boolean {
    return typeof params === 'object' && params !== null;
  }

  /**
   * 构建交易
   */
  async buildTransaction(operation: Operation): Promise<Transaction> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      console.log('🔧 构建交易...', {
        type: operation.type,
        priority: operation.priority
      });

      // 根据操作类型构建交易数据
      const transactionData = await this.buildTransactionData(operation);

      const transaction: Transaction = {
        to: transactionData.to,
        data: transactionData.data,
        value: transactionData.value || '0',
        gasLimit: transactionData.gasLimit || '200000',
        gasPrice: transactionData.gasPrice || '5000000000', // 5 Gwei
        ...(transactionData.nonce !== undefined && { nonce: transactionData.nonce })
      };

      console.log('✅ 交易构建完成', {
        to: transaction.to,
        gasLimit: transaction.gasLimit,
        gasPrice: transaction.gasPrice
      });

      return transaction;

    } catch (error) {
      this.errorCount++;
      console.error('❌ 构建交易失败:', error);
      throw error;
    }
  }

  /**
   * 估算Gas
   */
  async estimateGas(transaction: Transaction): Promise<GasEstimate> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      console.log('⛽ 估算交易Gas...', {
        to: transaction.to,
        gasLimit: transaction.gasLimit
      });

      // TODO: 实现实际的Gas估算
      // 这里返回模拟数据
      const gasEstimate: GasEstimate = {
        gasLimit: parseInt(transaction.gasLimit),
        gasPrices: {
          slow: 3,
          standard: 5,
          fast: 8,
          instant: 12
        },
        estimatedCost: 0.001, // $0.001
        recommendedSettings: {
          gasPrice: parseInt(transaction.gasPrice),
          gasLimit: parseInt(transaction.gasLimit)
        }
      };

      console.log('✅ Gas估算完成', gasEstimate);
      return gasEstimate;

    } catch (error) {
      this.errorCount++;
      console.error('❌ Gas估算失败:', error);
      throw error;
    }
  }

  /**
   * 发送交易
   */
  async sendTransaction(transaction: Transaction): Promise<TransactionResult> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      console.log('📤 发送交易...', {
        to: transaction.to,
        gasPrice: transaction.gasPrice,
        gasLimit: transaction.gasLimit
      });

      // TODO: 实现实际的交易发送
      // 这里模拟交易发送
      const txHash = this.generateTransactionHash();
      
      const result: TransactionResult = {
        hash: txHash,
        status: 'pending'
      };

      // 添加到待处理交易中
      this.pendingTransactions.set(txHash, result);

      // 模拟异步确认
      setTimeout(async () => {
        try {
          await this.simulateTransactionConfirmation(txHash);
        } catch (error) {
          console.error('交易确认模拟失败:', error);
        }
      }, 3000); // 3秒后确认

      console.log('✅ 交易已发送', {
        hash: txHash,
        status: result.status
      });

      return result;

    } catch (error) {
      this.errorCount++;
      console.error('❌ 发送交易失败:', error);
      throw error;
    }
  }

  /**
   * 等待交易确认
   */
  async waitForConfirmation(txHash: string): Promise<TransactionReceipt> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      console.log('⏳ 等待交易确认...', { txHash });

      // 轮询检查交易状态
      const maxAttempts = 60; // 最多等待5分钟
      let attempts = 0;

      while (attempts < maxAttempts) {
        const receipt = await this.getTransactionReceipt(txHash);
        if (receipt) {
          console.log('✅ 交易已确认', {
            txHash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed
          });
          return receipt;
        }

        // 等待5秒再检查
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      }

      throw new Error('交易确认超时');

    } catch (error) {
      this.errorCount++;
      console.error('❌ 等待交易确认失败:', error);
      throw error;
    }
  }

  /**
   * 带重试的发送交易
   */
  async sendWithRetry(transaction: Transaction, retryConfig: RetryConfig): Promise<TransactionResult> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      console.log('🔄 发送交易（带重试）...', {
        maxRetries: retryConfig.maxRetries,
        backoff: retryConfig.backoff
      });

      let lastError: Error | null = null;
      
      for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`🔄 重试交易 (第${attempt}次)...`);
            
            // 计算延迟时间
            const delay = this.calculateRetryDelay(attempt, retryConfig);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // 可能需要调整Gas价格
            transaction.gasPrice = this.adjustGasPriceForRetry(transaction.gasPrice, attempt);
          }

          const result = await this.sendTransaction(transaction);
          
          console.log('✅ 交易发送成功', {
            attempt: attempt + 1,
            hash: result.hash
          });
          
          return result;

        } catch (error) {
          lastError = error as Error;
          console.warn(`⚠️ 交易发送失败 (第${attempt + 1}次):`, error);
          
          if (attempt === retryConfig.maxRetries) {
            break;
          }
        }
      }

      throw new Error(`交易发送失败，已重试${retryConfig.maxRetries}次: ${lastError?.message}`);

    } catch (error) {
      this.errorCount++;
      console.error('❌ 带重试的交易发送失败:', error);
      throw error;
    }
  }

  /**
   * 获取交易回执
   */
  private async getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null> {
    try {
      // TODO: 实现实际的交易回执获取
      // 这里模拟获取交易回执
      
      const pendingTx = this.pendingTransactions.get(txHash);
      if (!pendingTx || pendingTx.status === 'pending') {
        return null;
      }

      if (pendingTx.status === 'confirmed') {
        return {
          transactionHash: txHash,
          blockNumber: pendingTx.blockNumber || 0,
          gasUsed: pendingTx.gasUsed || 0,
          status: 1,
          logs: []
        };
      }

      return null;

    } catch (error) {
      console.error('获取交易回执失败:', error);
      return null;
    }
  }

  /**
   * 构建交易数据
   */
  private async buildTransactionData(operation: Operation): Promise<{
    to: string;
    data: string;
    value?: string;
    gasLimit?: string;
    gasPrice?: string;
    nonce?: number;
  }> {
    // 根据操作类型构建交易数据
    switch (operation.type) {
      case 'addLiquidity':
        return this.buildAddLiquidityTransaction(operation.params);
      
      case 'removeLiquidity':
        return this.buildRemoveLiquidityTransaction(operation.params);
      
      case 'collect':
        return this.buildCollectFeesTransaction(operation.params);
      
      default:
        throw new Error(`不支持的操作类型: ${operation.type}`);
    }
  }

  /**
   * 构建添加流动性交易
   */
  private async buildAddLiquidityTransaction(params: any): Promise<any> {
    // TODO: 实现实际的添加流动性交易构建
    return {
      to: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364', // PancakeSwap V3 Position Manager
      data: '0x', // 编码的调用数据
      value: '0',
      gasLimit: '300000',
      gasPrice: '5000000000'
    };
  }

  /**
   * 构建移除流动性交易
   */
  private async buildRemoveLiquidityTransaction(params: any): Promise<any> {
    // TODO: 实现实际的移除流动性交易构建
    return {
      to: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
      data: '0x',
      value: '0',
      gasLimit: '200000',
      gasPrice: '5000000000'
    };
  }

  /**
   * 构建收取手续费交易
   */
  private async buildCollectFeesTransaction(params: any): Promise<any> {
    // TODO: 实现实际的收取手续费交易构建
    return {
      to: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
      data: '0x',
      value: '0',
      gasLimit: '150000',
      gasPrice: '5000000000'
    };
  }

  /**
   * 生成交易哈希
   */
  private generateTransactionHash(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    return `0x${timestamp}${random}`.padEnd(66, '0');
  }

  /**
   * 模拟交易确认
   */
  private async simulateTransactionConfirmation(txHash: string): Promise<void> {
    const pendingTx = this.pendingTransactions.get(txHash);
    if (pendingTx) {
      pendingTx.status = 'confirmed';
      pendingTx.blockNumber = Math.floor(Math.random() * 1000000) + 30000000;
      pendingTx.gasUsed = Math.floor(Math.random() * 100000) + 150000;
      
      console.log('📋 交易确认模拟完成', {
        txHash,
        blockNumber: pendingTx.blockNumber,
        gasUsed: pendingTx.gasUsed
      });
    }
  }

  /**
   * 计算重试延迟
   */
  private calculateRetryDelay(attempt: number, config: RetryConfig): number {
    if (config.backoff === 'exponential') {
      return config.delay * Math.pow(2, attempt - 1);
    } else {
      return config.delay * attempt;
    }
  }

  /**
   * 调整重试的Gas价格
   */
  private adjustGasPriceForRetry(currentGasPrice: string, attempt: number): string {
    const current = parseInt(currentGasPrice);
    const increased = Math.floor(current * (1 + attempt * 0.1)); // 每次重试增加10%
    return increased.toString();
  }
} 