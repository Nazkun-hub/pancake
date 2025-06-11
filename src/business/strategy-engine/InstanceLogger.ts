/**
 * 📝 实例日志管理器 - 为每个策略实例创建独立的关键操作日志
 */

import fs from 'fs';
import path from 'path';

export class InstanceLogger {
  private static logDir = 'logs/instances';
  private instanceId: string;
  private logFile: string;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
    this.logFile = path.join(InstanceLogger.logDir, `${instanceId}.log`);
    
    // 确保日志目录存在
    this.ensureLogDirectory();
    
    // 记录实例开始
    this.logOperation('INSTANCE_START', '策略实例启动', { 时间: new Date().toLocaleString() });
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDirectory(): void {
    try {
      if (!fs.existsSync(InstanceLogger.logDir)) {
        fs.mkdirSync(InstanceLogger.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('创建实例日志目录失败:', error);
    }
  }

  /**
   * 记录关键操作
   */
  logOperation(type: string, message: string, details?: any): void {
    try {
      // 生成本地时间戳 (YYYY-MM-DD HH:MM:SS)
      const now = new Date();
      const timestamp = now.getFullYear() + '-' + 
        String(now.getMonth() + 1).padStart(2, '0') + '-' + 
        String(now.getDate()).padStart(2, '0') + ' ' + 
        String(now.getHours()).padStart(2, '0') + ':' + 
        String(now.getMinutes()).padStart(2, '0') + ':' + 
        String(now.getSeconds()).padStart(2, '0');

      const logEntry = {
        时间: timestamp,
        类型: type,
        消息: message,
        ...(details && Object.keys(details).length > 0 ? { 详情: details } : {})
      };

      const logLine = `[${timestamp}] [${type}] ${message}` + 
        (details ? ` - ${JSON.stringify(details)}` : '') + '\n';

      fs.appendFileSync(this.logFile, logLine, 'utf8');
    } catch (error) {
      console.error(`实例日志记录失败 [${this.instanceId}]:`, error);
    }
  }

  /**
   * 记录阶段操作
   */
  logStage(stage: number, action: 'START' | 'SUCCESS' | 'ERROR', message?: string, details?: any): void {
    const stageNames = {
      1: '市场数据获取',
      2: '资产准备', 
      3: '创建头寸',
      4: '开始监控',
      5: '执行退出'
    };

    const stageName = stageNames[stage as keyof typeof stageNames] || `阶段${stage}`;
    const actionText = action === 'START' ? '开始' : action === 'SUCCESS' ? '成功' : '失败';
    
    this.logOperation(
      `STAGE_${stage}_${action}`,
      `${stageName}${actionText}${message ? `: ${message}` : ''}`,
      details
    );
  }

  /**
   * 记录OKX交易
   */
  logOKXTrade(action: 'START' | 'SUCCESS' | 'ERROR', details: {
    从代币?: string;
    到代币?: string; 
    金额?: string;
    交易哈希?: string;
    错误?: string;
    发送数量?: string;
    接收数量?: string;
    基础货币?: string;
    需求量?: string;
  }): void {
    const actionText = action === 'START' ? '开始' : action === 'SUCCESS' ? '成功' : '失败';
    
    this.logOperation(
      `OKX_TRADE_${action}`,
      `OKX交易${actionText}`,
      details
    );
  }

  /**
   * 记录余额检查
   */
  logBalanceCheck(token: string, balance: number, required?: number, sufficient?: boolean): void {
    this.logOperation(
      'BALANCE_CHECK',
      `余额检查: ${token}`,
      {
        当前余额: balance.toFixed(6),
        ...(required !== undefined ? { 需求量: required.toFixed(6) } : {}),
        ...(sufficient !== undefined ? { 是否充足: sufficient ? '是' : '否' } : {})
      }
    );
  }

  /**
   * 记录监控事件
   */
  logMonitoring(event: 'START' | 'OUT_OF_RANGE' | 'BACK_IN_RANGE' | 'TIMEOUT', details?: any): void {
    const eventMap = {
      'START': '监控启动',
      'OUT_OF_RANGE': '价格超出范围',
      'BACK_IN_RANGE': '价格重新进入范围', 
      'TIMEOUT': '监控超时'
    };

    this.logOperation(
      `MONITOR_${event}`,
      eventMap[event],
      details
    );
  }

  /**
   * 记录头寸操作
   */
  logPosition(action: 'CREATE_START' | 'CREATE_SUCCESS' | 'CLOSE_START' | 'CLOSE_SUCCESS' | 'ERROR', details?: any): void {
    const actionMap = {
      'CREATE_START': '开始创建头寸',
      'CREATE_SUCCESS': '头寸创建成功',
      'CLOSE_START': '开始关闭头寸',
      'CLOSE_SUCCESS': '头寸关闭成功',
      'ERROR': '头寸操作失败'
    };

    this.logOperation(
      `POSITION_${action}`,
      actionMap[action],
      details
    );
  }

  /**
   * 记录错误
   */
  logError(error: any, context?: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    this.logOperation(
      'ERROR',
      `错误${context ? `[${context}]` : ''}: ${errorMessage}`,
      {
        堆栈信息: error instanceof Error ? error.stack?.substring(0, 200) : undefined
      }
    );
  }

  /**
   * 记录实例结束
   */
  logInstanceEnd(reason: string, success: boolean): void {
    this.logOperation(
      'INSTANCE_END',
      `策略实例结束 - ${success ? '成功' : '失败'}`,
      {
        结束原因: reason,
        结束时间: new Date().toLocaleString()
      }
    );
  }
} 