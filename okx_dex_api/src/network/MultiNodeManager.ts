/**
 * 🌐 多节点管理器 - BSC网络故障转移
 * 
 * 功能特性：
 * - 多RPC节点配置和管理
 * - 自动故障检测和切换
 * - 节点健康监控
 * - 负载均衡和优先级管理
 * - 连接池和重试机制
 */

import { Web3 } from 'web3';

export interface NodeConfig {
  url: string;
  name: string;
  priority: number;        // 优先级：1最高，数字越小优先级越高
  timeout: number;         // 连接超时时间(ms)
  maxRetries: number;      // 最大重试次数
  healthCheckInterval: number; // 健康检查间隔(ms)
}

export interface NodeStatus {
  url: string;
  name: string;
  isHealthy: boolean;
  lastCheck: number;
  responseTime: number;
  errorCount: number;
  lastError?: string;
  blockNumber?: number;
}

export interface ConnectionAttempt {
  nodeUrl: string;
  attempt: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

export class MultiNodeManager {
  private nodes: NodeConfig[] = [];
  private nodeStatuses: Map<string, NodeStatus> = new Map();
  private currentNodeIndex: number = 0;
  private web3Instances: Map<string, Web3> = new Map();
  private connectionHistory: ConnectionAttempt[] = [];
  private healthCheckTimer?: NodeJS.Timeout;
  private isInitialized: boolean = false;

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

  constructor() {
    this.initializeDefaultNodes();
  }

  /**
   * 初始化默认BSC节点配置
   */
  private initializeDefaultNodes(): void {
    this.nodes = [
      {
        url: 'https://proportionate-red-feather.bsc.quiknode.pro/c9870bee98ea2d4bfd28c3ae026eaba31c7271cf/',
        name: 'QuickNode Premium',
        priority: 1,
        timeout: 5000,
        maxRetries: 3,
        healthCheckInterval: 30000
      },
      {
        url: 'https://rpc.48.club/',
        name: '48Club RPC',
        priority: 2,
        timeout: 8000,
        maxRetries: 3,
        healthCheckInterval: 30000
      }
    ];

    // 按优先级排序
    this.nodes.sort((a, b) => a.priority - b.priority);
    
    console.log(`🌐 [MultiNode] 已配置 ${this.nodes.length} 个BSC节点 (QuickNode主节点)`);
    this.nodes.forEach((node, index) => {
      console.log(`   ${index + 1}. ${node.name} (优先级: ${node.priority})`);
    });
  }

  /**
   * 初始化多节点管理器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('🚀 [MultiNode] 初始化多节点管理器...');

    // 初始化所有节点状态
    for (const node of this.nodes) {
      this.nodeStatuses.set(node.url, {
        url: node.url,
        name: node.name,
        isHealthy: false,
        lastCheck: 0,
        responseTime: 0,
        errorCount: 0
      });
    }

    // 尝试连接到最佳节点
    await this.findBestNode();
    
    // 启动健康检查
    this.startHealthCheck();
    
    this.isInitialized = true;
    console.log('✅ [MultiNode] 多节点管理器初始化完成');
  }

  /**
   * 查找并连接到最佳节点
   */
  async findBestNode(): Promise<Web3> {
    console.log('🔍 [MultiNode] 寻找最佳BSC节点...');

    // 按优先级测试节点
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      
      try {
        console.log(`🔄 [MultiNode] 测试节点 ${i + 1}/${this.nodes.length}: ${node.name}`);
        
        const web3 = await this.testNodeConnection(node);
        
        this.currentNodeIndex = i;
        this.web3Instances.set(node.url, web3);
        
        // 更新节点状态
        const status = this.nodeStatuses.get(node.url)!;
        status.isHealthy = true;
        status.lastCheck = Date.now();
        
        console.log(`✅ [MultiNode] 已连接到最佳节点: ${node.name}`);
        return web3;
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️ [MultiNode] 节点连接失败: ${node.name} - ${errorMsg}`);
        
        // 记录连接失败
        this.recordConnectionAttempt(node.url, 1, false, errorMsg);
        
        // 更新节点状态
        const status = this.nodeStatuses.get(node.url)!;
        status.isHealthy = false;
        status.errorCount++;
        status.lastError = errorMsg;
        status.lastCheck = Date.now();
      }
    }

    throw new Error('所有BSC节点都无法连接');
  }

  /**
   * 测试单个节点连接
   */
  private async testNodeConnection(node: NodeConfig): Promise<Web3> {
    const startTime = Date.now();
    
    const web3 = new Web3(node.url);
    
    // 设置超时Promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`连接超时 (${node.timeout}ms)`)), node.timeout);
    });

    // 测试连接
    const testPromise = this.performConnectionTest(web3);
    
    // 竞争执行
    const result = await Promise.race([testPromise, timeoutPromise]);
    
    const responseTime = Date.now() - startTime;
    
    // 更新响应时间
    const status = this.nodeStatuses.get(node.url)!;
    status.responseTime = responseTime;
    status.blockNumber = (result as any).blockNumber;
    
    // 记录成功连接
    this.recordConnectionAttempt(node.url, 1, true);
    
    console.log(`📊 [MultiNode] ${node.name} 连接测试: ${responseTime}ms, 区块: ${status.blockNumber}`);
    
    return web3;
  }

  /**
   * 执行连接测试
   */
  private async performConnectionTest(web3: Web3): Promise<{ blockNumber: number; chainId: number }> {
    // 同时测试获取区块号和链ID
    const [blockNumber, chainId] = await Promise.all([
      web3.eth.getBlockNumber(),
      web3.eth.getChainId()
    ]);

    // 验证链ID是否为BSC
    if (Number(chainId) !== 56) {
      throw new Error(`错误的链ID: ${chainId}, 期望: 56 (BSC)`);
    }

    return { 
      blockNumber: Number(blockNumber), 
      chainId: Number(chainId) 
    };
  }

  /**
   * 获取当前活跃的Web3实例
   */
  getCurrentWeb3(): Web3 {
    if (!this.isInitialized) {
      throw new Error('多节点管理器未初始化');
    }

    const currentNode = this.nodes[this.currentNodeIndex];
    const web3 = this.web3Instances.get(currentNode.url);
    
    if (!web3) {
      throw new Error(`当前节点 ${currentNode.name} 的Web3实例不存在`);
    }

    return web3;
  }

  /**
   * 获取当前使用的节点信息
   */
  getCurrentNodeInfo(): { name: string; url: string; priority: number } {
    if (!this.isInitialized) {
      throw new Error('多节点管理器未初始化');
    }

    const currentNode = this.nodes[this.currentNodeIndex];
    return {
      name: currentNode.name,
      url: currentNode.url,
      priority: currentNode.priority
    };
  }

  /**
   * 执行带故障转移的操作
   */
  async executeWithFailover<T>(
    operation: (web3: Web3) => Promise<T>,
    operationName: string = '网络操作'
  ): Promise<T> {
    let lastError: Error | null = null;
    let attemptCount = 0;

    // 尝试所有可用节点
    for (let nodeIndex = this.currentNodeIndex; nodeIndex < this.nodes.length; nodeIndex++) {
      const node = this.nodes[nodeIndex];
      attemptCount++;

      try {
        console.log(`[${this.getLocalTimeString()}] 🔄 [MultiNode] 执行${operationName} - 使用节点: ${node.name} (尝试 ${attemptCount})`);
        console.log(`[${this.getLocalTimeString()}] 🌐 [MultiNode] RPC节点地址: ${node.url}`);
        
        let web3 = this.web3Instances.get(node.url);
        
        // 如果Web3实例不存在，尝试创建
        if (!web3) {
          console.log(`[${this.getLocalTimeString()}] 🔧 [MultiNode] 创建新的Web3连接到: ${node.name}`);
          web3 = await this.testNodeConnection(node);
          this.web3Instances.set(node.url, web3);
        }

        // 执行操作
        const result = await this.executeWithTimeout(
          () => operation(web3!),
          node.timeout,
          operationName
        );

        // 操作成功，更新当前节点
        this.currentNodeIndex = nodeIndex;
        
        // 重置节点错误计数
        const status = this.nodeStatuses.get(node.url)!;
        status.errorCount = 0;
        status.isHealthy = true;
        
        console.log(`✅ [MultiNode] ${operationName}成功 - 使用节点: ${node.name} (${node.url.substring(0, 50)}...)`);
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMsg = lastError.message;
        
        console.warn(`[${this.getLocalTimeString()}] ⚠️ [MultiNode] ${operationName}失败 - 节点: ${node.name} - ${errorMsg}`);
        
        // 更新节点状态
        const status = this.nodeStatuses.get(node.url)!;
        status.errorCount++;
        status.lastError = errorMsg;
        status.isHealthy = false;
        
        // 记录失败尝试
        this.recordConnectionAttempt(node.url, attemptCount, false, errorMsg);
        
        // 移除失败的Web3实例
        this.web3Instances.delete(node.url);
        
        // 如果是网络错误，立即尝试下一个节点
        if (this.isNetworkError(errorMsg)) {
          console.log(`[${this.getLocalTimeString()}] 🔄 [MultiNode] 检测到网络错误，立即切换到下一个节点`);
          continue;
        }
        
        // 对于其他错误，可以考虑重试当前节点
        if (attemptCount < node.maxRetries) {
          console.log(`[${this.getLocalTimeString()}] 🔄 [MultiNode] 将在1秒后重试节点: ${node.name}`);
          await this.sleep(1000);
          nodeIndex--; // 重试当前节点
          continue;
        }
      }
    }

    // 所有节点都失败了
    console.error(`[${this.getLocalTimeString()}] ❌ [MultiNode] ${operationName}在所有节点上都失败了`);
    throw new Error(`${operationName}失败: ${lastError?.message || '所有BSC节点都不可用'}`);
  }

  /**
   * 带超时的操作执行
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number,
    operationName: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${operationName}超时 (${timeout}ms)`)), timeout);
    });

    return Promise.race([operation(), timeoutPromise]);
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
      'TLS connection'
    ];

    return networkErrorKeywords.some(keyword => 
      errorMessage.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, 30000); // 每30秒检查一次

    console.log('🏥 [MultiNode] 健康检查已启动 (30秒间隔)');
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    console.log('🏥 [MultiNode] 执行节点健康检查...');

    const healthPromises = this.nodes.map(async (node) => {
      try {
        const startTime = Date.now();
        const web3 = new Web3(node.url);
        
        await Promise.race([
          web3.eth.getBlockNumber(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('健康检查超时')), 5000)
          )
        ]);

        const responseTime = Date.now() - startTime;
        const status = this.nodeStatuses.get(node.url)!;
        status.isHealthy = true;
        status.responseTime = responseTime;
        status.lastCheck = Date.now();
        
        return { node: node.name, healthy: true, responseTime };
      } catch (error) {
        const status = this.nodeStatuses.get(node.url)!;
        status.isHealthy = false;
        status.lastError = error instanceof Error ? error.message : String(error);
        status.lastCheck = Date.now();
        
        return { node: node.name, healthy: false, error: status.lastError };
      }
    });

    const results = await Promise.allSettled(healthPromises);
    const healthyCount = results.filter(r => 
      r.status === 'fulfilled' && r.value.healthy
    ).length;

    console.log(`🏥 [MultiNode] 健康检查完成: ${healthyCount}/${this.nodes.length} 节点健康`);
  }

  /**
   * 记录连接尝试
   */
  private recordConnectionAttempt(
    nodeUrl: string, 
    attempt: number, 
    success: boolean, 
    error?: string
  ): void {
    this.connectionHistory.push({
      nodeUrl,
      attempt,
      timestamp: Date.now(),
      success,
      error
    });

    // 保持历史记录在合理大小
    if (this.connectionHistory.length > 100) {
      this.connectionHistory = this.connectionHistory.slice(-50);
    }
  }

  /**
   * 获取节点状态报告
   */
  getNodeStatusReport(): {
    currentNode: string;
    totalNodes: number;
    healthyNodes: number;
    nodeStatuses: NodeStatus[];
    connectionHistory: ConnectionAttempt[];
  } {
    const currentNode = this.nodes[this.currentNodeIndex]?.name || '未知';
    const nodeStatuses = Array.from(this.nodeStatuses.values());
    const healthyNodes = nodeStatuses.filter(s => s.isHealthy).length;

    return {
      currentNode,
      totalNodes: this.nodes.length,
      healthyNodes,
      nodeStatuses,
      connectionHistory: this.connectionHistory.slice(-10) // 最近10次尝试
    };
  }

  /**
   * 手动切换到指定节点
   */
  async switchToNode(nodeUrl: string): Promise<void> {
    const nodeIndex = this.nodes.findIndex(n => n.url === nodeUrl);
    if (nodeIndex === -1) {
      throw new Error(`节点不存在: ${nodeUrl}`);
    }

    console.log(`🔄 [MultiNode] 手动切换到节点: ${this.nodes[nodeIndex].name}`);
    
    try {
      const web3 = await this.testNodeConnection(this.nodes[nodeIndex]);
      this.currentNodeIndex = nodeIndex;
      this.web3Instances.set(nodeUrl, web3);
      
      console.log(`✅ [MultiNode] 成功切换到: ${this.nodes[nodeIndex].name}`);
    } catch (error) {
      throw new Error(`切换节点失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 停止多节点管理器
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    
    this.web3Instances.clear();
    console.log('⏹️ [MultiNode] 多节点管理器已停止');
  }

  /**
   * 工具方法：睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 