/**
 * 监控面板组件 (占位符)
 */

export class MonitorPanelComponent {
  constructor(container, api, websocket) {
    this.container = container;
    this.api = api;
    this.websocket = websocket;
  }

  render() {
    console.log('监控面板组件 - 待实现');
    if (this.container) {
      this.container.innerHTML = '<p>监控面板组件正在开发中...</p>';
    }
  }
} 