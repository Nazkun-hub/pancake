/**
 * 🌐 API服务模块 - 策略引擎的API调用封装
 */

import { 策略实例 } from '../../types/interfaces.js';

export class ApiService {
  private static readonly CONSTANTS = {
    LIQUIDITY_API_URL: 'http://localhost:4000/api/add-liquidity',
    WALLET_INFO_API_URL: 'http://localhost:4000/api/wallet/info',
    STRATEGY_API_URL: 'http://localhost:4000/api',
  };

  // 依赖注入的服务
  private web3Service: any;

  constructor(web3Service?: any) {
    this.web3Service = web3Service;
  }

  /**
   * 设置Web3Service（用于依赖注入）
   */
  setWeb3Service(web3Service: any) {
    this.web3Service = web3Service;
  }

  /**
   * 通用API调用方法
   */
  private async apiCall<T = any>(
    url: string, 
    options: {
      method?: 'GET' | 'POST' | 'DELETE' | 'PUT';
      body?: any;
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        ...(body && { body: JSON.stringify(body) })
      });
      
      const result = await response.json() as any;
      
      // 对于不同的API使用不同的成功判断标准
      if (!response.ok) {
        throw new Error(result.error || `API调用失败: HTTP ${response.status}`);
      }
      
      // 特殊处理：health API不需要success字段
      if (url.includes('/health')) {
        return result as T;
      }
      
      // 其他API需要success字段
      if (!result.success) {
        throw new Error(result.error || `API调用失败: HTTP ${response.status}`);
      }
      
      return result as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`网络请求失败: ${String(error)}`);
    }
  }

  /**
   * 钱包API专用调用方法
   */
  private async walletApiCall<T = any>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST';
      body?: any;
    } = {}
  ): Promise<T> {
    const url = `http://localhost:4000/api/wallet${endpoint}`;
    return this.apiCall<T>(url, options);
  }

  /**
   * 获取钱包地址
   */
  async 获取钱包地址(): Promise<string> {
    const result = await this.apiCall<{
      success: boolean;
      error?: string;
      info?: {
        address?: string;
        isConnected?: boolean;
      };
    }>(ApiService.CONSTANTS.WALLET_INFO_API_URL);
    
    const address = result.info?.address;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error('获取的钱包地址格式无效');
    }
    
    return address;
  }

  /**
   * 获取代币余额 - 通过API调用
   */
  async 获取代币余额(钱包地址: string, 代币地址: string): Promise<number> {
    try {
      console.log(`🔍 获取代币余额: ${代币地址} for ${钱包地址}`);
      
      // 修复API路径：直接调用balance路由，不使用wallet前缀
      const result = await this.apiCall<{
        success: boolean;
        error?: string;
        balance?: string;
        symbol?: string;
        decimals?: number;
      }>(`http://localhost:4000/api/balance/${钱包地址}/${代币地址}`);
      
      if (!result.success || !result.balance) {
        throw new Error(result.error || '余额查询失败');
      }
      
      const balance = parseFloat(result.balance);
      
      if (isNaN(balance) || balance < 0) {
        throw new Error('余额数值无效');
      }
      
      console.log(`✅ 代币余额获取成功: ${balance} ${result.symbol || ''}`);
      return balance;
      
    } catch (error) {
      console.error('❌ 获取代币余额失败:', error);
      throw new Error(`代币余额查询失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 创建流动性头寸 - 调用正确的API
   */
  async 创建流动性头寸(实例: 策略实例): Promise<any> {
    const 配置 = 实例.配置;
    const 市场数据 = 实例.市场数据;
    
    if (!市场数据) {
      throw new Error('市场数据未获取');
    }
    
    // 🔧 修复：根据主要代币配置确定输入代币地址（而非硬编码符号）
    let inputTokenAddress: string;
    let inputTokenSymbol: string;
    
    if (配置.主要代币 === 'token0') {
      inputTokenAddress = 市场数据.token0信息.address;
      inputTokenSymbol = 市场数据.token0信息.symbol;
    } else if (配置.主要代币 === 'token1') {
      inputTokenAddress = 市场数据.token1信息.address;
      inputTokenSymbol = 市场数据.token1信息.symbol;
    } else {
      throw new Error(`无效的主要代币配置: ${配置.主要代币}`);
    }
    
    console.log(`[STRATEGY] 📊 确定输入代币: ${inputTokenSymbol} (地址: ${inputTokenAddress})`);
    console.log(`[STRATEGY] 📊 主要代币配置: ${配置.主要代币}`);
    console.log(`[STRATEGY] 📊 输入数量: ${配置.代币数量}`);

    // 获取价格范围百分比 - 优先使用前端传递的百分比
    let 下限百分比: number;
    let 上限百分比: number;
    
    if (配置.代币范围.下限百分比 !== undefined && 配置.代币范围.上限百分比 !== undefined) {
      // 前端传递了百分比，直接使用
      下限百分比 = 配置.代币范围.下限百分比;
      上限百分比 = 配置.代币范围.上限百分比;
      console.log(`[STRATEGY] 📊 使用前端配置的价格范围百分比: ${下限百分比}% ~ ${上限百分比}%`);
    } else {
      // 前端没有传递百分比，从tick计算
      const 当前tick = 市场数据.池子状态.tick;
      下限百分比 = ((配置.代币范围.下限tick - 当前tick) / 100);
      上限百分比 = ((配置.代币范围.上限tick - 当前tick) / 100);
      console.log(`[STRATEGY] 📊 从tick计算的价格范围百分比: ${下限百分比}% ~ ${上限百分比}% (基于tick ${当前tick})`);
    }
    
    // 🔧 关键修复：传递正确的代币地址而非硬编码的符号
    const apiPayload = {
      inputAmount: 配置.代币数量.toString(),
      inputToken: inputTokenAddress,  // ✅ 使用代币地址而非符号
      lowerPercent: 下限百分比,
      upperPercent: 上限百分比,
      baseSlippagePercent: 配置.流动性滑点 || 配置.滑点设置 || 20,  // 🔧 使用专门的流动性滑点
      poolConfig: {
        poolAddress: 配置.池地址,
        token0Address: 市场数据.token0信息.address,
        token1Address: 市场数据.token1信息.address,
        fee: 市场数据.池子状态.fee || 100
      }
    };
    
    console.log(`[STRATEGY] 🔍 API调用参数检查:`);
    console.log(`[STRATEGY]   inputAmount: ${apiPayload.inputAmount}`);
    console.log(`[STRATEGY]   inputToken (地址): ${apiPayload.inputToken}`);
    console.log(`[STRATEGY]   inputToken (符号): ${inputTokenSymbol}`);
    console.log(`[STRATEGY]   主要代币: ${配置.主要代币}`);
    console.log(`[STRATEGY]   token0: ${市场数据.token0信息.symbol} (${市场数据.token0信息.address})`);
    console.log(`[STRATEGY]   token1: ${市场数据.token1信息.symbol} (${市场数据.token1信息.address})`);
    console.log(`[STRATEGY]   lowerPercent: ${apiPayload.lowerPercent}%`);
    console.log(`[STRATEGY]   upperPercent: ${apiPayload.upperPercent}%`);

    // 调用正确的流动性创建API
    const result = await this.apiCall<{
      success: boolean;
      error?: string;
      data?: {
        txHash?: string;
        tokenId?: string | number;
        gasUsed?: string;
        totalCost?: string;
        calculatedParams?: {
          finalState?: {
            amount0?: string;
            amount1?: string;
            liquidity?: string;
          };
        };
      };
      message?: string;
    }>('http://localhost:4000/api/add-liquidity', {
      method: 'POST',
      body: apiPayload
    });

    const 头寸数据 = result.data;
    if (!头寸数据) {
      throw new Error('API返回数据为空');
    }
    
    // 验证关键数据
    if (!头寸数据.txHash || 头寸数据.txHash.trim() === '') {
      throw new Error('交易哈希为空，头寸创建可能失败');
    }

    // 处理TokenID验证 - 考虑解析失败的情况
    if (!头寸数据.tokenId || 头寸数据.tokenId === 'PARSE_FAILED_CHECK_MANUALLY') {
      console.warn(`⚠️ TokenID解析失败或无效: ${头寸数据.tokenId}`);
      console.warn(`⚠️ 交易已成功执行: ${头寸数据.txHash}`);
      console.warn(`⚠️ 请手动检查交易以确认TokenID`);
      
      // 不抛出错误，而是使用一个特殊值继续执行
      头寸数据.tokenId = 'MANUAL_CHECK_REQUIRED';
    } else if (parseInt(String(头寸数据.tokenId)) <= 0) {
      throw new Error(`TokenID无效: ${头寸数据.tokenId}，头寸创建失败`);
    }
    
    return {
      tokenId: parseInt(String(头寸数据.tokenId)) || 0,
      transactionHash: 头寸数据.txHash,
      status: '成功',
      说明: '通过API成功创建流动性头寸',
      amount0: 头寸数据.calculatedParams?.finalState?.amount0 || '0',
      amount1: 头寸数据.calculatedParams?.finalState?.amount1 || '0',
      liquidity: 头寸数据.calculatedParams?.finalState?.liquidity || '0',
      tickLower: 配置.代币范围.下限tick,
      tickUpper: 配置.代币范围.上限tick,
      gasUsed: 头寸数据.gasUsed || '0',
      totalCost: 头寸数据.totalCost || '0',
      inputToken: inputTokenSymbol,  // 保持符号用于显示
      inputTokenAddress: inputTokenAddress,  // 新增：用于调试
      inputAmount: 配置.代币数量,
      创建时间: Date.now()
    };
  }

  /**
   * 关闭流动性头寸 - 调用现有的关闭头寸API
   */
  async 关闭流动性头寸(tokenId: string): Promise<any> {
    try {
      console.log(`🗑️ 调用关闭头寸API: TokenID ${tokenId}`);
      
      // 使用完整的API路径
      const 关闭结果 = await this.apiCall(`http://localhost:4000/api/positions/${tokenId}`, {
        method: 'DELETE'
      });

      if (!关闭结果.success) {
        throw new Error(关闭结果.error || '头寸关闭失败');
      }

      console.log(`✅ 头寸关闭成功: ${关闭结果.result?.transactionHash || '未提供哈希'}`);
      return 关闭结果;
    } catch (error) {
      console.error('❌ 关闭流动性头寸失败:', error);
      throw new Error(`头寸关闭失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 获取策略状态
   */
  async getStrategyStatus(instanceId: string): Promise<any> {
    try {
      console.log(`📊 获取策略状态: ${instanceId}`);
      
      const result = await this.apiCall<{
        success: boolean;
        error?: string;
        data?: {
          状态?: string;
          实例ID?: string;
          头寸信息?: any;
          利润信息?: any;
          市场数据?: any;
          lastUpdated?: number;
        };
      }>(`${ApiService.CONSTANTS.STRATEGY_API_URL}/strategy/${instanceId}/status`);
      
      if (!result.success) {
        throw new Error(result.error || '获取策略状态失败');
      }
      
      console.log(`✅ 策略状态获取成功: ${instanceId} - ${result.data?.状态}`);
      return result;
      
    } catch (error) {
      console.error(`❌ 获取策略状态失败: ${instanceId}`, error);
      throw new Error(`策略状态获取失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 启动策略（支持恢复）
   */
  async startStrategy(instanceId: string, resumeFromCheckpoint?: string): Promise<any> {
    try {
      console.log(`🚀 启动策略: ${instanceId}${resumeFromCheckpoint ? ` (从检查点恢复: ${resumeFromCheckpoint})` : ''}`);
      
      const result = await this.apiCall<{
        success: boolean;
        error?: string;
        data?: {
          状态?: string;
          message?: string;
        };
      }>(`${ApiService.CONSTANTS.STRATEGY_API_URL}/strategy/${instanceId}/start`, {
        method: 'POST',
        body: resumeFromCheckpoint ? { resumeFromCheckpoint } : {}
      });
      
      if (!result.success) {
        throw new Error(result.error || '启动策略失败');
      }
      
      console.log(`✅ 策略启动成功: ${instanceId}`);
      return result;
      
    } catch (error) {
      console.error(`❌ 启动策略失败: ${instanceId}`, error);
      throw new Error(`策略启动失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 获取所有策略实例
   */
  async getAllStrategyInstances(): Promise<any> {
    try {
      console.log('📋 获取所有策略实例...');
      
      const result = await this.apiCall<{
        success: boolean;
        error?: string;
        data?: any[];
      }>(`${ApiService.CONSTANTS.STRATEGY_API_URL}/strategy/instances`);
      
      if (!result.success) {
        throw new Error(result.error || '获取策略列表失败');
      }
      
      console.log(`✅ 策略列表获取成功: ${result.data?.length || 0} 个策略`);
      return result;
      
    } catch (error) {
      console.error('❌ 获取策略列表失败:', error);
      throw new Error(`策略列表获取失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
} 