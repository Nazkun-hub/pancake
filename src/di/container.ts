import 'reflect-metadata';
import { container } from 'tsyringe';
import { TYPES } from '../types/interfaces.js';

// 基础设施层
import { EventBus } from '../infrastructure/EventBus.js';
import { ConfigManager } from '../infrastructure/ConfigManager.js';
import { DataStorage } from '../infrastructure/DataStorage.js';
import { LoggerService } from '../infrastructure/LoggerService.js';

// 服务层
import { Web3Service } from '../services/Web3Service.js';
import { ContractService } from '../services/ContractService.js';
import { LiquidityManager } from '../services/LiquidityManager.js';
import { PositionManager } from '../services/PositionManager.js';
import { CryptoService } from '../services/CryptoService.js';
import { TransactionService } from '../services/TransactionService.js';
import { PriceService } from '../services/PriceService.js';
import { GasService } from '../services/GasService.js';
import { TickCalculatorService } from '../services/TickCalculatorService.js';
// import { OKXSwapService } from '../services/OKXSwapService.js';

// 业务逻辑层
import { PoolManager } from '../business/PoolManager.js';
import { RiskManager } from '../business/RiskManager.js';
import { 策略引擎 } from '../business/策略引擎.js';

// 协议适配层
import { ProtocolManager } from '../adapters/ProtocolManager.js';
import { PancakeSwapV3Adapter } from '../adapters/PancakeSwapV3Adapter.js';

/**
 * 依赖注入容器配置
 * 配置所有模块的依赖关系和生命周期
 */
export class DIContainer {
  private static _instance: DIContainer;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): DIContainer {
    if (!DIContainer._instance) {
      DIContainer._instance = new DIContainer();
    }
    return DIContainer._instance;
  }

  /**
   * 初始化依赖注入容器
   * 按层级注册所有服务，确保依赖关系正确
   */
  public initialize(): void {
    if (this.isInitialized) {
      return;
    }

    console.log('🔧 初始化依赖注入容器...');

    // 1. 基础设施层 - 最底层，无外部依赖
    this.registerInfrastructureServices();

    // 2. 协议适配层 - 依赖基础设施层
    this.registerAdapterServices();

    // 3. 服务层 - 依赖基础设施层和适配层
    this.registerServiceLayer();

    // 4. 业务逻辑层 - 依赖所有下层
    this.registerBusinessLayer();

    this.isInitialized = true;
    console.log('✅ 依赖注入容器初始化完成');
  }

  /**
   * 注册基础设施层服务
   */
  private registerInfrastructureServices(): void {
    console.log('📦 注册基础设施层服务...');

    // 事件总线 - 核心通信组件
    container.registerSingleton(TYPES.EventBus, EventBus);
    
    // 配置管理器 - 系统配置
    container.registerSingleton(TYPES.ConfigManager, ConfigManager);
    
    // 数据存储 - 持久化存储
    container.registerSingleton(TYPES.DataStorage, DataStorage);
    
    // 日志服务 - 系统日志
    container.registerSingleton(TYPES.LoggerService, LoggerService);

    console.log('✅ 基础设施层服务注册完成');
  }

  /**
   * 注册协议适配层服务
   */
  private registerAdapterServices(): void {
    console.log('🔌 注册协议适配层服务...');

    // PancakeSwap V3 适配器
    container.registerSingleton(TYPES.PancakeSwapV3Adapter, PancakeSwapV3Adapter);
    
    // 协议管理器 - 管理所有协议适配器
    container.registerSingleton(TYPES.ProtocolManager, ProtocolManager);

    console.log('✅ 协议适配层服务注册完成');
  }

  /**
   * 注册服务层
   */
  private registerServiceLayer(): void {
    console.log('⚙️ 注册服务层...');

    // Gas 服务 - BSC 网络专用
    container.registerSingleton(TYPES.GasService, GasService);
    
    // 交易服务 - 交易构建和发送
    container.registerSingleton(TYPES.TransactionService, TransactionService);
    
    // 价格服务 - 价格监控和历史
    container.registerSingleton(TYPES.PriceService, PriceService);
    
    // Tick计算服务 - tick和价格转换计算
    container.registerSingleton(TYPES.TickCalculatorService, TickCalculatorService);
    
    // 流动性服务 - 核心流动性操作
    // 注册LiquidityManager为两个不同的类型，以满足不同的依赖需求
    container.registerSingleton(TYPES.LiquidityManager, LiquidityManager);
    container.registerSingleton(TYPES.LiquidityService, LiquidityManager);

    // 加密服务
    container.registerSingleton(TYPES.CryptoService, CryptoService);

    // Web3 服务
    container.registerSingleton(TYPES.Web3Service, Web3Service);

    // 合约服务 - PancakeSwap V3 合约交互
    container.registerSingleton(TYPES.ContractService, ContractService);

    // 位置管理器
    container.registerSingleton(TYPES.PositionManager, PositionManager);

    // OKX 交换服务 - OKX DEX 代币交换
    // container.registerSingleton('OKXSwapService', OKXSwapService);

    console.log('✅ 服务层注册完成');
  }

  /**
   * 注册业务逻辑层
   */
  private registerBusinessLayer(): void {
    console.log('🏢 注册业务逻辑层...');

    // 风险管理器 - 风险评估和控制
    container.registerSingleton(TYPES.RiskManager, RiskManager);
    
    // 新策略引擎 - 自动化流动性管理策略
    container.registerSingleton(TYPES.策略引擎, 策略引擎);
    
    // 池管理器 - 池子生命周期管理
    container.registerSingleton(TYPES.PoolManager, PoolManager);

    console.log('✅ 业务逻辑层注册完成');
  }

  /**
   * 获取服务实例
   */
  public getService<T>(type: symbol): T {
    if (!this.isInitialized) {
      throw new Error('容器未初始化，请先调用 initialize() 方法');
    }
    return container.resolve<T>(type);
  }

  /**
   * 清理容器
   */
  public dispose(): void {
    container.clearInstances();
    this.isInitialized = false;
    console.log('🧹 依赖注入容器已清理');
  }

  /**
   * 获取所有已注册的服务信息
   */
  public getRegisteredServices(): string[] {
    const services = [];
    for (const [key, symbol] of Object.entries(TYPES)) {
      services.push(`${key}: ${symbol.toString()}`);
    }
    return services;
  }

  /**
   * 验证容器健康状态
   */
  public async validateContainer(): Promise<boolean> {
    try {
      console.log('🔍 验证容器健康状态...');
      
      // 尝试解析核心服务
      const coreServices = [
        TYPES.EventBus,
        TYPES.ConfigManager,
        TYPES.LoggerService,
        TYPES.PoolManager
      ];

      for (const serviceType of coreServices) {
        const service = container.resolve(serviceType);
        if (!service) {
          console.error(`❌ 核心服务解析失败: ${serviceType.toString()}`);
          return false;
        }
      }

      console.log('✅ 容器健康状态验证通过');
      return true;
    } catch (error) {
      console.error('❌ 容器健康状态验证失败:', error);
      return false;
    }
  }
}

// 导出全局容器实例
export const diContainer = DIContainer.getInstance();

// 导出便捷的获取服务方法
export function getService<T>(type: symbol): T {
  return diContainer.getService<T>(type);
} 