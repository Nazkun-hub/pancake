import { injectable } from 'tsyringe';
import { 
  IRiskManager,
  RiskAssessment,
  RiskRule,
  RiskAlert,
  Operation,
  ModuleConfig,
  ModuleHealth,
  ModuleMetrics
} from '../types/interfaces.js';

/**
 * 风险管理器实现
 * 负责风险评估、限制检查和风险监控
 */
@injectable()
export class RiskManager implements IRiskManager {
  public readonly name = 'RiskManager';
  public readonly version = '1.0.0';
  public readonly dependencies: string[] = [];

  private isStarted = false;
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private lastActivity = Date.now();
  private riskRules: RiskRule[] = [];
  private alertCallbacks: Array<(alert: RiskAlert) => void> = [];
  private monitoringPools = new Set<string>();

  /**
   * 初始化风险管理器
   */
  async initialize(config: ModuleConfig): Promise<void> {
    console.log('🔄 初始化风险管理器...');
    
    // 设置默认风险规则
    await this.setupDefaultRiskRules();
    
    console.log('✅ 风险管理器初始化完成');
  }

  /**
   * 启动风险管理器
   */
  async start(): Promise<void> {
    this.isStarted = true;
    this.startTime = Date.now();
    console.log('🚀 风险管理器已启动');
  }

  /**
   * 停止风险管理器
   */
  async stop(): Promise<void> {
    this.isStarted = false;
    this.riskRules.length = 0;
    this.alertCallbacks.length = 0;
    this.monitoringPools.clear();
    console.log('⏹️ 风险管理器已停止');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ModuleHealth> {
    return {
      status: this.isStarted ? 'healthy' : 'error',
      message: this.isStarted ? 
        `风险管理器运行正常 (${this.riskRules.length} 条规则)` : 
        '风险管理器未启动',
      timestamp: Date.now()
    };
  }

  /**
   * 获取模块指标
   */
  getMetrics(): ModuleMetrics {
    return {
      uptime: Date.now() - this.startTime,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      lastActivity: this.lastActivity
    };
  }

  /**
   * 评估操作风险
   */
  async assessRisk(operation: Operation): Promise<RiskAssessment> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      console.log('🔍 评估操作风险...', {
        type: operation.type,
        priority: operation.priority
      });

      const riskFactors = await this.calculateRiskFactors(operation);
      const riskScore = this.calculateRiskScore(riskFactors);
      const riskLevel = this.determineRiskLevel(riskScore);
      const recommendations = this.generateRecommendations(riskLevel, riskFactors);

      const assessment: RiskAssessment = {
        level: riskLevel,
        score: riskScore,
        factors: riskFactors,
        recommendations
      };

      console.log('✅ 风险评估完成', {
        level: riskLevel,
        score: riskScore.toFixed(2),
        factorCount: riskFactors.length
      });

      return assessment;

    } catch (error) {
      this.errorCount++;
      console.error('❌ 风险评估失败:', error);
      throw error;
    }
  }

  /**
   * 检查操作限制
   */
  async checkLimits(poolId: string, operation: Operation): Promise<boolean> {
    try {
      this.requestCount++;
      this.lastActivity = Date.now();

      console.log('🚫 检查操作限制...', { poolId, operationType: operation.type });

      // 检查所有相关的风险规则
      for (const rule of this.riskRules) {
        const isViolated = await this.checkRuleViolation(rule, poolId, operation);
        
        if (isViolated) {
          await this.handleRuleViolation(rule, poolId, operation);
          
          if (rule.action === 'block') {
            console.log(`🚫 操作被阻止: ${rule.name}`);
            return false;
          }
        }
      }

      console.log('✅ 操作限制检查通过');
      return true;

    } catch (error) {
      this.errorCount++;
      console.error('❌ 限制检查失败:', error);
      return false;
    }
  }

  /**
   * 设置风险规则
   */
  async setRiskRules(rules: RiskRule[]): Promise<void> {
    this.requestCount++;
    this.lastActivity = Date.now();

    // 验证规则
    for (const rule of rules) {
      if (!this.validateRiskRule(rule)) {
        throw new Error(`无效的风险规则: ${rule.name}`);
      }
    }

    this.riskRules = [...rules];
    console.log(`📋 设置风险规则: ${rules.length} 条`);
  }

  /**
   * 开始风险监控
   */
  async startRiskMonitoring(poolId: string): Promise<void> {
    this.requestCount++;
    this.lastActivity = Date.now();

    if (this.monitoringPools.has(poolId)) {
      console.log(`⚠️ 池 ${poolId} 已在监控中`);
      return;
    }

    this.monitoringPools.add(poolId);
    
    // 启动监控循环
    this.startPoolMonitoring(poolId);
    
    console.log(`👀 开始监控池风险: ${poolId}`);
  }

  /**
   * 注册风险警报回调
   */
  onRiskAlert(callback: (alert: RiskAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * 发送风险警报
   */
  private async sendRiskAlert(alert: RiskAlert): Promise<void> {
    console.log(`🚨 风险警报: ${alert.level} - ${alert.message}`);
    
    // 通知所有回调
    const promises = this.alertCallbacks.map(async (callback) => {
      try {
        callback(alert);
      } catch (error) {
        console.error('风险警报回调执行失败:', error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * 计算风险因子
   */
  private async calculateRiskFactors(operation: Operation): Promise<Array<{
    name: string;
    weight: number;
    value: number;
    description: string;
  }>> {
    const factors = [];

    // 操作类型风险
    const operationRisk = this.getOperationTypeRisk(operation.type);
    factors.push({
      name: 'operation_type',
      weight: 0.3,
      value: operationRisk,
      description: `操作类型风险: ${operation.type}`
    });

    // 市场波动性风险
    const volatilityRisk = await this.getMarketVolatilityRisk();
    factors.push({
      name: 'market_volatility',
      weight: 0.25,
      value: volatilityRisk,
      description: '市场波动性风险'
    });

    // 流动性风险
    const liquidityRisk = await this.getLiquidityRisk(operation);
    factors.push({
      name: 'liquidity_risk',
      weight: 0.2,
      value: liquidityRisk,
      description: '流动性风险'
    });

    // Gas价格风险
    const gasRisk = await this.getGasPriceRisk();
    factors.push({
      name: 'gas_price',
      weight: 0.15,
      value: gasRisk,
      description: 'Gas价格风险'
    });

    // 协议风险
    const protocolRisk = this.getProtocolRisk();
    factors.push({
      name: 'protocol_risk',
      weight: 0.1,
      value: protocolRisk,
      description: '协议风险'
    });

    return factors;
  }

  /**
   * 计算风险分数
   */
  private calculateRiskScore(factors: Array<{ weight: number; value: number }>): number {
    return factors.reduce((score, factor) => {
      return score + (factor.weight * factor.value);
    }, 0);
  }

  /**
   * 确定风险级别
   */
  private determineRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score < 0.3) return 'low';
    if (score < 0.6) return 'medium';
    if (score < 0.8) return 'high';
    return 'critical';
  }

  /**
   * 生成风险建议
   */
  private generateRecommendations(
    level: 'low' | 'medium' | 'high' | 'critical', 
    factors: Array<{ name: string; value: number; description: string }>
  ): string[] {
    const recommendations = [];

    switch (level) {
      case 'low':
        recommendations.push('风险较低，可以正常执行操作');
        break;
      case 'medium':
        recommendations.push('风险中等，建议谨慎操作');
        recommendations.push('考虑降低操作规模');
        break;
      case 'high':
        recommendations.push('风险较高，建议暂缓操作');
        recommendations.push('等待市场条件改善');
        break;
      case 'critical':
        recommendations.push('风险极高，强烈建议停止操作');
        recommendations.push('立即评估现有头寸');
        break;
    }

    // 基于具体风险因子的建议
    for (const factor of factors) {
      if (factor.value > 0.7) {
        recommendations.push(`注意${factor.description}风险偏高`);
      }
    }

    return recommendations;
  }

  /**
   * 获取操作类型风险
   */
  private getOperationTypeRisk(operationType: string): number {
    const riskMap: Record<string, number> = {
      'addLiquidity': 0.3,
      'removeLiquidity': 0.4,
      'collect': 0.1,
      'swap': 0.5,
      'multicall': 0.6
    };

    return riskMap[operationType] || 0.5;
  }

  /**
   * 获取市场波动性风险
   */
  private async getMarketVolatilityRisk(): Promise<number> {
    // TODO: 实现实际的市场波动性计算
    // 这里返回模拟值
    return Math.random() * 0.4 + 0.2; // 0.2-0.6之间
  }

  /**
   * 获取流动性风险
   */
  private async getLiquidityRisk(operation: Operation): Promise<number> {
    // TODO: 实现实际的流动性风险计算
    return Math.random() * 0.3 + 0.1; // 0.1-0.4之间
  }

  /**
   * 获取Gas价格风险
   */
  private async getGasPriceRisk(): Promise<number> {
    // TODO: 从GasService获取实际Gas价格数据
    return Math.random() * 0.2 + 0.1; // 0.1-0.3之间
  }

  /**
   * 获取协议风险
   */
  private getProtocolRisk(): number {
    // PancakeSwap V3协议风险相对较低
    return 0.2;
  }

  /**
   * 检查规则违反
   */
  private async checkRuleViolation(
    rule: RiskRule, 
    poolId: string, 
    operation: Operation
  ): Promise<boolean> {
    // TODO: 实现具体的规则检查逻辑
    // 这里简化处理
    return Math.random() < 0.1; // 10%概率违反规则
  }

  /**
   * 处理规则违反
   */
  private async handleRuleViolation(
    rule: RiskRule, 
    poolId: string, 
    operation: Operation
  ): Promise<void> {
    const alert: RiskAlert = {
      level: rule.action === 'block' ? 'critical' : 'warning',
      message: `规则违反: ${rule.name}`,
      poolId,
      timestamp: Date.now(),
      resolved: false
    };

    await this.sendRiskAlert(alert);
  }

  /**
   * 验证风险规则
   */
  private validateRiskRule(rule: RiskRule): boolean {
    return !!(rule.name && rule.condition && rule.action && rule.threshold >= 0);
  }

  /**
   * 设置默认风险规则
   */
  private async setupDefaultRiskRules(): Promise<void> {
    const defaultRules: RiskRule[] = [
      {
        name: '高Gas价格警告',
        condition: 'gas_price > threshold',
        action: 'warn',
        threshold: 20
      },
      {
        name: '大额交易限制',
        condition: 'amount > threshold',
        action: 'pause',
        threshold: 100000
      },
      {
        name: '极高风险阻止',
        condition: 'risk_score > threshold',
        action: 'block',
        threshold: 0.9
      }
    ];

    await this.setRiskRules(defaultRules);
  }

  /**
   * 启动池监控
   */
  private startPoolMonitoring(poolId: string): void {
    const monitoringInterval = setInterval(async () => {
      try {
        // 检查池是否还在监控列表中
        if (!this.monitoringPools.has(poolId)) {
          clearInterval(monitoringInterval);
          return;
        }

        // TODO: 实现具体的池风险监控逻辑
        // 例如：检查价格波动、流动性变化等

      } catch (error) {
        console.error(`池监控错误 [${poolId}]:`, error);
      }
    }, 30000); // 每30秒检查一次
  }
} 