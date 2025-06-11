/**
 * 策略持久化管理器
 * 负责策略数据的本地存储、状态管理和恢复
 */

export class StrategyPersistenceManager {
  constructor() {
    this.storageKey = 'strategy_instances';
    this.stateKey = 'strategy_states';
    this.recoveryKey = 'strategy_recovery';
    this.configKey = 'strategy_configs';
    
    // 初始化存储结构
    this.initializeStorage();
  }

  /**
   * 初始化存储结构
   */
  initializeStorage() {
    if (!localStorage.getItem(this.storageKey)) {
      localStorage.setItem(this.storageKey, JSON.stringify({}));
    }
    if (!localStorage.getItem(this.stateKey)) {
      localStorage.setItem(this.stateKey, JSON.stringify({}));
    }
    if (!localStorage.getItem(this.recoveryKey)) {
      localStorage.setItem(this.recoveryKey, JSON.stringify({}));
    }
    if (!localStorage.getItem(this.configKey)) {
      localStorage.setItem(this.configKey, JSON.stringify({}));
    }
  }

  /**
   * 保存策略实例
   */
  saveStrategy(instanceId, strategyData) {
    try {
      const strategies = this.getAllStrategies();
      
      // 保存完整策略数据
      strategies[instanceId] = {
        ...strategyData,
        instanceId,
        lastUpdated: Date.now(),
        persistenceVersion: '1.0'
      };
      
      localStorage.setItem(this.storageKey, JSON.stringify(strategies));
      
      // 同时保存到恢复数据中
      this.saveRecoveryData(instanceId, {
        type: 'strategy_saved',
        timestamp: Date.now(),
        data: strategyData
      });
      
      console.log(`✅ 策略已保存: ${instanceId}`);
      return true;
    } catch (error) {
      console.error('保存策略失败:', error);
      return false;
    }
  }

  /**
   * 保存策略状态
   */
  saveStrategyState(instanceId, state) {
    try {
      const states = this.getAllStates();
      
      states[instanceId] = {
        ...state,
        instanceId,
        lastUpdated: Date.now(),
        stateVersion: '1.0'
      };
      
      localStorage.setItem(this.stateKey, JSON.stringify(states));
      
      // 保存到恢复数据
      this.saveRecoveryData(instanceId, {
        type: 'state_updated',
        timestamp: Date.now(),
        state: state
      });
      
      console.log(`📊 状态已保存: ${instanceId} - ${state.状态}`);
      return true;
    } catch (error) {
      console.error('保存策略状态失败:', error);
      return false;
    }
  }

  /**
   * 保存恢复数据（用于断点续传）
   */
  saveRecoveryData(instanceId, recoveryInfo) {
    try {
      const recoveryData = this.getAllRecoveryData();
      
      if (!recoveryData[instanceId]) {
        recoveryData[instanceId] = {
          timeline: [],
          checkpoints: {}
        };
      }
      
      // 添加到时间线
      recoveryData[instanceId].timeline.push(recoveryInfo);
      
      // 保留最近100条记录
      if (recoveryData[instanceId].timeline.length > 100) {
        recoveryData[instanceId].timeline = recoveryData[instanceId].timeline.slice(-100);
      }
      
      // 保存检查点
      if (recoveryInfo.checkpoint) {
        recoveryData[instanceId].checkpoints[recoveryInfo.checkpoint] = {
          timestamp: Date.now(),
          data: recoveryInfo.data
        };
      }
      
      localStorage.setItem(this.recoveryKey, JSON.stringify(recoveryData));
      return true;
    } catch (error) {
      console.error('保存恢复数据失败:', error);
      return false;
    }
  }

  /**
   * 获取所有策略
   */
  getAllStrategies() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('读取策略数据失败:', error);
      return {};
    }
  }

  /**
   * 获取策略
   */
  getStrategy(instanceId) {
    const strategies = this.getAllStrategies();
    return strategies[instanceId] || null;
  }

  /**
   * 获取所有状态
   */
  getAllStates() {
    try {
      const data = localStorage.getItem(this.stateKey);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('读取状态数据失败:', error);
      return {};
    }
  }

  /**
   * 获取策略状态
   */
  getStrategyState(instanceId) {
    const states = this.getAllStates();
    return states[instanceId] || null;
  }

  /**
   * 获取所有恢复数据
   */
  getAllRecoveryData() {
    try {
      const data = localStorage.getItem(this.recoveryKey);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('读取恢复数据失败:', error);
      return {};
    }
  }

  /**
   * 获取恢复数据
   */
  getRecoveryData(instanceId) {
    const recoveryData = this.getAllRecoveryData();
    return recoveryData[instanceId] || null;
  }

  /**
   * 检查是否有可恢复的策略
   */
  getRecoverableStrategies() {
    const strategies = this.getAllStrategies();
    const states = this.getAllStates();
    const recoverableStrategies = [];
    
    for (const instanceId in strategies) {
      const strategy = strategies[instanceId];
      const state = states[instanceId];
      
      // 检查策略是否需要恢复
      if (state && this.shouldRecover(strategy, state)) {
        recoverableStrategies.push({
          instanceId,
          strategy,
          state,
          recoveryData: this.getRecoveryData(instanceId)
        });
      }
    }
    
    return recoverableStrategies;
  }

  /**
   * 判断策略是否应该恢复
   */
  shouldRecover(strategy, state) {
    if (!state || !state.状态) return false;
    
    // 检查状态是否为运行中或监控中
    const runningStates = ['准备中', '运行中', '监控中'];
    if (!runningStates.includes(state.状态)) return false;
    
    // 检查最后更新时间（超过5分钟认为可能中断）
    const lastUpdate = state.lastUpdated || strategy.lastUpdated || 0;
    const timeSinceUpdate = Date.now() - lastUpdate;
    const maxIdleTime = 5 * 60 * 1000; // 5分钟
    
    return timeSinceUpdate > maxIdleTime;
  }

  /**
   * 恢复策略执行
   */
  async recoverStrategy(instanceId, apiService) {
    try {
      const strategy = this.getStrategy(instanceId);
      const state = this.getStrategyState(instanceId);
      const recoveryData = this.getRecoveryData(instanceId);
      
      if (!strategy || !state) {
        throw new Error('策略或状态数据缺失');
      }
      
      console.log(`🔄 开始恢复策略: ${instanceId}`);
      console.log(`📊 当前状态: ${state.状态}`);
      console.log(`📅 最后更新: ${new Date(state.lastUpdated || 0).toLocaleString()}`);
      
      // 根据状态确定恢复方式
      let recoveryResult;
      
      switch (state.状态) {
        case '准备中':
          // 重新启动策略
          recoveryResult = await this.recoverFromPreparation(instanceId, strategy, apiService);
          break;
          
        case '运行中':
          // 检查头寸状态，恢复监控
          recoveryResult = await this.recoverFromRunning(instanceId, strategy, state, apiService);
          break;
          
        case '监控中':
          // 恢复监控状态
          recoveryResult = await this.recoverFromMonitoring(instanceId, strategy, state, apiService);
          break;
          
        default:
          throw new Error(`不支持从状态 ${state.状态} 恢复`);
      }
      
      // 更新恢复记录
      this.saveRecoveryData(instanceId, {
        type: 'strategy_recovered',
        timestamp: Date.now(),
        result: recoveryResult,
        checkpoint: 'recovery_completed'
      });
      
      console.log(`✅ 策略恢复成功: ${instanceId}`);
      return recoveryResult;
      
    } catch (error) {
      console.error(`❌ 策略恢复失败: ${instanceId}`, error);
      
      // 记录恢复失败
      this.saveRecoveryData(instanceId, {
        type: 'recovery_failed',
        timestamp: Date.now(),
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * 从准备阶段恢复
   */
  async recoverFromPreparation(instanceId, strategy, apiService) {
    console.log(`🔄 从准备阶段恢复策略: ${instanceId}`);
    
    // 重新启动策略
    const result = await apiService.startStrategy(instanceId);
    
    if (result.success) {
      this.saveStrategyState(instanceId, {
        状态: '准备中',
        恢复时间: Date.now(),
        恢复方式: '重新启动'
      });
    }
    
    return result;
  }

  /**
   * 从运行阶段恢复
   */
  async recoverFromRunning(instanceId, strategy, state, apiService) {
    console.log(`🔄 从运行阶段恢复策略: ${instanceId}`);
    
    // 检查策略状态
    const currentState = await apiService.getStrategyStatus(instanceId);
    
    if (currentState.success && currentState.data) {
      // 更新本地状态
      this.saveStrategyState(instanceId, {
        ...currentState.data,
        恢复时间: Date.now(),
        恢复方式: '状态同步'
      });
      
      // 如果还在运行中，尝试恢复监控
      if (currentState.data.状态 === '监控中') {
        return await this.recoverFromMonitoring(instanceId, strategy, currentState.data, apiService);
      }
    } else {
      // 策略状态获取失败，尝试重新启动
      return await this.recoverFromPreparation(instanceId, strategy, apiService);
    }
    
    return currentState;
  }

  /**
   * 从监控阶段恢复
   */
  async recoverFromMonitoring(instanceId, strategy, state, apiService) {
    console.log(`🔄 从监控阶段恢复策略: ${instanceId}`);
    
    // 恢复监控状态的逻辑
    this.saveStrategyState(instanceId, {
      ...state,
      状态: '监控中',
      恢复时间: Date.now(),
      恢复方式: '监控恢复'
    });
    
    return {
      success: true,
      message: '监控状态已恢复',
      data: state
    };
  }

  /**
   * 删除策略
   */
  deleteStrategy(instanceId) {
    try {
      // 删除策略数据
      const strategies = this.getAllStrategies();
      delete strategies[instanceId];
      localStorage.setItem(this.storageKey, JSON.stringify(strategies));
      
      // 删除状态数据
      const states = this.getAllStates();
      delete states[instanceId];
      localStorage.setItem(this.stateKey, JSON.stringify(states));
      
      // 删除恢复数据
      const recoveryData = this.getAllRecoveryData();
      delete recoveryData[instanceId];
      localStorage.setItem(this.recoveryKey, JSON.stringify(recoveryData));
      
      console.log(`🗑️ 策略已删除: ${instanceId}`);
      return true;
    } catch (error) {
      console.error('删除策略失败:', error);
      return false;
    }
  }

  /**
   * 清理过期数据
   */
  cleanupExpiredData(maxAge = 7 * 24 * 60 * 60 * 1000) { // 默认7天
    try {
      const now = Date.now();
      
      // 清理过期策略
      const strategies = this.getAllStrategies();
      for (const instanceId in strategies) {
        const strategy = strategies[instanceId];
        if (strategy.lastUpdated && (now - strategy.lastUpdated) > maxAge) {
          this.deleteStrategy(instanceId);
        }
      }
      
      console.log('✅ 过期数据清理完成');
    } catch (error) {
      console.error('清理过期数据失败:', error);
    }
  }

  /**
   * 导出策略数据
   */
  exportData() {
    return {
      strategies: this.getAllStrategies(),
      states: this.getAllStates(),
      recoveryData: this.getAllRecoveryData(),
      exportTime: Date.now(),
      version: '1.0'
    };
  }

  /**
   * 导入策略数据
   */
  importData(data) {
    try {
      if (data.strategies) {
        localStorage.setItem(this.storageKey, JSON.stringify(data.strategies));
      }
      if (data.states) {
        localStorage.setItem(this.stateKey, JSON.stringify(data.states));
      }
      if (data.recoveryData) {
        localStorage.setItem(this.recoveryKey, JSON.stringify(data.recoveryData));
      }
      
      console.log('✅ 策略数据导入成功');
      return true;
    } catch (error) {
      console.error('导入策略数据失败:', error);
      return false;
    }
  }
} 