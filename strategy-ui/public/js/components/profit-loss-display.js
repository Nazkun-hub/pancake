/**
 * 💰 盈亏统计显示组件
 * 用于在前端显示实时盈亏数据
 */

class ProfitLossDisplay {
  constructor() {
    this.apiBaseUrl = 'http://localhost:4000/api/profit-loss';
    this.updateInterval = 30000; // 30秒更新一次
    this.intervalId = null;
    this.isVisible = false;
    this.container = null; // 保存容器引用
    this.lifecycleVisible = false; // 生命周期详情显示状态
    
    // 🆕 分页相关状态
    this.currentPage = 1;
    this.pageSize = 10;
    this.allInstances = []; // 存储所有实例数据
    this.filteredInstances = []; // 存储过滤后的实例数据
  }

  /**
   * 🎯 初始化组件
   */
  init() {
    this.createDisplayContainer();
    this.bindEvents();
    this.startAutoUpdate();
    // 🆕 将实例暴露到全局，供删除按钮使用
    window.profitLossDisplay = this;
    console.log('[PROFIT-LOSS] 盈亏统计组件已初始化');
  }

  /**
   * 🏗️ 创建显示容器
   */
  createDisplayContainer() {
    // 检查是否已存在容器
    let container = document.getElementById('profit-loss-container');
    if (container) {
      this.container = container;
      return;
    }

    container = document.createElement('div');
    container.id = 'profit-loss-container';
    container.className = 'profit-loss-container';
    this.container = container;
    container.innerHTML = `
      <div class="profit-loss-header">
        <h3>💰 盈亏统计</h3>
        <div class="profit-loss-controls">
          <button id="refresh-profit-loss" class="btn btn-sm">🔄 刷新</button>
          <button id="toggle-profit-loss" class="btn btn-sm">📊 详情</button>
          <button id="toggle-lifecycle" class="btn btn-sm">🔄 生命周期</button>
        </div>
      </div>
      <div class="profit-loss-summary" id="profit-loss-summary">
        <div class="loading">正在加载盈亏数据...</div>
      </div>
      <div class="profit-loss-details" id="profit-loss-details" style="display: none;">
        <div class="details-content">
          <!-- 🆕 实例列表工具栏 -->
          <div class="instance-toolbar">
            <div class="toolbar-info">
              <span id="instance-count">总计: 0 个实例</span>
            </div>
            <div class="toolbar-actions">
              <select id="sort-selector" class="form-select">
                <option value="time-desc">最新创建在前</option>
                <option value="time-asc">最早创建在前</option>
                <option value="profit-desc">盈利高到低</option>
                <option value="profit-asc">盈利低到高</option>
              </select>
            </div>
          </div>
          
          <div class="instance-list" id="instance-list"></div>
          
          <!-- 🆕 分页控件 -->
          <div class="pagination-container" id="pagination-container" style="display: none;">
            <div class="pagination-info">
              <span id="pagination-info-text">第 1-10 条，共 0 条</span>
            </div>
            <div class="pagination-controls">
              <button id="prev-page" class="btn btn-sm" disabled>上一页</button>
              <span id="page-info">第 1 页，共 1 页</span>
              <button id="next-page" class="btn btn-sm" disabled>下一页</button>
            </div>
          </div>
        </div>
      </div>
      <div class="lifecycle-analysis" id="lifecycle-analysis" style="display: none;">
        <div class="lifecycle-summary" id="lifecycle-summary">
          <div class="loading">正在加载生命周期数据...</div>
        </div>
        <div class="lifecycle-details" id="lifecycle-details"></div>
      </div>
    `;

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      .profit-loss-container {
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 15px;
        margin: 15px 0;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        color: #fff;
      }
      
      .profit-loss-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        border-bottom: 1px solid #333;
        padding-bottom: 10px;
      }
      
      .profit-loss-header h3 {
        margin: 0;
        color: #fff;
        font-size: 18px;
      }
      
      .profit-loss-controls {
        display: flex;
        gap: 8px;
      }
      
      .profit-loss-controls .btn {
        padding: 4px 8px;
        font-size: 12px;
        border: 1px solid #555;
        background: #2a2a2a;
        color: #fff;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .profit-loss-controls .btn:hover {
        background: #404040;
      }
      
      .profit-loss-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
        margin-bottom: 15px;
      }
      
      .summary-card {
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 6px;
        padding: 12px;
        text-align: center;
      }
      
      .summary-card.positive {
        border-left: 4px solid #28a745;
      }
      
      .summary-card.negative {
        border-left: 4px solid #dc3545;
      }
      
      .summary-card.neutral {
        border-left: 4px solid #6c757d;
      }
      
      .summary-card .label {
        font-size: 12px;
        color: #aaa;
        margin-bottom: 4px;
      }
      
      .summary-card .value {
        font-size: 16px;
        font-weight: bold;
        color: #fff;
      }
      
      .summary-card .value.positive {
        color: #28a745;
      }
      
      .summary-card .value.negative {
        color: #dc3545;
      }
      
      .profit-loss-details {
        border-top: 1px solid #333;
        padding-top: 15px;
      }
      
      .instance-item {
        background: white;
        border: 1px solid #dee2e6;
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 10px;
      }
      
      .instance-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      
      .instance-id {
        font-weight: bold;
        color: #495057;
      }
      
      .instance-status {
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: bold;
      }
      
      .instance-status.running {
        background: #d4edda;
        color: #155724;
      }
      
      .instance-status.completed {
        background: #cce5ff;
        color: #004085;
      }
      
      .instance-status.exited {
        background: #f8d7da;
        color: #721c24;
      }
      
      .instance-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 8px;
        font-size: 12px;
      }
      
      .stat-item {
        text-align: center;
      }
      
      .stat-label {
        color: #6c757d;
        margin-bottom: 2px;
      }
      
      .stat-value {
        font-weight: bold;
        color: #495057;
      }
      
      .loading {
        text-align: center;
        color: #aaa;
        padding: 20px;
      }
      
      .instance-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        padding: 10px 15px;
        background: #2a2a2a;
        border-radius: 6px;
        border: 1px solid #444;
      }
      
      .toolbar-info {
        color: #aaa;
        font-size: 14px;
      }
      
      .toolbar-actions .form-select {
        background: #333;
        border: 1px solid #555;
        color: #fff;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 14px;
      }
      
      .pagination-container {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 20px;
        padding: 15px;
        background: #2a2a2a;
        border-radius: 6px;
        border: 1px solid #444;
      }
      
      .pagination-info {
        color: #aaa;
        font-size: 14px;
      }
      
      .pagination-controls {
        display: flex;
        align-items: center;
        gap: 15px;
      }
      
      .pagination-controls button {
        padding: 6px 12px;
        background: #333;
        border: 1px solid #555;
        color: #fff;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      }
      
      .pagination-controls button:hover:not(:disabled) {
        background: #404040;
      }
      
      .pagination-controls button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .instance-item {
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 10px;
        position: relative;
        padding-top: 35px;
      }
      
      .instance-delete {
        position: absolute;
        top: 8px;
        right: 8px;
        background: #dc3545;
        border: none;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        opacity: 0.8;
        transition: opacity 0.2s;
        z-index: 10;
      }
      
      .instance-delete:hover {
        opacity: 1;
        background: #c82333;
      }

      .instance-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      
      .instance-id {
        font-weight: bold;
        color: #fff;
        font-size: 14px;
      }
      
      .instance-status {
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: bold;
      }
      
      .instance-status.running {
        background: #28a745;
        color: #fff;
      }
      
      .instance-status.completed {
        background: #007bff;
        color: #fff;
      }
      
      .instance-status.exited {
        background: #dc3545;
        color: #fff;
      }
      
      .instance-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 8px;
        font-size: 12px;
        margin-bottom: 12px;
      }
      
      .stat-item {
        text-align: center;
      }
      
      .stat-label {
        color: #aaa;
        margin-bottom: 2px;
      }
      
      .stat-value {
        font-weight: bold;
        color: #fff;
      }
      
      .cost-output-details {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 15px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid #444;
      }
      
      .details-section {
        background: #333;
        border-radius: 6px;
        padding: 10px;
      }
      
      .section-title {
        font-size: 13px;
        font-weight: bold;
        color: #fff;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      
      .section-content {
        font-size: 12px;
        color: #aaa;
        line-height: 1.4;
      }
      
      .section-content strong {
        color: #fff;
      }
      
      @media (max-width: 768px) {
        .cost-output-details {
          grid-template-columns: 1fr;
          gap: 10px;
        }
      }
      
      .lifecycle-analysis {
        border-top: 1px solid #333;
        padding-top: 15px;
        margin-top: 15px;
      }
      
      .lifecycle-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-bottom: 15px;
      }
      
      .lifecycle-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 8px;
        padding: 15px;
        text-align: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      
      .lifecycle-card.success {
        background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      }
      
      .lifecycle-card.warning {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      }
      
      .lifecycle-card .card-label {
        font-size: 12px;
        opacity: 0.9;
        margin-bottom: 5px;
      }
      
      .lifecycle-card .card-value {
        font-size: 18px;
        font-weight: bold;
      }
      
      .lifecycle-instance {
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      }
      
      .lifecycle-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid #444;
      }
      
      .lifecycle-stages {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
      }
      
      .stage-card {
        background: #333;
        border: 1px solid #555;
        border-radius: 6px;
        padding: 12px;
      }
      
      .stage-title {
        font-weight: bold;
        color: #fff;
        margin-bottom: 8px;
        font-size: 14px;
      }
      
      .stage-stats {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      
      .stage-stat {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
      }
      
      .stage-stat .label {
        color: #6c757d;
      }
      
      .stage-stat .value {
        font-weight: bold;
        color: #495057;
      }
      
      .error {
        text-align: center;
        color: #dc3545;
        padding: 20px;
        background: #f8d7da;
        border-radius: 4px;
      }
    `;
    
    document.head.appendChild(style);

    // 将容器添加到页面
    const targetContainer = document.querySelector('.strategy-container') || document.body;
    targetContainer.appendChild(container);
  }

  /**
   * 🔗 绑定事件
   */
  bindEvents() {
    // 刷新按钮
    document.getElementById('refresh-profit-loss')?.addEventListener('click', () => {
      this.loadProfitLossData();
    });

    // 切换详情显示
    document.getElementById('toggle-profit-loss')?.addEventListener('click', () => {
      this.toggleDetails();
    });

    // 切换生命周期显示
    document.getElementById('toggle-lifecycle')?.addEventListener('click', () => {
      this.toggleLifecycle();
    });
    
    // 🆕 绑定排序和分页事件
    document.getElementById('sort-selector')?.addEventListener('change', (e) => this.handleSortChange(e.target.value));
    document.getElementById('prev-page')?.addEventListener('click', () => this.handlePageChange(this.currentPage - 1));
    document.getElementById('next-page')?.addEventListener('click', () => this.handlePageChange(this.currentPage + 1));
  }

  /**
   * 📊 切换详情显示
   */
  toggleDetails() {
    const details = document.getElementById('profit-loss-details');
    const button = document.getElementById('toggle-profit-loss');
    
    if (details && button) {
      this.isVisible = !this.isVisible;
      details.style.display = this.isVisible ? 'block' : 'none';
      button.textContent = this.isVisible ? '📈 收起' : '📊 详情';
      
      if (this.isVisible) {
        this.loadInstanceDetails();
      }
    }
  }

  /**
   * 🔄 切换生命周期显示
   */
  toggleLifecycle() {
    const lifecycle = document.getElementById('lifecycle-analysis');
    const button = document.getElementById('toggle-lifecycle');
    
    if (lifecycle && button) {
      this.lifecycleVisible = !this.lifecycleVisible;
      lifecycle.style.display = this.lifecycleVisible ? 'block' : 'none';
      button.textContent = this.lifecycleVisible ? '📈 收起' : '🔄 生命周期';
      
      if (this.lifecycleVisible) {
        this.loadLifecycleData();
      }
    }
  }

  /**
   * ⏰ 开始自动更新
   */
  startAutoUpdate() {
    this.loadProfitLossData();
    this.intervalId = setInterval(() => {
      this.loadProfitLossData();
      if (this.isVisible) {
        this.loadInstanceDetails();
      }
      if (this.lifecycleVisible) {
        this.loadLifecycleData();
      }
    }, this.updateInterval);
  }

  /**
   * ⏹️ 停止自动更新
   */
  stopAutoUpdate() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * 📈 加载盈亏汇总数据
   */
  async loadProfitLossData() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/summary`);
      const result = await response.json();
      
      if (result.success) {
        this.renderSummary(result.data);
      } else {
        this.showError('加载盈亏数据失败: ' + result.error);
      }
    } catch (error) {
      console.error('[PROFIT-LOSS] 加载数据失败:', error);
      this.showError('网络错误，无法加载盈亏数据');
    }
  }

  /**
   * 📋 加载实例详情
   */
  async loadInstanceDetails() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/all`);
      const result = await response.json();
      
      if (result.success) {
        // 🆕 存储原始数据
        this.allInstances = result.data;
        // 🆕 重置到第一页并应用排序
        this.currentPage = 1;
        this.applyFiltersAndSort();
      } else {
        console.error('[PROFIT-LOSS] 加载实例详情失败:', result.error);
      }
    } catch (error) {
      console.error('[PROFIT-LOSS] 加载实例详情失败:', error);
    }
  }

  /**
   * 🔄 加载生命周期数据
   */
  async loadLifecycleData() {
    try {
      // 加载生命周期汇总
      const summaryResponse = await fetch(`${this.apiBaseUrl}/lifecycle-summary`);
      const summaryResult = await summaryResponse.json();
      
      if (summaryResult.success) {
        this.renderLifecycleSummary(summaryResult.data);
      }

      // 加载所有实例数据用于显示生命周期详情
      const instancesResponse = await fetch(`${this.apiBaseUrl}/all`);
      const instancesResult = await instancesResponse.json();
      
      if (instancesResult.success) {
        this.renderLifecycleDetails(instancesResult.data);
      }
    } catch (error) {
      console.error('[PROFIT-LOSS] 加载生命周期数据失败:', error);
      this.showError('无法加载生命周期数据');
    }
  }

  /**
   * 🎨 渲染汇总数据
   */
  renderSummary(data) {
    const container = document.getElementById('profit-loss-summary');
    if (!container) return;

    const { 汇总统计, 实例数量 } = data;
    
    const getCardClass = (value) => {
      if (value > 0) return 'positive';
      if (value < 0) return 'negative';
      return 'neutral';
    };

    const getValueClass = (value) => {
      if (value > 0) return 'positive';
      if (value < 0) return 'negative';
      return '';
    };

    container.innerHTML = `
      <div class="summary-card ${getCardClass(汇总统计.总净盈亏_usdt)}">
        <div class="label">总净盈亏</div>
        <div class="value ${getValueClass(汇总统计.总净盈亏_usdt)}">
          ${汇总统计.总净盈亏_usdt >= 0 ? '+' : ''}${汇总统计.总净盈亏_usdt.toFixed(2)} USDT
        </div>
      </div>
      
      <div class="summary-card neutral">
        <div class="label">总投入</div>
        <div class="value">${汇总统计.总投入_usdt.toFixed(2)} USDT</div>
      </div>
      
      <div class="summary-card ${getCardClass(汇总统计.平均投资回报率_percent)}">
        <div class="label">平均回报率</div>
        <div class="value ${getValueClass(汇总统计.平均投资回报率_percent)}">
          ${汇总统计.平均投资回报率_percent >= 0 ? '+' : ''}${汇总统计.平均投资回报率_percent.toFixed(2)}%
        </div>
      </div>
      
      <div class="summary-card neutral">
        <div class="label">实例统计</div>
        <div class="value">
          ${实例数量.总数}个 (${实例数量.运行中}运行/${实例数量.已完成}完成)
        </div>
      </div>
      
      <div class="summary-card ${实例数量.盈利 > 0 ? 'positive' : 'neutral'}">
        <div class="label">盈利实例</div>
        <div class="value ${实例数量.盈利 > 0 ? 'positive' : ''}">${实例数量.盈利}个</div>
      </div>
      
      <div class="summary-card neutral">
        <div class="label">当前总价值</div>
        <div class="value">${汇总统计.总当前价值_usdt.toFixed(2)} USDT</div>
      </div>
    `;
  }

  /**
   * 🆕 应用筛选和排序
   */
  applyFiltersAndSort() {
    // 获取排序方式
    const sortSelector = document.getElementById('sort-selector');
    const sortType = sortSelector ? sortSelector.value : 'time-desc';
    
    // 复制数据并排序
    this.filteredInstances = [...this.allInstances];
    this.sortInstances(sortType);
    
    // 渲染当前页
    this.renderCurrentPage();
    this.updatePaginationControls();
  }

  /**
   * 🆕 排序实例数据
   */
  sortInstances(sortType) {
    switch (sortType) {
      case 'time-desc':
        this.filteredInstances.sort((a, b) => (b.开始时间 || 0) - (a.开始时间 || 0));
        break;
      case 'time-asc':
        this.filteredInstances.sort((a, b) => (a.开始时间 || 0) - (b.开始时间 || 0));
        break;
      case 'profit-desc':
        this.filteredInstances.sort((a, b) => {
          const aProfit = a.盈亏统计?.基础货币盈亏?.净盈亏_基础货币 || a.盈亏统计?.净盈亏_usdt || 0;
          const bProfit = b.盈亏统计?.基础货币盈亏?.净盈亏_基础货币 || b.盈亏统计?.净盈亏_usdt || 0;
          return bProfit - aProfit;
        });
        break;
      case 'profit-asc':
        this.filteredInstances.sort((a, b) => {
          const aProfit = a.盈亏统计?.基础货币盈亏?.净盈亏_基础货币 || a.盈亏统计?.净盈亏_usdt || 0;
          const bProfit = b.盈亏统计?.基础货币盈亏?.净盈亏_基础货币 || b.盈亏统计?.净盈亏_usdt || 0;
          return aProfit - bProfit;
        });
        break;
    }
  }

  /**
   * 🆕 处理排序变化
   */
  handleSortChange(sortType) {
    this.currentPage = 1; // 重置到第一页
    this.applyFiltersAndSort();
  }

  /**
   * 🆕 处理页面变化
   */
  handlePageChange(newPage) {
    const totalPages = Math.ceil(this.filteredInstances.length / this.pageSize);
    if (newPage >= 1 && newPage <= totalPages) {
      this.currentPage = newPage;
      this.renderCurrentPage();
      this.updatePaginationControls();
    }
  }

  /**
   * 🆕 渲染当前页
   */
  renderCurrentPage() {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    const currentPageInstances = this.filteredInstances.slice(startIndex, endIndex);
    
    this.renderInstanceList(currentPageInstances);
    this.updateInstanceCount();
  }

  /**
   * 🆕 更新实例计数显示
   */
  updateInstanceCount() {
    const countElement = document.getElementById('instance-count');
    if (countElement) {
      countElement.textContent = `总计: ${this.filteredInstances.length} 个实例`;
    }
  }

  /**
   * 🆕 更新分页控件
   */
  updatePaginationControls() {
    const totalPages = Math.ceil(this.filteredInstances.length / this.pageSize);
    const startIndex = (this.currentPage - 1) * this.pageSize + 1;
    const endIndex = Math.min(this.currentPage * this.pageSize, this.filteredInstances.length);
    
    // 更新分页信息
    const paginationInfo = document.getElementById('pagination-info-text');
    const pageInfo = document.getElementById('page-info');
    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');
    const paginationContainer = document.getElementById('pagination-container');
    
    if (paginationInfo) {
      paginationInfo.textContent = `第 ${startIndex}-${endIndex} 条，共 ${this.filteredInstances.length} 条`;
    }
    
    if (pageInfo) {
      pageInfo.textContent = `第 ${this.currentPage} 页，共 ${totalPages} 页`;
    }
    
    if (prevButton) {
      prevButton.disabled = this.currentPage <= 1;
    }
    
    if (nextButton) {
      nextButton.disabled = this.currentPage >= totalPages;
    }
    
    // 显示/隐藏分页控件
    if (paginationContainer) {
      paginationContainer.style.display = totalPages > 1 ? 'flex' : 'none';
    }
  }

  /**
   * 🆕 删除实例统计
   */
  async deleteInstance(instanceId) {
    if (!confirm(`确定要删除实例 ${instanceId} 的统计数据吗？\n这个操作不可撤销！`)) {
      return;
    }
    
    try {
      const response = await fetch(`${this.apiBaseUrl}/instance/${instanceId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        // 从本地数据中移除该实例
        this.allInstances = this.allInstances.filter(instance => instance.实例ID !== instanceId);
        
        // 重新应用筛选和排序
        this.applyFiltersAndSort();
        
        // 同时刷新汇总数据
        this.loadProfitLossData();
        
        console.log(`[PROFIT-LOSS] 实例 ${instanceId} 删除成功`);
      } else {
        alert(`删除失败: ${result.error}`);
      }
    } catch (error) {
      console.error('[PROFIT-LOSS] 删除实例失败:', error);
      alert('删除失败: 网络错误');
    }
  }

  /**
   * 📋 渲染实例列表
   */
  renderInstanceList(instances) {
    const container = document.getElementById('instance-list');
    if (!container) return;

    if (instances.length === 0) {
      container.innerHTML = '<div class="loading">暂无实例数据</div>';
      return;
    }

    const instancesHtml = instances.map(instance => {
      const statusClass = {
        '运行中': 'running',
        '已完成': 'completed',
        '已退出': 'exited'
      }[instance.状态] || 'neutral';

      const getValueClass = (value) => {
        if (value > 0) return 'style="color: #28a745;"';
        if (value < 0) return 'style="color: #dc3545;"';
        return '';
      };

      return `
        <div class="instance-item">
          <button class="instance-delete" onclick="window.profitLossDisplay?.deleteInstance('${instance.实例ID}')" title="删除此实例统计">🗑️</button>
          <div class="instance-header">
            <div class="instance-id">${instance.实例ID}</div>
            <div class="instance-status ${statusClass}">${instance.状态}</div>
          </div>
          <div class="instance-stats">
            <div class="stat-item">
              <div class="stat-label">净盈亏</div>
              <div class="stat-value" ${getValueClass(instance.盈亏统计.基础货币盈亏?.净盈亏_基础货币 || instance.盈亏统计.净盈亏_usdt)}>
                ${(instance.盈亏统计.基础货币盈亏?.净盈亏_基础货币 || instance.盈亏统计.净盈亏_usdt) >= 0 ? '+' : ''}${(instance.盈亏统计.基础货币盈亏?.净盈亏_基础货币 || instance.盈亏统计.净盈亏_usdt).toFixed(2)} ${instance.基础货币信息?.当前基础货币 || 'USDT'}
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-label">回报率</div>
              <div class="stat-value" ${getValueClass(instance.盈亏统计.基础货币盈亏?.投资回报率_percent || instance.盈亏统计.投资回报率_percent)}>
                ${(instance.盈亏统计.基础货币盈亏?.投资回报率_percent || instance.盈亏统计.投资回报率_percent) >= 0 ? '+' : ''}${(instance.盈亏统计.基础货币盈亏?.投资回报率_percent || instance.盈亏统计.投资回报率_percent).toFixed(2)}%
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-label">总投入</div>
              <div class="stat-value">
                ${this.formatCostByScenario(instance)} ${instance.基础货币信息?.当前基础货币 || 'USDT'}
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-label">当前产出</div>
              <div class="stat-value">
                ${(instance.盈亏统计.基础货币盈亏?.当前价值_基础货币 || instance.当前资产.总价值_usdt).toFixed(2)} ${instance.基础货币信息?.当前基础货币 || 'USDT'}
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-label">交换次数</div>
              <div class="stat-value">${instance.交换历史.length}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">运行时间</div>
              <div class="stat-value">${this.formatDuration(instance.开始时间, instance.结束时间)}</div>
            </div>
          </div>
          
          <!-- 新增：投入产出明细 -->
          <div class="cost-output-details">
            <div class="details-section">
              <div class="section-title">💰 投入明细 (${instance.计算场景 || '未确定'})</div>
              <div class="section-content">
                ${this.formatCostBreakdown(instance)}
              </div>
            </div>
            
            <div class="details-section">
              <div class="section-title">📊 产出明细</div>
              <div class="section-content">
                ${this.formatOutputBreakdown(instance)}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = instancesHtml;
  }

  /**
   * ⏱️ 格式化持续时间
   */
  formatDuration(startTime, endTime) {
    const duration = (endTime || Date.now()) - startTime;
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * 💰 根据场景格式化成本显示
   */
  formatCostByScenario(instance) {
    if (!instance.计算场景) {
      return instance.初始投入.总价值_usdt.toFixed(2);
    }

    if (instance.计算场景 === '场景1_双非基础货币') {
      return instance.初始投入.场景1_成本?.总购买成本_基础货币?.toFixed(2) || 
             instance.盈亏统计.基础货币盈亏?.总投入成本_基础货币?.toFixed(2) ||
             instance.初始投入.总价值_usdt.toFixed(2);
    } else if (instance.计算场景 === '场景2_包含基础货币') {
      return instance.初始投入.场景2_成本?.总成本_基础货币?.toFixed(2) ||
             instance.盈亏统计.基础货币盈亏?.总投入成本_基础货币?.toFixed(2) ||
             instance.初始投入.总价值_usdt.toFixed(2);
    }

    return instance.初始投入.总价值_usdt.toFixed(2);
  }

  /**
   * 📋 格式化成本明细显示
   */
  formatCostBreakdown(instance) {
    if (!instance.计算场景) {
      return `总投入: ${instance.初始投入.总价值_usdt.toFixed(2)} USDT`;
    }

    const baseCurrency = instance.基础货币信息?.当前基础货币 || 'USDT';

    if (instance.计算场景 === '场景1_双非基础货币') {
      const cost = instance.初始投入.场景1_成本;
      if (cost) {
        return `购买Token0: ${cost.token0购买成本_基础货币?.toFixed(2) || '0'} ${baseCurrency}<br/>` +
               `购买Token1: ${cost.token1购买成本_基础货币?.toFixed(2) || '0'} ${baseCurrency}<br/>` +
               `总成本: ${cost.总购买成本_基础货币?.toFixed(2) || '0'} ${baseCurrency}`;
      }
    } else if (instance.计算场景 === '场景2_包含基础货币') {
      const cost = instance.初始投入.场景2_成本;
      if (cost) {
        return `购买非基础货币: ${cost.非基础货币购买成本_基础货币?.toFixed(2) || '0'} ${baseCurrency}<br/>` +
               `直接投入: ${cost.直接投入基础货币数量?.toFixed(2) || '0'} ${baseCurrency}<br/>` +
               `总成本: ${cost.总成本_基础货币?.toFixed(2) || '0'} ${baseCurrency}`;
      }
    }

    return `总投入: ${instance.初始投入.总价值_usdt.toFixed(2)} USDT`;
  }

  /**
   * 📈 格式化产出明细显示
   */
  formatOutputBreakdown(instance) {
    const baseCurrency = instance.基础货币信息?.当前基础货币 || 'USDT';
    const currentValue = instance.盈亏统计.基础货币盈亏?.当前价值_基础货币 || instance.当前资产.总价值_usdt;
    
    // 检查是否有交换历史
    if (instance.交换历史 && instance.交换历史.length > 0) {
      // 分析产出来源
      const 流动性关闭产出 = instance.交换历史
        .filter(tx => tx.类型 === '头寸关闭' && tx.基础货币方向 === '获得基础货币')
        .reduce((sum, tx) => sum + (tx.基础货币数量 || 0), 0);
      
      const okx卖出产出 = instance.交换历史
        .filter(tx => tx.是否涉及基础货币 && tx.基础货币方向 === '买入基础货币')
        .reduce((sum, tx) => sum + (tx.基础货币数量 || 0), 0);
      
      if (流动性关闭产出 > 0 || okx卖出产出 > 0) {
        let breakdown = '';
        if (流动性关闭产出 > 0) {
          breakdown += `流动性关闭获得: ${流动性关闭产出.toFixed(2)} ${baseCurrency}<br/>`;
        }
        if (okx卖出产出 > 0) {
          breakdown += `OKX卖出获得: ${okx卖出产出.toFixed(2)} ${baseCurrency}<br/>`;
        }
        breakdown += `总产出: ${currentValue.toFixed(2)} ${baseCurrency}`;
        return breakdown;
      }
    }
    
    // 默认显示
    if (instance.状态 === '运行中') {
      return `当前LP头寸价值: ${instance.当前资产.LP头寸价值_usdt?.toFixed(2) || '0'} USDT<br/>` +
             `当前总价值: ${currentValue.toFixed(2)} ${baseCurrency}<br/>` +
             `<small style="color: #6c757d;">注：运行中实例，最终产出待头寸关闭后确定</small>`;
    } else {
      return `最终产出: ${currentValue.toFixed(2)} ${baseCurrency}<br/>` +
             `手续费收益: ${instance.盈亏统计.手续费收益_usdt?.toFixed(2) || '0'} USDT`;
    }
  }

  /**
   * 🎨 渲染生命周期汇总
   */
  renderLifecycleSummary(data) {
    const container = document.getElementById('lifecycle-summary');
    if (!container) return;

    const getCardClass = (value) => {
      if (value > 0) return 'success';
      if (value < 0) return 'warning';
      return '';
    };

    container.innerHTML = `
      <div class="lifecycle-card ${getCardClass(data.总净盈亏_usdt)}">
        <div class="card-label">生命周期总净盈亏</div>
        <div class="card-value">
          ${data.总净盈亏_usdt >= 0 ? '+' : ''}${data.总净盈亏_usdt.toFixed(2)} USDT
        </div>
      </div>
      
      <div class="lifecycle-card">
        <div class="card-label">已完成实例</div>
        <div class="card-value">${data.实例数量}个</div>
      </div>
      
      <div class="lifecycle-card ${getCardClass(data.平均年化收益率_percent)}">
        <div class="card-label">平均年化收益率</div>
        <div class="card-value">
          ${data.平均年化收益率_percent >= 0 ? '+' : ''}${data.平均年化收益率_percent.toFixed(2)}%
        </div>
      </div>
      
      <div class="lifecycle-card">
        <div class="card-label">平均持续时间</div>
        <div class="card-value">${data.平均持续时间_小时.toFixed(1)}小时</div>
      </div>
      
      <div class="lifecycle-card success">
        <div class="card-label">成功实例</div>
        <div class="card-value">${data.成功实例数}个</div>
      </div>
      
      <div class="lifecycle-card warning">
        <div class="card-label">失败实例</div>
        <div class="card-value">${data.失败实例数}个</div>
      </div>
    `;
  }

  /**
   * 🔄 渲染生命周期详情
   */
  renderLifecycleDetails(instances) {
    const container = document.getElementById('lifecycle-details');
    if (!container) return;

    // 只显示已完成的实例
    const completedInstances = instances.filter(instance => 
      instance.状态 === '已完成' || instance.状态 === '已退出'
    );

    if (completedInstances.length === 0) {
      container.innerHTML = '<div class="loading">暂无已完成的实例数据</div>';
      return;
    }

    const instancesHtml = completedInstances.map(instance => {
      const lifecycle = instance.生命周期统计;
      if (!lifecycle) return '';

      return `
        <div class="lifecycle-instance">
          <div class="lifecycle-header">
            <div class="instance-id">${instance.实例ID}</div>
            <div class="instance-status ${instance.状态 === '已完成' ? 'completed' : 'exited'}">
              ${instance.状态}
            </div>
          </div>
          
          <div class="lifecycle-stages">
            <div class="stage-card">
              <div class="stage-title">🚀 启动阶段</div>
              <div class="stage-stats">
                <div class="stage-stat">
                  <span class="label">初始投入</span>
                  <span class="value">${lifecycle.启动成本.初始投入_usdt.toFixed(2)} USDT</span>
                </div>
                <div class="stage-stat">
                  <span class="label">Gas费用</span>
                  <span class="value">${lifecycle.启动成本.Gas费用_usdt.toFixed(2)} USDT</span>
                </div>
              </div>
            </div>
            
            <div class="stage-card">
              <div class="stage-title">⚡ 运行阶段</div>
              <div class="stage-stats">
                <div class="stage-stat">
                  <span class="label">手续费收入</span>
                  <span class="value">${lifecycle.运行收益.手续费收入_usdt.toFixed(2)} USDT</span>
                </div>
                <div class="stage-stat">
                  <span class="label">LP价值变化</span>
                  <span class="value">${lifecycle.运行收益.LP价值变化_usdt.toFixed(2)} USDT</span>
                </div>
                <div class="stage-stat">
                  <span class="label">运行天数</span>
                  <span class="value">${lifecycle.运行收益.运行天数.toFixed(1)}天</span>
                </div>
              </div>
            </div>
            
            ${lifecycle.关闭结算 ? `
            <div class="stage-card">
              <div class="stage-title">🏁 关闭阶段</div>
              <div class="stage-stats">
                <div class="stage-stat">
                  <span class="label">最终提取</span>
                  <span class="value">${lifecycle.关闭结算.最终提取_usdt.toFixed(2)} USDT</span>
                </div>
                <div class="stage-stat">
                  <span class="label">关闭Gas</span>
                  <span class="value">${lifecycle.关闭结算.关闭Gas费用_usdt.toFixed(2)} USDT</span>
                </div>
                <div class="stage-stat">
                  <span class="label">滑点损失</span>
                  <span class="value">${lifecycle.关闭结算.滑点损失_usdt.toFixed(2)} USDT</span>
                </div>
              </div>
            </div>
            ` : ''}
            
            <div class="stage-card">
              <div class="stage-title">📊 汇总结果</div>
              <div class="stage-stats">
                <div class="stage-stat">
                  <span class="label">净盈亏</span>
                  <span class="value" style="color: ${lifecycle.生命周期汇总.净盈亏_usdt >= 0 ? '#28a745' : '#dc3545'}">
                    ${lifecycle.生命周期汇总.净盈亏_usdt >= 0 ? '+' : ''}${lifecycle.生命周期汇总.净盈亏_usdt.toFixed(2)} USDT
                  </span>
                </div>
                <div class="stage-stat">
                  <span class="label">投资回报率</span>
                  <span class="value" style="color: ${lifecycle.生命周期汇总.投资回报率_percent >= 0 ? '#28a745' : '#dc3545'}">
                    ${lifecycle.生命周期汇总.投资回报率_percent >= 0 ? '+' : ''}${lifecycle.生命周期汇总.投资回报率_percent.toFixed(2)}%
                  </span>
                </div>
                <div class="stage-stat">
                  <span class="label">年化收益率</span>
                  <span class="value" style="color: ${lifecycle.生命周期汇总.年化收益率_percent >= 0 ? '#28a745' : '#dc3545'}">
                    ${lifecycle.生命周期汇总.年化收益率_percent >= 0 ? '+' : ''}${lifecycle.生命周期汇总.年化收益率_percent.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = instancesHtml;
  }

  /**
   * ❌ 显示错误信息
   */
  showError(message) {
    const container = document.getElementById('profit-loss-summary');
    if (container) {
      container.innerHTML = `<div class="error">${message}</div>`;
    }
  }

  /**
   * 🧹 销毁组件
   */
  destroy() {
    this.stopAutoUpdate();
    const container = document.getElementById('profit-loss-container');
    if (container) {
      container.remove();
    }
  }
}

// 全局实例
window.ProfitLossDisplay = ProfitLossDisplay;

// 自动初始化（如果页面已加载）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (!window.profitLossDisplay) {
      window.profitLossDisplay = new ProfitLossDisplay();
      window.profitLossDisplay.init();
    }
  });
} else {
  if (!window.profitLossDisplay) {
    window.profitLossDisplay = new ProfitLossDisplay();
    window.profitLossDisplay.init();
  }
} 