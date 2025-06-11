/**
 * 策略恢复管理组件
 * 处理系统重启后的策略恢复
 */

export class StrategyRecoveryManager {
  constructor(persistenceManager, api, websocket) {
    this.persistence = persistenceManager;
    this.api = api;
    this.websocket = websocket;
    this.recoveryModal = null;
    this.recoverableStrategies = [];
  }

  /**
   * 检查是否有可恢复的策略
   */
  async checkForRecoverableStrategies() {
    try {
      console.log('🔍 检查可恢复的策略...');
      
      this.recoverableStrategies = this.persistence.getRecoverableStrategies();
      
      if (this.recoverableStrategies.length > 0) {
        console.log(`📋 发现 ${this.recoverableStrategies.length} 个可恢复的策略`);
        this.showRecoveryModal();
        return true;
      } else {
        console.log('✅ 没有需要恢复的策略');
        return false;
      }
    } catch (error) {
      console.error('检查恢复策略失败:', error);
      return false;
    }
  }

  /**
   * 显示恢复模态框
   */
  showRecoveryModal() {
    const modalHTML = this.createRecoveryModalHTML();
    
    // 创建模态框容器
    const modalContainer = document.createElement('div');
    modalContainer.className = 'recovery-modal-overlay';
    modalContainer.innerHTML = modalHTML;
    
    document.body.appendChild(modalContainer);
    this.recoveryModal = modalContainer;
    
    // 绑定事件
    this.bindRecoveryEvents();
    
    // 显示动画
    setTimeout(() => {
      modalContainer.classList.add('show');
    }, 10);
  }

  /**
   * 创建恢复模态框HTML
   */
  createRecoveryModalHTML() {
    const strategiesHTML = this.recoverableStrategies.map(item => {
      const { instanceId, strategy, state } = item;
      const lastUpdate = new Date(state.lastUpdated || 0).toLocaleString();
      const timeSinceUpdate = this.getTimeSinceUpdate(state.lastUpdated || 0);
      
      return `
        <div class="recovery-strategy-item" data-instance-id="${instanceId}">
          <div class="strategy-info">
            <div class="strategy-header">
              <h4>${this.getStrategyDisplayName(strategy)}</h4>
              <span class="status-badge status-${state.状态}">${state.状态}</span>
            </div>
            <div class="strategy-details">
              <div class="detail-item">
                <span class="label">池地址:</span>
                <span class="value">${this.truncateAddress(strategy.配置?.池地址 || 'N/A')}</span>
              </div>
              <div class="detail-item">
                <span class="label">最后更新:</span>
                <span class="value">${lastUpdate}</span>
              </div>
              <div class="detail-item">
                <span class="label">中断时长:</span>
                <span class="value text-warning">${timeSinceUpdate}</span>
              </div>
            </div>
          </div>
          <div class="strategy-actions">
            <label class="checkbox-container">
              <input type="checkbox" class="strategy-checkbox" checked>
              <span class="checkmark"></span>
              恢复此策略
            </label>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="recovery-modal">
        <div class="recovery-header">
          <div class="recovery-icon">🔄</div>
          <h2>检测到中断的策略</h2>
          <p>系统检测到 ${this.recoverableStrategies.length} 个策略在上次运行时被中断，您可以选择恢复这些策略。</p>
        </div>
        
        <div class="recovery-content">
          <div class="recovery-toolbar">
            <div class="toolbar-left">
              <button class="btn btn-outline btn-sm" id="selectAll">全选</button>
              <button class="btn btn-outline btn-sm" id="selectNone">全不选</button>
            </div>
            <div class="toolbar-right">
              <span class="selected-count">已选择 <span id="selectedCount">${this.recoverableStrategies.length}</span> 个策略</span>
            </div>
          </div>
          
          <div class="recovery-strategies">
            ${strategiesHTML}
          </div>
        </div>
        
        <div class="recovery-footer">
          <div class="recovery-options">
            <label class="checkbox-container">
              <input type="checkbox" id="autoRecoveryEnabled" checked>
              <span class="checkmark"></span>
              启用自动恢复 (下次自动恢复中断的策略)
            </label>
          </div>
          <div class="recovery-actions">
            <button class="btn btn-outline" id="skipRecovery">跳过恢复</button>
            <button class="btn btn-primary" id="startRecovery">
              <span class="btn-icon">🔄</span>
              开始恢复
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 绑定恢复事件
   */
  bindRecoveryEvents() {
    if (!this.recoveryModal) return;

    const modal = this.recoveryModal;

    // 全选/全不选
    modal.querySelector('#selectAll')?.addEventListener('click', () => {
      this.selectAllStrategies(true);
    });

    modal.querySelector('#selectNone')?.addEventListener('click', () => {
      this.selectAllStrategies(false);
    });

    // 策略选择变化
    modal.querySelectorAll('.strategy-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        this.updateSelectedCount();
      });
    });

    // 跳过恢复
    modal.querySelector('#skipRecovery')?.addEventListener('click', () => {
      this.closeRecoveryModal();
    });

    // 开始恢复
    modal.querySelector('#startRecovery')?.addEventListener('click', () => {
      this.startRecoveryProcess();
    });

    // 点击外部关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeRecoveryModal();
      }
    });
  }

  /**
   * 全选/全不选策略
   */
  selectAllStrategies(select) {
    if (!this.recoveryModal) return;

    const checkboxes = this.recoveryModal.querySelectorAll('.strategy-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = select;
    });

    this.updateSelectedCount();
  }

  /**
   * 更新已选择数量
   */
  updateSelectedCount() {
    if (!this.recoveryModal) return;

    const checkboxes = this.recoveryModal.querySelectorAll('.strategy-checkbox');
    const selectedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    const countElement = this.recoveryModal.querySelector('#selectedCount');
    if (countElement) {
      countElement.textContent = selectedCount;
    }
  }

  /**
   * 开始恢复过程
   */
  async startRecoveryProcess() {
    try {
      // 获取选中的策略
      const selectedStrategies = this.getSelectedStrategies();
      
      if (selectedStrategies.length === 0) {
        this.showNotification('请至少选择一个策略进行恢复', 'warning');
        return;
      }

      // 显示恢复进度
      this.showRecoveryProgress(selectedStrategies);

      // 依次恢复策略
      const results = [];
      for (let i = 0; i < selectedStrategies.length; i++) {
        const strategy = selectedStrategies[i];
        
        try {
          this.updateRecoveryProgress(i, strategy.instanceId, '恢复中...');
          
          const result = await this.persistence.recoverStrategy(strategy.instanceId, this.api);
          
          results.push({
            instanceId: strategy.instanceId,
            success: true,
            result: result
          });
          
          this.updateRecoveryProgress(i, strategy.instanceId, '恢复成功', 'success');
          
        } catch (error) {
          results.push({
            instanceId: strategy.instanceId,
            success: false,
            error: error.message
          });
          
          this.updateRecoveryProgress(i, strategy.instanceId, `恢复失败: ${error.message}`, 'error');
        }
      }

      // 显示恢复结果
      setTimeout(() => {
        this.showRecoveryResults(results);
      }, 1000);

    } catch (error) {
      console.error('恢复过程失败:', error);
      this.showNotification('恢复过程失败: ' + error.message, 'error');
    }
  }

  /**
   * 获取选中的策略
   */
  getSelectedStrategies() {
    if (!this.recoveryModal) return [];

    const selectedStrategies = [];
    const checkboxes = this.recoveryModal.querySelectorAll('.strategy-checkbox');
    
    checkboxes.forEach((checkbox, index) => {
      if (checkbox.checked && this.recoverableStrategies[index]) {
        selectedStrategies.push(this.recoverableStrategies[index]);
      }
    });

    return selectedStrategies;
  }

  /**
   * 显示恢复进度
   */
  showRecoveryProgress(strategies) {
    const progressHTML = `
      <div class="recovery-progress">
        <div class="progress-header">
          <h3>正在恢复策略...</h3>
          <p>请等待策略恢复完成，不要关闭页面</p>
        </div>
        <div class="progress-list">
          ${strategies.map((strategy, index) => `
            <div class="progress-item" data-index="${index}">
              <div class="progress-info">
                <span class="strategy-name">${this.getStrategyDisplayName(strategy.strategy)}</span>
                <span class="progress-status">等待中...</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    const modal = this.recoveryModal.querySelector('.recovery-modal');
    if (modal) {
      modal.innerHTML = progressHTML;
    }
  }

  /**
   * 更新恢复进度
   */
  updateRecoveryProgress(index, instanceId, status, type = 'info') {
    const progressItem = this.recoveryModal?.querySelector(`[data-index="${index}"]`);
    if (!progressItem) return;

    const statusElement = progressItem.querySelector('.progress-status');
    const progressBar = progressItem.querySelector('.progress-fill');

    if (statusElement) {
      statusElement.textContent = status;
      statusElement.className = `progress-status ${type}`;
    }

    if (progressBar) {
      progressBar.style.width = type === 'success' || type === 'error' ? '100%' : '50%';
      progressBar.className = `progress-fill ${type}`;
    }
  }

  /**
   * 显示恢复结果
   */
  showRecoveryResults(results) {
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    const resultsHTML = `
      <div class="recovery-results">
        <div class="results-header">
          <div class="results-icon ${successCount > 0 ? 'success' : 'error'}">
            ${successCount > 0 ? '✅' : '❌'}
          </div>
          <h3>恢复完成</h3>
          <p>成功恢复 ${successCount} 个策略，失败 ${failCount} 个</p>
        </div>
        
        <div class="results-details">
          ${results.map(result => `
            <div class="result-item ${result.success ? 'success' : 'error'}">
              <div class="result-icon">${result.success ? '✅' : '❌'}</div>
              <div class="result-info">
                <span class="strategy-id">${result.instanceId}</span>
                <span class="result-message">
                  ${result.success ? '恢复成功' : result.error}
                </span>
              </div>
            </div>
          `).join('')}
        </div>
        
        <div class="results-actions">
          <button class="btn btn-primary" id="closeResults">关闭</button>
        </div>
      </div>
    `;

    const modal = this.recoveryModal.querySelector('.recovery-modal');
    if (modal) {
      modal.innerHTML = resultsHTML;
      
      // 绑定关闭事件
      modal.querySelector('#closeResults')?.addEventListener('click', () => {
        this.closeRecoveryModal();
      });
    }
  }

  /**
   * 关闭恢复模态框
   */
  closeRecoveryModal() {
    if (this.recoveryModal) {
      this.recoveryModal.classList.add('hide');
      
      setTimeout(() => {
        if (this.recoveryModal && this.recoveryModal.parentNode) {
          this.recoveryModal.parentNode.removeChild(this.recoveryModal);
        }
        this.recoveryModal = null;
      }, 300);
    }
  }

  /**
   * 获取策略显示名称
   */
  getStrategyDisplayName(strategy) {
    if (!strategy || !strategy.配置) return '未知策略';
    
    const config = strategy.配置;
    const poolAddress = config.池地址 || 'unknown';
    const amount = config.代币数量 || 0;
    
    return `策略-${this.truncateAddress(poolAddress)}-${amount}`;
  }

  /**
   * 截断地址显示
   */
  truncateAddress(address) {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * 获取距离更新的时间
   */
  getTimeSinceUpdate(timestamp) {
    if (!timestamp) return '未知';
    
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}天前`;
    } else if (hours > 0) {
      return `${hours}小时前`;
    } else if (minutes > 0) {
      return `${minutes}分钟前`;
    } else {
      return '刚刚';
    }
  }

  /**
   * 显示通知
   */
  showNotification(message, type = 'info') {
    // 可以集成到主应用的通知系统
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // 创建临时通知
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : '#4caf50'};
      color: white;
      padding: 12px 16px;
      border-radius: 4px;
      z-index: 10001;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }
} 