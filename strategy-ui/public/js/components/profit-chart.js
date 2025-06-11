/**
 * 盈亏图表组件 (占位符)
 */

export class ProfitChartComponent {
  constructor(container, api) {
    this.container = container;
    this.api = api;
  }

  render() {
    console.log('盈亏图表组件 - 待实现');
    if (this.container) {
      this.container.innerHTML = '<p>盈亏图表组件正在开发中...</p>';
    }
  }
} 