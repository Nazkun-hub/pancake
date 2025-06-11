/**
 * 策略管理系统 - 主应用程序
 * 负责应用初始化、路由管理和全局功能
 */

import { StrategyAPI } from './api.js';
import { StrategyWebSocket } from './websocket.js';
import { StrategyFormComponent } from './components/strategy-form.js';
import { StrategyListComponent } from './components/strategy-list.js';
import { StrategyPersistenceManager } from './persistence.js';
import { StrategyRecoveryManager } from './components/recovery-manager.js';

class StrategyApp {
  constructor() {
    this.api = new StrategyAPI();
    this.websocket = new StrategyWebSocket();
    this.persistence = new StrategyPersistenceManager();
    this.recovery = new StrategyRecoveryManager(this.persistence, this.api, this.websocket);
    
    this.currentPage = 'dashboard';
    this.isConnected = false;
    this.stats = {
      total: 0,
      active: 0,
      totalProfit: 0,
      successRate: 0
    };
    
    // 组件实例
    this.components = {
      strategyForm: null,
      strategyList: null,
      monitorPanel: null,
      analyticsPanel: null,
      profitLossDisplay: null
    };
  }

  /**
   * 应用初始化
   */
  async init() {
    try {
      console.log('🚀 初始化策略管理系统...');
      
      // 隐藏加载动画
      this.hideLoading();
      
      // 初始化UI
      this.initializeUI();
      
      // 测试API连接
      await this.testConnection();
      
      // 连接WebSocket
      await this.connectWebSocket();
      
      // 🔄 检查恢复策略
      await this.checkRecovery();
      
      // 加载初始数据
      await this.loadInitialData();
      
      // 设置定时器
      this.startPeriodicUpdates();
      
      console.log('✅ 策略管理系统初始化完成');
      
    } catch (error) {
      console.error('❌ 系统初始化失败:', error);
      this.showNotification('系统初始化失败: ' + error.message, 'error');
      this.updateConnectionStatus(false, '初始化失败');
    }
  }

  /**
   * 隐藏加载动画
   */
  hideLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
      setTimeout(() => {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
          loadingOverlay.style.display = 'none';
        }, 300);
      }, 1000);
    }
  }

  /**
   * 初始化UI事件
   */
  initializeUI() {
    // 导航菜单
    this.initializeNavigation();
    
    // 主题切换
    this.initializeThemeToggle();
    
    // 刷新按钮
    this.initializeRefreshButton();
    
    // 快速操作按钮
    this.initializeQuickActions();
    
    // 模态框
    this.initializeModal();
    
    // 💰 初始化盈亏统计组件
    this.initializeProfitLossDisplay();
  }

  /**
   * 初始化导航
   */
  initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        if (page) {
          this.navigateTo(page);
        }
      });
    });
  }

  /**
   * 页面导航
   */
  navigateTo(page) {
    // 更新导航状态
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    
    const activeNavItem = document.querySelector(`[data-page="${page}"]`);
    if (activeNavItem) {
      activeNavItem.classList.add('active');
    }

    // 更新页面内容
    document.querySelectorAll('.page-content').forEach(pageContent => {
      pageContent.classList.remove('active');
    });
    
    const activePage = document.getElementById(`page-${page}`);
    if (activePage) {
      activePage.classList.add('active');
      this.currentPage = page;
      
      // 触发页面加载事件
      this.onPageLoad(page);
    }
  }

  /**
   * 页面加载事件
   */
  async onPageLoad(page) {
    try {
      switch (page) {
        case 'dashboard':
          await this.loadDashboard();
          break;
        case 'create':
          await this.loadCreateStrategyForm();
          break;
        case 'strategies':
          await this.loadStrategiesList();
          break;
        case 'monitor':
          await this.loadMonitorPanel();
          break;
        case 'analytics':
          await this.loadAnalyticsPanel();
          break;
      }
    } catch (error) {
      console.error(`页面加载失败 [${page}]:`, error);
      this.showNotification(`页面加载失败: ${error.message}`, 'error');
    }
  }

  /**
   * 测试API连接
   */
  async testConnection() {
    try {
      const result = await this.api.testConnection();
      this.updateConnectionStatus(result.connected, result.connected ? '已连接' : result.error);
      this.isConnected = result.connected;
      return result.connected;
    } catch (error) {
      this.updateConnectionStatus(false, '连接失败');
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * 连接WebSocket
   */
  async connectWebSocket() {
    try {
      await this.websocket.connect({
        onConnect: () => {
          console.log('✅ WebSocket连接成功');
          this.updateConnectionStatus(true, 'WebSocket已连接');
          this.addRecentActivity('WebSocket连接成功', 'success');
        },
        onDisconnect: (reason) => {
          console.log('❌ WebSocket断开:', reason);
          this.updateConnectionStatus(false, 'WebSocket断开');
          this.addRecentActivity(`WebSocket断开: ${reason}`, 'warning');
        },
        onError: (error) => {
          console.warn('⚠️ WebSocket连接错误:', error);
          // 不显示通知，避免频繁弹出
          // this.showNotification('WebSocket连接错误', 'error');
        },
        onStrategyUpdate: (data) => {
          this.handleStrategyUpdate(data);
        }
      });
    } catch (error) {
      console.warn('⚠️ WebSocket连接失败:', error);
      // WebSocket连接失败不阻止应用启动
    }
  }

  /**
   * 检查策略恢复
   */
  async checkRecovery() {
    try {
      console.log('🔍 检查中断的策略...');
      
      // 清理过期数据
      this.persistence.cleanupExpiredData();
      
      // 检查是否有可恢复的策略
      const hasRecoverable = await this.recovery.checkForRecoverableStrategies();
      
      if (hasRecoverable) {
        console.log('📋 发现可恢复的策略，显示恢复界面');
      } else {
        console.log('✅ 没有需要恢复的策略');
      }
      
    } catch (error) {
      console.error('❌ 检查恢复策略失败:', error);
      // 不中断应用启动
    }
  }

  /**
   * 加载初始数据
   */
  async loadInitialData() {
    try {
      // 加载策略统计
      this.stats = await this.api.getStrategyStats();
      this.updateStatsDisplay();
      
      this.addRecentActivity('初始数据加载完成', 'success');
    } catch (error) {
      console.error('加载初始数据失败:', error);
      this.addRecentActivity('初始数据加载失败', 'error');
      // 不抛出错误，允许应用继续运行
    }
  }

  /**
   * 更新连接状态
   */
  updateConnectionStatus(connected, message = '') {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    if (statusDot) {
      statusDot.className = `status-dot ${connected ? 'connected' : 'disconnected'}`;
    }
    
    if (statusText) {
      statusText.textContent = message || (connected ? '已连接' : '未连接');
    }
  }

  /**
   * 更新统计显示
   */
  updateStatsDisplay() {
    const elements = {
      totalStrategies: document.getElementById('totalStrategies'),
      activeStrategies: document.getElementById('activeStrategies'),
      totalProfit: document.getElementById('totalProfit'),
      successRate: document.getElementById('successRate')
    };

    if (elements.totalStrategies) {
      elements.totalStrategies.textContent = this.stats.total || 0;
    }
    
    if (elements.activeStrategies) {
      elements.activeStrategies.textContent = this.stats.active || 0;
    }
    
    if (elements.totalProfit) {
      const profit = this.stats.totalProfit || 0;
      const sign = profit >= 0 ? '+' : '';
      elements.totalProfit.textContent = `${sign}$${profit.toFixed(2)}`;
      elements.totalProfit.className = profit >= 0 ? 'profit' : 'loss';
    }
    
    if (elements.successRate) {
      elements.successRate.textContent = `${(this.stats.successRate || 0).toFixed(1)}%`;
    }
  }

  /**
   * 添加最近活动
   */
  addRecentActivity(message, type = 'info') {
    const activityList = document.getElementById('recentActivity');
    if (!activityList) return;

    const activityItem = document.createElement('div');
    activityItem.className = 'activity-item';
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    activityItem.innerHTML = `
      <div class="activity-content">
        <span class="activity-icon">${this.getActivityIcon(type)}</span>
        <span class="activity-text">${message}</span>
      </div>
      <span class="activity-time">${timeStr}</span>
    `;

    // 插入到顶部
    activityList.insertBefore(activityItem, activityList.firstChild);

    // 限制显示条数
    while (activityList.children.length > 10) {
      activityList.removeChild(activityList.lastChild);
    }
  }

  /**
   * 获取活动图标
   */
  getActivityIcon(type) {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || 'ℹ️';
  }

  /**
   * 主题切换
   */
  initializeThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      this.setTheme(newTheme);
    });

    // 设置初始主题
    this.setTheme('dark');
  }

  /**
   * 设置主题
   */
  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.textContent = theme === 'dark' ? '🌞' : '🌙';
    }
    localStorage.setItem('theme', theme);
  }

  /**
   * 刷新按钮
   */
  initializeRefreshButton() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (!refreshBtn) return;

    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = '🔄 刷新中...';
      
      try {
        await this.refreshData();
        this.showNotification('数据刷新成功', 'success');
      } catch (error) {
        this.showNotification('数据刷新失败', 'error');
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '🔄 刷新';
      }
    });
  }

  /**
   * 快速操作按钮
   */
  initializeQuickActions() {
    const quickCreateStrategy = document.getElementById('quickCreateStrategy');
    const quickMonitor = document.getElementById('quickMonitor');

    if (quickCreateStrategy) {
      quickCreateStrategy.addEventListener('click', () => {
        this.navigateTo('create');
      });
    }

    if (quickMonitor) {
      quickMonitor.addEventListener('click', () => {
        this.navigateTo('monitor');
      });
    }
  }

  /**
   * 模态框初始化
   */
  initializeModal() {
    // 创建模态框HTML结构
    this.createModalHTML();
    
    const modal = document.getElementById('modal');
    const modalClose = document.getElementById('modalClose');

    if (modalClose) {
      modalClose.addEventListener('click', () => {
        this.hideModal();
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideModal();
        }
      });
    }
  }

  /**
   * 创建模态框HTML结构
   */
  createModalHTML() {
    const existingModal = document.getElementById('modal');
    if (existingModal) return;

    const modalHTML = `
      <div id="modal" class="modal" style="display: none;">
        <div class="modal-content">
          <div class="modal-header">
            <h3 id="modalTitle">标题</h3>
            <button id="modalClose" class="modal-close">&times;</button>
          </div>
          <div class="modal-body" id="modalBody">内容</div>
          <div class="modal-footer" id="modalFooter"></div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  /**
   * 显示模态框
   */
  showModal(title, content, buttons = []) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalFooter = document.getElementById('modalFooter');

    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.innerHTML = content;
    if (modalFooter) {
      modalFooter.innerHTML = buttons.map(btn => 
        `<button class="btn ${btn.class || 'btn-secondary'}" onclick="${btn.onclick || ''}">${btn.text}</button>`
      ).join('');
    }

    if (modal) {
      modal.style.display = 'flex';
    }

    // 创建全局关闭函数
    window.closeModal = () => this.hideModal();
  }

  /**
   * 隐藏模态框
   */
  hideModal() {
    const modal = document.getElementById('modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * 💰 初始化盈亏统计显示组件
   */
  initializeProfitLossDisplay() {
    try {
      // 检查ProfitLossDisplay类是否存在
      if (typeof ProfitLossDisplay === 'undefined') {
        console.warn('⚠️ ProfitLossDisplay类未找到，跳过盈亏统计组件初始化');
        return;
      }

      // 创建盈亏统计组件实例
      this.components.profitLossDisplay = new ProfitLossDisplay();
      this.components.profitLossDisplay.init();
      
      console.log('✅ 盈亏统计组件初始化完成');
      this.addRecentActivity('盈亏统计系统已启动', 'success');
    } catch (error) {
      console.error('❌ 盈亏统计组件初始化失败:', error);
      this.showNotification('盈亏统计组件启动失败', 'warning');
    }
  }

  /**
   * 显示通知
   */
  showNotification(message, type = 'info', duration = 3000) {
    // 创建通知容器（如果不存在）
    let container = document.getElementById('notifications');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notifications';
      container.className = 'notifications-container';
      document.body.appendChild(container);
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">${this.getActivityIcon(type)}</span>
        <span class="notification-text">${message}</span>
      </div>
      <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(notification);

    // 自动移除
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, duration);
  }

  /**
   * 刷新数据
   */
  async refreshData() {
    // 重新加载统计数据
    this.stats = await this.api.getStrategyStats();
    this.updateStatsDisplay();
    
    // 重新加载当前页面数据
    await this.onPageLoad(this.currentPage);
    
    this.addRecentActivity('数据刷新完成', 'success');
  }

  /**
   * 定期更新
   */
  startPeriodicUpdates() {
    // 每30秒更新一次统计数据
    setInterval(async () => {
      try {
        if (this.isConnected) {
          this.stats = await this.api.getStrategyStats();
          this.updateStatsDisplay();
        }
      } catch (error) {
        console.warn('定期更新失败:', error);
      }
    }, 30000);
  }

  /**
   * 处理策略更新
   */
  handleStrategyUpdate(data) {
    try {
      console.log('📊 策略状态更新:', data);
      
      // 🔄 保存策略状态到持久化存储
      if (data.instanceId && data.状态) {
        this.persistence.saveStrategyState(data.instanceId, data);
      }
      
      // 更新统计数据
      if (data.stats) {
        this.stats = { ...this.stats, ...data.stats };
        this.updateStatsDisplay();
      }
      
      // 添加活动记录
      this.addRecentActivity(
        `策略 ${data.instanceId?.slice(0, 8)}... 状态更新: ${data.状态}`,
        this.getActivityTypeByStatus(data.状态)
      );
    
      // 如果当前在策略列表页面，刷新列表
      if (this.currentPage === 'strategies' && this.components.strategyList) {
      this.components.strategyList.handleStrategyUpdate(data);
      }
      
      // 触发UI更新
      this.triggerUIUpdate('strategy-update', data);
      
    } catch (error) {
      console.error('处理策略更新失败:', error);
    }
  }

  /**
   * 策略创建成功回调
   */
  onStrategyCreated(data) {
    try {
      console.log('✅ 策略创建成功:', data);
      
      // 🔄 保存新策略到持久化存储
      if (data.instanceId) {
        this.persistence.saveStrategy(data.instanceId, {
          配置: data.配置 || {},
          创建时间: Date.now(),
          状态: '初始化',
          市场数据: data.市场数据 || null
        });
        
        // 保存初始状态
        this.persistence.saveStrategyState(data.instanceId, {
          状态: '初始化',
          创建时间: Date.now(),
          instanceId: data.instanceId
        });
      }
      
      // 更新统计
      this.stats.total += 1;
      this.updateStatsDisplay();
      
      // 添加活动记录
      this.addRecentActivity(`新策略已创建: ${data.instanceId?.slice(0, 8)}...`, 'success');
      
      // 显示成功通知
      this.showNotification('策略创建成功！', 'success');
    
      // 如果在创建页面，可以选择跳转到策略列表
      if (this.currentPage === 'create') {
        setTimeout(() => {
          if (confirm('策略创建成功！是否跳转到策略列表查看？')) {
    this.navigateTo('strategies');
          }
        }, 1000);
      }
      
    } catch (error) {
      console.error('处理策略创建成功回调失败:', error);
    }
  }

  /**
   * 根据状态获取活动类型
   */
  getActivityTypeByStatus(status) {
    const statusTypeMap = {
      '初始化': 'info',
      '准备中': 'info', 
      '运行中': 'success',
      '监控中': 'success',
      '已完成': 'success',
      '已暂停': 'warning',
      '错误': 'error'
    };
    return statusTypeMap[status] || 'info';
  }

  /**
   * 触发UI更新事件
   */
  triggerUIUpdate(eventType, data) {
    const event = new CustomEvent('strategy-ui-update', {
      detail: { type: eventType, data: data }
    });
    document.dispatchEvent(event);
  }

  // ==================== 页面加载方法 ====================

  /**
   * 加载仪表盘
   */
  async loadDashboard() {
    console.log('📊 加载仪表盘数据...');
    // 仪表盘数据已在初始化时加载
    this.addRecentActivity('仪表盘数据已加载', 'info');
  }

  /**
   * 加载策略创建表单
   */
  async loadCreateStrategyForm() {
    console.log('➕ 加载策略创建表单...');
    
    const container = document.querySelector('#page-create .create-strategy-container');
    if (!container) {
      console.error('策略创建容器未找到');
      return;
    }

    // 清理之前的组件
    if (this.components.strategyForm) {
      this.components.strategyForm = null;
    }

    // 创建新的策略表单组件
    this.components.strategyForm = new StrategyFormComponent(container, this.api);
    this.components.strategyForm.render();

    // 设置全局app引用，供组件使用
    window.app = this;

    this.addRecentActivity('策略创建表单已加载', 'info');
  }

  /**
   * 加载策略列表
   */
  async loadStrategiesList() {
    const container = document.querySelector('#page-strategies .strategies-container');
    if (!container) return;

    if (!this.components.strategyList) {
      this.components.strategyList = new StrategyListComponent(
        container, 
        this.api, 
        this.websocket
      );
      
      // 🔄 注入持久化管理器
      this.components.strategyList.persistence = this.persistence;
    }

    this.components.strategyList.render();
  }

  /**
   * 加载监控面板
   */
  async loadMonitorPanel() {
    console.log('📈 加载监控面板...');
    
    const container = document.querySelector('#page-monitor .monitor-container');
    if (!container) {
      console.error('监控面板容器未找到');
      return;
    }

    // TODO: 实现监控面板组件
    container.innerHTML = `
      <div class="monitor-placeholder">
        <h3>📈 实时监控面板</h3>
        <p>监控面板正在开发中...</p>
        <div class="monitor-features">
          <div class="feature-card">
            <h4>🎯 策略状态监控</h4>
            <p>实时显示所有策略的运行状态和执行进度</p>
          </div>
          <div class="feature-card">
            <h4>📊 价格变化图表</h4>
            <p>可视化显示池子价格变化和头寸范围</p>
          </div>
          <div class="feature-card">
            <h4>⚡ 实时事件日志</h4>
            <p>记录策略执行过程中的所有关键事件</p>
          </div>
        </div>
      </div>
    `;

    this.addRecentActivity('监控面板已加载', 'info');
  }

  /**
   * 加载分析面板
   */
  async loadAnalyticsPanel() {
    console.log('📊 加载分析面板...');
    
    const container = document.querySelector('#page-analytics .analytics-container');
    if (!container) {
      console.error('分析面板容器未找到');
      return;
    }

    // 清空容器
    container.innerHTML = '';

    // 检查盈亏统计组件是否已初始化
    if (this.components.profitLossDisplay) {
      // 在分析面板中显示盈亏统计组件
      const profitLossContainer = this.components.profitLossDisplay.container;
      if (profitLossContainer) {
        container.appendChild(profitLossContainer);
        console.log('✅ 盈亏统计组件已添加到分析面板');
      }
    } else {
      // 如果组件未初始化，显示占位符
      container.innerHTML = `
        <div class="analytics-placeholder">
          <h3>💰 盈亏分析面板</h3>
          <p class="warning">⚠️ 盈亏统计组件未初始化，请刷新页面重试</p>
          <div class="analytics-features">
            <div class="feature-card">
              <h4>📈 实时盈亏统计</h4>
              <p>显示所有策略实例的盈亏统计数据</p>
            </div>
            <div class="feature-card">
              <h4>📊 汇总分析</h4>
              <p>计算总投入、总收益和投资回报率</p>
            </div>
            <div class="feature-card">
              <h4>💹 详细统计</h4>
              <p>查看每个策略实例的详细盈亏数据</p>
            </div>
          </div>
        </div>
      `;
    }

    this.addRecentActivity('分析面板已加载', 'info');
  }
}

// 应用初始化
document.addEventListener('DOMContentLoaded', () => {
  const app = new StrategyApp();
  app.init().catch(console.error);
  
  // 将应用实例绑定到全局，方便调试和组件使用
  window.strategyApp = app;
  window.app = app;
}); 