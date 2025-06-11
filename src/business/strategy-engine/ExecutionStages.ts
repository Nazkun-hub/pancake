/**
 * 🎬 执行阶段模块 - 策略执行的四个核心阶段实现
 * 
 * 阶段1: 获取市场数据 - 池子信息、代币信息、当前价格
 * 阶段2: 准备资产 - 余额检查、代币交换、资产准备
 * 阶段3: 创建头寸 - 流动性头寸创建、重试机制
 * 阶段4: 开始监控 - 价格监控器启动
 * 阶段5: 执行策略退出 - 完整的退出流程
 */

import { 策略实例, 策略配置 } from '../../types/interfaces.js';
import { ContractService } from '../../services/ContractService.js';
import { TickCalculatorService } from '../../services/TickCalculatorService.js';
import { Web3Service } from '../../services/Web3Service.js';
import { LiquidityManager } from '../../services/LiquidityManager.js';
import { 价格监控器 } from '../价格监控器.js';
import { ApiService } from './ApiService.js';
import { Utils } from './Utils.js';
import { StateManager } from './StateManager.js';
import { InstanceLogger } from './InstanceLogger.js';
import { 插件管理器 } from '../../plugins/PluginManager.js';
import { IEventBus, TYPES } from '../../types/interfaces.js';
import { inject, injectable } from 'tsyringe';

@injectable()
export class ExecutionStages {
  // 基础货币常量定义
  private static readonly USDT地址 = '0x55d398326f99059fF775485246999027B3197955'; // USDT
  private static readonly USDC地址 = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'; // USDC
  private static readonly WBNB地址 = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'; // WBNB
  
  // 当前使用的基础货币（动态选择）
  private 当前基础货币地址: string = '';
  private 当前基础货币名称: string = '';
  
  // API服务实例
  private readonly apiService: ApiService;
  
  // 实例日志记录器集合
  private instanceLoggers: Map<string, InstanceLogger> = new Map();
  
  constructor(
    @inject(TYPES.ContractService) private contractService: ContractService,
    @inject(TYPES.TickCalculatorService) private tickCalculatorService: TickCalculatorService,
    @inject(TYPES.LiquidityManager) private liquidityManager: LiquidityManager,
    private stateManager: StateManager,
    private 价格监控器类: typeof 价格监控器,
    private 监控器集合: Map<string, 价格监控器>,
    @inject(TYPES.Web3Service) private web3Service: Web3Service,
    @inject(TYPES.EventBus) private eventBus: IEventBus
  ) {
    // 确保StateManager有正确的依赖
    this.stateManager = new StateManager(this.tickCalculatorService, this.contractService);
    
    // 创建ApiService并注入Web3Service
    this.apiService = new ApiService(this.web3Service);
    
    // 🎯 初始化插件管理器和默认插件
    插件管理器.初始化默认插件();
    
    // 🌉 建立EventBus到PluginManager的桥接
    this.setupEventBridge();
  }

  /**
   * 🌉 设置EventBus到PluginManager的事件桥接
   */
  private setupEventBridge(): void {
    // 监听头寸创建事件并转发到插件管理器
    this.eventBus.subscribe('position.created', (event) => {
      console.log(`🌉 [EventBridge] 转发头寸创建事件到插件管理器: TokenID ${event.data.tokenId}`);
      插件管理器.分发事件('position.created', event.data);
    });

    // 监听头寸关闭事件并转发到插件管理器
    this.eventBus.subscribe('position.closed', (event) => {
      console.log(`🌉 [EventBridge] 转发头寸关闭事件到插件管理器: TokenID ${event.data.tokenId}`);
      插件管理器.分发事件('position.closed', event.data);
    });

    // 🔧 新增：监听代币交换事件并转发到插件管理器
    this.eventBus.subscribe('swap.executed', (event) => {
      console.log(`🌉 [EventBridge] 转发代币交换事件到插件管理器: ${event.data.fromSymbol} → ${event.data.toSymbol}`);
      插件管理器.分发事件('swap.executed', event.data);
    });

    console.log('🌉 EventBus到PluginManager的事件桥接已建立 (包含swap.executed)');
  }

  /**
   * 获取或创建实例日志记录器
   */
  private getInstanceLogger(instanceId: string): InstanceLogger {
    if (!this.instanceLoggers.has(instanceId)) {
      this.instanceLoggers.set(instanceId, new InstanceLogger(instanceId));
    }
    return this.instanceLoggers.get(instanceId)!;
  }

  /**
   * 🔥 OKX真实交易方法 (执行实际代币交换)
   * @param instanceId 策略实例ID
   * @param fromTokenAddress 源代币合约地址
   * @param toTokenAddress 目标代币合约地址
   * @param amount 交易金额（wei格式）
   * @param slippage 滑点容差（可选，默认1.0%）
   */
  private async okxSwap(
    instanceId: string,
    fromTokenAddress: string,
    toTokenAddress: string,
    amount: string,
    slippage: number
  ): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
    fromAmount?: string;
    toAmount?: string;
    fromSymbol?: string;
    toSymbol?: string;
    rawFromAmount?: string | undefined;
    rawToAmount?: string | undefined;
  }> {
    const logger = this.getInstanceLogger(instanceId);
    try {
      console.log(`[STRATEGY] [${instanceId}] 🔥 OKX真实交易开始: ${fromTokenAddress} → ${toTokenAddress}, 金额: ${amount}`);
      
      // 记录到实例日志
      logger.logOKXTrade('START', {
        从代币: fromTokenAddress,
        到代币: toTokenAddress,
        金额: amount
      });
      
      // 获取钱包地址
      const userWalletAddress = await this.获取钱包地址();
      
      // 🔧 修复：OKX API直接接受百分比格式，不需要除以100
      const okxSlippageValue = slippage.toString();
      
      // 调用OKX API执行真实交易
      const requestBody = {
        fromTokenAddress,
        toTokenAddress,
        amount,
        userWalletAddress,
        chainId: '56', // BSC链
        chainIndex: '56', // 🔧 添加缺失的chainIndex参数
        slippage: okxSlippageValue
      };
      
      // 🔍 详细的参数调试日志
      console.log(`[STRATEGY] [${instanceId}] 🔍 策略引擎调用OKX API详细参数:`);
      console.log(`[STRATEGY] [${instanceId}]   fromTokenAddress:`, fromTokenAddress);
      console.log(`[STRATEGY] [${instanceId}]   toTokenAddress:`, toTokenAddress);
      console.log(`[STRATEGY] [${instanceId}]   amount (wei):`, amount);
      console.log(`[STRATEGY] [${instanceId}]   userWalletAddress:`, userWalletAddress);
      console.log(`[STRATEGY] [${instanceId}]   chainId:`, '56');
      console.log(`[STRATEGY] [${instanceId}]   chainIndex:`, '56');
      console.log(`[STRATEGY] [${instanceId}]   slippage (原值):`, slippage, '%');
      console.log(`[STRATEGY] [${instanceId}]   slippage (OKX格式):`, okxSlippageValue, '(百分比)');
      console.log(`[STRATEGY] [${instanceId}]   完整请求体:`, JSON.stringify(requestBody, null, 2));
      
      const response = await fetch('http://localhost:8000/api/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      // 解析8000端口返回的嵌套数据结构
      const rawResult = await response.json() as {
        success: boolean;
        data?: {
          success: boolean;
          txHash?: string;
          orderId?: string;
          fromAmount?: string;
          toAmount?: string;
          quote?: {
            fromTokenAmount?: string;
            toTokenAmount?: string;
            fromToken?: {
              tokenSymbol?: string;
            };
            toToken?: {
              tokenSymbol?: string;
            };
          };
          routerResult?: {
            fromTokenAmount?: string;
            toTokenAmount?: string;
            fromToken?: {
              tokenSymbol?: string;
            };
            toToken?: {
              tokenSymbol?: string;
            };
          };
        };
        error?: string;
      };
      
      // 🔧 简化日志：只显示关键信息而不是完整原始数据  
      const 关键信息 = {
        成功状态: rawResult.success,
        交易哈希: rawResult.data?.txHash,
        发送代币: rawResult.data?.quote?.fromToken?.tokenSymbol,
        接收代币: rawResult.data?.quote?.toToken?.tokenSymbol,
        发送数量: rawResult.data?.quote?.fromTokenAmount ? (parseFloat(rawResult.data.quote.fromTokenAmount) / 1e18).toFixed(6) : 'N/A',
        接收数量: rawResult.data?.quote?.toTokenAmount ? (parseFloat(rawResult.data.quote.toTokenAmount) / 1e18).toFixed(6) : 'N/A',
        价格影响: (rawResult.data as any)?.quote?.priceImpactPercentage,
        滑点: (rawResult.data as any)?.transaction?.slippage,
        错误: rawResult.error
      };
      
      console.log(`[STRATEGY] [${instanceId}] 🔍 OKX API返回摘要:`, 关键信息);
      
      // 检查外层成功状态
      if (!rawResult.success) {
        console.error(`[STRATEGY] [${instanceId}] ❌ OKX API调用失败:`, rawResult.error);
        
        // 记录错误到实例日志
        logger.logOKXTrade('ERROR', {
          错误: rawResult.error || 'API调用失败'
        });
        
        return {
          success: false,
          error: rawResult.error || 'API调用失败'
        };
      }
      
      // 检查内层交易结果
      const result = rawResult.data;
      if (!result) {
        console.error(`❌ OKX API返回数据为空`);
        return {
          success: false,
          error: '返回数据为空'
        };
      }
      
      if (result.success && result.txHash) {
        // 🔧 修复：从正确的字段获取交易数量 (quote字段)
        const fromAmount = result.quote?.fromTokenAmount;
        const toAmount = result.quote?.toTokenAmount;
        
        // 转换为可读格式（从wei转换为标准单位）
        const formatAmount = (amount?: string, decimals: number = 18) => {
          if (!amount) return 'N/A';
          const value = parseFloat(amount) / Math.pow(10, decimals);
          return value.toFixed(6);
        };
        
        const fromSymbol = result.quote?.fromToken?.tokenSymbol || 'Unknown';
        const toSymbol = result.quote?.toToken?.tokenSymbol || 'Unknown';
        const fromFormatted = formatAmount(fromAmount);
        const toFormatted = formatAmount(toAmount);
        
        console.log(`[STRATEGY] [${instanceId}] ✅ OKX真实交易成功: ${result.txHash}`);
        console.log(`[STRATEGY] [${instanceId}] 📊 交易详情: 发送 ${fromFormatted} ${fromSymbol}, 接收 ${toFormatted} ${toSymbol}`);
        
        // 记录成功到实例日志
        logger.logOKXTrade('SUCCESS', {
          从代币: fromSymbol,
          到代币: toSymbol,
          发送数量: fromFormatted,
          接收数量: toFormatted,
          交易哈希: result.txHash
        });
        
        // 🔧 只通过EventBus发送事件，避免重复处理
        this.eventBus.publish({
          type: 'swap.executed',
          data: {
            实例ID: instanceId,
            交换结果: {
              success: true,
              txHash: result.txHash
            },
            fromSymbol,
            toSymbol,
            fromAmount: fromFormatted,
            toAmount: toFormatted,
            当前基础货币: this.当前基础货币名称,
            滑点: slippage,
            时间戳: Date.now()
          },
          timestamp: Date.now(),
          source: 'ExecutionStages'
        });

        console.log(`[STRATEGY] [${instanceId}] 📢 OKX交换事件已发送到EventBus: ${fromSymbol} → ${toSymbol}`);
        
        return {
          success: true,
          txHash: result.txHash,
          fromAmount: fromFormatted,
          toAmount: toFormatted,
          fromSymbol,
          toSymbol,
          rawFromAmount: fromAmount || undefined,
          rawToAmount: toAmount || undefined
        };
      } else {
        console.error(`❌ OKX真实交易失败: 交易执行失败`);
        return {
          success: false,
          error: '交易执行失败'
        };
      }
    } catch (error) {
      console.error(`❌ OKX真实交易异常:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '网络异常'
      };
    }
  }

  /**
   * ⚖️ 获取钱包地址
   */
  private async 获取钱包地址(): Promise<string> {
    const response = await fetch('http://localhost:4000/api/wallet/info');
    const result = await response.json() as {
      success: boolean;
      info?: { address?: string };
      error?: string;
    };
    
    if (!result.success || !result.info?.address) {
      throw new Error('无法获取钱包地址');
    }
    
    return result.info.address;
  }

  /**
   * 💰 获取代币余额（专用方法）
   */
  private async 获取代币余额(钱包地址: string, 代币地址: string): Promise<number> {
    const response = await fetch(`http://localhost:4000/api/balance/${钱包地址}/${代币地址}`);
    const result = await response.json() as {
      success: boolean;
      balance?: string;
      error?: string;
    };
    
    if (!result.success) {
      throw new Error(`获取代币余额失败: ${result.error}`);
    }
    
    return parseFloat(result.balance || '0');
  }

  /**
   * 🔄 将数量转换为wei格式
   */
  private toWei(amount: number): string {
    // 🔧 修复：使用BigInt避免科学计数法，确保返回标准字符串整数
    if (amount <= 0) return '0';
    
    // 先转换为整数wei值（使用字符串操作避免精度问题）
    const amountStr = amount.toString();
    const [integerPart, decimalPart = ''] = amountStr.split('.');
    
    // 补齐到18位小数
    const paddedDecimal = (decimalPart + '0'.repeat(18)).slice(0, 18);
    
    // 组合整数部分和小数部分
    const weiString = integerPart + paddedDecimal;
    
    // 移除前导零但保留至少一个零
    const result = weiString.replace(/^0+/, '') || '0';
    
    console.log(`[STRATEGY] 💱 toWei转换: ${amount} -> ${result} (避免科学计数法)`);
    return result;
  }

  /**
   * 🧠 智能选择基础货币（USDT vs USDC vs WBNB，选择余额最大的）
   */
  private async 智能选择基础货币(钱包地址: string, 实例ID?: string): Promise<void> {
    const 日志前缀 = 实例ID ? `[STRATEGY] [${实例ID}]` : '[STRATEGY]';
    console.log(`${日志前缀} 🔍 检查USDT、USDC和WBNB余额，选择更优的基础货币...`);
    
    // 获取三种基础货币的余额
    const USDT余额 = await this.apiService.获取代币余额(钱包地址, ExecutionStages.USDT地址);
    console.log(`${日志前缀} 💰 USDT 余额: ${USDT余额}`);
    
    const USDC余额 = await this.apiService.获取代币余额(钱包地址, ExecutionStages.USDC地址);
    console.log(`${日志前缀} 💰 USDC 余额: ${USDC余额}`);
    
    const WBNB余额 = await this.apiService.获取代币余额(钱包地址, ExecutionStages.WBNB地址);
    console.log(`${日志前缀} 💰 WBNB 余额: ${WBNB余额}`);
    
    // 智能选择余额最大的基础货币
    const 余额列表 = [
      { 名称: 'USDT', 地址: ExecutionStages.USDT地址, 余额: USDT余额 },
      { 名称: 'USDC', 地址: ExecutionStages.USDC地址, 余额: USDC余额 },
      { 名称: 'WBNB', 地址: ExecutionStages.WBNB地址, 余额: WBNB余额 }
    ];
    
    // 按余额从大到小排序
    余额列表.sort((a, b) => b.余额 - a.余额);
    
    // 选择余额最大的基础货币
    const 选中货币 = 余额列表[0];
    this.当前基础货币地址 = 选中货币.地址;
    this.当前基础货币名称 = 选中货币.名称;
    
    console.log(`${日志前缀} ✅ 选择基础货币: ${选中货币.名称} (余额: ${选中货币.余额})`);
    console.log(`${日志前缀} 📊 余额排序: ${余额列表.map(c => `${c.名称}=${c.余额}`).join(', ')}`);
    
    // 检查选中的基础货币是否足够
    if (选中货币.余额 < 10) {
      throw new Error(`❌ 基础货币余额不足！${选中货币.名称}余额仅有${选中货币.余额}，建议至少准备20个单位`);
    }
  }

  /**
   * 🔍 阶段1: 获取市场数据
   */
  async 阶段1_获取市场数据(实例: 策略实例): Promise<void> {
    const logger = this.getInstanceLogger(实例.实例ID);
    this.stateManager.updateStageProgress(实例, 1, '正在获取市场数据');
    
    try {
      logger.logStage(1, 'START', '开始获取市场数据');
      const { 池地址, 代币范围, 代币数量, 主要代币 } = 实例.配置;
      
      // 1. 获取池子状态
      const 池子状态 = await this.contractService.getPoolState(池地址);
      if (!池子状态) {
        throw new Error(`无法获取池子状态: ${池地址}`);
      }
      
      // 2. 获取代币信息
      const 代币信息 = await this.获取池子代币信息(池地址, 池子状态);
      
      // 3. 计算当前价格
      const 当前价格 = Math.pow(1.0001, 池子状态.tick);
      const 小数位调整价格 = 当前价格 * Math.pow(10, 代币信息.token0.decimals - 代币信息.token1.decimals);
      const token0价格_相对token1 = 1 / 小数位调整价格;
      const token1价格_相对token0 = 小数位调整价格;
      
      // 4. 验证价格范围合理性
      const 范围检查结果 = this.验证价格范围合理性(池子状态.tick, 代币范围);
      if (!范围检查结果.合理) {
        throw new Error(`价格范围设置不合理: ${范围检查结果.原因}`);
      }
      
      // 5. 保存市场数据 (移除无效的需求量计算，真实需求量在阶段2中计算)
      实例.市场数据 = {
        池子状态,
        当前tick: 池子状态.tick,
        当前价格,
        token0信息: 代币信息.token0,
        token1信息: 代币信息.token1,
        价格信息: { token0价格_相对token1, token1价格_相对token0, 小数位调整价格 },
        数据获取时间: Date.now()
      };
      
      this.stateManager.completeStage(实例, 1, `${代币信息.token0.symbol}/${代币信息.token1.symbol} tick:${池子状态.tick} 市场数据获取完成`);
      
      console.log(`[STRATEGY] [${实例.实例ID}] ✅ 阶段1完成: 市场数据获取成功`);
      logger.logStage(1, 'SUCCESS', '市场数据获取成功', {
        当前tick: 池子状态.tick,
        token0: 代币信息.token0.symbol,
        token1: 代币信息.token1.symbol
      });
      
      // 🎯 发射策略开始事件（轻量级插件注入点）
      插件管理器.分发事件('strategy.started', {
        实例ID: 实例.实例ID,
        策略配置: 实例.配置,
        市场数据: {
          token0信息: 代币信息.token0,
          token1信息: 代币信息.token1,
          当前价格: 当前价格
        },
        当前基础货币: this.当前基础货币名称,
        当前基础货币地址: this.当前基础货币地址,
        时间戳: Date.now()
      });
      
    } catch (error) {
      console.log(`[STRATEGY] [${实例.实例ID}] ❌ 阶段1失败: ${error instanceof Error ? error.message : String(error)}`);
      logger.logStage(1, 'ERROR', error instanceof Error ? error.message : String(error));
      this.stateManager.setErrorState(实例, 1, error);
      throw error;
    }
  }

  /**
   * 🔄 阶段2: 准备资产
   */
  async 阶段2_准备资产(实例: 策略实例): Promise<void> {
    const logger = this.getInstanceLogger(实例.实例ID);
    this.stateManager.updateStageProgress(实例, 2, '正在准备资产');
    
    try {
      console.log(`[STRATEGY] [${实例.实例ID}] 🚀 阶段2开始: 准备资产`);
      logger.logStage(2, 'START', '开始准备资产');
      
      if (!实例.市场数据) {
        throw new Error('市场数据不存在');
      }
      
      const { token0信息, token1信息, 代币需求量 } = 实例.市场数据;
      const 钱包地址 = await this.apiService.获取钱包地址();
      
      // 🔧 修复：使用与阶段3一致的Uniswap V3官方计算方法重新计算需求量
      const { 代币范围, 代币数量, 主要代币 } = 实例.配置;
      const 当前tick = 实例.市场数据.当前tick;
      
      // 使用官方流动性计算获取真实需求量
      const 官方需求量 = await this.计算官方代币需求量({
        inputAmount: 代币数量.toString(),
        inputToken: 主要代币 === 'token0' ? token0信息.symbol : token1信息.symbol,
        currentTick: 当前tick,
        tickLower: 代币范围.下限tick,
        tickUpper: 代币范围.上限tick,
        token0信息,
        token1信息,
        实例配置: 实例.配置
      });
      
      console.log(`[STRATEGY] [${实例.实例ID}] 📊 官方计算需求量: ${token0信息.symbol}=${官方需求量.token0需求量.toFixed(6)}, ${token1信息.symbol}=${官方需求量.token1需求量.toFixed(6)}`);
      
      // 🔧 更新实例中的需求量为官方计算结果
      实例.市场数据.代币需求量 = {
        token0需求量: 官方需求量.token0需求量,
        token1需求量: 官方需求量.token1需求量,
        计算说明: `官方Uniswap V3计算: ${官方需求量.计算说明}`
      };
      
      // 1. 检查当前余额
      const token0余额 = await this.apiService.获取代币余额(钱包地址, token0信息.address);
      const token1余额 = await this.apiService.获取代币余额(钱包地址, token1信息.address);
      
      // 2. 使用官方计算的需求量计算代币不足量
      const token0不足量 = Math.max(0, 官方需求量.token0需求量 - token0余额);
      const token1不足量 = Math.max(0, 官方需求量.token1需求量 - token1余额);
      
      // 只在需要交换时显示余额详情
      if (token0不足量 > 0 || token1不足量 > 0) {
        console.log(`[STRATEGY] [${实例.实例ID}] 💰 需要补充代币: ${token0信息.symbol}缺${token0不足量.toFixed(4)}, ${token1信息.symbol}缺${token1不足量.toFixed(4)}`);
      }
      
      // 3. 执行代币交换（如需要）
      const 交换记录: any[] = [];
      if (token0不足量 > 0 || token1不足量 > 0) {
        // 智能选择基础货币（USDT vs USDC）
        await this.智能选择基础货币(钱包地址, 实例.实例ID);
        
        if (token0不足量 > 0) {
          console.log(`[STRATEGY] [${实例.实例ID}] 🛒 使用${this.当前基础货币名称}购买${token0信息.symbol}, 需求量: ${token0不足量}`);
          
          const 交换结果 = await this.精确购买B2代币(
            实例.实例ID,  // 实例ID
            this.当前基础货币地址,  // 源代币地址
            token0信息.address,  // 目标代币地址
            token0不足量,  // 需求目标代币数量
            钱包地址,  // 用户钱包地址
            实例.配置.OKX交易滑点 || 实例.配置.滑点设置 || 0.5  // 🔧 使用专门的OKX交易滑点
          );
          
          if (交换结果.success && 交换结果.txHash) {
            console.log(`[STRATEGY] [${实例.实例ID}] ✅ ${this.当前基础货币名称}→${token0信息.symbol} 购买成功: ${交换结果.txHash}`);
            
            // 记录到实例日志
            logger.logOperation('TOKEN_PURCHASE', `${this.当前基础货币名称}→${token0信息.symbol}购买成功`, {
              交易哈希: 交换结果.txHash,
              需求量: token0不足量.toFixed(6),
              基础货币: this.当前基础货币名称
            });
            
            交换记录.push({
              类型: `${this.当前基础货币名称}_TO_${token0信息.symbol}`,
              交易哈希: 交换结果.txHash,
              状态: '成功',
              实际交易: true,
              智能基础货币购买: true,
              使用基础货币: this.当前基础货币名称
            });
          } else {
            throw new Error(`❌ ${this.当前基础货币名称}→${token0信息.symbol} 购买失败: ${交换结果.error}`);
          }
        }
        
        if (token1不足量 > 0) {
          console.log(`[STRATEGY] [${实例.实例ID}] 🛒 使用${this.当前基础货币名称}购买${token1信息.symbol}, 需求量: ${token1不足量}`);
          
          const 交换结果 = await this.精确购买B2代币(
            实例.实例ID,  // 实例ID
            this.当前基础货币地址,  // 源代币地址 
            token1信息.address,  // 目标代币地址
            token1不足量,  // 需求目标代币数量
            钱包地址,  // 用户钱包地址
            实例.配置.OKX交易滑点 || 实例.配置.滑点设置 || 0.5  // 🔧 使用专门的OKX交易滑点
          );
          
          if (交换结果.success && 交换结果.txHash) {
            console.log(`[STRATEGY] [${实例.实例ID}] ✅ ${this.当前基础货币名称}→${token1信息.symbol} 购买成功: ${交换结果.txHash}`);
            
            // 记录到实例日志
            logger.logOperation('TOKEN_PURCHASE', `${this.当前基础货币名称}→${token1信息.symbol}购买成功`, {
              交易哈希: 交换结果.txHash,
              需求量: token1不足量.toFixed(6),
              基础货币: this.当前基础货币名称
            });
            
            交换记录.push({
              类型: `${this.当前基础货币名称}_TO_${token1信息.symbol}`,
              交易哈希: 交换结果.txHash,
              状态: '成功',
              实际交易: true,
              智能基础货币购买: true,
              使用基础货币: this.当前基础货币名称
            });
          } else {
            throw new Error(`❌ ${this.当前基础货币名称}→${token1信息.symbol} 购买失败: ${交换结果.error}`);
          }
        }
      }
      
      // 4. 获取最终余额
      const 最终token0余额 = await this.apiService.获取代币余额(钱包地址, token0信息.address);
      const 最终token1余额 = await this.apiService.获取代币余额(钱包地址, token1信息.address);
      
      // 5. 验证资产充足性（使用官方计算的需求量）
      if (最终token0余额 < 官方需求量.token0需求量 || 最终token1余额 < 官方需求量.token1需求量) {
        throw new Error(`资产准备后仍不足: ${token0信息.symbol}需求${官方需求量.token0需求量.toFixed(6)}实际${最终token0余额.toFixed(6)}, ${token1信息.symbol}需求${官方需求量.token1需求量.toFixed(6)}实际${最终token1余额.toFixed(6)}`);
      }
      
      // 5. 保存结果
      实例.资产准备结果 = {
        交换记录,
        最终余额: {
          token0: 最终token0余额.toString(),
          token1: 最终token1余额.toString()
        },
        满足需求: true,
        准备完成时间: Date.now()
      };
      
      this.stateManager.completeStage(实例, 2, `资产就绪 ${token0信息.symbol}:${最终token0余额.toFixed(2)}/${token1信息.symbol}:${最终token1余额.toFixed(2)} ${token0不足量 > 0 || token1不足量 > 0 ? '(已交换)' : '(无需交换)'}`);
      
    } catch (error) {
      this.stateManager.setErrorState(实例, 2, error);
      throw error;
    }
  }

  /**
   * 💎 阶段3: 创建头寸
   */
  async 阶段3_创建头寸(实例: 策略实例, 重试配置: any): Promise<void> {
    this.stateManager.updateStageProgress(实例, 3, '正在创建流动性头寸');
    
    try {
      if (!实例.市场数据 || !实例.资产准备结果) {
        throw new Error('市场数据或资产准备结果不存在，请先执行前置阶段');
      }

      const { 代币范围 } = 实例.配置;
      let 重试次数 = 0;
      let 头寸创建结果: any = null;
      const 最大重试次数 = 重试配置.最大重试次数;

      while (重试次数 <= 最大重试次数) {
        try {
          头寸创建结果 = await this.apiService.创建流动性头寸(实例);
          
          // 检查创建结果状态
          if (!头寸创建结果 || 头寸创建结果.status === '失败') {
            throw new Error(`头寸创建失败: ${头寸创建结果?.错误 || '头寸创建返回失败状态'}`);
          }
          
          // 处理TokenID验证 - 考虑解析失败的情况
          if (!头寸创建结果.tokenId) {
            throw new Error('头寸创建失败: TokenID缺失');
          }
          
          if (头寸创建结果.tokenId === 'PARSE_FAILED_CHECK_MANUALLY' || 
              头寸创建结果.tokenId === 'MANUAL_CHECK_REQUIRED') {
            console.warn(`⚠️ TokenID解析失败，但交易成功: ${头寸创建结果.transactionHash}`);
            console.warn(`⚠️ 继续执行流程，但建议手动检查TokenID`);
            // 允许继续执行，但记录警告
          } else if (parseInt(String(头寸创建结果.tokenId)) <= 0) {
            throw new Error('头寸创建失败: TokenID无效或为0');
          }
          
          if (!头寸创建结果.transactionHash || 头寸创建结果.transactionHash === '') {
            throw new Error('头寸创建失败: 交易哈希为空');
          }
          
          break; // 成功，跳出重试循环

        } catch (retryError) {
          重试次数++;
          
          // 🔴 添加：明确的错误日志
          console.log(`[STRATEGY] [${实例.实例ID}] ❌ 头寸创建失败 (第${重试次数}次尝试): ${retryError instanceof Error ? retryError.message : String(retryError)}`);
          
          if (重试次数 > 最大重试次数) {
            console.log(`[STRATEGY] [${实例.实例ID}] 🚫 头寸创建彻底失败，已达到最大重试次数: ${最大重试次数}`);
            
            // 添加实例日志记录
            const logger = this.getInstanceLogger(实例.实例ID);
            logger.logError(retryError, '头寸创建彻底失败');
            
            throw new Error(`头寸创建彻底失败: ${retryError instanceof Error ? retryError.message : String(retryError)} (已重试${最大重试次数}次)`);
          }
          
          // 🔧 新增：检查是否因为代币余额不足导致失败，如果是则自动购买
          const 错误信息 = retryError instanceof Error ? retryError.message : String(retryError);
          if (错误信息.includes('余额不足') || 错误信息.includes('不足')) {
            console.log(`[STRATEGY] [${实例.实例ID}] 💰 检测到代币余额不足，开始自动补充代币...`);
            
            // 添加实例日志记录
            const logger = this.getInstanceLogger(实例.实例ID);
            logger.logOperation('TOKEN_BALANCE_INSUFFICIENT', '检测到代币余额不足，开始自动补充', {
              错误信息,
              重试次数
            });

            try {
              // 获取当前余额和市场数据
              const { token0信息, token1信息 } = 实例.市场数据!;
              const 钱包地址 = await this.apiService.获取钱包地址();
              
              // 🔧 关键修复：使用实时的LiquidityManager计算获取真实需求量
              console.log(`[STRATEGY] 🧮 重新计算真实代币需求量...`);
              const { 代币范围, 代币数量, 主要代币 } = 实例.配置;
              const 当前tick = 实例.市场数据!.当前tick;
              
              // 🔧 使用实时数据计算，与实际流动性创建保持一致
              const 真实需求量 = await this.liquidityManager.calculateTokenRequirements({
                inputAmount: parseFloat(代币数量.toString()),
                inputTokenType: 主要代币 === 'token0' ? 'token0' : 'token1',
                currentTick: 当前tick,  // 提供原始tick作为备用
                tickLower: 代币范围.下限tick,
                tickUpper: 代币范围.上限tick,
                token0Decimals: token0信息.decimals,
                token1Decimals: token1信息.decimals,
                poolConfig: {
                  poolAddress: 实例.配置.池地址,
                  token0Address: token0信息.address,
                  token1Address: token1信息.address,
                  fee: 100
                },
                useRealTimeData: true  // 🔧 关键：使用实时数据
              });
              
              console.log(`[STRATEGY] 📊 真实需求量计算完成: ${token0信息.symbol}=${真实需求量.token0需求量.toFixed(6)}, ${token1信息.symbol}=${真实需求量.token1需求量.toFixed(6)}`);
              console.log(`[STRATEGY] 📊 计算详情: ${真实需求量.计算说明}`);
              
              // 检查当前余额
              const token0余额 = await this.apiService.获取代币余额(钱包地址, token0信息.address);
              const token1余额 = await this.apiService.获取代币余额(钱包地址, token1信息.address);
              
              console.log(`[STRATEGY] 📊 当前余额检查: ${token0信息.symbol}=${token0余额.toFixed(6)}, ${token1信息.symbol}=${token1余额.toFixed(6)}`);
              console.log(`[STRATEGY] 📊 真实需求检查: ${token0信息.symbol}=${真实需求量.token0需求量.toFixed(6)}, ${token1信息.symbol}=${真实需求量.token1需求量.toFixed(6)}`);
              
              // 🔧 使用真实需求量计算不足量
              const token0不足量 = Math.max(0, 真实需求量.token0需求量 - token0余额);
              const token1不足量 = Math.max(0, 真实需求量.token1需求量 - token1余额);
              
              console.log(`[STRATEGY] 📊 不足量计算(基于真实需求): ${token0信息.symbol}不足=${token0不足量.toFixed(6)}, ${token1信息.symbol}不足=${token1不足量.toFixed(6)}`);
              
              // 自动购买不足的代币（购买110%防止误差）
              if (token0不足量 > 0) {
                const 购买数量 = token0不足量 * 1.1; // 多买10%
                console.log(`[STRATEGY] 🛒 自动购买 ${token0信息.symbol}: 不足${token0不足量.toFixed(6)}, 将购买${购买数量.toFixed(6)} (110%)`);
                
                const 滑点设置 = 实例.配置.OKX交易滑点 || 实例.配置.滑点设置;
                if (!滑点设置) {
                  throw new Error('滑点设置未配置，无法执行代币交换');
                }
                const 交换结果 = await this.okxSwap(
                  实例.实例ID,  // 实例ID
                  token1信息.address,  // 从token1换到token0
                  token0信息.address,
                  this.toWei(购买数量),
                  滑点设置
                );
                
                if (交换结果.success) {
                  console.log(`[STRATEGY] ✅ ${token0信息.symbol} 自动购买成功: ${交换结果.txHash}`);
                  console.log(`[STRATEGY] 📊 交易详情: 发送 ${交换结果.fromAmount} ${交换结果.fromSymbol}, 接收 ${交换结果.toAmount} ${交换结果.toSymbol}`);
                } else {
                  console.error(`❌ ${token0信息.symbol} 自动购买失败: ${交换结果.error}`);
                }
              }
              
              if (token1不足量 > 0) {
                const 购买数量 = token1不足量 * 1.1; // 多买10%
                console.log(`[STRATEGY] 🛒 自动购买 ${token1信息.symbol}: 不足${token1不足量.toFixed(6)}, 将购买${购买数量.toFixed(6)} (110%)`);
                
                const 滑点设置2 = 实例.配置.OKX交易滑点 || 实例.配置.滑点设置;
                if (!滑点设置2) {
                  throw new Error('滑点设置未配置，无法执行代币交换');
                }
                const 交换结果 = await this.okxSwap(
                  实例.实例ID,  // 实例ID
                  token0信息.address,  // 从token0换到token1
                  token1信息.address,
                  this.toWei(购买数量),
                  滑点设置2
                );
                
                if (交换结果.success) {
                  console.log(`[STRATEGY] ✅ ${token1信息.symbol} 自动购买成功: ${交换结果.txHash}`);
                  console.log(`[STRATEGY] 📊 交易详情: 发送 ${交换结果.fromAmount} ${交换结果.fromSymbol}, 接收 ${交换结果.toAmount} ${交换结果.toSymbol}`);
                } else {
                  console.error(`❌ ${token1信息.symbol} 自动购买失败: ${交换结果.error}`);
                }
              }
              
              // 等待一小段时间让交易确认
              if (token0不足量 > 0 || token1不足量 > 0) {
                console.log(`[STRATEGY] ⏰ 等待3秒让购买交易确认...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // 重新检查余额
                const 更新后token0余额 = await this.apiService.获取代币余额(钱包地址, token0信息.address);
                const 更新后token1余额 = await this.apiService.获取代币余额(钱包地址, token1信息.address);
                console.log(`[STRATEGY] 📊 购买后余额: ${token0信息.symbol}=${更新后token0余额.toFixed(6)}, ${token1信息.symbol}=${更新后token1余额.toFixed(6)}`);
              } else {
                console.log(`[STRATEGY] ℹ️ 根据真实需求量计算，当前余额充足，无需购买额外代币`);
              }
              
            } catch (购买错误) {
              console.error(`❌ 自动购买代币失败:`, 购买错误);
              console.log(`📝 将继续重试，但可能会再次因余额不足而失败`);
            }
          }
          
          // 计算延迟时间（指数退避）
          const 延迟时间 = Math.min(
            重试配置.初始延迟 * Math.pow(重试配置.退避倍数, 重试次数 - 1),
            重试配置.最大延迟
          );
          
          // 🔴 添加：明确的重试提醒，包含次数和间隔时间
          console.log(`[STRATEGY] 🔄 准备进行第${重试次数}次重试 (${重试次数}/${最大重试次数})`);
          console.log(`[STRATEGY] ⏰ 指数避让等待: ${延迟时间}ms = ${(延迟时间/1000).toFixed(1)}秒`);
          console.log(`[STRATEGY] 📊 重试策略: 基础延迟${重试配置.初始延迟}ms × ${重试配置.退避倍数}^${重试次数-1} = ${延迟时间}ms`);
          
          this.stateManager.updateStageProgress(实例, 3, `头寸创建重试中 (${重试次数}/${最大重试次数}) - 等待${(延迟时间/1000).toFixed(1)}s`);
          
          // 🔴 添加：等待开始提醒
          console.log(`[STRATEGY] ⏳ 开始等待 ${(延迟时间/1000).toFixed(1)} 秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, 延迟时间));
          
          // 🔴 添加：等待结束，重试开始提醒
          console.log(`[STRATEGY] 🚀 等待结束，开始第${重试次数}次重试...`);
        }
      }

      // 保存头寸信息
      实例.头寸信息 = {
        tokenId: 头寸创建结果.tokenId,
        交易哈希: 头寸创建结果.transactionHash,
        创建时间: Date.now(),
        tick范围: {
          下限: 代币范围.下限tick,
          上限: 代币范围.上限tick
        },
        投入数量: {
          token0: 头寸创建结果.amount0.toString(),
          token1: 头寸创建结果.amount1.toString()
        },
        状态: '活跃'
      };

      this.stateManager.completeStage(实例, 3, `头寸创建成功 TokenID:${头寸创建结果.tokenId}`);
      
      // 🔧 修复：移除重复的position.created事件分发
      // LiquidityManager已经通过EventBus发送了此事件，无需重复分发
      console.log(`[STRATEGY] 📢 头寸创建事件由LiquidityManager统一处理，避免重复分发`);
      
    } catch (error) {
      this.stateManager.setErrorState(实例, 3, error);
      throw error;
    }
  }

  /**
   * 🧠 阶段4: 开始监控
   */
  async 阶段4_开始监控(实例: 策略实例): Promise<void> {
    try {
      if (实例.状态 !== '运行中') {
        throw new Error('策略实例状态异常，无法开始监控');
      }
      
      // 创建监控器
      const 配置 = 实例.配置;
      const 超时时间 = 配置.自动退出.启用超时退出 ? 
        Math.floor(配置.自动退出.超时时长 / 1000) : undefined;
      
      // 🔧 修改：传入策略实例ID以便在日志中区分
      const 监控器 = new this.价格监控器类(this.contractService, 超时时间, 实例.实例ID);
      
      // 🔧 新增：监听价格变化事件，实时更新前端数据
      监控器.on('价格变化', (价格数据) => {
        // 更新策略实例的市场数据
        if (实例.市场数据) {
          const 旧tick = 实例.市场数据.当前tick;
          const 新tick = 价格数据.当前tick;
          
          // 更新tick数据
          实例.市场数据.当前tick = 新tick;
          实例.市场数据.数据获取时间 = Date.now();
          
          // 🔧 修复：使用StateManager的正确方法推送实时数据更新
          this.stateManager.updateAndBroadcastState(实例, {
            市场数据: 实例.市场数据
          });
          
          // 🔧 移除重复日志：价格监控器已经有相同的日志输出了
          // 这里只需要更新数据，不需要重复打印
        }
      });
      
      // 🔧 新增：监听超出范围事件
      监控器.on('超出范围', (数据) => {
        console.log(`[STRATEGY] ⚠️ [${实例.实例ID}] 价格超出范围警告: tick=${数据.当前tick}, 范围=[${数据.目标范围.下限}, ${数据.目标范围.上限}]`);
        
        // 直接更新策略实例的市场数据
        if (实例.市场数据) {
          实例.市场数据.当前tick = 数据.当前tick;
          实例.市场数据.数据获取时间 = Date.now();
          // 添加超出范围标记（扩展市场数据）
          (实例.市场数据 as any).超出范围 = true;
          (实例.市场数据 as any).超出范围时间 = Date.now();
          (实例.市场数据 as any).目标范围 = 数据.目标范围;
          
          this.stateManager.updateAndBroadcastState(实例, {
            市场数据: 实例.市场数据
          });
        }
      });
      
      // 🔧 新增：监听重新进入范围事件
      监控器.on('重新进入', (数据) => {
        console.log(`[STRATEGY] ✅ [${实例.实例ID}] 价格重新进入范围: tick=${数据.当前tick}`);
        
        // 直接更新策略实例的市场数据
        if (实例.市场数据) {
          实例.市场数据.当前tick = 数据.当前tick;
          实例.市场数据.数据获取时间 = Date.now();
          // 清除超出范围标记
          (实例.市场数据 as any).超出范围 = false;
          (实例.市场数据 as any).重新进入时间 = Date.now();
          (实例.市场数据 as any).目标范围 = 数据.目标范围;
          
          this.stateManager.updateAndBroadcastState(实例, {
            市场数据: 实例.市场数据
          });
        }
      });
      
      // 监听超时触发事件
      监控器.on('超时触发', async (数据) => {
        console.log(`[STRATEGY] ⏰ [${实例.实例ID}] 监控器超时触发，准备退出策略 - 超时时间: ${数据.超时时间}ms`);
        
        // 更新策略实例状态，标记超时触发
        const 更新数据 = {
          状态: '退出中' as any,
          错误信息: `价格监控超时: 持续${数据.超时时间}ms超出范围[${数据.目标范围.下限}, ${数据.目标范围.上限}], 当前tick: ${数据.当前tick}`,
          退出时间: Date.now(),
          退出原因: '价格监控超时'
        };
        
        this.stateManager.updateAndBroadcastState(实例, 更新数据);
        
        try {
          // 这里应该调用策略引擎的退出方法，但ExecutionStages没有直接访问权限
          // 所以先更新状态，由策略引擎处理
          console.log(`[STRATEGY] 📝 [${实例.实例ID}] 需要策略引擎处理超时退出`);
        } catch (error) {
          console.error(`[STRATEGY] ❌ [${实例.实例ID}] 超时退出策略失败:`, error);
        }
      });
      
      // 监听监控错误事件
      监控器.on('监控错误', (错误) => {
        console.error(`[STRATEGY] ❌ [${实例.实例ID}] 价格监控发生错误:`, 错误);
      });
      
      // 启动监控
      监控器.开始监控(实例.配置.池地址, {
        下限: 实例.配置.代币范围.下限tick,
        上限: 实例.配置.代币范围.上限tick
      });
      
      // 保存监控器
      this.监控器集合.set(实例.实例ID, 监控器);
      
      // 更新实例状态
      实例.状态 = '监控中';
      
      console.log(`[STRATEGY] [${实例.实例ID}] ✅ 阶段4完成 - 价格监控已启动`);
      
      // 添加实例日志记录
      const logger = this.getInstanceLogger(实例.实例ID);
      logger.logStage(4, 'SUCCESS', '价格监控已启动', {
        监控器ID: 实例.实例ID,
        价格范围: `[${实例.配置.代币范围.下限tick}, ${实例.配置.代币范围.上限tick}]`,
        超时设置: 超时时间 ? `${超时时间}秒` : '无超时'
      });
      
    } catch (error) {
      console.log(`[STRATEGY] [${实例.实例ID}] ❌ 阶段4失败:`, error);
      
      // 添加实例日志记录
      const logger = this.getInstanceLogger(实例.实例ID);
      logger.logStage(4, 'ERROR', error instanceof Error ? error.message : String(error));
      
      throw error;
    }
  }

  /**
   * 🚪 阶段5: 执行策略退出 - 完整的退出流程
   */
  async 阶段5_执行退出(实例: 策略实例, 退出原因?: string): Promise<void> {
    this.stateManager.updateStageProgress(实例, 5, '正在执行策略退出');
    
    try {
      console.log(`[STRATEGY] [${实例.实例ID}] 🚪 开始执行策略退出: ${实例.实例ID}`);
      console.log(`[STRATEGY] [${实例.实例ID}] 📝 退出原因: ${退出原因 || '用户主动退出'}`);
      
      // 添加实例日志记录
      const logger = this.getInstanceLogger(实例.实例ID);
      logger.logStage(5, 'START', '开始执行策略退出', {
        退出原因: 退出原因 || '用户主动退出'
      });
      
      // 步骤1: 关闭流动性头寸
      let 头寸关闭结果: any = null;
      if (实例.头寸信息?.tokenId && 实例.头寸信息.tokenId > 0) {
        console.log(`[STRATEGY] [${实例.实例ID}] 💎 关闭流动性头寸: TokenID ${实例.头寸信息.tokenId}`);
        
        try {
          头寸关闭结果 = await this.apiService.关闭流动性头寸(实例.头寸信息.tokenId.toString());
          
          if (头寸关闭结果.success) {
            console.log(`[STRATEGY] [${实例.实例ID}] ✅ 头寸关闭成功: ${头寸关闭结果.result?.transactionHash || '模拟交易'}`);
            
            // 记录成功到实例日志
            logger.logPosition('CLOSE_SUCCESS', {
              tokenId: 实例.头寸信息.tokenId,
              交易哈希: 头寸关闭结果.result?.transactionHash
            });
          } else {
            throw new Error(头寸关闭结果.error || '头寸关闭失败');
          }
        } catch (error) {
          console.error(`[STRATEGY] [${实例.实例ID}] ❌ 关闭头寸失败:`, error);
          
          // 记录错误到实例日志
          logger.logError(error, '关闭头寸失败');
          
          console.log(`[STRATEGY] [${实例.实例ID}] 📝 手动操作提示: 请手动关闭头寸 TokenID ${实例.头寸信息.tokenId}`);
          // 不抛出错误，继续执行后续步骤
        }
      } else {
        console.log(`[STRATEGY] [${实例.实例ID}] ℹ️ 没有需要关闭的流动性头寸`);
      }
      
      // 步骤2: 查询代币余额并执行卖出
      let 卖出结果: any = null;
      if (实例.市场数据 && 实例.配置) {
        console.log(`[STRATEGY] [${实例.实例ID}] 💰 开始代币卖出流程...`);
        
        try {
          // 获取钱包地址
          const 钱包地址 = await this.apiService.获取钱包地址();
          
          // 🔧 关键修改：重新执行智能基础货币选择，与购买时保持一致
          await this.智能选择基础货币(钱包地址, 实例.实例ID);
          console.log(`[STRATEGY] [${实例.实例ID}] 🎯 退出时选择的基础货币: ${this.当前基础货币名称} (地址: ${this.当前基础货币地址})`);
          
          const { token0信息, token1信息 } = 实例.市场数据;
          
          // 🔧 新逻辑：确定哪些是非基础货币，需要卖出成基础货币
          const 非基础货币列表: any[] = [];
          
          // 检查token0是否为基础货币
          if (token0信息.address !== this.当前基础货币地址) {
            非基础货币列表.push({
              代币信息: token0信息,
              类型: 'token0'
            });
          }
          
          // 检查token1是否为基础货币
          if (token1信息.address !== this.当前基础货币地址) {
            非基础货币列表.push({
              代币信息: token1信息,
              类型: 'token1'
            });
          }
          
          console.log(`[STRATEGY] [${实例.实例ID}] 📊 需要卖出的非基础货币数量: ${非基础货币列表.length}`);
          
          // 🔄 逐个卖出非基础货币成基础货币
          const 卖出记录: any[] = [];
          
          for (const 非基础货币 of 非基础货币列表) {
            const 代币信息 = 非基础货币.代币信息;
            
            console.log(`[STRATEGY] [${实例.实例ID}] 🔍 检查 ${代币信息.symbol} 余额...`);
            
            // 查询该代币的余额
            const 代币余额 = await this.apiService.获取代币余额(钱包地址, 代币信息.address);
            console.log(`[STRATEGY] [${实例.实例ID}] 💰 ${代币信息.symbol} 余额: ${代币余额}`);
            
            if (代币余额 > 0.000001) { // 只有余额大于最小值才卖出
              console.log(`[STRATEGY] [${实例.实例ID}] 🔄 执行OKX真实卖出: ${代币信息.symbol} → ${this.当前基础货币名称}, 数量: ${代币余额 * 0.9995} (99.95%)`);
              
              const 滑点设置3 = 实例.配置.OKX交易滑点 || 实例.配置.滑点设置;
              if (!滑点设置3) {
                throw new Error('滑点设置未配置，无法执行代币交换');
              }
              const 卖出交换结果 = await this.okxSwap(
                实例.实例ID,  // 实例ID
                代币信息.address,
                this.当前基础货币地址,
                this.toWei(代币余额 * 0.9995), // 99.95%的余额
                滑点设置3
              );
              
              if (卖出交换结果.success) {
                console.log(`[STRATEGY] [${实例.实例ID}] ✅ ${代币信息.symbol} → ${this.当前基础货币名称} 卖出成功: ${卖出交换结果.txHash}`);
                console.log(`[STRATEGY] [${实例.实例ID}] 📊 交易详情: 发送 ${卖出交换结果.fromAmount} ${卖出交换结果.fromSymbol}, 接收 ${卖出交换结果.toAmount} ${卖出交换结果.toSymbol}`);
                
                卖出记录.push({
                  代币: 代币信息.symbol,
                  卖出数量: 代币余额 * 0.9995,
                  目标货币: this.当前基础货币名称,
                  交易哈希: 卖出交换结果.txHash,
                  状态: '成功',
                  实际交易: true
                });
              } else {
                console.error(`❌ ${代币信息.symbol} → ${this.当前基础货币名称} 卖出失败: ${卖出交换结果.error}`);
                
                卖出记录.push({
                  代币: 代币信息.symbol,
                  卖出数量: 代币余额 * 0.9995,
                  目标货币: this.当前基础货币名称,
                  状态: '失败',
                  错误: 卖出交换结果.error,
                  实际交易: false
                });
              }
            } else {
              console.log(`[STRATEGY] [${实例.实例ID}] ℹ️ ${代币信息.symbol} 余额过低 (${代币余额})，跳过卖出`);
              
              卖出记录.push({
                代币: 代币信息.symbol,
                卖出数量: 0,
                目标货币: this.当前基础货币名称,
                状态: '跳过',
                原因: '余额过低',
                实际交易: false
              });
            }
          }
          
          // 🔧 设置卖出结果
          卖出结果 = {
            success: 卖出记录.some(r => r.状态 === '成功'),
            卖出记录,
            使用基础货币: this.当前基础货币名称,
            总卖出代币数: 卖出记录.filter(r => r.状态 === '成功').length,
            智能基础货币选择: true
          };
          
          // 📊 输出卖出汇总
          console.log(`[STRATEGY] [${实例.实例ID}] 📋 代币卖出汇总:`);
          console.log(`[STRATEGY] [${实例.实例ID}]   🎯 统一基础货币: ${this.当前基础货币名称}`);
          console.log(`[STRATEGY] [${实例.实例ID}]   ✅ 成功卖出: ${卖出记录.filter(r => r.状态 === '成功').length} 个代币`);
          console.log(`[STRATEGY] [${实例.实例ID}]   ⏭️ 跳过卖出: ${卖出记录.filter(r => r.状态 === '跳过').length} 个代币`);
          console.log(`[STRATEGY] [${实例.实例ID}]   ❌ 失败卖出: ${卖出记录.filter(r => r.状态 === '失败').length} 个代币`);
          
        } catch (error) {
          console.error(`❌ 代币卖出流程失败:`, error);
          console.log(`📝 手动操作提示: 请手动卖出代币`);
          // 不抛出错误，继续执行
        }
      }
      
      // 步骤3: 保存退出结果到已有字段
      实例.退出时间 = Date.now();
      实例.退出原因 = 退出原因 || '用户主动退出';
       
       // 在错误信息字段中记录退出详情（如果需要的话）
       const 退出详情 = {
         头寸关闭: 头寸关闭结果?.success || false,
         代币卖出: 卖出结果?.success || false,
         退出完成时间: Date.now()
       };
       
       this.stateManager.completeStage(实例, 5, `策略退出完成 ${头寸关闭结果?.success ? '✅头寸已关闭' : ''} ${卖出结果?.success ? '✅代币已卖出' : ''}`);
       
       console.log(`✅ 策略退出流程完成: ${实例.实例ID}`, 退出详情);
       
       // 🎯 发射策略结束事件（轻量级插件注入点）
       插件管理器.分发事件('strategy.ended', {
         实例ID: 实例.实例ID,
         退出原因: 退出原因 || '用户主动退出',
         退出详情,
         头寸关闭结果,
         卖出结果,
         时间戳: Date.now()
       });
      
    } catch (error) {
      this.stateManager.setErrorState(实例, 5, error);
      throw error;
    }
  }

  // ==== 私有辅助方法 ====

  private async 获取池子代币信息(池地址: string, 池子状态: any) {
    const provider = this.web3Service.getProvider();
    if (!provider) throw new Error('Provider未初始化');
    
    const { POOL_ABI } = await import('../../types/contracts.js');
    const { ethers } = await import('ethers');
    const poolContract = new ethers.Contract(池地址, POOL_ABI, provider);
    
    const [token0地址, token1地址] = await Promise.all([
      poolContract.token0(),
      poolContract.token1()
    ]);

    const [token0信息, token1信息] = await Promise.all([
      this.contractService.getTokenInfo(token0地址),
      this.contractService.getTokenInfo(token1地址)
    ]);
    
    return { token0: token0信息, token1: token1信息 };
  }

  private 验证价格范围合理性(当前tick: number, 代币范围: { 下限tick: number; 上限tick: number }) {
    const { 下限tick, 上限tick } = 代币范围;

    if (下限tick >= 上限tick) {
      return { 合理: false, 原因: 'tick下限必须小于上限' };
    }

    if (当前tick < 下限tick || 当前tick > 上限tick) {
      return { 合理: false, 原因: `当前tick(${当前tick})不在设定范围[${下限tick}, ${上限tick}]内` };
    }

    const 范围宽度 = 上限tick - 下限tick;
    if (范围宽度 < 10) {
      return { 合理: false, 原因: `价格范围过窄(${范围宽度}个tick)，建议至少10个tick` };
    }

    if (范围宽度 > 2000) {
      return { 合理: false, 原因: `价格范围过宽(${范围宽度}个tick)，建议不超过2000个tick` };
    }

    return { 合理: true };
  }

  /**
   * 🧮 计算官方代币需求量 - 使用LiquidityManager的纯计算方法
   */
  private async 计算官方代币需求量(参数: {
    inputAmount: string;
    inputToken: string;
    currentTick: number;
    tickLower: number;
    tickUpper: number;
    token0信息: any;
    token1信息: any;
    实例配置: any;
  }): Promise<{
    token0需求量: number;
    token1需求量: number;
    计算说明: string;
  }> {
    const { inputAmount, inputToken, currentTick, tickLower, tickUpper, token0信息, token1信息, 实例配置 } = 参数;
    
    try {
      console.log(`📊 调用LiquidityManager进行纯计算...`);
      
      // 🔧 修复：使用LiquidityManager的纯计算方法，避免执行真实交易
      const 需求量结果 = await this.liquidityManager.calculateTokenRequirements({
        inputAmount: parseFloat(inputAmount),
        inputTokenType: inputToken === token0信息.symbol ? 'token0' : 'token1',
        currentTick,
        tickLower,
        tickUpper,
        token0Decimals: token0信息.decimals,
        token1Decimals: token1信息.decimals,
        poolConfig: {
          poolAddress: 实例配置.池地址,
          token0Address: token0信息.address,
          token1Address: token1信息.address,
          fee: 100
        }
      });
      
      console.log(`✅ LiquidityManager纯计算成功:`, 需求量结果);
      
      return {
        token0需求量: 需求量结果.token0需求量,
        token1需求量: 需求量结果.token1需求量,
        计算说明: `LiquidityManager纯计算: ${需求量结果.计算说明}`
      };
      
    } catch (error) {
      console.error('LiquidityManager纯计算失败，回退到TickCalculatorService:', error);
      
      // 🔄 回退到TickCalculatorService计算
      const 计算结果 = this.tickCalculatorService.calculateTokenRequirements({
        inputAmount: parseFloat(inputAmount),
        inputTokenType: inputToken === token0信息.symbol ? 'token0' : 'token1',
        currentTick,
        tickLower,
        tickUpper,
        token0Decimals: token0信息.decimals,
        token1Decimals: token1信息.decimals,
        poolConfig: {
          poolAddress: 实例配置.池地址,
          token0Address: token0信息.address,
          token1Address: token1信息.address,
          fee: 100 // 默认费率
        }
      });
      
      return {
        token0需求量: 计算结果.token0需求量,
        token1需求量: 计算结果.token1需求量,
        计算说明: `TickCalculatorService计算(回退): ${计算结果.计算说明}`
      };
    }
  }

  /**
   * 🔄 通过OKX API获取代币汇率
   */
  private async 获取OKX汇率(
    fromTokenAddress: string,
    toTokenAddress: string,
    userWalletAddress: string
  ): Promise<{
    success: boolean;
    exchangeRate?: number; // toToken/fromToken
    error?: string;
  }> {
    try {
      console.log(`📊 获取OKX汇率: ${fromTokenAddress} → ${toTokenAddress}`);
      
      // 使用小额USDT测试获取汇率
      const testAmount = this.toWei(0.1); // 0.1 USDT
      
      const response = await fetch('http://localhost:8000/api/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fromTokenAddress,
          toTokenAddress,
          amount: testAmount,
          userWalletAddress,
          chainId: '56',
          slippage: '0.5'  // 汇率查询固定使用0.5%滑点
        })
      });
      
      const result = await response.json() as {
        success: boolean;
        data?: {
          routerResult?: {
            fromTokenAmount?: string;
            toTokenAmount?: string;
          };
        };
        error?: string;
      };
      
      if (result.success && result.data?.routerResult) {
        const routerResult = result.data.routerResult;
        const fromAmount = parseFloat(routerResult.fromTokenAmount || '0') / Math.pow(10, 18);  
        const toAmount = parseFloat(routerResult.toTokenAmount || '0') / Math.pow(10, 18);
        
        if (fromAmount > 0) {
          const exchangeRate = toAmount / fromAmount; // toToken/fromToken
          console.log(`💱 汇率计算成功: 1 源代币 = ${exchangeRate.toFixed(6)} 目标代币`);
          
          return {
            success: true,
            exchangeRate
          };
        } else {
          throw new Error('无效的汇率数据');
        }
      } else {
        throw new Error(result.error || '获取报价失败');
      }
    } catch (error) {
      console.error(`❌ 获取汇率失败:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '网络异常'
      };
    }
  }

  /**
   * 🔄 精确计算所需代币数量并执行购买
   */
  private async 精确购买B2代币(
    实例ID: string,
    源代币地址: string,
    目标代币地址: string,
    需求目标代币数量: number,
    userWalletAddress: string,
    slippage?: number  // 可选的滑点参数
  ): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
    实际获得B2数量?: number;
    使用USDT数量?: number;
  }> {
    try {
      // 动态获取代币符号
      const [源代币信息, 目标代币信息] = await Promise.all([
        this.contractService.getTokenInfo(源代币地址),
        this.contractService.getTokenInfo(目标代币地址)
      ]);
      
      console.log(`🎯 开始精确购买 ${需求目标代币数量} 个${目标代币信息.symbol}代币`);
      
      // 1. 获取当前汇率
      const 汇率结果 = await this.获取OKX汇率(源代币地址, 目标代币地址, userWalletAddress);
      if (!汇率结果.success || !汇率结果.exchangeRate) {
        throw new Error(`获取汇率失败: ${汇率结果.error}`);
      }
      
      const exchangeRate = 汇率结果.exchangeRate; // 目标代币/源代币
      
      // 2. 计算所需源代币数量 (增加2%缓冲)
      const 所需源代币数量 = (需求目标代币数量 / exchangeRate) * 1.02;
      const 源代币数量Wei = this.toWei(所需源代币数量);
      
      console.log(`💰 汇率: 1 ${源代币信息.symbol} = ${exchangeRate.toFixed(6)} ${目标代币信息.symbol}`);
      console.log(`📊 需求: ${需求目标代币数量} ${目标代币信息.symbol}`);
      console.log(`💳 计算所需: ${所需源代币数量.toFixed(6)} ${源代币信息.symbol} (含2%缓冲)`);
      
      // 3. 执行精确购买 - 必须传入滑点设置
      if (slippage === undefined) {
        throw new Error('滑点参数必须提供，不允许使用默认值');
      }
      const 购买结果 = await this.okxSwap(
        实例ID,  // 实例ID
        源代币地址,
        目标代币地址,
        源代币数量Wei,
        slippage  // 使用传入的滑点设置
      );
      
      if (购买结果.success) {
        const 实际获得目标代币数量 = parseFloat(购买结果.toAmount || '0');
        const 实际使用源代币数量 = parseFloat(购买结果.fromAmount || '0');
        
        console.log(`✅ 精确购买成功!`);
        console.log(`📊 使用 ${实际使用源代币数量.toFixed(6)} ${源代币信息.symbol}`);
        console.log(`📊 获得 ${实际获得目标代币数量.toFixed(6)} ${目标代币信息.symbol}`);
        console.log(`🎯 目标 ${需求目标代币数量} ${目标代币信息.symbol}`);
        console.log(`📈 精确度: ${((实际获得目标代币数量 / 需求目标代币数量) * 100).toFixed(2)}%`);
        
        return {
          success: true,
          ...(购买结果.txHash && { txHash: 购买结果.txHash }),
          实际获得B2数量: 实际获得目标代币数量,
          使用USDT数量: 实际使用源代币数量
        };
      } else {
        throw new Error(`购买执行失败: ${购买结果.error}`);
      }
    } catch (error) {
      console.error(`❌ 精确购买失败:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '购买异常'
      };
    }
  }
} 