/**
 * 策略API封装类
 * 负责与策略引擎服务器的API通信 (4000端口)
 */

export class StrategyAPI {
  constructor(baseURL = 'http://localhost:4000') {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  /**
   * 通用请求方法
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: { ...this.defaultHeaders, ...options.headers },
      ...options
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API请求失败 [${endpoint}]:`, error);
      throw error;
    }
  }

  /**
   * GET请求
   */
  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  /**
   * POST请求
   */
  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * PUT请求
   */
  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * DELETE请求
   */
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // ==================== 策略管理API ====================

  /**
   * 创建策略
   */
  async createStrategy(config) {
    // 转换前端表单数据为后端API格式
    const strategyConfig = {
      池地址: config.poolAddress,
      代币数量: config.amount,
      主要代币: config.mainToken,
      // 🔧 修复：正确映射新的滑点字段
      okxSlippage: config.okxSlippage,           // 前端okxSlippage -> 后端okxSlippage
      liquiditySlippage: config.liquiditySlippage, // 前端liquiditySlippage -> 后端liquiditySlippage
      交换缓冲百分比: config.swapBuffer,
      自动退出: {
        启用超时退出: true,
        超时时长: config.timeoutSeconds * 1000, // 转换为毫秒
        退出代币选择: config.exitToken
      }
    };

    // 添加价格范围配置 (使用百分比，后端策略引擎会调用tick计算API)
    if (config.lowerPercent !== undefined && config.upperPercent !== undefined) {
      strategyConfig.价格范围配置 = {
        下限百分比: config.lowerPercent,
        上限百分比: config.upperPercent
      };
    }

    console.log('发送策略配置数据:', strategyConfig);
    return this.post('/api/strategy/create', strategyConfig);
  }

  /**
   * 获取策略列表 (已废弃，使用getAllStrategyInstances)
   */
  async getStrategyList() {
    return this.getAllStrategyInstances();
  }

  /**
   * 启动策略
   */
  async startStrategy(instanceId) {
    return this.post(`/api/strategy/${instanceId}/start`);
  }

  /**
   * 停止策略
   */
  async stopStrategy(instanceId) {
    return this.post(`/api/strategy/${instanceId}/stop`);
  }

  /**
   * 🚨 强制退出策略
   */
  async forceExitStrategy(instanceId) {
    return this.post(`/api/strategy/${instanceId}/force-exit`);
  }

  /**
   * 获取策略状态
   */
  async getStrategyStatus(instanceId) {
    return this.get(`/api/strategy/${instanceId}/status`);
  }

  /**
   * 获取所有策略实例状态
   */
  async getAllStrategyInstances() {
    return this.get('/api/strategy/instances');
  }

  /**
   * 删除策略
   */
  async deleteStrategy(instanceId) {
    return this.delete(`/api/strategy/${instanceId}`);
  }

  /**
   * 重置策略状态
   */
  async resetStrategy(instanceId) {
    return this.post(`/api/strategy/${instanceId}/reset`);
  }

  /**
   * 更新策略配置
   */
  async updateStrategy(instanceId, config) {
    return this.put(`/api/strategy/${instanceId}`, config);
  }

  // ==================== 盈亏统计API ====================

  /**
   * 获取策略盈亏
   */
  async getStrategyProfit(instanceId) {
    return this.get(`/api/strategy/${instanceId}/profit`);
  }

  /**
   * 获取总体盈亏统计
   */
  async getTotalProfitSummary() {
    return this.get('/api/strategy/profit/summary');
  }

  // ==================== 系统状态API ====================

  /**
   * 获取系统健康状态
   */
  async getHealthStatus() {
    return this.get('/api/health');
  }

  /**
   * 获取策略统计信息
   */
  async getStrategyStats() {
    try {
      const instances = await this.getAllStrategyInstances();
      
      if (!instances || !instances.success) {
        return {
          total: 0,
          active: 0,
          totalProfit: 0,
          successRate: 0
        };
      }

      const strategies = instances.data || [];
      const totalStrategies = strategies.length;
      const activeStrategies = strategies.filter(s => 
        s.状态 === '运行中' || s.状态 === '监控中'
      ).length;

      // 计算盈亏统计
      let totalProfit = 0;
      let completedStrategies = 0;
      let profitableStrategies = 0;

      strategies.forEach(strategy => {
        if (strategy.盈亏统计) {
          totalProfit += strategy.盈亏统计.总盈亏 || 0;
          completedStrategies++;
          if (strategy.盈亏统计.总盈亏 > 0) {
            profitableStrategies++;
          }
        }
      });

      const successRate = completedStrategies > 0 ? 
        (profitableStrategies / completedStrategies) * 100 : 0;

      return {
        total: totalStrategies,
        active: activeStrategies,
        totalProfit: totalProfit,
        successRate: successRate
      };

    } catch (error) {
      console.error('获取策略统计失败:', error);
      return {
        total: 0,
        active: 0,
        totalProfit: 0,
        successRate: 0
      };
    }
  }

  // ==================== 池信息API ====================

  /**
   * 获取可用的流动性池列表
   */
  async getAvailablePools() {
    try {
      // 调用策略引擎的池信息API
      return this.get('/api/pools/list');
    } catch (error) {
      console.warn('获取池列表失败，使用默认数据:', error);
      // 返回默认的热门池
      return [
        {
          address: '0x36696169c63e42cd08ce11f5deebbcebae652050',
          name: 'WBNB/USDT',
          fee: 2500,
          tvl: '$10M+'
        },
        {
          address: '0x92c3e2c395c4968912f417dd9de98a0fc582b38e',
          name: 'WBNB/BUSD', 
          fee: 500,
          tvl: '$5M+'
        }
      ];
    }
  }

  /**
   * 获取池的当前价格信息
   */
  async getPoolPrice(poolAddress) {
    try {
      return this.get(`/api/pools/${poolAddress}/price`);
    } catch (error) {
      console.warn('获取池价格失败:', error);
      return {
        currentTick: 0,
        price: '0',
        priceUSD: '0'
      };
    }
  }

  /**
   * 获取池子的代币信息
   */
  async getPoolTokenInfo(poolAddress) {
    try {
      const result = await this.get(`/api/pool-info/${poolAddress}`);
      
      if (result.success && result.data) {
        // 转换后端数据结构为前端期望的格式
        return {
          success: true,
          token0: {
            address: result.data.token0Info.address,
            symbol: result.data.token0Info.symbol,
            decimals: result.data.token0Info.decimals,
            name: result.data.token0Info.name
          },
          token1: {
            address: result.data.token1Info.address,
            symbol: result.data.token1Info.symbol,
            decimals: result.data.token1Info.decimals,
            name: result.data.token1Info.name
          },
          poolState: result.data.poolState
        };
      } else {
        throw new Error(result.error || '获取池子信息失败');
      }
    } catch (error) {
      console.warn('获取池子代币信息失败:', error);
      // 返回默认结构，避免前端报错
      return {
        success: false,
        error: error.message,
        token0: {
          address: '',
          symbol: 'Token0',
          decimals: 18,
          name: 'Unknown Token 0'
        },
        token1: {
          address: '',
          symbol: 'Token1', 
          decimals: 18,
          name: 'Unknown Token 1'
        }
      };
    }
  }

  /**
   * 获取池子的完整信息 (包含代币和价格)
   */
  async getPoolInfo(poolAddress) {
    try {
      return this.get(`/api/pools/${poolAddress}/info`);
    } catch (error) {
      console.warn('获取池子信息失败:', error);
      return {
        address: poolAddress,
        token0: {
          address: '',
          symbol: 'Token0',
          decimals: 18,
          name: 'Unknown Token 0'
        },
        token1: {
          address: '',
          symbol: 'Token1',
          decimals: 18,
          name: 'Unknown Token 1'
        },
        fee: 0,
        currentTick: 0,
        price: '0'
      };
    }
  }

  // ==================== 钱包和余额API ====================

  /**
   * 获取钱包余额
   */
  async getWalletBalance() {
    try {
      return this.get('/api/wallet/balance');
    } catch (error) {
      console.warn('获取钱包余额失败:', error);
      return {
        native: '0',
        tokens: {}
      };
    }
  }

  /**
   * 获取代币余额
   */
  async getTokenBalance(tokenAddress) {
    try {
      return this.get(`/api/wallet/token/${tokenAddress}/balance`);
    } catch (error) {
      console.warn('获取代币余额失败:', error);
      return { balance: '0', formatted: '0' };
    }
  }

  // ==================== 历史数据API ====================

  /**
   * 获取策略历史记录
   */
  async getStrategyHistory(instanceId, timeframe = '1d') {
    try {
      return this.get(`/api/strategy/${instanceId}/history?timeframe=${timeframe}`);
    } catch (error) {
      console.warn('获取策略历史失败:', error);
      return [];
    }
  }

  /**
   * 获取价格历史数据
   */
  async getPriceHistory(poolAddress, timeframe = '1h') {
    try {
      return this.get(`/api/pools/${poolAddress}/history?timeframe=${timeframe}`);
    } catch (error) {
      console.warn('获取价格历史失败:', error);
      return [];
    }
  }

  // ==================== 错误处理和重试 ====================

  /**
   * 带重试的请求
   */
  async requestWithRetry(endpoint, options = {}, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await this.request(endpoint, options);
      } catch (error) {
        lastError = error;
        
        if (i < maxRetries) {
          // 指数退避
          const delay = Math.pow(2, i) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          console.warn(`API请求重试 ${i + 1}/${maxRetries}: ${endpoint}`);
        }
      }
    }
    
    throw lastError;
  }

  // ==================== 测试连接 ====================

  /**
   * 测试API连接
   */
  async testConnection() {
    try {
      const health = await this.getHealthStatus();
      return {
        connected: true,
        status: health.status,
        services: health.services
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
} 