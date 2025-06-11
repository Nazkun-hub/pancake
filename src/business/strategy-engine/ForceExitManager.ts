/**
 * 🚨 强制退出管理器
 * 
 * 用户主动触发的强制退出功能，执行流程与阶段5完全一致：
 * 1. 移除流动性关闭头寸（单独这个实例的头寸）
 * 2. 卖出非基础货币代币
 * 
 * 与原始阶段5的区别：
 * - 原始阶段5：因脱离区间自动触发
 * - 强制退出：用户主动触发
 * - 执行流程：完全一致
 */

import { 策略实例 } from '../../types/interfaces.js';
import { ApiService } from './ApiService.js';
import { Web3Service } from '../../services/Web3Service.js';

export class ForceExitManager {
  private readonly apiService: ApiService;
  
  // 基础货币常量定义（与ExecutionStages保持一致）
  private static readonly USDT地址 = '0x55d398326f99059fF775485246999027B3197955';
  private static readonly USDC地址 = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
  private static readonly WBNB地址 = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  
  // 当前使用的基础货币（动态选择）
  private 当前基础货币地址: string = '';
  private 当前基础货币名称: string = '';

  constructor(private web3Service: Web3Service) {
    this.apiService = new ApiService(this.web3Service);
  }

  /**
   * 🚨 执行强制退出
   * @param 实例 策略实例
   * @returns Promise<{success: boolean, details: any}>
   */
  async executeForceExit(实例: 策略实例): Promise<{
    success: boolean;
    details: any;
    error?: string;
  }> {
    console.log(`[STRATEGY] 🚨 开始执行强制退出: ${实例.实例ID}`);
    console.log(`[STRATEGY] 📝 退出原因: 用户主动强制退出`);
    
    const 退出详情 = {
      开始时间: Date.now(),
      头寸关闭结果: null,
      代币卖出结果: null,
      完成时间: 0,
      状态: '执行中'
    };

    try {
      // 步骤1: 关闭流动性头寸
      console.log(`[STRATEGY] 💎 步骤1: 关闭流动性头寸...`);
      退出详情.头寸关闭结果 = await this.关闭单个头寸(实例);
      
      // 步骤2: 卖出非基础货币代币
      console.log(`[STRATEGY] 💰 步骤2: 卖出非基础货币代币...`);
      退出详情.代币卖出结果 = await this.卖出非基础货币(实例);
      
      // 标记完成
      退出详情.完成时间 = Date.now();
      退出详情.状态 = '成功';
      
      console.log(`[STRATEGY] ✅ 强制退出执行完成: ${实例.实例ID}`);
      console.log(`[STRATEGY] 📊 总耗时: ${退出详情.完成时间 - 退出详情.开始时间}ms`);
      
      return {
        success: true,
        details: 退出详情
      };
      
    } catch (error) {
      退出详情.状态 = '失败';
      退出详情.完成时间 = Date.now();
      
      console.error(`[STRATEGY] ❌ 强制退出失败: ${实例.实例ID}`, error);
      
      return {
        success: false,
        details: 退出详情,
        error: error instanceof Error ? error.message : '强制退出执行失败'
      };
    }
  }

  /**
   * 💎 关闭单个流动性头寸
   */
  private async 关闭单个头寸(实例: 策略实例): Promise<any> {
    let 头寸关闭结果: any = {
      执行: false,
      成功: false,
      原因: '',
      交易哈希: null,
      错误: null
    };

    if (!实例.头寸信息?.tokenId || 实例.头寸信息.tokenId <= 0) {
      头寸关闭结果.原因 = '没有需要关闭的流动性头寸';
      console.log(`[STRATEGY] ℹ️ 没有需要关闭的流动性头寸`);
      return 头寸关闭结果;
    }

    try {
      console.log(`[STRATEGY] 💎 正在关闭流动性头寸: TokenID ${实例.头寸信息.tokenId}`);
      
      const 关闭结果 = await this.apiService.关闭流动性头寸(实例.头寸信息.tokenId.toString());
      
      头寸关闭结果.执行 = true;
      
      if (关闭结果.success) {
        头寸关闭结果.成功 = true;
        头寸关闭结果.交易哈希 = 关闭结果.result?.transactionHash;
        console.log(`[STRATEGY] ✅ 头寸关闭成功: ${关闭结果.result?.transactionHash || '模拟交易'}`);
      } else {
        头寸关闭结果.错误 = 关闭结果.error || '头寸关闭失败';
        console.error(`[STRATEGY] ❌ 头寸关闭失败: ${头寸关闭结果.错误}`);
      }
      
    } catch (error) {
      头寸关闭结果.执行 = true;
      头寸关闭结果.错误 = error instanceof Error ? error.message : '头寸关闭异常';
      console.error(`[STRATEGY] ❌ 关闭头寸异常:`, error);
    }

    return 头寸关闭结果;
  }

  /**
   * 💰 卖出非基础货币代币
   */
  private async 卖出非基础货币(实例: 策略实例): Promise<any> {
    let 卖出结果: any = {
      执行: false,
      成功记录: [],
      失败记录: [],
      跳过记录: [],
      使用基础货币: '',
      智能基础货币选择: true
    };

    if (!实例.市场数据 || !实例.配置) {
      卖出结果.错误 = '缺少市场数据或配置信息';
      console.log(`[STRATEGY] ℹ️ 跳过代币卖出: 缺少市场数据或配置信息`);
      return 卖出结果;
    }

    try {
      卖出结果.执行 = true;
      
      // 获取钱包地址
      const 钱包地址 = await this.apiService.获取钱包地址();
      
      // 🔧 关键：重新执行智能基础货币选择，与购买时保持一致
      await this.智能选择基础货币(钱包地址);
      卖出结果.使用基础货币 = this.当前基础货币名称;
      
      console.log(`[STRATEGY] 🎯 强制退出时选择的基础货币: ${this.当前基础货币名称} (地址: ${this.当前基础货币地址})`);
      
      const { token0信息, token1信息 } = 实例.市场数据;
      
      // 🔧 确定哪些是非基础货币，需要卖出成基础货币
      const 非基础货币列表: any[] = [];
      
      if (token0信息.address !== this.当前基础货币地址) {
        非基础货币列表.push({
          代币信息: token0信息,
          类型: 'token0'
        });
      }
      
      if (token1信息.address !== this.当前基础货币地址) {
        非基础货币列表.push({
          代币信息: token1信息,
          类型: 'token1'
        });
      }
      
      console.log(`[STRATEGY] 📊 需要卖出的非基础货币数量: ${非基础货币列表.length}`);
      
      // 🔄 逐个卖出非基础货币成基础货币
      for (const 非基础货币 of 非基础货币列表) {
        const 代币信息 = 非基础货币.代币信息;
        
        console.log(`[STRATEGY] 🔍 检查 ${代币信息.symbol} 余额...`);
        
        // 查询该代币的余额
        const 代币余额 = await this.apiService.获取代币余额(钱包地址, 代币信息.address);
        console.log(`[STRATEGY] 💰 ${代币信息.symbol} 余额: ${代币余额}`);
        
        if (代币余额 > 0.000001) { // 只有余额大于最小值才卖出
          console.log(`[STRATEGY] 🔄 执行OKX真实卖出: ${代币信息.symbol} → ${this.当前基础货币名称}, 数量: ${代币余额 * 0.9995} (99.95%)`);
          
          const 滑点设置 = 实例.配置.OKX交易滑点 || 实例.配置.滑点设置;
          if (!滑点设置) {
            throw new Error('滑点设置未配置，无法执行代币交换');
          }
          const 卖出交换结果 = await this.okxSwap(
            代币信息.address,
            this.当前基础货币地址,
            this.toWei(代币余额 * 0.9995), // 99.95%的余额
            滑点设置
          );
          
          if (卖出交换结果.success) {
            console.log(`[STRATEGY] ✅ ${代币信息.symbol} → ${this.当前基础货币名称} 卖出成功: ${卖出交换结果.txHash}`);
            console.log(`[STRATEGY] 📊 交易详情: 发送 ${卖出交换结果.fromAmount} ${卖出交换结果.fromSymbol}, 接收 ${卖出交换结果.toAmount} ${卖出交换结果.toSymbol}`);
            卖出结果.成功记录.push({
              代币: 代币信息.symbol,
              卖出数量: 代币余额 * 0.9995,
              目标货币: this.当前基础货币名称,
              交易哈希: 卖出交换结果.txHash,
              获得数量: 卖出交换结果.toAmount,
              实际交易: true
            });
          } else {
            console.error(`[STRATEGY] ❌ ${代币信息.symbol} → ${this.当前基础货币名称} 卖出失败: ${卖出交换结果.error}`);
            
            卖出结果.失败记录.push({
              代币: 代币信息.symbol,
              卖出数量: 代币余额 * 0.9995,
              目标货币: this.当前基础货币名称,
              错误: 卖出交换结果.error,
              实际交易: false
            });
          }
        } else {
          console.log(`[STRATEGY] ℹ️ ${代币信息.symbol} 余额过低 (${代币余额})，跳过卖出`);
          
          卖出结果.跳过记录.push({
            代币: 代币信息.symbol,
            卖出数量: 0,
            目标货币: this.当前基础货币名称,
            原因: '余额过低',
            实际交易: false
          });
        }
      }
      
      // 📊 输出卖出汇总
      console.log(`[STRATEGY] 📋 代币卖出汇总:`);
      console.log(`[STRATEGY]   🎯 统一基础货币: ${this.当前基础货币名称}`);
      console.log(`[STRATEGY]   ✅ 成功卖出: ${卖出结果.成功记录.length} 个代币`);
      console.log(`[STRATEGY]   ⏭️ 跳过卖出: ${卖出结果.跳过记录.length} 个代币`);
      console.log(`[STRATEGY]   ❌ 失败卖出: ${卖出结果.失败记录.length} 个代币`);
      
    } catch (error) {
      console.error(`[STRATEGY] ❌ 代币卖出流程失败:`, error);
      卖出结果.错误 = error instanceof Error ? error.message : '代币卖出异常';
    }

    return 卖出结果;
  }

  // ==== 辅助方法 ====

  /**
   * 🧠 智能选择基础货币（与ExecutionStages保持一致）
   */
  private async 智能选择基础货币(钱包地址: string): Promise<void> {
    console.log('[STRATEGY] 🔍 检查USDT、USDC和WBNB余额，选择更优的基础货币...');
    
    // 获取三种基础货币的余额
    const USDT余额 = await this.apiService.获取代币余额(钱包地址, ForceExitManager.USDT地址);
    console.log(`[STRATEGY] 💰 USDT 余额: ${USDT余额}`);
    
    const USDC余额 = await this.apiService.获取代币余额(钱包地址, ForceExitManager.USDC地址);
    console.log(`[STRATEGY] 💰 USDC 余额: ${USDC余额}`);
    
    const WBNB余额 = await this.apiService.获取代币余额(钱包地址, ForceExitManager.WBNB地址);
    console.log(`[STRATEGY] 💰 WBNB 余额: ${WBNB余额}`);
    
    // 智能选择余额最大的基础货币
    const 余额列表 = [
      { 名称: 'USDT', 地址: ForceExitManager.USDT地址, 余额: USDT余额 },
      { 名称: 'USDC', 地址: ForceExitManager.USDC地址, 余额: USDC余额 },
      { 名称: 'WBNB', 地址: ForceExitManager.WBNB地址, 余额: WBNB余额 }
    ];
    
    // 按余额从大到小排序
    余额列表.sort((a, b) => b.余额 - a.余额);
    
    // 选择余额最大的基础货币
    const 选中货币 = 余额列表[0];
    this.当前基础货币地址 = 选中货币.地址;
    this.当前基础货币名称 = 选中货币.名称;
    
    console.log(`[STRATEGY] ✅ 选择基础货币: ${选中货币.名称} (余额: ${选中货币.余额})`);
    console.log(`[STRATEGY] 📊 余额排序: ${余额列表.map(c => `${c.名称}=${c.余额}`).join(', ')}`);
  }

  /**
   * 🔥 OKX真实交易方法 (与ExecutionStages保持一致)
   */
  private async okxSwap(
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
  }> {
    try {
      console.log(`[STRATEGY] 🔥 OKX真实交易开始: ${fromTokenAddress} → ${toTokenAddress}, 金额: ${amount}`);
      
      // 获取钱包地址
      const userWalletAddress = await this.apiService.获取钱包地址();
      
      // 🔧 修复：OKX API直接接受百分比格式，不需要除以100
      const okxSlippageValue = slippage.toString();
      
      // 调用OKX API执行真实交易
      const requestBody = {
        fromTokenAddress,
        toTokenAddress,
        amount,
        userWalletAddress,
        chainId: '56', // BSC链
        chainIndex: '56',
        slippage: okxSlippageValue
      };
      
      console.log('[STRATEGY] 🔍 强制退出调用OKX API详细参数:');
      console.log('[STRATEGY]   fromTokenAddress:', fromTokenAddress);
      console.log('[STRATEGY]   toTokenAddress:', toTokenAddress);
      console.log('[STRATEGY]   amount (wei):', amount);
      console.log('[STRATEGY]   userWalletAddress:', userWalletAddress);
      console.log('[STRATEGY]   chainId:', '56');
      console.log('[STRATEGY]   slippage (原值):', slippage, '%');
      console.log('[STRATEGY]   slippage (OKX格式):', okxSlippageValue, '(百分比)');
      
      const response = await fetch('http://localhost:8000/api/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      const rawResult = await response.json() as {
        success: boolean;
        data?: {
          success: boolean;
          txHash?: string;
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
            fromToken?: { tokenSymbol?: string; };
            toToken?: { tokenSymbol?: string; };
          };
        };
        error?: string;
      };
      
      console.log('[STRATEGY] 🔍 OKX API原始返回:', JSON.stringify(rawResult, null, 2));
      
      if (!rawResult.success || !rawResult.data) {
        return {
          success: false,
          error: rawResult.error || 'API调用失败'
        };
      }
      
      const result = rawResult.data;
      if (result.success && result.txHash) {
        const fromAmount = result.quote?.fromTokenAmount;
        const toAmount = result.quote?.toTokenAmount;
        
        const formatAmount = (amount?: string, decimals: number = 18) => {
          if (!amount) return 'N/A';
          const value = parseFloat(amount) / Math.pow(10, decimals);
          return value.toFixed(6);
        };
        
        const fromSymbol = result.quote?.fromToken?.tokenSymbol || 'Unknown';
        const toSymbol = result.quote?.toToken?.tokenSymbol || 'Unknown';
        const fromFormatted = formatAmount(fromAmount);
        const toFormatted = formatAmount(toAmount);
        
        console.log(`[STRATEGY] ✅ OKX真实交易成功: ${result.txHash}`);
        console.log(`[STRATEGY] 📊 交易详情: 发送 ${fromFormatted} ${fromSymbol}, 接收 ${toFormatted} ${toSymbol}`);
        
        return {
          success: true,
          txHash: result.txHash,
          fromAmount: fromFormatted,
          toAmount: toFormatted,
          fromSymbol,
          toSymbol
        };
      } else {
        return {
          success: false,
          error: '交易执行失败'
        };
      }
    } catch (error) {
      console.error(`[STRATEGY] ❌ OKX真实交易异常:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '网络异常'
      };
    }
  }

  /**
   * 🔄 将数量转换为wei格式 (与ExecutionStages保持一致)
   */
  private toWei(amount: number): string {
    if (amount <= 0) return '0';
    
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
} 