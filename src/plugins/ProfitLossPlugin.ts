import { EventEmitter } from './EventEmitter.js';
import { ethers } from 'ethers';

/**
 * 📊 单实例生命周期统计接口
 */
export interface InstanceLifecycleStats {
  // 启动阶段成本
  启动成本: {
    Gas费用_usdt: number;
    初始投入_usdt: number;
    时间戳: number;
  };
  
  // 运行阶段收益
  运行收益: {
    手续费收入_usdt: number;
    LP价值变化_usdt: number;
    累计交换损失_usdt: number;
    运行天数: number;
  };
  
  // 关闭阶段结算
  关闭结算?: {
    最终提取_usdt: number;
    关闭Gas费用_usdt: number;
    滑点损失_usdt: number;
    时间戳: number;
  };
  
  // 完整生命周期汇总
  生命周期汇总: {
    总投入成本_usdt: number;  // 启动成本 + 运行成本
    总收益_usdt: number;      // 手续费 + LP增值
    总成本_usdt: number;      // Gas + 滑点 + 其他成本
    净盈亏_usdt: number;      // 总收益 - 总成本
    持续时间_小时: number;
    年化收益率_percent: number;
    投资回报率_percent: number;
  };
}

/**
 * 📊 盈亏统计数据接口
 */
export interface ProfitLossData {
  实例ID: string;
  策略名称?: string;
  开始时间: number;
  结束时间?: number;
  状态: '运行中' | '已完成' | '已退出';
  
  // 🔧 新增：动态基础货币信息
  基础货币信息: {
    当前基础货币: string;          // 如 'USDT', 'USDC', 'WBNB'
    当前基础货币地址: string;      // 对应的地址
    最后更新时间: number;
  };
  
  // 🔧 新增：场景识别
  计算场景: '场景1_双非基础货币' | '场景2_包含基础货币' | '未确定';
  
  // 🔧 新增：头寸信息
  头寸信息?: {
    tokenId: number;
    创建时间: number;
    关闭时间?: number;
    状态?: '运行中' | '已关闭';
    token0: string;
    token1: string;
    投入数量: {
      token0: number;
      token1: number;
    };
  };
  
  // 投入资产 - 修改为基础货币为中心
  初始投入: {
    // 场景1：两个代币都是非基础货币
    场景1_成本: {
      token0购买成本_基础货币: number;     // 购买token0花费的基础货币
      token1购买成本_基础货币: number;     // 购买token1花费的基础货币
      总购买成本_基础货币: number;         // 总购买成本
    };
    
    // 场景2：包含基础货币的情况
    场景2_成本: {
      非基础货币购买成本_基础货币: number;  // 购买非基础货币花费的基础货币
      直接投入基础货币数量: number;        // 直接投入的基础货币数量（从流动性添加中解析）
      总成本_基础货币: number;            // 总成本
    };
    
    // 原始代币信息（保持兼容）
    token0: { symbol: string; amount: number; value_usdt: number };
    token1: { symbol: string; amount: number; value_usdt: number };
    总价值_usdt: number;
  };
  
  // 当前资产（实时）
  当前资产: {
    LP头寸价值_usdt: number;
    剩余token0: { symbol: string; amount: number; value_usdt: number };
    剩余token1: { symbol: string; amount: number; value_usdt: number };
    总价值_usdt: number;
  };
  
  // 🔧 修改：交换记录 - 增加基础货币信息
  交换历史: Array<{
    时间: number;
    类型: '买入' | '卖出' | '头寸关闭' | '待卖出';
    from_token: string;
    to_token: string;
    from_amount: number;
    to_amount: number;
    // 新增：基础货币相关信息
    是否涉及基础货币: boolean;
    基础货币方向?: '买入基础货币' | '卖出基础货币' | '获得基础货币' | undefined;
    基础货币数量?: number | undefined;
    滑点损失_usdt: number;
    交易哈希?: string;
  }>;
  
  // 手续费收益
  手续费收益: {
    累计收益_usdt: number;
    最后更新时间: number;
  };
  
  // 🔧 修改：盈亏统计 - 以基础货币为标准
  盈亏统计: {
    // 原有字段（保持兼容）
    绝对盈亏_usdt: number;
    相对盈亏_percent: number;
    手续费收益_usdt: number;
    交换成本_usdt: number;
    净盈亏_usdt: number;
    投资回报率_percent: number;
    
    // 🔧 新增：基础货币标准的盈亏计算
    基础货币盈亏: {
      总投入成本_基础货币: number;      // 根据场景计算的总成本
      当前价值_基础货币: number;        // 当前总价值（按基础货币计算）
      绝对盈亏_基础货币: number;        // 绝对盈亏
      相对盈亏_percent: number;        // 相对盈亏百分比
      手续费收益_基础货币: number;      // 手续费收益
      净盈亏_基础货币: number;          // 净盈亏
      投资回报率_percent: number;      // 投资回报率
    };
  };
  
  // 🆕 单实例生命周期统计
  生命周期统计: InstanceLifecycleStats;
}

/**
 * 💰 盈亏统计插件
 * 监听策略事件，自动计算实时盈亏
 */
export class ProfitLossPlugin extends EventEmitter {
  private 统计数据: Map<string, ProfitLossData> = new Map();
  private 是否启用: boolean = true;
  private 数据存储路径: string;
  
  // 🔧 新增：TokenID到实例ID的映射
  private tokenId映射: Map<number, string> = new Map();

  // 🆕 新增：历史数据存储（已完成的实例）
  private 历史数据: Map<string, ProfitLossData> = new Map();
  
  // 🆕 新增：实例版本追踪
  private 实例版本: Map<string, number> = new Map(); // 基础实例ID → 当前版本号

  constructor(数据存储路径: string = './data/profit-loss') {
    super();
    this.数据存储路径 = 数据存储路径;
    this.初始化数据存储();
    this.加载历史数据();
    
    // 🔧 新增：订阅头寸关闭事件
    this.setupEventListeners();
  }

  /**
   * 🔧 新增：设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听头寸创建事件
    this.on('position.created', this.处理头寸创建事件监听.bind(this));
    
    // 监听头寸关闭事件
    this.on('position.closed', this.处理头寸关闭.bind(this));
    
    // 监听最终卖出完成事件
    this.on('final.sell.completed', this.处理最终卖出完成.bind(this));
    
    console.log('🎧 盈亏统计事件监听器启动完成');
  }

  /**
   * 🔧 初始化数据存储
   */
  private async 初始化数据存储(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      if (!fs.existsSync(this.数据存储路径)) {
        fs.mkdirSync(this.数据存储路径, { recursive: true });
      }
    } catch (error) {
      console.error('[PLUGIN] 数据存储初始化失败:', error);
    }
  }

  /**
   * 📥 加载历史数据
   */
  private async 加载历史数据(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const 数据文件路径 = path.join(this.数据存储路径, 'profit-loss.json');
      const 历史数据文件路径 = path.join(this.数据存储路径, 'historical-data.json');
      const 版本数据文件路径 = path.join(this.数据存储路径, 'instance-versions.json');
      
      // 加载主要统计数据
      if (fs.existsSync(数据文件路径)) {
        const 数据内容 = await fs.promises.readFile(数据文件路径, 'utf-8');
        const 解析数据 = JSON.parse(数据内容);
        
        for (const [key, value] of Object.entries(解析数据)) {
          this.统计数据.set(key, value as ProfitLossData);
        }
        
        console.log(`[PLUGIN] 💾 已加载 ${this.统计数据.size} 个实例的统计数据`);
      }

      // 🆕 加载历史数据
      if (fs.existsSync(历史数据文件路径)) {
        const 历史内容 = await fs.promises.readFile(历史数据文件路径, 'utf-8');
        const 历史解析数据 = JSON.parse(历史内容);
        
        for (const [key, value] of Object.entries(历史解析数据)) {
          this.历史数据.set(key, value as ProfitLossData);
        }
        
        console.log(`[PLUGIN] 📚 已加载 ${this.历史数据.size} 个历史实例数据`);
      }

      // 🆕 加载版本信息
      if (fs.existsSync(版本数据文件路径)) {
        const 版本内容 = await fs.promises.readFile(版本数据文件路径, 'utf-8');
        const 版本解析数据 = JSON.parse(版本内容);
        
        for (const [key, value] of Object.entries(版本解析数据)) {
          this.实例版本.set(key, value as number);
        }
        
        console.log(`[PLUGIN] 🔄 已加载 ${this.实例版本.size} 个实例版本信息`);
      }
      
    } catch (error) {
      console.error('[PLUGIN] ❌ 加载历史数据失败:', error);
    }
  }

  /**
   * 💾 保存数据到文件
   */
  private async 保存数据(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      // 保存主要统计数据
      const 主数据文件 = path.join(this.数据存储路径, 'profit-loss.json');
      const 主数据对象 = Object.fromEntries(this.统计数据);
      await fs.promises.writeFile(主数据文件, JSON.stringify(主数据对象, null, 2), 'utf-8');
      
      // 🆕 保存历史数据
      const 历史数据文件 = path.join(this.数据存储路径, 'historical-data.json');
      const 历史数据对象 = Object.fromEntries(this.历史数据);
      await fs.promises.writeFile(历史数据文件, JSON.stringify(历史数据对象, null, 2), 'utf-8');
      
      // 🆕 保存版本信息
      const 版本数据文件 = path.join(this.数据存储路径, 'instance-versions.json');
      const 版本数据对象 = Object.fromEntries(this.实例版本);
      await fs.promises.writeFile(版本数据文件, JSON.stringify(版本数据对象, null, 2), 'utf-8');
      
    } catch (error) {
      console.error('[PLUGIN] 保存数据失败:', error);
    }
  }

  /**
   * 🎯 启动插件
   */
  启动(): void {
    this.是否启用 = true;
    console.log('[PLUGIN] 盈亏统计插件已启动');
  }

  /**
   * ⏹️ 停止插件
   */
  停止(): void {
    this.是否启用 = false;
    this.保存数据();
    console.log('[PLUGIN] 盈亏统计插件已停止');
  }

  /**
   * 🏁 处理策略开始事件
   * 🆕 增强：支持实例版本管理
   */
  处理策略开始(事件数据: any): void {
    if (!this.是否启用) return;

    const { 实例ID: 原始实例ID, 策略配置, 当前基础货币 } = 事件数据;
    
    // 🆕 实例版本化处理
    const { 基础实例ID, 版本化实例ID, 版本号 } = this.处理实例版本化(原始实例ID);
    
    console.log(`[PLUGIN] 开始统计实例 ${版本化实例ID} 的盈亏数据，基础货币：${当前基础货币}`);
    
    if (版本号 > 1) {
      console.log(`[PLUGIN] 🔄 检测到实例重新开始，版本：v${版本号}，基础实例：${基础实例ID}`);
    }

    const 盈亏数据: ProfitLossData = {
      实例ID: 版本化实例ID,
      策略名称: 策略配置?.策略名称 || '未知策略',
      开始时间: Date.now(),
      状态: '运行中',
      
      // 🔧 动态基础货币信息
      基础货币信息: {
        当前基础货币: 当前基础货币 || 'USDT',
        当前基础货币地址: this.获取基础货币地址(当前基础货币 || 'USDT'),
        最后更新时间: Date.now()
      },
      
      // 🔧 场景初始化为未确定
      计算场景: '未确定',
      
      // 初始化投入资产
      初始投入: {
        场景1_成本: {
          token0购买成本_基础货币: 0,
          token1购买成本_基础货币: 0,
          总购买成本_基础货币: 0
        },
        场景2_成本: {
          非基础货币购买成本_基础货币: 0,
          直接投入基础货币数量: 0,
          总成本_基础货币: 0
        },
        
        // 保持兼容性
        token0: { symbol: '', amount: 0, value_usdt: 0 },
        token1: { symbol: '', amount: 0, value_usdt: 0 },
        总价值_usdt: 0
      },

      // 初始化当前资产
      当前资产: {
        LP头寸价值_usdt: 0,
        剩余token0: { symbol: '', amount: 0, value_usdt: 0 },
        剩余token1: { symbol: '', amount: 0, value_usdt: 0 },
        总价值_usdt: 0
      },

      // 初始化交换历史
      交换历史: [],

      // 初始化手续费收益
      手续费收益: {
        累计收益_usdt: 0,
        最后更新时间: Date.now()
      },

      // 初始化盈亏统计
      盈亏统计: {
        绝对盈亏_usdt: 0,
        相对盈亏_percent: 0,
        手续费收益_usdt: 0,
        交换成本_usdt: 0,
        净盈亏_usdt: 0,
        投资回报率_percent: 0,
        
        // 🔧 基础货币盈亏
        基础货币盈亏: {
          总投入成本_基础货币: 0,
          当前价值_基础货币: 0,
          绝对盈亏_基础货币: 0,
          相对盈亏_percent: 0,
          手续费收益_基础货币: 0,
          净盈亏_基础货币: 0,
          投资回报率_percent: 0
        }
      },

      // 初始化生命周期统计
      生命周期统计: {
        启动成本: {
          Gas费用_usdt: 0,
          初始投入_usdt: 0,
          时间戳: Date.now()
        },
        运行收益: {
          手续费收入_usdt: 0,
          LP价值变化_usdt: 0,
          累计交换损失_usdt: 0,
          运行天数: 0
        },
        生命周期汇总: {
          总投入成本_usdt: 0,
          总收益_usdt: 0,
          总成本_usdt: 0,
          净盈亏_usdt: 0,
          持续时间_小时: 0,
          年化收益率_percent: 0,
          投资回报率_percent: 0
        }
      }
    };

    this.统计数据.set(版本化实例ID, 盈亏数据);
    this.保存数据();
    
    // 🆕 如果是重新开始的实例，记录关联信息
    if (版本号 > 1) {
      this.记录实例重新开始(基础实例ID, 版本化实例ID, 版本号);
    }
  }

  /**
   * 💱 处理代币交换事件 - 关键修改：只记录实际交易结果
   */
  处理代币交换(事件数据: any): void {
    if (!this.是否启用) return;

    const { 实例ID, 交换结果, fromSymbol, toSymbol, fromAmount, toAmount, 当前基础货币 } = 事件数据;
    const 数据 = this.统计数据.get(实例ID);
    
    if (数据 && 交换结果.success) {
      // 🔧 更新基础货币信息
      if (当前基础货币) {
        数据.基础货币信息.当前基础货币 = 当前基础货币;
        数据.基础货币信息.最后更新时间 = Date.now();
      }
      
      // 🔧 分析是否涉及基础货币（基于实际交易结果）
      const 基础货币符号 = 数据.基础货币信息.当前基础货币;
      const 涉及基础货币 = fromSymbol === 基础货币符号 || toSymbol === 基础货币符号;
      
      let 基础货币方向: '买入基础货币' | '卖出基础货币' | undefined;
      let 基础货币数量: number | undefined;
      
      if (涉及基础货币) {
        if (fromSymbol === 基础货币符号) {
          // 卖出基础货币（用基础货币购买其他代币）
          基础货币方向 = '卖出基础货币';
          基础货币数量 = parseFloat(fromAmount) || 0;
        } else if (toSymbol === 基础货币符号) {
          // 买入基础货币（卖出其他代币获得基础货币）
          基础货币方向 = '买入基础货币';  
          基础货币数量 = parseFloat(toAmount) || 0;
        }
      }
      
      // 🔧 确定交易类型
      let 交易类型: '买入' | '卖出';
      if (基础货币方向 === '卖出基础货币') {
        交易类型 = '买入';  // 用基础货币买入其他代币
      } else if (基础货币方向 === '买入基础货币') {
        交易类型 = '卖出';  // 卖出其他代币获得基础货币
      } else {
        // 不涉及基础货币的交换，根据常见逻辑判断
        交易类型 = '买入';  // 默认为买入
      }
      
      // 记录交换历史
      数据.交换历史.push({
        时间: Date.now(),
        类型: 交易类型,
        from_token: fromSymbol,
        to_token: toSymbol,
        from_amount: parseFloat(fromAmount) || 0,
        to_amount: parseFloat(toAmount) || 0,
        // 🔧 新增：基础货币相关信息（只记录实际结果）
        是否涉及基础货币: 涉及基础货币,
        基础货币方向,
        基础货币数量,
        滑点损失_usdt: 0, // 需要通过价格API计算
        交易哈希: 交换结果.txHash
      });

      // 🔧 实时更新基础货币成本统计
      this.更新基础货币成本统计(实例ID);
      
      // 实时盈亏计算
      this.计算实时盈亏(实例ID);
      this.保存数据();
      
      console.log(`[PLUGIN] 记录实例 ${实例ID} 的代币交换：${fromSymbol} → ${toSymbol}，涉及基础货币：${涉及基础货币}`);
      if (涉及基础货币) {
        console.log(`[PLUGIN] 基础货币${基础货币方向}：${基础货币数量} ${基础货币符号}`);
      }
    }
  }

  /**
   * 🔧 新增：更新基础货币成本统计（基于实际交易历史）
   */
  private 更新基础货币成本统计(实例ID: string): void {
    const 数据 = this.统计数据.get(实例ID);
    if (!数据) return;

    // 🎯 只统计实际花费的基础货币（卖出基础货币的交易）
    const 基础货币支出记录 = 数据.交换历史.filter(交换 => 
      交换.是否涉及基础货币 && 交换.基础货币方向 === '卖出基础货币'
    );

    // 计算累计基础货币支出
    const 累计基础货币支出 = 基础货币支出记录.reduce((总计, 交换) => 
      总计 + (交换.基础货币数量 || 0), 0
    );

    console.log(`[PLUGIN] 实例 ${实例ID} 累计基础货币支出：${累计基础货币支出.toFixed(6)} ${数据.基础货币信息.当前基础货币}`);
    
    // 暂存到数据中，头寸创建时使用
    (数据 as any)._累计基础货币支出 = 累计基础货币支出;
  }

  /**
   * 🏗️ 处理头寸创建事件 - 使用策略API实际返回数据
   */
  async 处理头寸创建(data: any): Promise<void> {
    try {
      console.log(`[盈亏统计] 🔍 处理头寸创建事件`);
      
      // 提取关键数据
      const tokenId = data.tokenId;
      const poolConfig = data.poolConfig;
      const strategyApiResult = data.strategyApiResult; // 完整的策略API返回结果
      
      if (!tokenId || !poolConfig || !strategyApiResult) {
        console.log(`[盈亏统计] ⚠️ 缺少必要数据，跳过处理`);
        return;
      }
      
      console.log(`[盈亏统计] 📊 处理TokenID: ${tokenId}`);
      
      // 🔴 关键修改：优先使用实际投入数量
      let actualAmount0: string;
      let actualAmount1: string;
      
      // 🔴 修改：只使用实际投入数量，删除不准确的备用计算
      if (strategyApiResult.calculatedParams?.actualAmounts) {
        // 使用从mint交易事件解析的实际数量
        actualAmount0 = strategyApiResult.calculatedParams.actualAmounts.amount0;
        actualAmount1 = strategyApiResult.calculatedParams.actualAmounts.amount1;
        console.log(`[盈亏统计] ✅ 使用实际投入数量（区块链事件数据）:`);
        console.log(`[盈亏统计]    实际Amount0: ${ethers.formatUnits(actualAmount0, 18)}`);
        console.log(`[盈亏统计]    实际Amount1: ${ethers.formatUnits(actualAmount1, 18)}`);
      } else {
        // 🔴 修改：没有实际数据就直接失败，不使用不准确的理论计算
        console.log(`[盈亏统计] ❌ 无法获取实际投入数量数据，解析失败`);
        console.log(`[盈亏统计] 💡 请确保LiquidityManager的增强版方法2正确解析了Pool Mint事件`);
        return;
      }
      
      // 确定当前基础货币
      const baseCurrency = await this.确定当前基础货币();
      console.log(`[盈亏统计] 💰 当前基础货币: ${baseCurrency}`);
      
      // 解析代币地址
      const token0Address = poolConfig.token0Address.toLowerCase();
      const token1Address = poolConfig.token1Address.toLowerCase();
      
      // 基础货币地址映射
      const baseCurrencyAddresses: { [key: string]: string } = {
        'USDT': '0x55d398326f99059ff775485246999027b3197955',
        'USDC': '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
        'WBNB': '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c'
      };
      
      const baseCurrencyAddress = baseCurrencyAddresses[baseCurrency]?.toLowerCase();
      if (!baseCurrencyAddress) {
        console.log(`[盈亏统计] ❌ 未支持的基础货币: ${baseCurrency}`);
        return;
      }
      
      // 识别场景类型
      let scenario: 'scenario1' | 'scenario2';
      let baseCurrencyDirectInvestment = 0; // 直接投入的基础货币数量
      let nonBaseCurrencyPurchaseCost = 0;   // 购买非基础货币的成本
      
      if (token0Address === baseCurrencyAddress) {
        // Scenario 2: token0是基础货币
        scenario = 'scenario2';
        baseCurrencyDirectInvestment = parseFloat(ethers.formatUnits(actualAmount0, 18));
        // token1购买成本从OKX交易记录获取
        console.log(`[盈亏统计] 📍 场景2: Token0(${baseCurrency})直接投入 + Token1购买`);
      } else if (token1Address === baseCurrencyAddress) {
        // Scenario 2: token1是基础货币
        scenario = 'scenario2';
        baseCurrencyDirectInvestment = parseFloat(ethers.formatUnits(actualAmount1, 18));
        // token0购买成本从OKX交易记录获取
        console.log(`[盈亏统计] 📍 场景2: Token1(${baseCurrency})直接投入 + Token0购买`);
      } else {
        // Scenario 1: 两个代币都不是基础货币
        scenario = 'scenario1';
        console.log(`[盈亏统计] 📍 场景1: 两个代币都需要购买`);
      }
      
      // 获取OKX交易成本数据
      const okxCosts = await this.获取OKX交易成本(baseCurrency);
      
      // 计算总成本
      let totalCost: number;
      
      if (scenario === 'scenario1') {
        // 场景1: 全部通过OKX购买
        totalCost = okxCosts.totalCost;
        console.log(`[盈亏统计] 💸 场景1总成本: ${totalCost} ${baseCurrency} (全部OKX购买)`);
        
        // 🔧 修复：设置详细的token成本分解
        if (okxCosts.breakdown.length >= 2) {
          const token0购买成本 = okxCosts.breakdown.find(交易 => 
            交易.toToken === 'WBNB' || 交易.toToken.toLowerCase().includes('wbnb')
          )?.cost || 0;
          const token1购买成本 = okxCosts.breakdown.find(交易 => 
            交易.toToken === 'PORT3' || 交易.toToken.toLowerCase().includes('port3')
          )?.cost || 0;
          
          console.log(`[盈亏统计] 📊 场景1成本明细: Token0=${token0购买成本}, Token1=${token1购买成本}`);
        }
      } else {
        // 场景2: OKX购买 + 直接投入基础货币
        totalCost = okxCosts.totalCost + baseCurrencyDirectInvestment;
        console.log(`[盈亏统计] 💸 场景2总成本: ${totalCost} ${baseCurrency}`);
        console.log(`[盈亏统计]    OKX购买成本: ${okxCosts.totalCost} ${baseCurrency}`);
        console.log(`[盈亏统计]    直接投入: ${baseCurrencyDirectInvestment} ${baseCurrency}`);
      }
      
      // 保存头寸数据并触发成本重新计算
      
      // 🔧 立即触发成本重新计算以确保所有交换记录被处理
      console.log(`[盈亏统计] 🔄 触发成本重新计算以处理所有交换记录...`);
      setTimeout(async () => {
        await this.重新计算所有运行中实例的成本();
        this.保存数据();
      }, 1000); // 延迟1秒确保所有交换事件都已处理
      const positionData = {
        tokenId,
        poolConfig,
        actualAmount0,
        actualAmount1,
        baseCurrency,
        scenario,
        costs: {
          totalCost,
          okxCost: okxCosts.totalCost,
          directInvestment: baseCurrencyDirectInvestment,
          breakdown: okxCosts.breakdown
        },
        timestamp: Date.now(),
        status: 'active'
      };
      
      // 使用实际投入数量更新统计数据
      await this.更新统计数据(baseCurrency, 'position_created', {
        cost: totalCost,
        actualAmounts: {
          amount0: actualAmount0,
          amount1: actualAmount1
        },
        scenario,
        tokenId
      });
      
      console.log(`[盈亏统计] ✅ 头寸创建处理完成`);
      console.log(`[盈亏统计] 📋 保存的数据:`, {
        tokenId,
        baseCurrency,
        scenario,
        totalCost: `${totalCost} ${baseCurrency}`,
        actualInvestment: {
          amount0: ethers.formatUnits(actualAmount0, 18),
          amount1: ethers.formatUnits(actualAmount1, 18)
        }
      });
      
    } catch (error) {
      console.error(`[盈亏统计] ❌ 处理头寸创建失败:`, error);
    }
  }

  /**
   * 🏁 处理策略结束事件
   */
  处理策略结束(事件数据: any): void {
    if (!this.是否启用) return;

    const { 实例ID, 退出原因 } = 事件数据;
    const 数据 = this.统计数据.get(实例ID);
    
    if (数据) {
      数据.结束时间 = Date.now();
      数据.状态 = 退出原因?.includes('超时') ? '已退出' : '已完成';
      
      // 最终盈亏计算
      this.计算最终盈亏(实例ID);
      this.保存数据();
      
      console.log(`[PLUGIN] 完成实例 ${实例ID} 的盈亏统计，状态：${数据.状态}`);
    }
  }

  /**
   * 📈 计算实时盈亏 - 关键修改
   */
  private 计算实时盈亏(实例ID: string): void {
    const 数据 = this.统计数据.get(实例ID);
    if (!数据) return;

    try {
      // 🔧 基础货币标准的盈亏计算
      let 总投入成本_基础货币 = 0;
      
      if (数据.计算场景 === '场景1_双非基础货币') {
        // 场景1：使用购买两个代币的总成本
        总投入成本_基础货币 = 数据.初始投入.场景1_成本.总购买成本_基础货币;
      } else if (数据.计算场景 === '场景2_包含基础货币') {
        // 场景2：使用购买非基础货币成本 + 直接投入基础货币
        总投入成本_基础货币 = 数据.初始投入.场景2_成本.总成本_基础货币;
      }

      // 🔧 更新基础货币盈亏统计
      数据.盈亏统计.基础货币盈亏.总投入成本_基础货币 = 总投入成本_基础货币;
      
      // 🔧 修复：根据实例状态和交换历史计算当前价值
      let 当前价值_基础货币 = 0;
      
      if (数据.状态 === '运行中') {
        // 运行中：使用当前资产价值
        当前价值_基础货币 = 数据.当前资产.总价值_usdt;
      } else {
        // 已完成/已退出：从交换历史计算实际获得的基础货币总量
        当前价值_基础货币 = this.计算交换历史中的基础货币总获得量(数据);
      }
      
      数据.盈亏统计.基础货币盈亏.当前价值_基础货币 = 当前价值_基础货币;
      
      if (总投入成本_基础货币 > 0) {
        数据.盈亏统计.基础货币盈亏.绝对盈亏_基础货币 = 
          数据.盈亏统计.基础货币盈亏.当前价值_基础货币 - 总投入成本_基础货币;
          
        数据.盈亏统计.基础货币盈亏.相对盈亏_percent = 
          (数据.盈亏统计.基础货币盈亏.绝对盈亏_基础货币 / 总投入成本_基础货币) * 100;
          
        数据.盈亏统计.基础货币盈亏.净盈亏_基础货币 = 
          数据.盈亏统计.基础货币盈亏.绝对盈亏_基础货币 + 
          数据.盈亏统计.手续费收益_usdt - 数据.盈亏统计.交换成本_usdt;
          
        数据.盈亏统计.基础货币盈亏.投资回报率_percent = 
          (数据.盈亏统计.基础货币盈亏.净盈亏_基础货币 / 总投入成本_基础货币) * 100;
      }

      console.log(`[PLUGIN] 实例 ${实例ID} 实时盈亏更新：总成本 ${总投入成本_基础货币.toFixed(4)} ${数据.基础货币信息.当前基础货币}，当前价值 ${当前价值_基础货币.toFixed(4)} ${数据.基础货币信息.当前基础货币}，净盈亏 ${数据.盈亏统计.基础货币盈亏.净盈亏_基础货币.toFixed(4)} ${数据.基础货币信息.当前基础货币}`);
      
    } catch (error) {
      console.error(`[PLUGIN] 实例 ${实例ID} 盈亏计算错误:`, error);
    }
  }

  /**
   * 🔧 新增：计算交换历史中的基础货币总获得量
   * 用于已完成实例的当前价值计算
   */
  private 计算交换历史中的基础货币总获得量(数据: ProfitLossData): number {
    const 基础货币 = 数据.基础货币信息.当前基础货币;
    let 总获得量 = 0;
    
    // 遍历交换历史，统计所有获得基础货币的交易
    for (const 交换 of 数据.交换历史) {
      if (交换.是否涉及基础货币 && 交换.基础货币方向 === '获得基础货币') {
        总获得量 += 交换.基础货币数量 || 0;
      } else if (交换.是否涉及基础货币 && 交换.基础货币方向 === '买入基础货币') {
        // OKX卖出获得基础货币的情况
        总获得量 += 交换.基础货币数量 || 0;
      } else if (交换.to_token === 基础货币) {
        // 直接转换到基础货币的情况
        总获得量 += 交换.to_amount;
      }
    }
    
    console.log(`[PLUGIN] 实例 ${数据.实例ID} 从交换历史计算总获得量: ${总获得量.toFixed(6)} ${基础货币}`);
    return 总获得量;
  }

  /**
   * 💰 计算资产价值
   */
  private async 计算资产价值(数据: ProfitLossData): Promise<void> {
    // 这里需要集成价格API来计算USDT价值
    // 暂时使用示例值
    console.log(`[PLUGIN] 计算资产价值：${数据.实例ID}`);
  }

  /**
   * 🏆 计算最终盈亏
   */
  private 计算最终盈亏(实例ID: string): void {
    this.计算实时盈亏(实例ID);
    console.log(`[PLUGIN] 最终盈亏计算完成：${实例ID}`);
  }

  /**
   * 📊 获取实例统计数据
   */
  获取实例统计(实例ID: string): ProfitLossData | undefined {
    return this.统计数据.get(实例ID);
  }

  /**
   * 📋 获取所有统计数据
   */
  获取所有统计(): ProfitLossData[] {
    return Array.from(this.统计数据.values());
  }

  /**
   * 🎯 获取运行中的实例统计
   */
  获取运行中统计(): ProfitLossData[] {
    return this.获取所有统计().filter(data => data.状态 === '运行中');
  }

  /**
   * ✅ 获取已完成的实例统计
   */
  获取已完成统计(): ProfitLossData[] {
    return this.获取所有统计().filter(data => data.状态 === '已完成');
  }

  /**
   * 🗑️ 删除指定实例的统计数据
   */
  删除实例统计(实例ID: string): boolean {
    const 数据 = this.统计数据.get(实例ID);
    
    if (数据) {
      // 🔧 清理TokenID映射
      if (数据.头寸信息?.tokenId) {
        this.tokenId映射.delete(数据.头寸信息.tokenId);
        console.log(`[PLUGIN] 清理TokenID映射: ${数据.头寸信息.tokenId}`);
      }
      
      const 删除成功 = this.统计数据.delete(实例ID);
      if (删除成功) {
        this.保存数据();
        console.log(`[PLUGIN] 删除实例统计: ${实例ID}`);
      }
      return 删除成功;
    }
    return false;
  }

  /**
   * 🔄 更新实例状态
   */
  更新实例状态(实例ID: string, 状态: '运行中' | '已完成' | '已退出'): void {
    const 数据 = this.统计数据.get(实例ID);
    if (数据) {
      数据.状态 = 状态;
      if (状态 !== '运行中' && !数据.结束时间) {
        数据.结束时间 = Date.now();
        this.计算生命周期统计(实例ID);
      }
      this.保存数据();
    }
  }

  /**
   * 🔄 计算生命周期统计
   */
  private 计算生命周期统计(实例ID: string): void {
    const 数据 = this.统计数据.get(实例ID);
    if (!数据) return;

    const 当前时间 = Date.now();
    const 持续时间_毫秒 = (数据.结束时间 || 当前时间) - 数据.开始时间;
    const 持续时间_小时 = 持续时间_毫秒 / (1000 * 60 * 60);
    const 运行天数 = 持续时间_小时 / 24;

    // 更新启动成本
    数据.生命周期统计.启动成本.初始投入_usdt = 数据.初始投入.总价值_usdt;

    // 更新运行收益
    数据.生命周期统计.运行收益.手续费收入_usdt = 数据.盈亏统计.手续费收益_usdt;
    数据.生命周期统计.运行收益.LP价值变化_usdt = 数据.盈亏统计.绝对盈亏_usdt;
    数据.生命周期统计.运行收益.累计交换损失_usdt = 数据.盈亏统计.交换成本_usdt;
    数据.生命周期统计.运行收益.运行天数 = 运行天数;

    // 如果实例已结束，计算关闭结算
    if (数据.状态 !== '运行中') {
      数据.生命周期统计.关闭结算 = {
        最终提取_usdt: 数据.当前资产.总价值_usdt,
        关闭Gas费用_usdt: 0, // 需要从交易记录中计算
        滑点损失_usdt: 数据.交换历史.reduce((sum, tx) => sum + tx.滑点损失_usdt, 0),
        时间戳: 数据.结束时间 || 当前时间
      };
    }

    // 计算生命周期汇总
    const 总投入成本 = 数据.生命周期统计.启动成本.初始投入_usdt + 数据.生命周期统计.启动成本.Gas费用_usdt;
    const 总收益 = 数据.生命周期统计.运行收益.手续费收入_usdt + 数据.生命周期统计.运行收益.LP价值变化_usdt;
    const 总成本 = 数据.生命周期统计.启动成本.Gas费用_usdt + 
                   数据.生命周期统计.运行收益.累计交换损失_usdt + 
                   (数据.生命周期统计.关闭结算?.关闭Gas费用_usdt || 0);
    const 净盈亏 = 总收益 - 总成本;

    数据.生命周期统计.生命周期汇总 = {
      总投入成本_usdt: 总投入成本,
      总收益_usdt: 总收益,
      总成本_usdt: 总成本,
      净盈亏_usdt: 净盈亏,
      持续时间_小时: 持续时间_小时,
      年化收益率_percent: 总投入成本 > 0 && 持续时间_小时 > 0 ? 
        (净盈亏 / 总投入成本) * (365 * 24 / 持续时间_小时) * 100 : 0,
      投资回报率_percent: 总投入成本 > 0 ? (净盈亏 / 总投入成本) * 100 : 0
    };

    console.log(`[PLUGIN] 生命周期统计完成：${实例ID}，净盈亏：${净盈亏.toFixed(2)} USDT`);
  }

  /**
   * 📊 获取实例生命周期报告
   */
  获取生命周期报告(实例ID: string): InstanceLifecycleStats | undefined {
    const 数据 = this.统计数据.get(实例ID);
    if (!数据) return undefined;

    // 实时更新生命周期统计
    this.计算生命周期统计(实例ID);
    return 数据.生命周期统计;
  }

  /**
   * 📈 获取所有实例的生命周期汇总
   */
  获取所有生命周期汇总(): {
    实例数量: number;
    平均持续时间_小时: number;
    总投入_usdt: number;
    总净盈亏_usdt: number;
    平均年化收益率_percent: number;
    成功实例数: number;
    失败实例数: number;
  } {
    const 所有实例 = this.获取所有统计();
    const 已完成实例 = 所有实例.filter(data => data.状态 !== '运行中');

    if (已完成实例.length === 0) {
      return {
        实例数量: 0,
        平均持续时间_小时: 0,
        总投入_usdt: 0,
        总净盈亏_usdt: 0,
        平均年化收益率_percent: 0,
        成功实例数: 0,
        失败实例数: 0
      };
    }

    const 总投入 = 已完成实例.reduce((sum, data) => sum + data.生命周期统计.生命周期汇总.总投入成本_usdt, 0);
    const 总净盈亏 = 已完成实例.reduce((sum, data) => sum + data.生命周期统计.生命周期汇总.净盈亏_usdt, 0);
    const 总持续时间 = 已完成实例.reduce((sum, data) => sum + data.生命周期统计.生命周期汇总.持续时间_小时, 0);
    const 平均年化收益率 = 已完成实例.reduce((sum, data) => sum + data.生命周期统计.生命周期汇总.年化收益率_percent, 0) / 已完成实例.length;
    const 成功实例数 = 已完成实例.filter(data => data.生命周期统计.生命周期汇总.净盈亏_usdt > 0).length;

    return {
      实例数量: 已完成实例.length,
      平均持续时间_小时: 总持续时间 / 已完成实例.length,
      总投入_usdt: 总投入,
      总净盈亏_usdt: 总净盈亏,
      平均年化收益率_percent: 平均年化收益率,
      成功实例数: 成功实例数,
      失败实例数: 已完成实例.length - 成功实例数
    };
  }

  /**
   * 💰 确定当前基础货币
   * 基于钱包余额动态选择最大的基础货币作为基准
   */
  private async 确定当前基础货币(): Promise<string> {
    try {
      // 模拟获取钱包余额，选择最大的作为基础货币
      // 这里可以对接实际的钱包服务
      const balances = {
        'USDT': 1000,  // 示例余额
        'USDC': 800,
        'WBNB': 500
      };
      
      // 找到余额最大的基础货币
      let maxBalance = 0;
      let baseCurrency = 'USDT'; // 默认
      
      for (const [currency, balance] of Object.entries(balances)) {
        if (balance > maxBalance) {
          maxBalance = balance;
          baseCurrency = currency;
        }
      }
      
      return baseCurrency;
    } catch (error) {
      console.error(`[盈亏统计] 确定基础货币失败:`, error);
      return 'USDT'; // 默认返回USDT
    }
  }

  /**
   * 📊 获取OKX交易成本
   * 从实际交易历史中汇总基础货币支出
   */
  private async 获取OKX交易成本(baseCurrency: string): Promise<{
    totalCost: number;
    breakdown: Array<{
      fromToken: string;
      toToken: string;
      fromAmount: number;
      toAmount: number;
      cost: number;
    }>;
  }> {
    try {
      // 🔧 修复：从最新运行中实例的实际交易历史中获取OKX成本
      const 运行中实例 = this.获取运行中统计();
      if (运行中实例.length === 0) {
        console.log(`[盈亏统计] ⚠️ 没有运行中的实例，无法获取OKX成本`);
        return { totalCost: 0, breakdown: [] };
      }
      
      // 获取最新的实例（简化处理）
      const 最新实例 = 运行中实例[运行中实例.length - 1];
      const 基础货币支出交易 = 最新实例.交换历史.filter(交换 => 
        交换.是否涉及基础货币 && 
        交换.基础货币方向 === '卖出基础货币' &&
        交换.from_token === baseCurrency
      );
      
      console.log(`[盈亏统计] 📊 从实例 ${最新实例.实例ID} 的交易历史获取OKX成本`);
      console.log(`[盈亏统计] 📊 找到 ${基础货币支出交易.length} 笔基础货币支出交易`);
      
      const breakdown = 基础货币支出交易.map(交换 => ({
        fromToken: 交换.from_token,
        toToken: 交换.to_token,
        fromAmount: 交换.from_amount,
        toAmount: 交换.to_amount,
        cost: 交换.基础货币数量 || 交换.from_amount
      }));
      
      const totalCost = breakdown.reduce((总计, 交易) => 总计 + 交易.cost, 0);
      
      console.log(`[盈亏统计] 💰 计算出的总OKX成本: ${totalCost} ${baseCurrency}`);
      breakdown.forEach((交易, index) => {
        console.log(`[盈亏统计]    交易${index + 1}: ${交易.fromToken} -> ${交易.toToken}, 成本: ${交易.cost}`);
      });
      
      return {
        totalCost,
        breakdown
      };
    } catch (error) {
      console.error(`[盈亏统计] 获取OKX交易成本失败:`, error);
      return {
        totalCost: 0,
        breakdown: []
      };
    }
  }

  /**
   * 📈 更新统计数据
   */
  private async 更新统计数据(baseCurrency: string, eventType: string, data: any): Promise<void> {
    try {
      console.log(`[盈亏统计] 更新统计数据: ${baseCurrency}, 事件: ${eventType}`);
      
      // 🔧 修复：根据事件类型执行具体的更新逻辑
      if (eventType === 'position_created') {
        const { cost, actualAmounts, scenario, tokenId } = data;
        
        // 🔧 查找相关实例ID（通过tokenId或其他方式）
        // 由于当前没有实例ID，我们需要从现有运行中的实例中推断
        const 运行中实例 = this.获取运行中统计();
        if (运行中实例.length === 0) {
          console.log(`[盈亏统计] ⚠️ 没有找到运行中的实例`);
          return;
        }
        
        // 找到最新的实例（简化处理，实际应该通过tokenId匹配）
        const 目标实例 = 运行中实例[运行中实例.length - 1];
        const 实例ID = 目标实例.实例ID;
        const 实例数据 = this.统计数据.get(实例ID);
        
        if (实例数据) {
          console.log(`[盈亏统计] 🎯 更新实例 ${实例ID} 的成本数据`);
          
          // 更新基础货币信息
          实例数据.基础货币信息.当前基础货币 = baseCurrency;
          实例数据.基础货币信息.最后更新时间 = Date.now();
          
          // 🔧 根据场景更新成本信息
          if (scenario === 'scenario1') {
            实例数据.计算场景 = '场景1_双非基础货币';
            实例数据.初始投入.场景1_成本.总购买成本_基础货币 = cost;
            console.log(`[盈亏统计] ✅ 场景1成本更新: ${cost} ${baseCurrency}`);
          } else if (scenario === 'scenario2') {
            实例数据.计算场景 = '场景2_包含基础货币';
            实例数据.初始投入.场景2_成本.总成本_基础货币 = cost;
            console.log(`[盈亏统计] ✅ 场景2成本更新: ${cost} ${baseCurrency}`);
          }
          
          // 更新头寸信息
          实例数据.头寸信息 = {
            tokenId: tokenId,
            创建时间: Date.now(),
            状态: '运行中',
            token0: '',
            token1: '',
            投入数量: {
              token0: actualAmounts ? parseFloat(ethers.formatUnits(actualAmounts.amount0, 18)) : 0,
              token1: actualAmounts ? parseFloat(ethers.formatUnits(actualAmounts.amount1, 18)) : 0
            }
          };
          
          // 🔧 建立TokenID映射
          this.tokenId映射.set(tokenId, 实例ID);
          console.log(`[盈亏统计] 🔗 建立TokenID映射: ${tokenId} → ${实例ID}`);
          
          // 重新计算盈亏统计
          this.计算实时盈亏(实例ID);
          
          console.log(`[盈亏统计] 🎉 实例 ${实例ID} 成本数据更新完成`);
        }
      }
      
      // 🔧 新增：基于现有交易历史的成本重新计算
      // 这是关键修复：即使头寸创建事件没有正确触发，也能基于交易历史计算成本
      await this.重新计算所有运行中实例的成本();
      
      await this.保存数据();
    } catch (error) {
      console.error(`[盈亏统计] 更新统计数据失败:`, error);
    }
  }

  /**
   * 🔧 新增：重新计算所有运行中实例的成本
   * 基于已有的交易历史重新计算投入成本
   */
  private async 重新计算所有运行中实例的成本(): Promise<void> {
    const 运行中实例 = this.获取运行中统计();
    
    for (const 实例 of 运行中实例) {
      if (实例.计算场景 === '未确定' && 实例.交换历史.length > 0) {
        console.log(`[盈亏统计] 🔄 重新计算实例 ${实例.实例ID} 的成本`);
        await this.基于交易历史计算成本(实例.实例ID);
      }
    }
  }

  /**
   * 🔧 新增：基于交易历史计算投入成本
   */
  private async 基于交易历史计算成本(实例ID: string): Promise<void> {
    const 实例数据 = this.统计数据.get(实例ID);
    if (!实例数据) return;

    const 基础货币 = 实例数据.基础货币信息.当前基础货币;
    const 基础货币支出交易 = 实例数据.交换历史.filter(交换 => 
      交换.是否涉及基础货币 && 交换.基础货币方向 === '卖出基础货币'
    );

    if (基础货币支出交易.length === 0) {
      console.log(`[盈亏统计] ⚠️ 实例 ${实例ID} 没有基础货币支出记录`);
      return;
    }

    // 计算总投入成本
    const 总投入成本 = 基础货币支出交易.reduce((总计, 交换) => 
      总计 + (交换.基础货币数量 || 0), 0
    );

    console.log(`[盈亏统计] 💰 实例 ${实例ID} 基于交易历史计算的总投入: ${总投入成本} ${基础货币}`);

    // 🔧 分析交易确定场景
    const 购买的代币集合 = new Set(基础货币支出交易.map(t => t.to_token));
    const 购买的代币 = Array.from(购买的代币集合);
    
    // 假设场景判断逻辑（简化版）
    if (购买的代币.length >= 2) {
      // 购买了多种代币，可能是场景1
      实例数据.计算场景 = '场景1_双非基础货币';
      实例数据.初始投入.场景1_成本.总购买成本_基础货币 = 总投入成本;
      
      // 计算每个代币的购买成本
      console.log(`[盈亏统计] 🔍 场景1成本计算调试信息:`);
      console.log(`[盈亏统计]    购买的代币: [${购买的代币.join(', ')}]`);
      console.log(`[盈亏统计]    基础货币支出交易数量: ${基础货币支出交易.length}`);
      基础货币支出交易.forEach((交易, index) => {
        console.log(`[盈亏统计]    交易${index}: ${交易.from_token} -> ${交易.to_token}, 基础货币数量: ${交易.基础货币数量}`);
      });

      const token0成本 = 基础货币支出交易
        .filter(t => t.to_token === 购买的代币[0])
        .reduce((sum, t) => sum + (t.基础货币数量 || 0), 0);
      const token1成本 = 基础货币支出交易
        .filter(t => t.to_token === 购买的代币[1])
        .reduce((sum, t) => sum + (t.基础货币数量 || 0), 0);
        
      console.log(`[盈亏统计] 🔍 成本计算结果:`);
      console.log(`[盈亏统计]    ${购买的代币[0]}成本: ${token0成本} ${基础货币}`);
      console.log(`[盈亏统计]    ${购买的代币[1]}成本: ${token1成本} ${基础货币}`);
      console.log(`[盈亏统计]    总成本: ${总投入成本} ${基础货币}`);
        
      实例数据.初始投入.场景1_成本.token0购买成本_基础货币 = token0成本;
      实例数据.初始投入.场景1_成本.token1购买成本_基础货币 = token1成本;
      
      console.log(`[盈亏统计] 📊 场景1成本分解: ${购买的代币[0]}=${token0成本}, ${购买的代币[1]}=${token1成本}`);
    } else {
      // 只购买了一种代币，可能是场景2
      实例数据.计算场景 = '场景2_包含基础货币';
      实例数据.初始投入.场景2_成本.非基础货币购买成本_基础货币 = 总投入成本;
      实例数据.初始投入.场景2_成本.总成本_基础货币 = 总投入成本; // 简化处理，假设没有直接投入
      
      console.log(`[盈亏统计] 📊 场景2成本: 购买${购买的代币[0]}=${总投入成本} ${基础货币}`);
    }

    // 重新计算盈亏
    this.计算实时盈亏(实例ID);
    
    console.log(`[盈亏统计] ✅ 实例 ${实例ID} 成本重新计算完成`);
  }

  /**
   * 🏁 处理头寸关闭事件
   * 解析流动性关闭后返回的基础货币数量
   */
  async 处理头寸关闭(data: any): Promise<void> {
    try {
      console.log(`[盈亏统计] 🔍 处理头寸关闭事件`);
      
      const { 实例ID, tokenId, 关闭结果, 最终代币余额 } = data;
      
      // 🔧 优先使用传入的实例ID，如果没有则通过tokenId查找
      let 目标实例ID = 实例ID;
      
      if (!目标实例ID && tokenId) {
        目标实例ID = this.tokenId映射.get(tokenId);
        console.log(`[盈亏统计] 🔍 通过TokenID ${tokenId} 查找到实例ID: ${目标实例ID}`);
      }
      
      if (!目标实例ID) {
        console.log(`[盈亏统计] ⚠️ 无法确定实例ID，tokenId: ${tokenId}，跳过处理`);
        console.log(`[盈亏统计] 📋 当前TokenID映射:`, Array.from(this.tokenId映射.entries()));
        return;
      }
      
      const 数据 = this.统计数据.get(目标实例ID);
      
      if (!数据) {
        console.log(`[盈亏统计] ⚠️ 找不到实例 ${目标实例ID} 的数据，跳过处理`);
        return;
      }
      
      console.log(`[盈亏统计] 📊 处理TokenID: ${tokenId}，实例: ${目标实例ID}`);
      
      // 更新头寸状态
      if (数据.头寸信息) {
        数据.头寸信息.状态 = '已关闭';
        数据.头寸信息.关闭时间 = Date.now();
      }
      
      const 当前基础货币 = 数据.基础货币信息.当前基础货币;
      const 场景 = 数据.计算场景;
      console.log(`[盈亏统计] 💰 当前基础货币: ${当前基础货币}`);
      console.log(`[盈亏统计] 🎯 计算场景: ${场景}`);
      
      // 🔧 重新解析代币返回数据 - 使用策略配置的基础货币而不是硬编码
      let 流动性关闭获得基础货币 = 0;
      let 流动性关闭获得非基础货币 = 0;
      let 非基础货币符号 = '';
      let token0数量 = 0;
      let token1数量 = 0;
      let token0符号 = '';
      let token1符号 = '';
      
      if (关闭结果?.result?.tokenReturns) {
        const tokenReturns = 关闭结果.result.tokenReturns;
        
        token0数量 = parseFloat(ethers.formatUnits(tokenReturns.token0Amount, 18));
        token1数量 = parseFloat(ethers.formatUnits(tokenReturns.token1Amount, 18));
        token0符号 = tokenReturns.token0Symbol;
        token1符号 = tokenReturns.token1Symbol;
        
        console.log(`[盈亏统计] 🔍 解析头寸关闭返回:`, {
          token0: `${token0符号}: ${token0数量}`,
          token1: `${token1符号}: ${token1数量}`,
          当前基础货币: 当前基础货币
        });
        
        // 🎯 关键修复：根据策略配置的基础货币识别，而不是PositionManager的硬编码
        if (场景 === '场景1_双非基础货币') {
          // 场景1：两个代币都不是基础货币，都需要通过OKX卖出
          console.log(`[盈亏统计] 🔄 场景1处理 - 两个代币都将通过OKX卖出为${当前基础货币}`);
          console.log(`[盈亏统计]    ${token0符号}: ${token0数量} (将卖出)`);
          console.log(`[盈亏统计]    ${token1符号}: ${token1数量} (将卖出)`);
          
          // 场景1中，流动性关闭不直接获得基础货币，需要等待OKX卖出
          流动性关闭获得基础货币 = 0;
          
        } else if (场景 === '场景2_包含基础货币') {
          // 场景2：其中一个代币是基础货币
          if (token0符号 === 当前基础货币) {
            流动性关闭获得基础货币 = token0数量;
            流动性关闭获得非基础货币 = token1数量;
            非基础货币符号 = token1符号;
          } else if (token1符号 === 当前基础货币) {
            流动性关闭获得基础货币 = token1数量;
            流动性关闭获得非基础货币 = token0数量;
            非基础货币符号 = token0符号;
          } else {
            console.log(`[盈亏统计] ⚠️ 场景2但未发现基础货币${当前基础货币}，可能场景识别错误`);
          }
          
          console.log(`[盈亏统计] 🔄 场景2处理:`);
          console.log(`[盈亏统计]    直接获得基础货币: ${流动性关闭获得基础货币} ${当前基础货币}`);
          console.log(`[盈亏统计]    待卖出非基础货币: ${流动性关闭获得非基础货币} ${非基础货币符号}`);
        }
      } else {
        console.log(`[盈亏统计] ⚠️ 关闭结果中没有tokenReturns数据，尝试从最终代币余额解析`);
        
        // 备选方案：从最终代币余额中解析
        if (最终代币余额) {
          console.log(`[盈亏统计] 📋 最终代币余额:`, 最终代币余额);
        }
      }
      
      // 🔧 记录头寸关闭到交换历史
      数据.交换历史.push({
        时间: Date.now(),
        类型: '头寸关闭',
        from_token: 'LP_POSITION',
        to_token: token0符号 && token1符号 ? `${token0符号}+${token1符号}` : '未知',
        from_amount: 0, // LP头寸没有直接的数量概念
        to_amount: 场景 === '场景2_包含基础货币' ? 流动性关闭获得基础货币 : 0,
        是否涉及基础货币: 场景 === '场景2_包含基础货币',
        基础货币方向: 场景 === '场景2_包含基础货币' ? '获得基础货币' : undefined,
        基础货币数量: 场景 === '场景2_包含基础货币' ? 流动性关闭获得基础货币 : 0,
        滑点损失_usdt: 0,
        交易哈希: 关闭结果?.result?.transactionHash || 'N/A'
      } as any);
      
      // 记录所有获得的代币（用于OKX卖出跟踪）
      if (token0数量 > 0) {
        数据.交换历史.push({
          时间: Date.now(),
          类型: 场景 === '场景1_双非基础货币' || (场景 === '场景2_包含基础货币' && token0符号 !== 当前基础货币) ? '待卖出' : '直接获得',
          from_token: 'LP_POSITION',
          to_token: token0符号,
          from_amount: 0,
          to_amount: token0数量,
          是否涉及基础货币: token0符号 === 当前基础货币,
          滑点损失_usdt: 0,
          交易哈希: 关闭结果?.result?.transactionHash || 'N/A'
        } as any);
      }
      
      if (token1数量 > 0) {
        数据.交换历史.push({
          时间: Date.now(),
          类型: 场景 === '场景1_双非基础货币' || (场景 === '场景2_包含基础货币' && token1符号 !== 当前基础货币) ? '待卖出' : '直接获得',
          from_token: 'LP_POSITION',
          to_token: token1符号,
          from_amount: 0,
          to_amount: token1数量,
          是否涉及基础货币: token1符号 === 当前基础货币,
          滑点损失_usdt: 0,
          交易哈希: 关闭结果?.result?.transactionHash || 'N/A'
        } as any);
      }
      
      // 🔧 根据场景更新盈亏统计
      if (场景 === '场景1_双非基础货币') {
        console.log(`[盈亏统计] 📊 场景1处理 - 等待OKX卖出完成后计算最终盈亏`);
        console.log(`[盈亏统计]    总投入成本: ${数据.初始投入.场景1_成本.总购买成本_基础货币} ${当前基础货币}`);
        console.log(`[盈亏统计]    待卖出: ${token0数量} ${token0符号} + ${token1数量} ${token1符号}`);
        
      } else if (场景 === '场景2_包含基础货币') {
        const 总投入成本 = 数据.初始投入.场景2_成本.总成本_基础货币;
        
        // 场景2中期统计：已获得基础货币 + 待卖出非基础货币
        数据.盈亏统计.基础货币盈亏.当前价值_基础货币 = 流动性关闭获得基础货币;
        数据.盈亏统计.基础货币盈亏.绝对盈亏_基础货币 = 流动性关闭获得基础货币 - 总投入成本;
        
        if (总投入成本 > 0) {
          数据.盈亏统计.基础货币盈亏.相对盈亏_percent = 
            (数据.盈亏统计.基础货币盈亏.绝对盈亏_基础货币 / 总投入成本) * 100;
        }
        
        console.log(`[盈亏统计] 📊 场景2中期统计:`);
        console.log(`[盈亏统计]    总投入成本: ${总投入成本} ${当前基础货币}`);
        console.log(`[盈亏统计]    已获得基础货币: ${流动性关闭获得基础货币} ${当前基础货币}`);
        console.log(`[盈亏统计]    待卖出非基础货币: ${流动性关闭获得非基础货币} ${非基础货币符号}`);
        console.log(`[盈亏统计]    暂时盈亏: ${数据.盈亏统计.基础货币盈亏.绝对盈亏_基础货币.toFixed(6)} ${当前基础货币}`);
        console.log(`[盈亏统计]    💡 等待${非基础货币符号}卖出完成以计算最终盈亏`);
      }
      
      // 实时盈亏计算
      this.计算实时盈亏(目标实例ID);
      this.保存数据();
      
      console.log(`[盈亏统计] ✅ 头寸关闭处理完成`);
      console.log(`[盈亏统计] 💡 等待OKX卖出完成以计算最终盈亏`);
      
    } catch (error) {
      console.error(`[盈亏统计] ❌ 处理头寸关闭失败:`, error);
    }
  }

  /**
   * 🔧 新增：处理最终卖出完成事件
   * 计算场景2的最终盈亏
   */
  async 处理最终卖出完成(data: any): Promise<void> {
    try {
      console.log(`[盈亏统计] 🔍 处理最终卖出完成事件`);
      
      const { 实例ID, 卖出结果 } = data;
      const 数据 = this.统计数据.get(实例ID);
      
      if (!数据) return;
      
      const 基础货币 = 数据.基础货币信息.当前基础货币;
      const 场景 = 数据.计算场景;
      
      if (场景 === '场景2_包含基础货币' && 卖出结果?.success) {
        console.log(`[盈亏统计] 🎯 场景2最终盈亏计算`);
        
        // 获取OKX卖出获得的基础货币数量
        let okx卖出获得基础货币 = 0;
        if (卖出结果.toSymbol === 基础货币) {
          okx卖出获得基础货币 = parseFloat(卖出结果.toAmount || '0');
        }
        
        // 计算最终总产出
        const 流动性关闭获得基础货币 = 数据.交换历史
          .filter(交换 => 交换.类型 === '头寸关闭' && 交换.基础货币方向 === '获得基础货币')
          .reduce((总计, 交换) => 总计 + (交换.基础货币数量 || 0), 0);
        
        const 最终总产出 = 流动性关闭获得基础货币 + okx卖出获得基础货币;
        const 总投入成本 = 数据.初始投入.场景2_成本.总成本_基础货币;
        
        // 更新最终盈亏统计
        数据.盈亏统计.基础货币盈亏.当前价值_基础货币 = 最终总产出;
        数据.盈亏统计.基础货币盈亏.绝对盈亏_基础货币 = 最终总产出 - 总投入成本;
        
        if (总投入成本 > 0) {
          数据.盈亏统计.基础货币盈亏.相对盈亏_percent = 
            (数据.盈亏统计.基础货币盈亏.绝对盈亏_基础货币 / 总投入成本) * 100;
          数据.盈亏统计.基础货币盈亏.投资回报率_percent = 
            数据.盈亏统计.基础货币盈亏.相对盈亏_percent;
        }
        
        console.log(`[盈亏统计] 🎉 场景2最终统计完成:`);
        console.log(`[盈亏统计]    总投入成本: ${总投入成本} ${基础货币}`);
        console.log(`[盈亏统计]    流动性关闭获得: ${流动性关闭获得基础货币} ${基础货币}`);
        console.log(`[盈亏统计]    OKX卖出获得: ${okx卖出获得基础货币} ${基础货币}`);
        console.log(`[盈亏统计]    最终总产出: ${最终总产出} ${基础货币}`);
        console.log(`[盈亏统计]    净盈亏: ${数据.盈亏统计.基础货币盈亏.绝对盈亏_基础货币.toFixed(6)} ${基础货币}`);
        console.log(`[盈亏统计]    投资回报率: ${数据.盈亏统计.基础货币盈亏.投资回报率_percent.toFixed(2)}%`);
      }
      
      // 最终盈亏计算
      this.计算最终盈亏(实例ID);
      this.保存数据();
      
    } catch (error) {
      console.error(`[盈亏统计] ❌ 处理最终卖出完成失败:`, error);
    }
  }

  /**
   * 📈 处理头寸创建事件 - 新版本与现有系统整合
   * 监听LiquidityManager触发的position.created事件
   */  
  private async 处理头寸创建事件监听(event: any): Promise<void> {
    // 这个方法留作将来扩展用
    console.log(`[盈亏统计] 收到头寸创建事件:`, event);
  }
  
  /**
   * 🔧 新增：手动触发成本重新计算
   * 用于修复场景识别和成本计算问题
   */
  async 手动重新计算成本(): Promise<void> {
    console.log(`[盈亏统计] 🔧 开始手动重新计算所有实例的成本`);
    
    try {
      await this.重新计算所有运行中实例的成本();
      console.log(`[盈亏统计] ✅ 手动成本重新计算完成`);
    } catch (error) {
      console.error(`[盈亏统计] ❌ 手动成本重新计算失败:`, error);
    }
  }

  /**
   * 🔧 修复重复交易记录问题
   * 清理由于双重事件分发导致的重复交易记录
   */
  修复重复交易记录(): void {
    console.log(`[盈亏统计] 🔧 开始修复重复交易记录`);
    
    let 修复实例数 = 0;
    let 清理记录数 = 0;
    
    for (const [实例ID, 数据] of Array.from(this.统计数据.entries())) {
      const 原始记录数 = 数据.交换历史.length;
      
      // 按交易哈希分组，合并重复记录
      const 交易映射 = new Map<string, any>();
      
      for (const 交换记录 of 数据.交换历史) {
        const 关键字 = `${交换记录.from_token}_${交换记录.to_token}_${交换记录.from_amount}_${交换记录.to_amount}`;
        
        if (!交易映射.has(关键字)) {
          交易映射.set(关键字, 交换记录);
        } else {
          console.log(`[盈亏统计] 🗑️ 发现重复交易: ${交换记录.from_token} → ${交换记录.to_token}, 金额: ${交换记录.from_amount}`);
          清理记录数++;
        }
      }
      
      // 更新去重后的交换历史
      数据.交换历史 = Array.from(交易映射.values());
      
      if (原始记录数 > 数据.交换历史.length) {
        修复实例数++;
        console.log(`[盈亏统计] 🔧 实例 ${实例ID}: ${原始记录数} → ${数据.交换历史.length} 条记录`);
        
        // 重新计算成本
        this.基于交易历史计算成本(实例ID);
        this.计算实时盈亏(实例ID);
      }
    }
    
    this.保存数据();
    
    console.log(`[盈亏统计] ✅ 重复交易记录修复完成:`);
    console.log(`[盈亏统计]    修复实例数: ${修复实例数}`);
    console.log(`[盈亏统计]    清理重复记录数: ${清理记录数}`);
  }

  /**
   * 🔄 定期更新运行中头寸的当前价值
   */
  async 更新运行中头寸价值(): Promise<void> {
    try {
      const 运行中实例 = this.获取运行中统计();
      console.log(`[盈亏统计] 🔄 更新 ${运行中实例.length} 个运行中实例的头寸价值`);
      
      for (const 实例 of 运行中实例) {
        if (实例.头寸信息?.tokenId) {
          try {
            // 这里应该调用实际的LP头寸价值查询API
            // 暂时使用模拟逻辑
            const tokenId = 实例.头寸信息.tokenId;
            console.log(`[盈亏统计] 🔍 更新TokenID ${tokenId} 的当前价值`);
            
            // TODO: 集成实际的LP头寸价值查询
            // const 当前价值 = await this.查询LP头寸价值(tokenId);
            // 实例.当前资产.LP头寸价值_usdt = 当前价值;
            // 实例.盈亏统计.基础货币盈亏.当前价值_基础货币 = 当前价值;
            
            this.计算实时盈亏(实例.实例ID);
          } catch (error) {
            console.error(`[盈亏统计] ❌ 更新实例 ${实例.实例ID} 头寸价值失败:`, error);
          }
        }
      }
      
      this.保存数据();
    } catch (error) {
      console.error(`[盈亏统计] ❌ 更新运行中头寸价值失败:`, error);
    }
  }

  /**
   * 🔍 获取TokenID映射状态（调试用）
   */
  获取TokenID映射(): Array<{ tokenId: number; 实例ID: string }> {
    return Array.from(this.tokenId映射.entries()).map(([tokenId, 实例ID]) => ({
      tokenId,
      实例ID
    }));
  }

  /**
   * 🔍 通过TokenID查找实例ID
   */
  通过TokenID查找实例(tokenId: number): string | undefined {
    return this.tokenId映射.get(tokenId);
  }

  /**
   * 🆕 实例版本化处理
   * 检测实例重新开始并分配版本号
   */
  private 处理实例版本化(原始实例ID: string): {
    基础实例ID: string,
    版本化实例ID: string,
    版本号: number
  } {
    // 移除现有版本后缀（如果有）
    const 基础实例ID = 原始实例ID.replace(/_v\d+$/, '');
    
    // 检查是否已有正在运行的实例
    const 现有实例 = this.统计数据.get(原始实例ID);
    if (现有实例 && 现有实例.状态 === '运行中') {
      // 🔄 检测到重新开始：将现有实例移至历史数据
      console.log(`[PLUGIN] 🔄 实例 ${原始实例ID} 重新开始，归档当前数据`);
             现有实例.状态 = '已退出';
       现有实例.结束时间 = Date.now();
      this.历史数据.set(`${原始实例ID}_interrupted_${Date.now()}`, 现有实例);
      this.统计数据.delete(原始实例ID);
    }
    
    // 获取或更新版本号
    const 当前版本号 = this.实例版本.get(基础实例ID) || 0;
    const 新版本号 = 当前版本号 + 1;
    this.实例版本.set(基础实例ID, 新版本号);
    
    // 生成版本化实例ID
    const 版本化实例ID = 新版本号 === 1 ? 原始实例ID : `${基础实例ID}_v${新版本号}`;
    
    return {
      基础实例ID,
      版本化实例ID,
      版本号: 新版本号
    };
  }

  /**
   * 🆕 记录实例重新开始
   */
  private 记录实例重新开始(基础实例ID: string, 版本化实例ID: string, 版本号: number): void {
    console.log(`[PLUGIN] 📊 实例重新开始记录：${基础实例ID} → ${版本化实例ID} (v${版本号})`);
    
    // 触发重新开始事件（可选）
    this.emit('实例重新开始', {
      基础实例ID,
      版本化实例ID,
      版本号,
      时间戳: Date.now()
    });
  }

  /**
   * 🔧 获取基础货币地址
   */
  private 获取基础货币地址(基础货币: string): string {
    const 地址映射: Record<string, string> = {
      'USDT': '0x55d398326f99059fF775485246999027B3197955',
      'USDC': '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', 
      'WBNB': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
    };
    
    return 地址映射[基础货币] || '';
  }

  /**
   * 🆕 获取累积盈亏统计
   * 计算某个基础实例ID所有版本的累积表现
   */
  获取累积盈亏统计(基础实例ID: string): {
    累积盈亏_基础货币: number,
    累积盈亏_usdt: number,
    累积投资回报率_percent: number,
    总版本数: number,
    活跃版本: string | null,
    历史版本: string[]
  } {
    let 累积盈亏_基础货币 = 0;
    let 累积盈亏_usdt = 0;
    let 总投入成本_基础货币 = 0;
    let 总投入成本_usdt = 0;
    const 历史版本: string[] = [];
    let 活跃版本: string | null = null;

    // 🔍 查找所有相关版本
    // 1. 当前活跃数据
    for (const [实例ID, 数据] of Array.from(this.统计数据.entries())) {
      if (实例ID === 基础实例ID || 实例ID.startsWith(`${基础实例ID}_v`)) {
        if (数据.状态 === '运行中') {
          活跃版本 = 实例ID;
        }
        历史版本.push(实例ID);
        累积盈亏_基础货币 += 数据.盈亏统计.基础货币盈亏.净盈亏_基础货币;
        累积盈亏_usdt += 数据.盈亏统计.净盈亏_usdt;
        总投入成本_基础货币 += 数据.盈亏统计.基础货币盈亏.总投入成本_基础货币;
        总投入成本_usdt += 数据.生命周期统计.生命周期汇总.总投入成本_usdt;
      }
    }

    // 2. 历史归档数据
    for (const [归档ID, 数据] of Array.from(this.历史数据.entries())) {
      if (归档ID.includes(基础实例ID)) {
        历史版本.push(归档ID);
        累积盈亏_基础货币 += 数据.盈亏统计.基础货币盈亏.净盈亏_基础货币;
        累积盈亏_usdt += 数据.盈亏统计.净盈亏_usdt;
        总投入成本_基础货币 += 数据.盈亏统计.基础货币盈亏.总投入成本_基础货币;
        总投入成本_usdt += 数据.生命周期统计.生命周期汇总.总投入成本_usdt;
      }
    }

    // 📊 计算累积投资回报率
    const 累积投资回报率_percent = 总投入成本_基础货币 > 0 
      ? (累积盈亏_基础货币 / 总投入成本_基础货币) * 100 
      : 0;

    return {
      累积盈亏_基础货币: Number(累积盈亏_基础货币.toFixed(6)),
      累积盈亏_usdt: Number(累积盈亏_usdt.toFixed(2)),
      累积投资回报率_percent: Number(累积投资回报率_percent.toFixed(2)),
      总版本数: 历史版本.length,
      活跃版本,
      历史版本: 历史版本.sort()
    };
  }
} 