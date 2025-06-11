import { Web3 } from 'web3';
import { EVMConfig } from '../types';
import { MultiNodeManager } from './MultiNodeManager';

/**
 * 网络管理器 - 集成多节点故障转移
 */
export class NetworkManager {
  private web3: Web3;
  private config: EVMConfig;
  private multiNodeManager: MultiNodeManager;
  private isInitialized: boolean = false;

  constructor(config: EVMConfig) {
    this.config = config;
    this.multiNodeManager = new MultiNodeManager();
    
    // 临时创建Web3实例用于兼容性
    this.web3 = new Web3(config.rpcUrl);
  }

  /**
   * 初始化网络管理器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('🌐 [NetworkManager] 初始化网络管理器...');
    
    // 初始化多节点管理器
    await this.multiNodeManager.initialize();
    
    // 使用多节点管理器的Web3实例
    this.web3 = this.multiNodeManager.getCurrentWeb3();
    
    this.isInitialized = true;
    console.log('✅ [NetworkManager] 网络管理器初始化完成');
  }

  /**
   * 获取Web3实例
   */
  public getWeb3(): Web3 {
    if (!this.isInitialized) {
      console.warn('⚠️ [NetworkManager] 网络管理器未初始化，使用默认Web3实例');
      return this.web3;
    }
    
    return this.multiNodeManager.getCurrentWeb3();
  }

  /**
   * 获取EVM配置
   */
  public getEVMConfig(): EVMConfig {
    return this.config;
  }

  /**
   * 获取当前gas价格 - 使用故障转移
   */
  public async getGasPrice(): Promise<bigint> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await this.multiNodeManager.executeWithFailover(
      async (web3) => await web3.eth.getGasPrice(),
      '获取Gas价格'
    );
  }

  /**
   * 获取账户nonce - 使用故障转移
   */
  public async getNonce(address?: string): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const addr = address || this.config.walletAddress;
    
    return await this.multiNodeManager.executeWithFailover(
      async (web3) => {
        const count = await web3.eth.getTransactionCount(addr, 'latest');
        return Number(count);
      },
      '获取账户Nonce'
    );
  }

  /**
   * 检查账户ETH余额 - 使用故障转移
   */
  public async getETHBalance(address?: string): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const addr = address || this.config.walletAddress;
    
    return await this.multiNodeManager.executeWithFailover(
      async (web3) => {
        const balance = await web3.eth.getBalance(addr);
        return web3.utils.fromWei(balance, 'ether');
      },
      '获取BNB余额'
    );
  }

  /**
   * 检查ERC20代币余额 - 使用故障转移
   */
  public async getTokenBalance(tokenAddress: string, walletAddress?: string): Promise<bigint> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const addr = walletAddress || this.config.walletAddress;
    
    return await this.multiNodeManager.executeWithFailover(
      async (web3) => {
        const tokenABI = [
          {
            constant: true,
            inputs: [{ name: '_owner', type: 'address' }],
            name: 'balanceOf',
            outputs: [{ name: 'balance', type: 'uint256' }],
            type: 'function'
          }
        ];

        const tokenContract = new web3.eth.Contract(tokenABI, tokenAddress);
        const balance = await tokenContract.methods.balanceOf(addr).call();
        return BigInt(String(balance));
      },
      '获取代币余额'
    );
  }

  /**
   * 检查ERC20代币授权额度 - 使用故障转移
   */
  public async checkAllowance(
    tokenAddress: string,
    spenderAddress: string,
    ownerAddress?: string
  ): Promise<bigint> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const owner = ownerAddress || this.config.walletAddress;
    
    return await this.multiNodeManager.executeWithFailover(
      async (web3) => {
        const tokenABI = [
          {
            constant: true,
            inputs: [
              { name: '_owner', type: 'address' },
              { name: '_spender', type: 'address' }
            ],
            name: 'allowance',
            outputs: [{ name: '', type: 'uint256' }],
            type: 'function'
          }
        ];

        const tokenContract = new web3.eth.Contract(tokenABI, tokenAddress);
        const allowance = await tokenContract.methods.allowance(owner, spenderAddress).call();
        return BigInt(String(allowance));
      },
      '检查代币授权额度'
    );
  }

  /**
   * 签名并发送交易 - 使用故障转移和智能交易状态检测
   */
  public async signAndSendTransaction(txObject: any): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const originalNonce = txObject.nonce;
    
    return await this.multiNodeManager.executeWithFailover(
      async (web3) => {
        try {
          const signedTx = await web3.eth.accounts.signTransaction(
            txObject,
            this.config.privateKey
          );
          
          const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction!);
          return receipt.transactionHash as string;
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // 🔧 处理超时错误 - 交易可能已发送成功
          if (errorMessage.includes('timeout') || errorMessage.includes('超时')) {
            console.log(`[${this.getLocalTimeString()}] ⚠️ 交易发送超时，检查交易状态...`);
            return await this.handleTimeoutTransaction(originalNonce);
          }
          
          // 🔧 处理"already known"错误 - 交易已在网络中
          if (errorMessage.includes('already known')) {
            console.log(`[${this.getLocalTimeString()}] ✅ 交易已存在网络中，等待确认...`);
            return await this.waitForTransactionByNonce(originalNonce);
          }
          
          // 🔧 处理nonce冲突错误 - 检查是否有已完成的交易
          if (errorMessage.includes('nonce too low')) {
            console.log(`[${this.getLocalTimeString()}] ⚠️ Nonce已被使用，检查交易历史...`);
            const existingTxHash = await this.findCompletedTransactionByNonce(originalNonce);
            if (existingTxHash) {
              console.log(`[${this.getLocalTimeString()}] ✅ 找到已完成交易: ${existingTxHash}`);
              return existingTxHash;
            }
          }
          
          // 🔧 其他错误直接抛出
          throw error;
        }
      },
      '发送交易'
    );
  }

  /**
   * 🔧 处理超时交易：检查交易是否实际成功
   */
  private async handleTimeoutTransaction(nonce: number): Promise<string> {
    console.log(`[${this.getLocalTimeString()}] 🔍 超时后检查nonce ${nonce} 的交易状态...`);
    
    // 等待一段时间让交易有机会被网络处理
    await this.sleep(3000);
    
    // 1. 首先检查pending交易
    const pendingTxHash = await this.findPendingTransactionByNonce(nonce);
    if (pendingTxHash) {
      console.log(`[${this.getLocalTimeString()}] ✅ 找到pending交易: ${pendingTxHash}`);
      return await this.waitForTransactionConfirmation(pendingTxHash);
    }
    
    // 2. 检查已完成交易
    const completedTxHash = await this.findCompletedTransactionByNonce(nonce);
    if (completedTxHash) {
      console.log(`[${this.getLocalTimeString()}] ✅ 找到已完成交易: ${completedTxHash}`);
      return completedTxHash;
    }
    
    // 3. 检查当前nonce是否已被消耗
    const currentNonce = await this.getNonce();
    if (currentNonce > nonce) {
      console.log(`[${this.getLocalTimeString()}] ⚠️ Nonce ${nonce} 已被消耗，但找不到对应交易`);
      throw new Error(`交易可能失败：nonce ${nonce} 已被使用但找不到交易记录`);
    }
    
    // 4. 如果nonce未被消耗，说明交易确实失败了
    console.log(`[${this.getLocalTimeString()}] ❌ 确认交易失败：nonce ${nonce} 未被消耗`);
    throw new Error(`交易发送失败：超时且未在网络中找到交易`);
  }

  /**
   * 🔧 等待指定nonce的交易完成
   */
  private async waitForTransactionByNonce(nonce: number, maxWaitTime: number = 60000): Promise<string> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      // 检查pending交易
      const pendingTxHash = await this.findPendingTransactionByNonce(nonce);
      if (pendingTxHash) {
        console.log(`[${this.getLocalTimeString()}] 🔍 找到pending交易: ${pendingTxHash}，等待确认...`);
        return await this.waitForTransactionConfirmation(pendingTxHash);
      }
      
      // 检查已完成交易
      const completedTxHash = await this.findCompletedTransactionByNonce(nonce);
      if (completedTxHash) {
        console.log(`[${this.getLocalTimeString()}] ✅ 交易已完成: ${completedTxHash}`);
        return completedTxHash;
      }
      
      await this.sleep(2000); // 等待2秒再检查
    }
    
    throw new Error(`等待交易超时：nonce ${nonce} 在 ${maxWaitTime/1000} 秒内未完成`);
  }

  /**
   * 🔧 根据nonce查找pending交易
   */
  private async findPendingTransactionByNonce(nonce: number): Promise<string | null> {
    try {
      return await this.multiNodeManager.executeWithFailover(
        async (web3) => {
          const pendingBlock = await web3.eth.getBlock('pending', true);
          
          if (pendingBlock && pendingBlock.transactions) {
            for (const tx of pendingBlock.transactions as any[]) {
              if (tx.from?.toLowerCase() === this.config.walletAddress.toLowerCase() && 
                  Number(tx.nonce) === nonce) {
                return tx.hash;
              }
            }
          }
          
          return null;
        },
        '查找pending交易'
      );
    } catch (error) {
      return null;
    }
  }

  /**
   * 🔧 根据nonce查找已完成交易
   */
  private async findCompletedTransactionByNonce(nonce: number): Promise<string | null> {
    try {
      return await this.multiNodeManager.executeWithFailover(
        async (web3) => {
          // 获取最近几个区块的交易
          const currentBlock = await web3.eth.getBlockNumber();
          const searchBlocks = 10; // 搜索最近10个区块
          
          for (let i = 0; i < searchBlocks; i++) {
            const blockNumber = Number(currentBlock) - i;
            if (blockNumber < 0) break;
            
            const block = await web3.eth.getBlock(blockNumber, true);
            if (block && block.transactions) {
              for (const tx of block.transactions as any[]) {
                if (tx.from?.toLowerCase() === this.config.walletAddress.toLowerCase() && 
                    Number(tx.nonce) === nonce) {
                  return tx.hash;
                }
              }
            }
          }
          
          return null;
        },
        '查找已完成交易'
      );
    } catch (error) {
      return null;
    }
  }

  /**
   * 🔧 等待交易确认
   */
  private async waitForTransactionConfirmation(txHash: string): Promise<string> {
    console.log(`[${this.getLocalTimeString()}] ⏳ 等待交易确认: ${txHash}`);
    
    try {
      await this.waitForTransaction(txHash);
      console.log(`[${this.getLocalTimeString()}] ✅ 交易确认完成: ${txHash}`);
      return txHash;
    } catch (error) {
      console.warn(`[${this.getLocalTimeString()}] ⚠️ 等待交易确认失败: ${error}`);
      return txHash; // 即使等待失败，也返回交易哈希
    }
  }

  /**
   * 🔧 工具方法：延迟
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getLocalTimeString(): string {
    return new Date().toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false
    });
  }

  /**
   * 等待交易确认 - 使用故障转移
   */
  public async waitForTransaction(txHash: string, confirmations: number = 1): Promise<any> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await this.multiNodeManager.executeWithFailover(
      async (web3) => {
        return new Promise((resolve, reject) => {
          const checkTransaction = async () => {
            try {
              const receipt = await web3.eth.getTransactionReceipt(txHash);
              if (receipt) {
                resolve(receipt);
              } else {
                setTimeout(checkTransaction, 1000);
              }
            } catch (error) {
              reject(error);
            }
          };
          checkTransaction();
        });
      },
      '等待交易确认'
    );
  }

  /**
   * 获取链ID
   */
  public getChainId(): string {
    return this.config.chainId || '56';
  }

  /**
   * 检查网络连接 - 使用故障转移
   */
  public async checkConnection(): Promise<boolean> {
    if (!this.isInitialized) {
      try {
        await this.initialize();
        return true;
      } catch (error) {
        console.error('初始化网络管理器失败:', error);
        return false;
      }
    }

    try {
      await this.multiNodeManager.executeWithFailover(
        async (web3) => await web3.eth.getBlockNumber(),
        '检查网络连接'
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取代币信息 - 使用故障转移
   */
  public async getTokenInfo(tokenAddress: string): Promise<{
    symbol: string;
    name: string;
    decimals: number;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // BNB 特殊处理
    if (tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      return {
        symbol: 'BNB',
        name: 'Binance Coin',
        decimals: 18
      };
    }

    return await this.multiNodeManager.executeWithFailover(
      async (web3) => {
        const tokenABI = [
          {
            constant: true,
            inputs: [],
            name: 'symbol',
            outputs: [{ name: '', type: 'string' }],
            type: 'function'
          },
          {
            constant: true,
            inputs: [],
            name: 'name',
            outputs: [{ name: '', type: 'string' }],
            type: 'function'
          },
          {
            constant: true,
            inputs: [],
            name: 'decimals',
            outputs: [{ name: '', type: 'uint8' }],
            type: 'function'
          }
        ];

        const tokenContract = new web3.eth.Contract(tokenABI, tokenAddress);
        
        const [symbol, name, decimals] = await Promise.all([
          tokenContract.methods.symbol().call(),
          tokenContract.methods.name().call(),
          tokenContract.methods.decimals().call()
        ]);

        return {
          symbol: String(symbol),
          name: String(name),
          decimals: Number(decimals)
        };
      },
      '获取代币信息'
    );
  }

  /**
   * 验证代币地址格式
   */
  public isValidTokenAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * 获取节点状态报告
   */
  public getNodeStatusReport(): any {
    if (!this.isInitialized) {
      return {
        status: 'uninitialized',
        message: '网络管理器未初始化'
      };
    }

    return this.multiNodeManager.getNodeStatusReport();
  }

  /**
   * 手动切换到指定节点
   */
  public async switchToNode(nodeUrl: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await this.multiNodeManager.switchToNode(nodeUrl);
    console.log(`🔄 [NetworkManager] 已切换到节点: ${nodeUrl}`);
  }

  /**
   * 获取当前使用的RPC节点信息
   */
  public getCurrentRPCNode(): { name: string; url: string; priority: number } | null {
    if (!this.isInitialized) {
      return null;
    }

    try {
      return this.multiNodeManager.getCurrentNodeInfo();
    } catch (error) {
      console.warn('获取当前RPC节点信息失败:', error);
      return null;
    }
  }

  /**
   * 停止网络管理器
   */
  public stop(): void {
    if (this.multiNodeManager) {
      this.multiNodeManager.stop();
    }
    this.isInitialized = false;
    console.log('⏹️ [NetworkManager] 网络管理器已停止');
  }
} 