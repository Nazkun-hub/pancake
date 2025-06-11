/**
 * 图表配置工具函数
 */

/**
 * 获取默认图表配置
 */
export function getDefaultChartConfig() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: '时间'
        }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: '价值'
        }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  };
}

/**
 * 创建价格图表配置
 */
export function createPriceChartConfig(data, labels) {
  return {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '价格',
        data: data,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.1
      }]
    },
    options: {
      ...getDefaultChartConfig(),
      scales: {
        ...getDefaultChartConfig().scales,
        y: {
          ...getDefaultChartConfig().scales.y,
          title: {
            display: true,
            text: '价格 (USD)'
          }
        }
      }
    }
  };
}

/**
 * 创建盈亏图表配置
 */
export function createProfitChartConfig(data, labels) {
  return {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '盈亏',
        data: data,
        borderColor: function(context) {
          const value = context.parsed.y;
          return value >= 0 ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)';
        },
        backgroundColor: function(context) {
          const value = context.parsed.y;
          return value >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
        },
        tension: 0.1
      }]
    },
    options: {
      ...getDefaultChartConfig(),
      scales: {
        ...getDefaultChartConfig().scales,
        y: {
          ...getDefaultChartConfig().scales.y,
          title: {
            display: true,
            text: '盈亏 (USD)'
          }
        }
      }
    }
  };
}

/**
 * 创建饼图配置
 */
export function createPieChartConfig(data, labels) {
  return {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          'rgb(59, 130, 246)',
          'rgb(16, 185, 129)',
          'rgb(245, 158, 11)',
          'rgb(239, 68, 68)',
          'rgb(139, 92, 246)'
        ]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'right',
        }
      }
    }
  };
} 