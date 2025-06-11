/**
 * 策略列表组件
 * 显示和管理所有策略实例
 */

export class StrategyListComponent {
  constructor(container, api, websocket) {
    this.container = container;
    this.api = api;
    this.websocket = websocket;
    this.strategies = [];
    this.selectedStrategy = null;
    this.refreshInterval = null;
  }

  /**
   * 渲染策略列表界面
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="strategy-list-wrapper">
        <!-- 工具栏 -->
        <div class="list-toolbar">
          <div class="toolbar-left">
            <h3>策略列表</h3>
            <span class="strategy-count" id="strategyCount">共 0 个策略</span>
          </div>
          <div class="toolbar-right">
            <button class="btn btn-outline" id="refreshList">
              <span class="btn-icon">🔄</span>
              刷新
            </button>
            <button class="btn btn-primary" id="createNewStrategy">
              <span class="btn-icon">➕</span>
              新建策略
            </button>
          </div>
        </div>

        <!-- 过滤器 -->
        <div class="list-filters">
          <select id="statusFilter" class="filter-select">
            <option value="">所有状态</option>
            <option value="初始化">初始化</option>
            <option value="准备中">准备中</option>
            <option value="运行中">运行中</option>
            <option value="监控中">监控中</option>
            <option value="已暂停">已暂停</option>
            <option value="已完成">已完成</option>
            <option value="错误">错误</option>
          </select>
          
          <input type="text" id="searchInput" placeholder="搜索策略..." class="filter-input">
        </div>

        <!-- 策略列表 -->
        <div class="strategies-container">
          <div id="strategiesList" class="strategies-grid">
            <!-- 策略卡片将在这里动态生成 -->
          </div>
          
          <div id="emptyState" class="empty-state" style="display: none;">
            <div class="empty-icon">📋</div>
            <h3>暂无策略</h3>
            <p>点击"新建策略"开始创建您的第一个自动流动性策略</p>
            <button class="btn btn-primary" id="createFirstStrategy">
              <span class="btn-icon">➕</span>
              创建策略
            </button>
          </div>
        </div>

        <!-- 批量操作工具栏 (当选中策略时显示) -->
        <div id="batchToolbar" class="batch-toolbar" style="display: none;">
          <div class="batch-info">
            <span id="selectedCount">已选择 0 个策略</span>
          </div>
          <div class="batch-actions">
            <button class="btn btn-outline" id="batchStart">
              <span class="btn-icon">▶️</span>
              批量启动
            </button>
            <button class="btn btn-outline" id="batchStop">
              <span class="btn-icon">⏹️</span>
              批量停止
            </button>
            <button class="btn btn-danger" id="batchDelete">
              <span class="btn-icon">🗑️</span>
              批量删除
            </button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.loadStrategies();
    this.startAutoRefresh();
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    const wrapper = this.container.querySelector('.strategy-list-wrapper');
    if (!wrapper) return;

    // 刷新按钮
    wrapper.querySelector('#refreshList')?.addEventListener('click', () => {
      this.loadStrategies();
    });

    // 新建策略按钮
    const createBtns = wrapper.querySelectorAll('#createNewStrategy, #createFirstStrategy');
    createBtns.forEach(btn => {
      btn?.addEventListener('click', () => {
        this.navigateToCreate();
      });
    });

    // 过滤器
    wrapper.querySelector('#statusFilter')?.addEventListener('change', (e) => {
      this.filterStrategies();
    });

    wrapper.querySelector('#searchInput')?.addEventListener('input', (e) => {
      this.filterStrategies();
    });

    // 批量操作
    wrapper.querySelector('#batchStart')?.addEventListener('click', () => {
      this.handleBatchOperation('start');
    });

    wrapper.querySelector('#batchStop')?.addEventListener('click', () => {
      this.handleBatchOperation('stop');
    });

    wrapper.querySelector('#batchDelete')?.addEventListener('click', () => {
      this.handleBatchOperation('delete');
    });

    // WebSocket事件监听
    if (this.websocket) {
      this.websocket.onStrategyUpdate = (data) => {
        this.handleStrategyUpdate(data);
      };
    }
  }

  /**
   * 加载策略列表
   */
  async loadStrategies() {
    try {
      const result = await this.api.getAllStrategyInstances();
      
      if (result.success) {
        this.strategies = result.data || [];
      } else {
        this.strategies = [];
      }

      this.renderStrategies();
      this.updateStrategyCount();

    } catch (error) {
      console.error('加载策略列表失败:', error);
      this.showNotification('加载策略列表失败: ' + error.message, 'error');
      this.strategies = [];
      this.renderStrategies();
    }
  }

  /**
   * 渲染策略卡片
   */
  renderStrategies() {
    const listContainer = this.container.querySelector('#strategiesList');
    const emptyState = this.container.querySelector('#emptyState');
    
    if (!listContainer || !emptyState) return;

    if (this.strategies.length === 0) {
      listContainer.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    listContainer.style.display = 'grid';
    emptyState.style.display = 'none';

    listContainer.innerHTML = this.strategies.map(strategy => this.renderStrategyCard(strategy)).join('');

    // 绑定卡片事件
    this.bindCardEvents();
  }

  /**
   * 渲染单个策略卡片
   */
  renderStrategyCard(strategy) {
    const statusInfo = this.getStatusInfo(strategy.状态);
    const progress = strategy.执行进度 || {};
    const createTime = new Date(strategy.创建时间).toLocaleString();
    
    return `
      <div class="strategy-card" data-strategy-id="${strategy.实例ID}">
        <div class="card-header">
          <div class="card-title">
            <input type="checkbox" class="strategy-checkbox" data-id="${strategy.实例ID}">
            <h4 class="strategy-name">
              <span class="token-pair">${this.getStrategyDisplayName(strategy)}</span>
            </h4>
          </div>
          <div class="card-status">
            <span class="status-badge status-${statusInfo.class}">${statusInfo.text}</span>
          </div>
        </div>

        <div class="card-content">
          <!-- 基础信息 -->
          <div class="strategy-info">
            <div class="info-item">
              <label>池地址:</label>
              <span class="pool-address" title="${strategy.配置?.池地址}">${this.truncateAddress(strategy.配置?.池地址)}</span>
            </div>
            <div class="info-item">
              <label>投入数量:</label>
              <span>${strategy.配置?.代币数量} ${strategy.配置?.主要代币 || ''}</span>
            </div>
            <div class="info-item">
              <label>创建时间:</label>
              <span>${createTime}</span>
            </div>
          </div>

          <!-- 执行进度 -->
          ${this.renderProgressBar(strategy)}

          <!-- 🔧 新增：Tick范围可视化 -->
          ${this.renderTickVisualization(strategy)}

          <!-- 头寸信息 (如果有) -->
          ${strategy.头寸信息 ? this.renderPositionInfo(strategy.头寸信息) : ''}

          <!-- 盈亏信息 (如果有) -->
          ${strategy.盈亏统计 ? this.renderProfitInfo(strategy.盈亏统计) : ''}
        </div>

        <div class="card-actions">
          ${this.renderActionButtons(strategy)}
        </div>
      </div>
    `;
  }

  /**
   * 渲染进度条
   */
  renderProgressBar(strategy) {
    const progress = strategy.执行进度 || {};
    const stage = progress.当前阶段 || 0;
    const description = progress.阶段描述 || '待启动';
    const progressPercent = Math.min((stage / 4) * 100, 100);

    return `
      <div class="progress-section">
        <div class="progress-header">
          <span class="progress-label">执行进度</span>
          <span class="progress-text">${description}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
        <div class="progress-stages">
          ${[1, 2, 3, 4].map(i => `
            <div class="stage ${i <= stage ? 'completed' : ''} ${i === stage ? 'current' : ''}">
              ${this.getStageIcon(i)}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * 渲染头寸信息
   */
  renderPositionInfo(position) {
    return `
      <div class="position-info">
        <div class="position-header">
          <span class="position-label">📊 头寸信息</span>
          <span class="position-status">${position.状态}</span>
        </div>
        <div class="position-details">
          <div class="detail-item">
            <label>TokenID:</label>
            <span>${position.tokenId}</span>
          </div>
          <div class="detail-item">
            <label>Tick范围:</label>
            <span>[${position.tick范围?.下限}, ${position.tick范围?.上限}]</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染Tick范围可视化组件 - 新增功能
   */
  renderTickVisualization(strategy) {
    const marketData = strategy.市场数据;
    const config = strategy.配置;
    
    // 检查必要数据
    if (!marketData || !config || !config.代币范围) {
      return `
        <div class="tick-visualization">
          <div class="tick-info-unavailable">
            <span>📊 Tick数据暂未获取</span>
          </div>
        </div>
      `;
    }
    
    const currentTick = marketData.当前tick;
    const tickLower = config.代币范围.下限tick;
    const tickUpper = config.代币范围.上限tick;
    const token0Symbol = marketData.token0信息?.symbol || 'Token0';
    const token1Symbol = marketData.token1信息?.symbol || 'Token1';
    
    // 🔧 新增：检查超出范围状态和方向
    const 超出范围 = marketData.超出范围 || false;
    const 超出范围时间 = marketData.超出范围时间;
    
    // 🔧 关键修改：使用新的状态计算方法
    const tickStatus = this.getTickPositionStatus(currentTick, tickLower, tickUpper);
    const tickStatusClass = tickStatus.statusClass;
    
    // 计算tick在范围内的位置百分比
    const position = this.calculateTickPosition(currentTick, tickLower, tickUpper);
    
    // 🔧 新增：超时计时显示
    let 超时显示 = '';
    if (超出范围 && 超出范围时间 && config.自动退出?.启用超时退出) {
      const 超时时长 = config.自动退出.超时时长 || 60000; // 默认60秒
      const 已经过时间 = Date.now() - 超出范围时间;
      const 剩余时间 = Math.max(0, 超时时长 - 已经过时间);
      const 剩余秒数 = Math.ceil(剩余时间 / 1000);
      
      if (剩余时间 > 0) {
        超时显示 = `
          <div class="timeout-warning">
            ⏰ 超时退出倒计时: ${剩余秒数}秒
          </div>
        `;
      }
    }
    
    return `
      <div class="tick-visualization">
        <div class="tick-info">
          <div class="current-tick ${tickStatusClass}">
            📍 当前Tick: ${currentTick} ${tickStatus.message}
          </div>
          <div class="tick-range">
            📊 ${token0Symbol}/${token1Symbol} 范围: [${tickLower}, ${tickUpper}]
          </div>
        </div>
        
        ${超时显示}
        
        <div class="tick-range-container">
          <div class="tick-range-bar ${tickStatusClass}">
            <div class="tick-indicator ${tickStatusClass}" style="left: ${position}%">
              <div class="tick-needle"></div>
              <div class="tick-tooltip">Tick: ${currentTick}</div>
            </div>
          </div>
          <div class="tick-labels">
            <span class="tick-label-left">${tickLower}</span>
            <span class="tick-label-right">${tickUpper}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染盈亏信息
   */
  renderProfitInfo(profit) {
    const profitClass = profit.总盈亏 >= 0 ? 'profit' : 'loss';
    const profitSign = profit.总盈亏 >= 0 ? '+' : '';

    return `
      <div class="profit-info">
        <div class="profit-header">
          <span class="profit-label">💰 盈亏统计</span>
        </div>
        <div class="profit-details">
          <div class="profit-item">
            <label>总盈亏:</label>
            <span class="profit-value ${profitClass}">${profitSign}${profit.总盈亏}</span>
          </div>
          <div class="profit-item">
            <label>收益率:</label>
            <span class="profit-rate ${profitClass}">${profitSign}${profit.收益率}%</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染操作按钮
   */
  renderActionButtons(strategy) {
    const status = strategy.状态;
    let buttons = [];

    // 根据状态显示不同按钮
    if (status === '初始化' || status === '已暂停') {
      buttons.push(`
        <button class="btn btn-primary btn-sm" onclick="strategyList.startStrategy('${strategy.实例ID}')">
          <span class="btn-icon">▶️</span>
          启动
        </button>
      `);
    }

    // 🔧 区分：完成周期后的"重新开始" vs 中途出错的"重新启动"
    if (status === '已退出' || status === '已完成') {
      buttons.push(`
        <button class="btn btn-success btn-sm" onclick="strategyList.restartStrategy('${strategy.实例ID}')">
          <span class="btn-icon">🔄</span>
          重新开始
        </button>
      `);
    } else if (status === '准备中' || status === '错误') {
      buttons.push(`
        <button class="btn btn-warning btn-sm" onclick="strategyList.restartStrategy('${strategy.实例ID}')">
          <span class="btn-icon">🔄</span>
          重新启动
        </button>
      `);
    }

    if (status === '运行中' || status === '监控中') {
      buttons.push(`
        <button class="btn btn-warning btn-sm" onclick="strategyList.stopStrategy('${strategy.实例ID}')">
          <span class="btn-icon">⏹️</span>
          停止
        </button>
      `);
    }

    // 查看详情按钮
    buttons.push(`
      <button class="btn btn-outline btn-sm" onclick="strategyList.viewDetails('${strategy.实例ID}')">
        <span class="btn-icon">👁️</span>
        详情
      </button>
    `);

    // 🚨 新增：强制退出按钮（红色，放在右下角）
    const 允许强制退出的状态 = ['运行中', '监控中', '准备中', '错误'];
    if (允许强制退出的状态.includes(status)) {
      buttons.push(`
        <button class="btn btn-danger btn-sm force-exit-btn" onclick="strategyList.forceExitStrategy('${strategy.实例ID}')" title="强制退出：立即关闭头寸并卖出代币">
          <span class="btn-icon">🚨</span>
          强退
        </button>
      `);
    }

    // 删除按钮
    if (status !== '运行中' && status !== '监控中') {
      buttons.push(`
        <button class="btn btn-danger btn-sm" onclick="strategyList.deleteStrategy('${strategy.实例ID}')">
          <span class="btn-icon">🗑️</span>
          删除
        </button>
      `);
    }

    return buttons.join('');
  }

  /**
   * 绑定卡片事件
   */
  bindCardEvents() {
    // 全局暴露策略列表实例，用于按钮点击
    window.strategyList = this;

    // 复选框变化事件
    const checkboxes = this.container.querySelectorAll('.strategy-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        this.updateBatchToolbar();
      });
    });
  }

  /**
   * 启动策略
   */
  async startStrategy(instanceId) {
    try {
      this.showNotification('正在启动策略...', 'info');
      
      const result = await this.api.startStrategy(instanceId);
      
      if (result.success) {
        this.showNotification('策略启动成功', 'success');
        this.loadStrategies(); // 刷新列表
      } else {
        throw new Error(result.error || '启动失败');
      }

    } catch (error) {
      console.error('启动策略失败:', error);
      this.showNotification(`启动策略失败: ${error.message}`, 'error');
    }
  }

  /**
   * 🔧 新增：重新启动策略
   */
  async restartStrategy(instanceId) {
    const strategy = this.strategies.find(s => s.实例ID === instanceId);
    const statusText = strategy ? strategy.状态 : '未知';
    
    // 🔧 区分确认对话框文案
    let confirmMessage = '';
    let actionText = '';
    
    if (statusText === '已退出' || statusText === '已完成') {
      actionText = '重新开始';
      confirmMessage = `确定要重新开始这个处于"${statusText}"状态的策略吗？这将使用相同参数开始一个全新的策略周期。`;
    } else {
      actionText = '重新启动';
      confirmMessage = `确定要重新启动这个处于"${statusText}"状态的策略吗？这将清除错误状态并重新开始执行。`;
    }
    
    if (!confirm(confirmMessage)) return;

    try {
      this.showNotification(`正在${actionText}策略...`, 'info');
      
      // 🔧 新增：如果是已退出或已完成状态，先重置状态
      if (statusText === '已退出' || statusText === '已完成') {
        this.showNotification('正在重置策略状态...', 'info');
        const resetResult = await this.api.resetStrategy(instanceId);
        
        if (!resetResult.success) {
          throw new Error(resetResult.error || '重置策略状态失败');
        }
        
        this.showNotification('策略状态已重置，正在启动...', 'info');
      }
      
      // 启动策略
      const result = await this.api.startStrategy(instanceId);
      
      if (result.success) {
        this.showNotification(`策略${actionText}成功`, 'success');
        this.loadStrategies(); // 刷新列表
      } else {
        throw new Error(result.error || `${actionText}失败`);
      }

    } catch (error) {
      console.error(`${actionText}策略失败:`, error);
      this.showNotification(`${actionText}策略失败: ${error.message}`, 'error');
    }
  }

  /**
   * 停止策略
   */
  async stopStrategy(instanceId) {
    if (!confirm('确定要停止这个策略吗？')) return;

    try {
      this.showNotification('正在停止策略...', 'info');
      
      const result = await this.api.stopStrategy(instanceId);
      
      if (result.success) {
        this.showNotification('策略停止成功', 'success');
        this.loadStrategies(); // 刷新列表
      } else {
        throw new Error(result.error || '停止失败');
      }

    } catch (error) {
      console.error('停止策略失败:', error);
      this.showNotification(`停止策略失败: ${error.message}`, 'error');
    }
  }

  /**
   * 删除策略
   */
  async deleteStrategy(instanceId) {
    if (!confirm('确定要删除这个策略吗？此操作不可撤销。')) return;

    try {
      this.showNotification('正在删除策略...', 'info');
      
      const result = await this.api.deleteStrategy(instanceId);
      
      if (result.success) {
        this.showNotification('策略删除成功', 'success');
        this.loadStrategies(); // 刷新列表
      } else {
        throw new Error(result.error || '删除失败');
      }

    } catch (error) {
      console.error('删除策略失败:', error);
      this.showNotification(`删除策略失败: ${error.message}`, 'error');
    }
  }

  /**
   * 🚨 强制退出策略
   */
  async forceExitStrategy(instanceId) {
    const strategy = this.strategies.find(s => s.实例ID === instanceId);
    const statusText = strategy ? strategy.状态 : '未知';
    
    // 强制退出确认对话框
    const confirmMessage = `⚠️ 强制退出确认

策略ID: ${instanceId}
当前状态: ${statusText}

🚨 强制退出将立即执行以下操作：
1. 关闭流动性头寸（移除所有流动性）
2. 卖出非基础货币代币

⚠️ 注意：此操作不可撤销，建议在确认市场情况后再执行。

确定要强制退出这个策略吗？`;

    if (!confirm(confirmMessage)) return;

    try {
      this.showNotification('🚨 正在执行强制退出...', 'warning');
      
      // 调用强制退出API
      const result = await this.api.forceExitStrategy(instanceId);
      
      if (result.success) {
        console.log('✅ 强制退出成功:', result.data);
        
        // 显示详细的退出结果
        const exitDetails = result.data.exitDetails;
        let resultMessage = '🚨 策略强制退出成功！\n\n';
        
        // 头寸关闭结果
        if (exitDetails.头寸关闭结果) {
          const 头寸结果 = exitDetails.头寸关闭结果;
          if (头寸结果.成功) {
            resultMessage += '✅ 流动性头寸已关闭\n';
            if (头寸结果.交易哈希) {
              resultMessage += `📝 交易哈希: ${头寸结果.交易哈希.substring(0, 20)}...\n`;
            }
          } else if (头寸结果.执行) {
            resultMessage += `❌ 头寸关闭失败: ${头寸结果.错误}\n`;
          } else {
            resultMessage += `ℹ️ ${头寸结果.原因}\n`;
          }
        }
        
        // 代币卖出结果
        if (exitDetails.代币卖出结果) {
          const 卖出结果 = exitDetails.代币卖出结果;
          resultMessage += `\n💰 代币卖出结果:\n`;
          resultMessage += `🎯 基础货币: ${卖出结果.使用基础货币}\n`;
          resultMessage += `✅ 成功卖出: ${卖出结果.成功记录.length} 个代币\n`;
          resultMessage += `⏭️ 跳过卖出: ${卖出结果.跳过记录.length} 个代币\n`;
          resultMessage += `❌ 失败卖出: ${卖出结果.失败记录.length} 个代币\n`;
          
          // 显示成功的交易
          卖出结果.成功记录.forEach(record => {
            resultMessage += `  • ${record.代币}: ${record.卖出数量.toFixed(4)} → ${record.获得数量} ${record.目标货币}\n`;
          });
        }
        
        const 总耗时 = exitDetails.完成时间 - exitDetails.开始时间;
        resultMessage += `\n⏱️ 总耗时: ${总耗时}ms`;
        
        this.showNotification('策略强制退出成功', 'success');
        
        // 显示详细结果弹窗
        this.showModal('🚨 强制退出完成', `
          <div class="force-exit-result">
            <pre style="white-space: pre-wrap; font-family: monospace; background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0;">${resultMessage}</pre>
            <div style="margin-top: 15px;">
              <button class="btn btn-primary" onclick="closeModal()">确认</button>
            </div>
          </div>
        `);
        
        this.loadStrategies(); // 刷新列表
        
      } else {
        throw new Error(result.error || '强制退出失败');
      }

    } catch (error) {
      console.error('强制退出策略失败:', error);
      this.showNotification(`强制退出失败: ${error.message}`, 'error');
      
      // 显示错误详情
      if (error.response && error.response.details) {
        console.error('强制退出详情:', error.response.details);
      }
    }
  }

  /**
   * 查看策略详情
   */
  viewDetails(instanceId) {
    const strategy = this.strategies.find(s => s.实例ID === instanceId);
    if (!strategy) return;

    // 显示详情弹窗
    this.showStrategyDetails(strategy);
  }

  /**
   * 显示策略详情弹窗
   */
  showStrategyDetails(strategy) {
    const detailsHTML = `
      <div class="strategy-details">
        <h3>策略详情</h3>
        
        <div class="details-section">
          <h4>基础配置</h4>
          <div class="config-grid">
            <div class="config-item">
              <label>池地址:</label>
              <span>${strategy.配置?.池地址}</span>
            </div>
            <div class="config-item">
              <label>代币数量:</label>
              <span>${strategy.配置?.代币数量}</span>
            </div>
            <div class="config-item">
              <label>滑点设置:</label>
              <span>${strategy.配置?.滑点设置}%</span>
            </div>
            <div class="config-item">
              <label>交换缓冲:</label>
              <span>${strategy.配置?.交换缓冲百分比}%</span>
            </div>
            <div class="config-item">
              <label>超时时间:</label>
              <span>${strategy.配置?.监控超时时间}ms</span>
            </div>
            <div class="config-item">
              <label>退出代币:</label>
              <span>${strategy.配置?.退出代币选择}</span>
            </div>
          </div>
        </div>

        ${strategy.市场数据 ? `
          <div class="details-section">
            <h4>市场数据</h4>
            <div class="market-data">
              <div class="data-item">
                <label>当前Tick:</label>
                <span>${strategy.市场数据.当前tick}</span>
              </div>
              <div class="data-item">
                <label>Token0需求:</label>
                <span>${strategy.市场数据.代币需求量?.token0需求量}</span>
              </div>
              <div class="data-item">
                <label>Token1需求:</label>
                <span>${strategy.市场数据.代币需求量?.token1需求量}</span>
              </div>
            </div>
          </div>
        ` : ''}

        ${strategy.头寸信息 ? `
          <div class="details-section">
            <h4>头寸信息</h4>
            <div class="position-data">
              <div class="data-item">
                <label>TokenID:</label>
                <span>${strategy.头寸信息.tokenId}</span>
              </div>
              <div class="data-item">
                <label>交易哈希:</label>
                <span>${strategy.头寸信息.交易哈希}</span>
              </div>
              <div class="data-item">
                <label>Tick范围:</label>
                <span>[${strategy.头寸信息.tick范围?.下限}, ${strategy.头寸信息.tick范围?.上限}]</span>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="details-actions">
          <button class="btn btn-outline" onclick="closeModal()">关闭</button>
        </div>
      </div>
    `;

    this.showModal('策略详情', detailsHTML);
  }

  /**
   * 处理策略更新 (WebSocket)
   */
  handleStrategyUpdate(data) {
    const { instanceId, strategyData } = data;
    
    // 更新本地策略数据
    const index = this.strategies.findIndex(s => s.实例ID === instanceId);
    if (index !== -1) {
      const oldStrategy = this.strategies[index];
      this.strategies[index] = strategyData;
      
      // 🔧 新增：实时更新tick位置
      this.updateTickVisualization(instanceId, oldStrategy, strategyData);
      
      this.renderStrategies();
    } else {
      // 新策略，重新加载
      this.loadStrategies();
    }
  }

  /**
   * 实时更新tick可视化 - 新增方法
   */
  updateTickVisualization(instanceId, oldStrategy, newStrategy) {
    const strategyCard = this.container.querySelector(`[data-strategy-id="${instanceId}"]`);
    if (!strategyCard) return;
    
    const oldTick = oldStrategy.市场数据?.当前tick;
    const newTick = newStrategy.市场数据?.当前tick;
    const config = newStrategy.配置;
    
    // 检查tick是否发生变化
    if (oldTick === newTick || !config?.代币范围) return;
    
    console.log(`🎯 策略 ${instanceId} Tick更新: ${oldTick} → ${newTick}`);
    
    // 查找tick指示器元素
    const tickIndicator = strategyCard.querySelector('.tick-indicator');
    if (!tickIndicator) return;
    
    // 计算新的位置
    const tickLower = config.代币范围.下限tick;
    const tickUpper = config.代币范围.上限tick;
    const newPosition = this.calculateTickPosition(newTick, tickLower, tickUpper);
    
    // 添加临时动画类
    tickIndicator.classList.add('updating');
    
    // 更新位置和属性
    tickIndicator.style.left = `${newPosition}%`;
    tickIndicator.setAttribute('data-tick', newTick);
    
    // 更新状态信息
    const status = this.getTickPositionStatus(newTick, tickLower, tickUpper);
    
    // 🔧 重要修改：清除所有状态类，然后添加新的状态类
    tickIndicator.classList.remove('out-of-range', 'out-of-range-left', 'out-of-range-right', 'in-range');
    tickIndicator.classList.add(status.statusClass);
    
    const statusElement = strategyCard.querySelector('.tick-position-status');
    if (statusElement) {
      statusElement.className = `tick-position-status ${status.statusClass}`;
      statusElement.textContent = status.message;
    }
    
    // 更新tick信息显示
    const currentTickElement = strategyCard.querySelector('.current-tick');
    if (currentTickElement) {
      currentTickElement.textContent = `当前Tick: ${newTick}`;
    }
    
    // 如果tick在范围内，添加动画效果
    if (status.inRange) {
      tickIndicator.classList.add('animated');
    } else {
      tickIndicator.classList.remove('animated');
    }
    
    // 移除临时动画类
    setTimeout(() => {
      tickIndicator.classList.remove('updating');
    }, 600);
  }

  /**
   * 过滤策略
   */
  filterStrategies() {
    const statusFilter = this.container.querySelector('#statusFilter')?.value;
    const searchText = this.container.querySelector('#searchInput')?.value.toLowerCase();

    let filteredStrategies = this.strategies;

    // 状态过滤
    if (statusFilter) {
      filteredStrategies = filteredStrategies.filter(s => s.状态 === statusFilter);
    }

    // 搜索过滤
    if (searchText) {
      filteredStrategies = filteredStrategies.filter(s => {
        return s.配置?.池地址?.toLowerCase().includes(searchText) ||
               s.实例ID.toLowerCase().includes(searchText);
      });
    }

    // 临时保存原始数据
    const originalStrategies = this.strategies;
    this.strategies = filteredStrategies;
    this.renderStrategies();
    this.strategies = originalStrategies; // 恢复原始数据
  }

  /**
   * 更新批量操作工具栏
   */
  updateBatchToolbar() {
    const checkboxes = this.container.querySelectorAll('.strategy-checkbox:checked');
    const batchToolbar = this.container.querySelector('#batchToolbar');
    const selectedCount = this.container.querySelector('#selectedCount');

    if (checkboxes.length > 0) {
      batchToolbar.style.display = 'flex';
      selectedCount.textContent = `已选择 ${checkboxes.length} 个策略`;
    } else {
      batchToolbar.style.display = 'none';
    }
  }

  /**
   * 处理批量操作
   */
  async handleBatchOperation(operation) {
    const checkboxes = this.container.querySelectorAll('.strategy-checkbox:checked');
    const instanceIds = Array.from(checkboxes).map(cb => cb.dataset.id);

    if (instanceIds.length === 0) return;

    let confirmMessage = '';
    switch (operation) {
      case 'start':
        confirmMessage = `确定要启动 ${instanceIds.length} 个策略吗？`;
        break;
      case 'stop':
        confirmMessage = `确定要停止 ${instanceIds.length} 个策略吗？`;
        break;
      case 'delete':
        confirmMessage = `确定要删除 ${instanceIds.length} 个策略吗？此操作不可撤销。`;
        break;
    }

    if (!confirm(confirmMessage)) return;

    this.showNotification(`正在执行批量${operation}操作...`, 'info');

    const results = await Promise.allSettled(
      instanceIds.map(id => {
        switch (operation) {
          case 'start':
            return this.api.startStrategy(id);
          case 'stop':
            return this.api.stopStrategy(id);
          case 'delete':
            return this.api.deleteStrategy(id);
        }
      })
    );

    const successes = results.filter(r => r.status === 'fulfilled').length;
    const failures = results.filter(r => r.status === 'rejected').length;

    this.showNotification(`批量操作完成: ${successes} 成功, ${failures} 失败`, 
                         failures > 0 ? 'warning' : 'success');
    
    this.loadStrategies(); // 刷新列表
    this.updateBatchToolbar(); // 清除选择
  }

  /**
   * 自动刷新
   */
  startAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = setInterval(() => {
      this.loadStrategies();
    }, 10000); // 每10秒刷新一次
  }

  /**
   * 停止自动刷新
   */
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * 导航到创建页面
   */
  navigateToCreate() {
    if (window.app && typeof window.app.navigateTo === 'function') {
      window.app.navigateTo('create');
    }
  }

  /**
   * 更新策略计数
   */
  updateStrategyCount() {
    const countElement = this.container.querySelector('#strategyCount');
    if (countElement) {
      countElement.textContent = `共 ${this.strategies.length} 个策略`;
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 获取状态信息
   */
  getStatusInfo(status) {
    const statusMap = {
      '初始化': { text: '初始化', class: 'init' },
      '准备中': { text: '准备中', class: 'preparing' },
      '运行中': { text: '运行中', class: 'running' },
      '监控中': { text: '监控中', class: 'monitoring' },
      '已暂停': { text: '已暂停', class: 'paused' },
      '已完成': { text: '已完成', class: 'completed' },
      '错误': { text: '错误', class: 'error' }
    };

    return statusMap[status] || { text: status, class: 'unknown' };
  }

  /**
   * 获取策略显示名称 - 优化版本
   */
  getStrategyDisplayName(strategy) {
    // 🔧 优化：根据代币信息生成友好的策略名称
    const marketData = strategy.市场数据;
    if (marketData?.token0信息?.symbol && marketData?.token1信息?.symbol) {
      const token0Symbol = marketData.token0信息.symbol;
      const token1Symbol = marketData.token1信息.symbol;
      return `${token0Symbol}-${token1Symbol}-策略`;
    }
    
    // 回退到原有逻辑
    const address = strategy.配置?.池地址;
    if (address) {
      return `策略-${address.slice(-6)}`;
    }
    return `策略-${strategy.实例ID.slice(-6)}`;
  }

  /**
   * 截断地址显示
   */
  truncateAddress(address) {
    if (!address) return '未知';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * 获取阶段图标
   */
  getStageIcon(stage) {
    const icons = ['', '📊', '💰', '🎯', '👁️'];
    return icons[stage] || '⭕';
  }

  /**
   * 计算tick在范围内的位置百分比
   */
  calculateTickPosition(currentTick, tickLower, tickUpper) {
    if (currentTick < tickLower) {
      return 0; // 左边界
    } else if (currentTick > tickUpper) {
      return 100; // 右边界
    } else {
      // 在范围内，计算具体位置
      return ((currentTick - tickLower) / (tickUpper - tickLower)) * 100;
    }
  }

  /**
   * 获取tick位置状态 - 支持方向性颜色显示
   */
  getTickPositionStatus(currentTick, tickLower, tickUpper) {
    const inRange = currentTick >= tickLower && currentTick <= tickUpper;
    
    if (inRange) {
      return {
        inRange: true,
        statusClass: 'in-range',
        message: '✅ 在范围内'
      };
    } else {
      // 🔧 新功能：根据脱离方向设置不同颜色
      const isLeftOutOfRange = currentTick < tickLower;  // 向左脱离（下跌）
      const isRightOutOfRange = currentTick > tickUpper; // 向右脱离（上涨）
      
      if (isLeftOutOfRange) {
        return {
          inRange: false,
          statusClass: 'out-of-range-left', // 红色：向左脱离（下跌）
          message: '⬅️ 下跌脱离',
          direction: 'left'
        };
      } else if (isRightOutOfRange) {
        return {
          inRange: false,
          statusClass: 'out-of-range-right', // 绿色：向右脱离（上涨）
          message: '➡️ 上涨脱离',
          direction: 'right'
        };
      } else {
        // 备用情况
        return {
          inRange: false,
          statusClass: 'out-of-range',
          message: '❌ 超出范围'
        };
      }
    }
  }

  /**
   * 显示通知
   */
  showNotification(message, type = 'info') {
    if (window.app && typeof window.app.showNotification === 'function') {
      window.app.showNotification(message, type);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  /**
   * 显示模态框
   */
  showModal(title, content) {
    if (window.app && typeof window.app.showModal === 'function') {
      window.app.showModal(title, content);
    } else {
      alert(`${title}\n\n${content}`);
    }
  }

  /**
   * 销毁组件
   */
  destroy() {
    this.stopAutoRefresh();
    if (this.websocket) {
      this.websocket.onStrategyUpdate = null;
    }
    if (window.strategyList === this) {
      delete window.strategyList;
    }
  }
} 