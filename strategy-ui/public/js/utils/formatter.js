/**
 * 数据格式化和通知工具
 */

// ==================== 数字格式化 ====================

/**
 * 格式化数字为货币显示
 */
export function formatCurrency(value, currency = 'USD', decimals = 2) {
  const numValue = parseFloat(value) || 0;
  
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(numValue);
  }
  
  return `${numValue.toFixed(decimals)} ${currency}`;
}

/**
 * 格式化大数字（K, M, B）
 */
export function formatLargeNumber(value, decimals = 1) {
  const num = parseFloat(value) || 0;
  
  if (num >= 1e9) {
    return `${(num / 1e9).toFixed(decimals)}B`;
  } else if (num >= 1e6) {
    return `${(num / 1e6).toFixed(decimals)}M`;
  } else if (num >= 1e3) {
    return `${(num / 1e3).toFixed(decimals)}K`;
  }
  
  return num.toFixed(decimals);
}

/**
 * 格式化百分比
 */
export function formatPercentage(value, decimals = 2) {
  const numValue = parseFloat(value) || 0;
  return `${numValue.toFixed(decimals)}%`;
}

/**
 * 格式化代币数量
 */
export function formatTokenAmount(value, decimals = 6) {
  const numValue = parseFloat(value) || 0;
  
  if (numValue === 0) return '0';
  
  if (numValue < 0.000001) {
    return numValue.toExponential(2);
  }
  
  return numValue.toFixed(decimals).replace(/\.?0+$/, '');
}

// ==================== 时间格式化 ====================

/**
 * 格式化时间戳
 */
export function formatTimestamp(timestamp, format = 'full') {
  const date = new Date(timestamp);
  
  switch (format) {
    case 'time':
      return date.toLocaleTimeString();
    case 'date':
      return date.toLocaleDateString();
    case 'relative':
      return getRelativeTime(timestamp);
    case 'full':
    default:
      return date.toLocaleString();
  }
}

/**
 * 获取相对时间
 */
export function getRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  if (seconds > 10) return `${seconds}秒前`;
  return '刚刚';
}

/**
 * 格式化持续时间
 */
export function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}天 ${hours % 24}小时`;
  if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`;
  if (minutes > 0) return `${minutes}分钟 ${seconds % 60}秒`;
  return `${seconds}秒`;
}

// ==================== 地址格式化 ====================

/**
 * 缩短地址显示
 */
export function shortenAddress(address, startLength = 6, endLength = 4) {
  if (!address) return '';
  if (address.length <= startLength + endLength) return address;
  
  return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
}

/**
 * 验证以太坊地址
 */
export function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// ==================== 状态格式化 ====================

/**
 * 格式化策略状态
 */
export function formatStrategyStatus(status) {
  const statusMap = {
    'waiting': { text: '等待中', class: 'status-waiting', icon: '⏳' },
    'running': { text: '运行中', class: 'status-running', icon: '🟢' },
    'completed': { text: '已完成', class: 'status-completed', icon: '✅' },
    'error': { text: '错误', class: 'status-error', icon: '❌' },
    'stopped': { text: '已停止', class: 'status-stopped', icon: '⏹️' },
    'paused': { text: '已暂停', class: 'status-paused', icon: '⏸️' }
  };
  
  return statusMap[status] || { text: status, class: 'status-unknown', icon: '❓' };
}

/**
 * 格式化连接状态
 */
export function formatConnectionStatus(status) {
  const statusMap = {
    'connected': { text: '已连接', class: 'connected', icon: '🟢' },
    'connecting': { text: '连接中', class: 'connecting', icon: '🟡' },
    'disconnected': { text: '已断开', class: 'disconnected', icon: '🔴' },
    'error': { text: '连接错误', class: 'error', icon: '❌' }
  };
  
  return statusMap[status] || { text: status, class: 'unknown', icon: '❓' };
}

// ==================== 通知系统 ====================

/**
 * 显示通知
 */
export function showNotification(message, type = 'info', duration = 5000) {
  const container = getNotificationContainer();
  const notification = createNotificationElement(message, type);
  
  container.appendChild(notification);
  
  // 动画显示
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // 自动隐藏
  if (duration > 0) {
    setTimeout(() => {
      hideNotification(notification);
    }, duration);
  }
  
  return notification;
}

/**
 * 获取通知容器
 */
function getNotificationContainer() {
  let container = document.getElementById('notifications');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notifications';
    container.className = 'notifications-container';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * 创建通知元素
 */
function createNotificationElement(message, type) {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  
  const iconMap = {
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'info': 'ℹ️'
  };
  
  notification.innerHTML = `
    <div class="notification-content">
      <span class="notification-icon">${iconMap[type] || 'ℹ️'}</span>
      <span class="notification-message">${message}</span>
      <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;
  
  return notification;
}

/**
 * 隐藏通知
 */
function hideNotification(notification) {
  notification.classList.add('hide');
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 300);
}

// ==================== 连接状态更新 ====================

/**
 * 更新连接状态显示
 */
export function updateConnectionStatus(status, message = '') {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  
  if (statusDot) {
    // 清除所有状态类
    statusDot.className = 'status-dot';
    
    // 添加新状态类
    switch (status) {
      case 'connected':
        statusDot.classList.add('connected');
        break;
      case 'connecting':
        statusDot.classList.add('connecting');
        break;
      case 'error':
      case 'disconnected':
        statusDot.classList.remove('connected', 'connecting');
        break;
    }
  }
  
  if (statusText) {
    const statusInfo = formatConnectionStatus(status);
    statusText.textContent = message || statusInfo.text;
  }
}

// ==================== 数据验证 ====================

/**
 * 验证数字输入
 */
export function validateNumber(value, min = 0, max = Infinity) {
  const num = parseFloat(value);
  
  if (isNaN(num)) {
    return { valid: false, error: '请输入有效数字' };
  }
  
  if (num < min) {
    return { valid: false, error: `数值不能小于 ${min}` };
  }
  
  if (num > max) {
    return { valid: false, error: `数值不能大于 ${max}` };
  }
  
  return { valid: true, value: num };
}

/**
 * 验证百分比输入
 */
export function validatePercentage(value, min = 0, max = 100) {
  const result = validateNumber(value, min, max);
  if (!result.valid) {
    return result;
  }
  
  return { valid: true, value: result.value / 100 };
}

// ==================== 颜色工具 ====================

/**
 * 根据值生成颜色
 */
export function getColorByValue(value, threshold = 0) {
  if (value > threshold) {
    return 'var(--success-color)';
  } else if (value < threshold) {
    return 'var(--error-color)';
  } else {
    return 'var(--text-muted)';
  }
}

/**
 * 根据百分比生成渐变色
 */
export function getGradientColor(percentage, startColor = '#ff6b35', endColor = '#4ecdc4') {
  // 简单的颜色插值
  const start = hexToRgb(startColor);
  const end = hexToRgb(endColor);
  
  const r = Math.round(start.r + (end.r - start.r) * percentage);
  const g = Math.round(start.g + (end.g - start.g) * percentage);
  const b = Math.round(start.b + (end.b - start.b) * percentage);
  
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * 十六进制颜色转RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

/**
 * 数据格式化工具函数
 */

/**
 * 格式化价格
 */
export function formatPrice(price, decimals = 6) {
  if (!price || isNaN(price)) return '0.00';
  return parseFloat(price).toFixed(decimals);
}

/**
 * 格式化货币
 */
export function formatCurrency(amount, currency = 'USD') {
  if (!amount || isNaN(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
}

/**
 * 格式化时间
 */
export function formatTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString();
}

/**
 * 格式化百分比
 */
export function formatPercent(value, decimals = 2) {
  if (!value || isNaN(value)) return '0%';
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * 简化地址显示
 */
export function shortenAddress(address, start = 6, end = 4) {
  if (!address) return '';
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

/**
 * 格式化策略状态
 */
export function formatStrategyStatus(status) {
  const statusMap = {
    '运行中': { text: '运行中', class: 'status-success' },
    '已停止': { text: '已停止', class: 'status-warning' },
    '错误': { text: '错误', class: 'status-danger' },
    '创建中': { text: '创建中', class: 'status-info' }
  };
  
  return statusMap[status] || { text: status, class: 'status-info' };
} 