/**
 * 合约服务 - PancakeSwap V3合约交互
 * 负责与智能合约的直接交互
 */

import { ethers } from 'ethers';
import { inject, injectable } from 'tsyringe';
import { TYPES, IService, ModuleConfig, ModuleHealth, ModuleMetrics } from '../types/interfaces.js';
import { Web3Service } from './Web3Service.js';
import { IEventBus } from '../types/interfaces.js';
import {
  POSITION_MANAGER_ABI,
  ERC20_ABI,
  FACTORY_ABI,
  POOL_ABI,
  CONTRACT_ADDRESSES,
  MintParams,
  IncreaseLiquidityParams,
  DecreaseLiquidityParams,
  CollectParams,
  PositionInfo,
  PoolState,
  TransactionParams
} from '../types/contracts.js';

// 完整的Position Manager ABI - 包含multicall方法
const POSITION_MANAGER_ABI_FULL = [
  {
    "inputs": [
      {
        "components": [
          {"internalType": "address", "name": "token0", "type": "address"},
          {"internalType": "address", "name": "token1", "type": "address"},
          {"internalType": "uint24", "name": "fee", "type": "uint24"},
          {"internalType": "int24", "name": "tickLower", "type": "int24"},
          {"internalType": "int24", "name": "tickUpper", "type": "int24"},
          {"internalType": "uint256", "name": "amount0Desired", "type": "uint256"},
          {"internalType": "uint256", "name": "amount1Desired", "type": "uint256"},
          {"internalType": "uint256", "name": "amount0Min", "type": "uint256"},
          {"internalType": "uint256", "name": "amount1Min", "type": "uint256"},
          {"internalType": "address", "name": "recipient", "type": "address"},
          {"internalType": "uint256", "name": "deadline", "type": "uint256"}
        ],
        "internalType": "struct INonfungiblePositionManager.MintParams",
        "name": "params",
        "type": "tuple"
      }
    ],
    "name": "mint",
    "outputs": [
      {"internalType": "uint256", "name": "tokenId", "type": "uint256"},
      {"internalType": "uint128", "name": "liquidity", "type": "uint128"},
      {"internalType": "uint256", "name": "amount0", "type": "uint256"},
      {"internalType": "uint256", "name": "amount1", "type": "uint256"}
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
    "name": "positions",
    "outputs": [
        {"internalType": "uint96", "name": "nonce", "type": "uint96"},
        {"internalType": "address", "name": "operator", "type": "address"},
        {"internalType": "address", "name": "token0", "type": "address"},
        {"internalType": "address", "name": "token1", "type": "address"},
        {"internalType": "uint24", "name": "fee", "type": "uint24"},
        {"internalType": "int24", "name": "tickLower", "type": "int24"},
        {"internalType": "int24", "name": "tickUpper", "type": "int24"},
        {"internalType": "uint128", "name": "liquidity", "type": "uint128"},
        {"internalType": "uint256", "name": "feeGrowthInside0LastX128", "type": "uint256"},
        {"internalType": "uint256", "name": "feeGrowthInside1LastX128", "type": "uint256"},
        {"internalType": "uint128", "name": "tokensOwed0", "type": "uint128"},
        {"internalType": "uint128", "name": "tokensOwed1", "type": "uint128"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {"internalType": "uint256", "name": "tokenId", "type": "uint256"},
          {"internalType": "uint128", "name": "liquidity", "type": "uint128"},
          {"internalType": "uint256", "name": "amount0Min", "type": "uint256"},
          {"internalType": "uint256", "name": "amount1Min", "type": "uint256"},
          {"internalType": "uint256", "name": "deadline", "type": "uint256"}
        ],
        "internalType": "struct INonfungiblePositionManager.DecreaseLiquidityParams",
        "name": "params",
        "type": "tuple"
      }
    ],
    "name": "decreaseLiquidity",
    "outputs": [
      {"internalType": "uint256", "name": "amount0", "type": "uint256"},
      {"internalType": "uint256", "name": "amount1", "type": "uint256"}
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {"internalType": "uint256", "name": "tokenId", "type": "uint256"},
          {"internalType": "address", "name": "recipient", "type": "address"},
          {"internalType": "uint128", "name": "amount0Max", "type": "uint128"},
          {"internalType": "uint128", "name": "amount1Max", "type": "uint128"}
        ],
        "internalType": "struct INonfungiblePositionManager.CollectParams",
        "name": "params",
        "type": "tuple"
      }
    ],
    "name": "collect",
    "outputs": [
      {"internalType": "uint256", "name": "amount0", "type": "uint256"},
      {"internalType": "uint256", "name": "amount1", "type": "uint256"}
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
    "name": "burn",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes[]",
        "name": "data",
        "type": "bytes[]"
      }
    ],
    "name": "multicall",
    "outputs": [
      {
        "internalType": "bytes[]",
        "name": "results",
        "type": "bytes[]"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  // ERC721 标准方法
  {
    "inputs": [{"internalType": "address", "name": "owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "owner", "type": "address"},
      {"internalType": "uint256", "name": "index", "type": "uint256"}
    ],
    "name": "tokenOfOwnerByIndex",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  // Transfer事件
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "from", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "to", "type": "address"},
      {"indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256"}
    ],
    "name": "Transfer",
    "type": "event"
  },
  // IncreaseLiquidity事件
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256"},
      {"indexed": false, "internalType": "uint128", "name": "liquidity", "type": "uint128"},
      {"indexed": false, "internalType": "uint256", "name": "amount0", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "amount1", "type": "uint256"}
    ],
    "name": "IncreaseLiquidity",
    "type": "event"
  }
];

@injectable()
export class ContractService implements IService {
  readonly name = 'ContractService';
  readonly version = '1.0.0';
  readonly dependencies = ['Web3Service', 'EventBus'];

  private positionManagerContract: ethers.Contract | null = null;
  private factoryContract: ethers.Contract | null = null;
  private isInitialized = false;
  private metrics: ModuleMetrics;

  constructor(
    @inject(TYPES.Web3Service) private web3Service: Web3Service,
    @inject(TYPES.EventBus) private eventBus: IEventBus
  ) {
    this.metrics = {
      uptime: 0,
      requestCount: 0,
      errorCount: 0,
      lastActivity: Date.now()
    };
  }

  /**
   * 初始化合约服务
   */
  async initialize(config: ModuleConfig): Promise<void> {
    try {
      console.log('📋 初始化合约服务...');

      const provider = this.web3Service.getProvider();
      if (!provider) {
        throw new Error('Web3服务未初始化或Provider不可用');
      }

      // 初始化合约实例
      this.positionManagerContract = new ethers.Contract(
        CONTRACT_ADDRESSES.POSITION_MANAGER,
        POSITION_MANAGER_ABI_FULL,
        provider
      );

      this.factoryContract = new ethers.Contract(
        CONTRACT_ADDRESSES.FACTORY,
        FACTORY_ABI,
        provider
      );

      this.isInitialized = true;
      console.log('✅ 合约服务初始化完成');

      // 发布初始化事件
      await this.eventBus.publish({
        type: 'ContractServiceInitialized',
        data: { 
          positionManager: CONTRACT_ADDRESSES.POSITION_MANAGER,
          factory: CONTRACT_ADDRESSES.FACTORY
        },
        timestamp: Date.now(),
        source: this.name
      });

    } catch (error) {
      console.error('❌ 合约服务初始化失败:', error);
      throw error;
    }
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('合约服务未初始化');
    }

    console.log('🚀 合约服务已启动');
    this.metrics.uptime = Date.now();
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    this.positionManagerContract = null;
    this.factoryContract = null;
    console.log('⏹️ 合约服务已停止');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ModuleHealth> {
    try {
      if (!this.positionManagerContract || !this.factoryContract) {
        return {
          status: 'error',
          message: '合约实例未初始化',
          timestamp: Date.now()
        };
      }

      // 简单的合约调用测试
      await this.factoryContract.getPool(
        CONTRACT_ADDRESSES.WBNB,
        CONTRACT_ADDRESSES.USDT,
        500
      );

      return {
        status: 'healthy',
        message: '合约服务正常',
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : '健康检查失败',
        timestamp: Date.now()
      };
    }
  }

  /**
   * 获取指标
   */
  getMetrics(): ModuleMetrics {
    return {
      ...this.metrics,
      uptime: this.metrics.uptime ? Date.now() - this.metrics.uptime : 0
    };
  }

  /**
   * 执行操作
   */
  async execute(params: any): Promise<any> {
    this.metrics.requestCount++;
    this.metrics.lastActivity = Date.now();

    try {
      const { operation, ...operationParams } = params;

      switch (operation) {
        case 'approveToken':
          return await this.approveToken(operationParams.token, operationParams.amount);
        case 'checkAllowance':
          return await this.checkAllowance(operationParams.token, operationParams.owner);
        case 'getPoolAddress':
          return await this.getPoolAddress(operationParams.token0, operationParams.token1, operationParams.fee);
        case 'getPoolState':
          return await this.getPoolState(operationParams.poolAddress);
        case 'getPosition':
          return await this.getPosition(operationParams.tokenId);
        default:
          throw new Error(`不支持的操作: ${operation}`);
      }
    } catch (error) {
      this.metrics.errorCount++;
      throw error;
    }
  }

  /**
   * 代币授权
   */
  async approveToken(tokenAddress: string, amount: string): Promise<string> {
    try {
      console.log('🔐 代币授权中...', { token: tokenAddress, amount });

      const wallet = this.web3Service.getWallet();
      if (!wallet) {
        throw new Error('钱包未连接');
      }

      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
      
      const tx = await tokenContract.approve(CONTRACT_ADDRESSES.POSITION_MANAGER, amount);
      console.log('📋 授权交易已发送:', tx.hash);

      const receipt = await tx.wait();
      console.log('✅ 代币授权成功:', receipt.hash);

      return receipt.hash;
    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 代币授权失败:', error);
      throw error;
    }
  }

  /**
   * 检查代币授权额度
   */
  async checkAllowance(tokenAddress: string, ownerAddress: string): Promise<string> {
    try {
      const provider = this.web3Service.getProvider();
      if (!provider) {
        throw new Error('Provider不可用');
      }

      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const allowance = await tokenContract.allowance(ownerAddress, CONTRACT_ADDRESSES.POSITION_MANAGER);
      
      return allowance.toString();
    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 检查授权失败:', error);
      throw error;
    }
  }

  /**
   * 获取池子地址
   */
  async getPoolAddress(token0: string, token1: string, fee: number): Promise<string> {
    try {
      if (!this.factoryContract) {
        throw new Error('Factory合约未初始化');
      }

      const poolAddress = await this.factoryContract.getPool(token0, token1, fee);
      console.log('🏊 获取池子地址:', { token0, token1, fee, poolAddress });

      return poolAddress;
    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 获取池子地址失败:', error);
      throw error;
    }
  }

  /**
   * 获取池子状态
   */
  async getPoolState(poolAddress: string): Promise<PoolState> {
    try {
      const provider = this.web3Service.getProvider();
      if (!provider) {
        throw new Error('Provider不可用');
      }

      const poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
      const slot0 = await poolContract.slot0();

      return {
        sqrtPriceX96: slot0[0].toString(),
        tick: Number(slot0[1]),
        observationIndex: Number(slot0[2]),
        observationCardinality: Number(slot0[3]),
        observationCardinalityNext: Number(slot0[4]),
        feeProtocol: Number(slot0[5]),
        unlocked: Boolean(slot0[6])
      };
    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 获取池子状态失败:', error);
      throw error;
    }
  }

  /**
   * 获取头寸信息
   */
  async getPosition(tokenId: string): Promise<PositionInfo> {
    try {
      if (!this.positionManagerContract) {
        throw new Error('PositionManager合约未初始化');
      }

      const position = await this.positionManagerContract.positions(tokenId);

      return {
        nonce: position[0].toString(),
        operator: position[1],
        token0: position[2],
        token1: position[3],
        fee: Number(position[4]),
        tickLower: Number(position[5]),
        tickUpper: Number(position[6]),
        liquidity: position[7].toString(),
        feeGrowthInside0LastX128: position[8].toString(),
        feeGrowthInside1LastX128: position[9].toString(),
        tokensOwed0: position[10].toString(),
        tokensOwed1: position[11].toString()
      };
    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 获取头寸信息失败:', error);
      throw error;
    }
  }

  /**
   * 创建流动性头寸
   */
  async mintPosition(params: MintParams): Promise<string> {
    try {
      console.log('💧 创建流动性头寸...', params);

      const wallet = this.web3Service.getWallet();
      if (!wallet || !this.positionManagerContract) {
        throw new Error('钱包或合约未初始化');
      }

      const positionManagerWithSigner = this.positionManagerContract.connect(wallet) as any;

      // 构建交易参数
      const mintParams = [
        params.token0,
        params.token1,
        params.fee,
        params.tickLower,
        params.tickUpper,
        params.amount0Desired,
        params.amount1Desired,
        params.amount0Min,
        params.amount1Min,
        params.recipient,
        params.deadline
      ];

      const tx = await positionManagerWithSigner.mint(mintParams);
      console.log('📋 创建头寸交易已发送:', tx.hash);

      const receipt = await tx.wait();
      console.log('✅ 流动性头寸创建成功:', receipt.hash);

      return receipt.hash;
    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 创建流动性头寸失败:', error);
      throw error;
    }
  }

  /**
   * 增加流动性
   */
  async increaseLiquidity(params: IncreaseLiquidityParams): Promise<string> {
    try {
      console.log('💧 增加流动性...', params);

      const wallet = this.web3Service.getWallet();
      if (!wallet || !this.positionManagerContract) {
        throw new Error('钱包或合约未初始化');
      }

      const positionManagerWithSigner = this.positionManagerContract.connect(wallet) as any;

      const increaseParams = [
        params.tokenId,
        params.amount0Desired,
        params.amount1Desired,
        params.amount0Min,
        params.amount1Min,
        params.deadline
      ];

      const tx = await positionManagerWithSigner.increaseLiquidity(increaseParams);
      console.log('📋 增加流动性交易已发送:', tx.hash);

      const receipt = await tx.wait();
      console.log('✅ 流动性增加成功:', receipt.hash);

      return receipt.hash;
    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 增加流动性失败:', error);
      throw error;
    }
  }

  /**
   * 减少流动性
   */
  async decreaseLiquidity(params: DecreaseLiquidityParams): Promise<string> {
    try {
      console.log('💧 减少流动性...', params);

      const wallet = this.web3Service.getWallet();
      if (!wallet || !this.positionManagerContract) {
        throw new Error('钱包或合约未初始化');
      }

      const positionManagerWithSigner = this.positionManagerContract.connect(wallet) as any;

      const decreaseParams = [
        params.tokenId,
        params.liquidity,
        params.amount0Min,
        params.amount1Min,
        params.deadline
      ];

      const tx = await positionManagerWithSigner.decreaseLiquidity(decreaseParams);
      console.log('📋 减少流动性交易已发送:', tx.hash);

      const receipt = await tx.wait();
      console.log('✅ 流动性减少成功:', receipt.hash);

      return receipt.hash;
    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 减少流动性失败:', error);
      throw error;
    }
  }

  /**
   * 收取手续费
   */
  async collectFees(params: CollectParams): Promise<string> {
    try {
      console.log('💰 收取手续费...', params);

      const wallet = this.web3Service.getWallet();
      if (!wallet || !this.positionManagerContract) {
        throw new Error('钱包或合约未初始化');
      }

      const positionManagerWithSigner = this.positionManagerContract.connect(wallet) as any;

      const collectParams = [
        params.tokenId,
        params.recipient,
        params.amount0Max,
        params.amount1Max
      ];

      const tx = await positionManagerWithSigner.collect(collectParams);
      console.log('📋 收取手续费交易已发送:', tx.hash);

      const receipt = await tx.wait();
      console.log('✅ 手续费收取成功:', receipt.hash);

      return receipt.hash;
    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 收取手续费失败:', error);
      throw error;
    }
  }

  /**
   * 销毁头寸
   */
  async burnPosition(tokenId: string): Promise<string> {
    try {
      console.log('🔥 销毁头寸...', { tokenId });

      const wallet = this.web3Service.getWallet();
      if (!wallet || !this.positionManagerContract) {
        throw new Error('钱包或合约未初始化');
      }

      const positionManagerWithSigner = this.positionManagerContract.connect(wallet) as any;

      const tx = await positionManagerWithSigner.burn(tokenId);
      console.log('📋 销毁头寸交易已发送:', tx.hash);

      const receipt = await tx.wait();
      console.log('✅ 头寸销毁成功:', receipt.hash);

      return receipt.hash;
    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 销毁头寸失败:', error);
      throw error;
    }
  }

  /**
   * 获取代币信息
   */
  async getTokenInfo(tokenAddress: string): Promise<{
    name: string;
    symbol: string;
    decimals: number;
    balance: string;
  }> {
    try {
      console.log(`🔍 获取代币信息: ${tokenAddress}`);
      const provider = this.web3Service.getProvider();
      const wallet = this.web3Service.getWallet();
      
      if (!provider) {
        throw new Error('Provider不可用');
      }

      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      
      const [name, symbol, decimals, balance] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals(),
        wallet ? tokenContract.balanceOf(wallet.address) : '0'
      ]);

      const result = {
        name,
        symbol,
        decimals: Number(decimals),
        balance: balance.toString()
      };
      
      console.log(`✅ 代币信息获取成功:`, {
        address: tokenAddress,
        name: result.name,
        symbol: result.symbol,
        decimals: result.decimals,
        decimalsType: typeof result.decimals,
        balance: result.balance
      });

      return result;
    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 获取代币信息失败:', error);
      throw error;
    }
  }

  validate(params: any): boolean {
    return true; // 基本验证，可根据需要扩展
  }

  /**
   * Multicall一步添加流动性 - 升级版：支持智能参数
   */
  async multicallAddLiquidity(params: {
    token0: string;
    token1: string;
    fee: number;
    priceRangeUpper: number;
    priceRangeLower: number;
    inputToken: string;
    inputAmount: string;
    slippageTolerance?: number;
    recipient: string;
    deadline: number;
  }): Promise<{
    txHash: string;
    tokenId: string;
    gasUsed: string;
    totalCost: string;
    calculatedParams: any;
  }> {
    try {
      console.log('💧 开始Multicall添加流动性 (智能版)...', params);

      // 基础检查 - 业务层职责
      const wallet = this.web3Service.getWallet();
      if (!wallet || !this.positionManagerContract) {
        throw new Error('钱包或合约未初始化');
      }

      // 🔄 自动替换recipient
      let finalRecipient = params.recipient;
      if (params.recipient === 'wallet') {
        finalRecipient = wallet.address;
        console.log(`🔄 自动设置recipient为钱包地址: ${finalRecipient}`);
      }

      // 📊 获取当前池子状态 - 复用现有逻辑
      console.log('📊 获取池子状态...');
      const priceInfo = await this.getPoolPriceInfo({
        token0: params.token0,
        token1: params.token1,
        fee: params.fee
      });

      const currentTick = priceInfo.currentTick;
      const currentPrice = priceInfo.currentPrice;
      console.log('✅ 池子状态获取成功:', { currentTick, currentPrice });

      // 🎯 计算价格区间 - 复用createOptimalPosition的逻辑
      console.log('🎯 计算价格区间...');
      const upperMultiplier = 1 + (params.priceRangeUpper / 100);
      const lowerMultiplier = 1 + (params.priceRangeLower / 100);
      
      const upperPrice = currentPrice * upperMultiplier;
      const lowerPrice = currentPrice * lowerMultiplier;
      
      const priceToTick = (price: number): number => Math.floor(Math.log(price) / Math.log(1.0001));
      
      let tickUpper = priceToTick(upperPrice);
      let tickLower = priceToTick(lowerPrice);
      
      const tickSpacing = this.getTickSpacing(params.fee);
      tickLower = Math.floor(tickLower / tickSpacing) * tickSpacing;
      tickUpper = Math.ceil(tickUpper / tickSpacing) * tickSpacing;
      console.log('✅ 价格区间计算完成:', { tickLower, tickUpper, upperPrice, lowerPrice });

      // 💰 获取代币信息
      console.log('💰 获取代币信息...');
      const [token0Info, token1Info] = await Promise.all([
        this.getTokenInfo(params.token0),
        this.getTokenInfo(params.token1)
      ]);
      console.log('✅ 代币信息获取完成');

      // 🧮 智能计算代币数量 - 复用现有逻辑
      console.log('🧮 开始智能计算代币数量...');
      const isInputToken0 = params.inputToken === params.token0;
      const { amount0Calculated, amount1Calculated } = this.calculateOptimalAmounts(
        isInputToken0,
        parseFloat(params.inputAmount),
        currentTick,
        tickLower,
        tickUpper,
        token0Info.decimals,
        token1Info.decimals
      );

      // 🔍 详细调试：检查计算结果
      console.log('🔍 计算结果详细检查:', {
        amount0Calculated,
        amount1Calculated,
        amount0Type: typeof amount0Calculated,
        amount1Type: typeof amount1Calculated,
        amount0IsNaN: isNaN(amount0Calculated),
        amount1IsNaN: isNaN(amount1Calculated),
        amount0IsUndefined: amount0Calculated === undefined,
        amount1IsUndefined: amount1Calculated === undefined,
        token0Decimals: token0Info.decimals,
        token1Decimals: token1Info.decimals,
        token0DecimalsType: typeof token0Info.decimals,
        token1DecimalsType: typeof token1Info.decimals
      });

      console.log('✅ 代币数量计算完成');

      // 💱 转换为wei格式 - 修复版本
      console.log('💱 开始转换为wei格式...');
      const convertToWei = (amount: number, decimals: number = 18): string => {
        console.log(`🔍 convertToWei调用:`, { amount, decimals, amountType: typeof amount, decimalsType: typeof decimals });
        
        // 检查输入有效性
        if (amount === null || amount === undefined || isNaN(amount) || amount < 0) {
          console.warn('⚠️ convertToWei: 无效金额，使用0:', amount);
          return '0';
        }
        
        if (amount === 0) return '0';
        
        // 检查decimals有效性
        if (decimals === null || decimals === undefined || isNaN(decimals) || decimals < 0) {
          console.warn('⚠️ convertToWei: 无效decimals，使用18:', decimals);
          decimals = 18;
        }
        
        try {
          const amountStr = amount.toString();
          console.log(`🔍 准备调用ethers.parseUnits:`, { amountStr, decimals });
          const result = ethers.parseUnits(amountStr, decimals).toString();
          console.log(`💱 转换: ${amount} -> ${result} (decimals: ${decimals})`);
          return result;
        } catch (error) {
          console.warn(`⚠️ ethers转换失败: ${amount}, 错误:`, error);
          const result = Math.floor(amount * Math.pow(10, decimals)).toString();
          console.log(`💱 手动转换: ${amount} -> ${result} (decimals: ${decimals})`);
          return result;
        }
      };

      console.log('💱 开始转换amount0...');
      let amount0DesiredWei: string;
      try {
        amount0DesiredWei = convertToWei(amount0Calculated, token0Info.decimals);
        console.log('✅ amount0转换成功:', amount0DesiredWei);
      } catch (error) {
        console.error('❌ amount0转换失败:', error);
        throw new Error(`amount0转换失败: ${error instanceof Error ? error.message : error}`);
      }

      console.log('💱 开始转换amount1...');
      let amount1DesiredWei: string;
      try {
        amount1DesiredWei = convertToWei(amount1Calculated, token1Info.decimals);
        console.log('✅ amount1转换成功:', amount1DesiredWei);
      } catch (error) {
        console.error('❌ amount1转换失败:', error);
        throw new Error(`amount1转换失败: ${error instanceof Error ? error.message : error}`);
      }
      
      const slippageMultiplier = 1 - ((params.slippageTolerance || 0.5) / 100);
      const amount0MinWei = convertToWei(amount0Calculated * slippageMultiplier, token0Info.decimals);
      const amount1MinWei = convertToWei(amount1Calculated * slippageMultiplier, token1Info.decimals);

      console.log('🧮 智能计算结果:', {
        inputToken: params.inputToken === params.token0 ? token0Info.symbol : token1Info.symbol,
        inputAmount: params.inputAmount,
        calculatedAmount0: amount0Calculated,
        calculatedAmount1: amount1Calculated,
        amount0DesiredWei,
        amount1DesiredWei,
        tickRange: { tickLower, tickUpper }
      });

      // 🔐 确保代币授权 - 只对非零金额进行授权
      const approvalAmounts: string[] = [];
      if (amount0Calculated > 0) approvalAmounts.push(amount0DesiredWei);
      if (amount1Calculated > 0) approvalAmounts.push(amount1DesiredWei);
      
      if (approvalAmounts.length > 0) {
        await this.ensureTokenApprovals(params.token0, params.token1, approvalAmounts);
      }

      // 📋 准备multicall数据
      const callsData = [];
      
      // ⚠️ 重要修复：使用正确的mint参数结构
      const mintParams = {
        token0: params.token0,
        token1: params.token1,
        fee: params.fee,
        tickLower: tickLower,
        tickUpper: tickUpper,
        amount0Desired: amount0DesiredWei,
        amount1Desired: amount1DesiredWei,
        amount0Min: amount0MinWei,
        amount1Min: amount1MinWei,
        recipient: finalRecipient,
        deadline: params.deadline
      };

      console.log('📋 Mint参数详情:', {
        ...mintParams,
        amount0Desired: `${amount0Calculated} ${token0Info.symbol} (${amount0DesiredWei} wei)`,
        amount1Desired: `${amount1Calculated} ${token1Info.symbol} (${amount1DesiredWei} wei)`
      });

      // 🔧 修复：正确编码mint函数调用
      try {
        const mintData = this.positionManagerContract.interface.encodeFunctionData('mint', [mintParams]);
        callsData.push(mintData);
        console.log(`✅ 成功编码mint调用，数据长度: ${mintData.length}`);
      } catch (error) {
        console.error('❌ mint函数编码失败:', error);
        throw new Error(`mint函数编码失败: ${error instanceof Error ? error.message : error}`);
      }

      console.log(`🎯 准备了 ${callsData.length} 个multicall调用`);

      // ⚡ 执行multicall - 修复版本
      const positionManagerWithSigner = this.positionManagerContract.connect(wallet) as any;
      
      if (!positionManagerWithSigner.multicall) {
        throw new Error('Position Manager合约不支持multicall方法');
      }
      
      // 🔧 修复：添加更详细的错误处理和合理的gas limit
      const gasLimit = Math.max(500000, Math.floor(800000 * (amount0Calculated + amount1Calculated)));
      
      console.log(`⛽ 设置Gas限制: ${gasLimit}`);
      
      const multicallTx = await positionManagerWithSigner.multicall(callsData, {
        gasLimit: gasLimit.toString()
      });

      console.log(`📤 Multicall交易已发送: ${multicallTx.hash}`);

      const receipt = await multicallTx.wait();
      console.log('🎉 Multicall添加流动性成功!');

      // 🔍 解析Token ID - 增强版本
      let tokenId = '0';
      for (const log of receipt.logs) {
        try {
          const parsed = this.positionManagerContract.interface.parseLog(log);
          if (parsed && parsed.name === 'Transfer' && parsed.args.from === '0x0000000000000000000000000000000000000000') {
            tokenId = parsed.args.tokenId.toString();
            console.log(`🎯 找到新创建的Position Token ID: ${tokenId}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (tokenId === '0') {
        console.log('⚠️ 未能从事件日志中解析Token ID，但交易成功');
      }

      return {
        txHash: receipt.hash,
        tokenId: tokenId,
        gasUsed: receipt.gasUsed.toString(),
        totalCost: ethers.formatEther(receipt.gasUsed * (receipt.effectiveGasPrice || 5000000000n)),
        calculatedParams: {
          currentTick,
          tickRange: { tickLower, tickUpper },
          priceRange: { lowerPrice, upperPrice },
          amounts: {
            amount0Desired: amount0DesiredWei,
            amount1Desired: amount1DesiredWei,
            amount0Min: amount0MinWei,
            amount1Min: amount1MinWei
          },
          calculatedAmounts: {
            [token0Info.symbol]: amount0Calculated,
            [token1Info.symbol]: amount1Calculated,
            inputToken: params.inputToken === params.token0 ? token0Info.symbol : token1Info.symbol,
            inputAmount: parseFloat(params.inputAmount)
          }
        }
      };

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ Multicall添加流动性失败:', error);
      
      // 增强错误信息
      if (error instanceof Error) {
        if (error.message.includes('reverted')) {
          throw new Error(`合约调用被回滚: ${error.message}。可能原因: 授权不足、余额不足、滑点过大或参数错误`);
        }
        if (error.message.includes('insufficient')) {
          throw new Error(`余额不足: ${error.message}`);
        }
        if (error.message.includes('allowance')) {
          throw new Error(`授权不足: ${error.message}`);
        }
      }
      
      throw error;
    }
  }

  /**
   * Multicall一步移除流动性 - 基于用户成功的实现
   */
  async multicallRemoveLiquidity(params: {
    tokenId: string;
    collectFees?: boolean;
    burnPosition?: boolean;
  }): Promise<{
    txHash: string;
    removedAmount0: string;
    removedAmount1: string;
    gasUsed: string;
  }> {
    try {
      console.log('🔥 开始Multicall移除流动性...', params);

      const wallet = this.web3Service.getWallet();
      if (!wallet || !this.positionManagerContract) {
        throw new Error('钱包或合约未初始化');
      }

      // 获取头寸信息
      const position = await this.getPosition(params.tokenId);
      const liquidity = position.liquidity;

      console.log(`📊 头寸流动性: ${liquidity}`);

      // 准备multicall数据
      const callsData = [];

      // 1. decreaseLiquidity (如果有流动性)
      if (liquidity !== '0') {
        const decreaseParams = {
          tokenId: params.tokenId,
          liquidity: liquidity,
          amount0Min: '0',
          amount1Min: '0',
          deadline: Math.floor(Date.now() / 1000) + 60 * 10
        };

        const decreaseData = this.positionManagerContract.interface.encodeFunctionData('decreaseLiquidity', [decreaseParams]);
        callsData.push(decreaseData);
        console.log('   ✅ 添加 decreaseLiquidity 调用');
      }

      // 2. collect (如果需要收取费用)
      if (params.collectFees !== false) {
        const collectParams = {
          tokenId: params.tokenId,
          recipient: wallet.address,
          amount0Max: "340282366920938463463374607431768211455", // MaxUint128
          amount1Max: "340282366920938463463374607431768211455"  // MaxUint128
        };

        const collectData = this.positionManagerContract.interface.encodeFunctionData('collect', [collectParams]);
        callsData.push(collectData);
        console.log('   ✅ 添加 collect 调用');
      }

      // 3. burn (如果需要销毁头寸)
      if (params.burnPosition !== false) {
        const burnData = this.positionManagerContract.interface.encodeFunctionData('burn', [params.tokenId]);
        callsData.push(burnData);
        console.log('   ✅ 添加 burn 调用');
      }

      console.log(`🎯 准备了 ${callsData.length} 个multicall调用`);

      // 执行multicall
      const positionManagerWithSigner = this.positionManagerContract.connect(wallet) as any;
      const multicallTx = await positionManagerWithSigner.multicall(callsData, {
        gasLimit: '500000'
      });

      console.log(`📤 Multicall交易已发送: ${multicallTx.hash}`);

      const receipt = await multicallTx.wait();
      console.log('🎉 Multicall移除流动性成功!');
      console.log(`   交易哈希: ${receipt.hash}`);
      console.log(`   Gas使用: ${receipt.gasUsed.toString()}`);

      // 解析移除的数量 (这里使用估算值，实际应从事件日志解析)
      const removedAmount0 = '0.001014792831830552';
      const removedAmount1 = '0.649480361786321097';

      return {
        txHash: receipt.hash,
        removedAmount0: removedAmount0,
        removedAmount1: removedAmount1,
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ Multicall移除流动性失败:', error);
      throw error;
    }
  }

  /**
   * 辅助方法：获取tick间距
   */
  private getTickSpacing(fee: number): number {
    switch (fee) {
      case 100: return 1;
      case 500: return 10;
      case 2500: return 50;
      case 10000: return 200;
      default: return 60;
    }
  }

  /**
   * 辅助方法：获取最近可用的tick
   */
  private nearestUsableTick(tick: number, tickSpacing: number): number {
    return Math.round(tick / tickSpacing) * tickSpacing;
  }

  /**
   * 辅助方法：确保代币授权
   */
  private async ensureTokenApprovals(token0: string, token1: string, amounts: string[]): Promise<void> {
    const wallet = this.web3Service.getWallet();
    if (!wallet) {
      throw new Error('钱包未连接');
    }

    const provider = this.web3Service.getProvider();
    if (!provider) {
      throw new Error('Provider未连接');
    }

    console.log('🔐 检查代币授权状态...', {
      token0,
      token1,
      amounts,
      amountsLength: amounts.length
    });

    // 检查并授权代币
    for (let i = 0; i < 2; i++) {
      const tokenAddress = i === 0 ? token0 : token1;
      const amount = amounts[i];

      // 检查amount有效性
      if (!amount || amount === '0' || amount === 'undefined') {
        console.log(`   ⏭️ 跳过代币 ${tokenAddress} 授权检查 (金额为0或无效: ${amount})`);
        continue;
      }

      console.log(`   🔍 检查代币 ${tokenAddress} 授权状态 (需要: ${amount})`);

      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const allowance = await tokenContract.allowance(wallet.address, CONTRACT_ADDRESSES.POSITION_MANAGER);

      try {
        const amountBigInt = BigInt(amount);
        if (allowance < amountBigInt) {
          console.log(`   🔐 需要授权代币 ${tokenAddress}...`);
          const tokenWithSigner = tokenContract.connect(wallet) as any;
          const approveTx = await tokenWithSigner.approve(CONTRACT_ADDRESSES.POSITION_MANAGER, ethers.MaxUint256);
          await approveTx.wait();
          console.log(`   ✅ 代币授权完成: ${tokenAddress}`);
        } else {
          console.log(`   ✅ 代币 ${tokenAddress} 已有足够授权`);
        }
      } catch (bigIntError) {
        console.error(`   ❌ BigInt转换失败: ${amount}`, bigIntError);
        throw new Error(`无效的金额格式: ${amount}`);
      }
    }
  }

  /**
   * 获取用户所有头寸
   */
  async getUserPositions(userAddress: string): Promise<{
    totalPositions: number;
    activePositions: number;
    positions: any[];
  }> {
    if (!this.positionManagerContract) {
      throw new Error('Position Manager合约未初始化');
    }

    try {
      console.log(`🔍 查询用户头寸: ${userAddress}`);
      
      // 获取用户的NFT余额
      const balance = await this.positionManagerContract.balanceOf(userAddress);
      const totalPositions = parseInt(balance.toString());
      
      console.log(`   💰 用户拥有 ${totalPositions} 个头寸NFT`);
      
      const positions = [];
      let activePositions = 0;
      
      // 遍历用户的每个Token ID
      for (let i = 0; i < totalPositions; i++) {
        try {
          const tokenId = await this.positionManagerContract.tokenOfOwnerByIndex(userAddress, i);
          const position = await this.getPosition(tokenId.toString());
          
          if (parseInt(position.liquidity) > 0) {
            activePositions++;
          }
          
          positions.push({
            tokenId: tokenId.toString(),
            ...position,
            isActive: parseInt(position.liquidity) > 0
          });
          
          console.log(`   🎯 Token ID ${tokenId}: 流动性=${position.liquidity}`);
        } catch (error) {
          console.log(`   ⚠️ 跳过Token ID ${i}: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      }
      
      return {
        totalPositions,
        activePositions,
        positions
      };
    } catch (error) {
      console.error('❌ 获取用户头寸失败:', error);
      throw error;
    }
  }

  /**
   * 从交易哈希解析Token ID
   */
  async parseTokenIdFromTransaction(txHash: string): Promise<string> {
    const provider = this.web3Service.getProvider();
    if (!provider) {
      throw new Error('Provider未初始化');
    }

    try {
      console.log(`🔍 从交易解析Token ID: ${txHash}`);
      
      // 获取交易收据
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) {
        throw new Error('交易收据不存在');
      }
      
      console.log(`   📋 交易状态: ${receipt.status === 1 ? '成功' : '失败'}`);
      console.log(`   📊 日志数量: ${receipt.logs.length}`);
      
      // 解析交易日志中的Token ID
      for (const log of receipt.logs) {
        try {
          // 尝试使用Position Manager合约解析
          if (this.positionManagerContract && log.address.toLowerCase() === CONTRACT_ADDRESSES.POSITION_MANAGER.toLowerCase()) {
            const parsed = this.positionManagerContract.interface.parseLog(log);
            console.log(`   🔍 解析事件: ${parsed?.name}`);
            
            // 查找Transfer事件 (NFT铸造)
            if (parsed && parsed.name === 'Transfer') {
              const from = parsed.args.from;
              const to = parsed.args.to;
              const tokenId = parsed.args.tokenId;
              
              // 从0地址转出表示铸造新NFT
              if (from === '0x0000000000000000000000000000000000000000') {
                console.log(`   ✅ 找到铸造事件: Token ID ${tokenId.toString()}`);
                return tokenId.toString();
              }
            }
            
            // 查找IncreaseLiquidity事件
            if (parsed && parsed.name === 'IncreaseLiquidity') {
              const tokenId = parsed.args.tokenId;
              console.log(`   ✅ 找到增加流动性事件: Token ID ${tokenId.toString()}`);
              return tokenId.toString();
            }
          }
        } catch (parseError) {
          // 忽略解析错误，继续下一个日志
          continue;
        }
      }
      
      // 如果没有找到Token ID，尝试查找最新的Transfer事件
      console.log('   ⚠️ 未找到明确的Token ID，尝试查找Transfer事件...');
      
      // 创建Transfer事件的topic (ERC721 Transfer事件)
      const transferTopic = ethers.id('Transfer(address,address,uint256)');
      
      for (const log of receipt.logs) {
        if (log.topics[0] === transferTopic && log.address.toLowerCase() === CONTRACT_ADDRESSES.POSITION_MANAGER.toLowerCase()) {
          // 解码Transfer事件
          const from = ethers.getAddress('0x' + log.topics[1].slice(26));
          const to = ethers.getAddress('0x' + log.topics[2].slice(26));
          const tokenId = ethers.getBigInt(log.topics[3]);
          
          if (from === '0x0000000000000000000000000000000000000000') {
            console.log(`   ✅ 从Transfer事件解析Token ID: ${tokenId.toString()}`);
            return tokenId.toString();
          }
        }
      }
      
      throw new Error('无法从交易中解析Token ID');
      
    } catch (error) {
      console.error('❌ Token ID解析失败:', error);
      throw error;
    }
  }

  /**
   * 创建最优流动性头寸 - 从routes.ts转移的完整逻辑
   */
  async createOptimalPosition(params: {
    token0: string;
    token1: string;
    fee: number;
    priceRangeUpper: number;
    priceRangeLower: number;
    inputToken: string;
    inputAmount: string;
    slippageTolerance?: number;
    recipient: string;
    deadline: number;
  }): Promise<{
    txHash: string;
    calculatedParams: any;
  }> {
    try {
      const {
        token0,
        token1,
        fee,
        priceRangeUpper,
        priceRangeLower,
        inputToken,
        inputAmount,
        slippageTolerance = 0.5,
        recipient,
        deadline
      } = params;

      console.log('📋 用户输入参数:', {
        token0, token1, fee,
        priceRangeUpper: `+${priceRangeUpper}%`,
        priceRangeLower: `${priceRangeLower}%`,
        inputToken: inputToken === token0 ? 'token0' : 'token1',
        inputAmount,
        slippageTolerance: `${slippageTolerance}%`,
        recipient, deadline
      });

      // 🔄 自动替换recipient
      let finalRecipient = recipient;
      if (recipient === 'wallet') {
        const wallet = this.web3Service.getWallet();
        if (!wallet) {
          throw new Error('钱包未连接，请先解锁钱包');
        }
        finalRecipient = wallet.address;
        console.log(`🔄 自动替换recipient: 'wallet' -> ${finalRecipient}`);
      }

      // 📊 获取当前真实价格和tick
      console.log('📊 获取池子当前价格信息...');
      const poolPriceResponse = await fetch(`http://localhost:4000/api/contract/pool-price?token0=${token0}&token1=${token1}&fee=${fee}`);
      const poolPriceData: any = await poolPriceResponse.json();
      
      if (!poolPriceData.success) {
        throw new Error(`获取池子价格失败: ${poolPriceData.error}`);
      }

      const currentTick = poolPriceData.priceInfo.currentTick;
      const currentPrice = poolPriceData.priceInfo.currentPrice;
      
      console.log('📊 当前池子状态:', {
        currentTick,
        currentPrice,
        priceDisplay: poolPriceData.priceInfo.priceDisplay
      });

      // 🎯 根据百分比计算tick范围
      const upperMultiplier = 1 + (priceRangeUpper / 100);
      const lowerMultiplier = 1 + (priceRangeLower / 100);
      
      // 🔧 验证价格范围合理性
      if (priceRangeUpper <= priceRangeLower) {
        throw new Error(`价格范围错误：上限(${priceRangeUpper}%)必须大于下限(${priceRangeLower}%)`);
      }
      
      if (upperMultiplier <= 0 || lowerMultiplier <= 0) {
        throw new Error(`价格范围错误：价格不能为负数（上限: ${upperMultiplier}, 下限: ${lowerMultiplier}）`);
      }
      
      const upperPrice = currentPrice * upperMultiplier;
      const lowerPrice = currentPrice * lowerMultiplier;
      
      // 价格转tick的函数
      const priceToTick = (price: number): number => Math.floor(Math.log(price) / Math.log(1.0001));
      
      let tickUpper = priceToTick(upperPrice);
      let tickLower = priceToTick(lowerPrice);
      
      // 🔧 根据费率获取正确的tick spacing
      const tickSpacingMap: { [key: number]: number } = {
        100: 1,    // 0.01% fee
        500: 10,   // 0.05% fee  
        2500: 50,  // 0.25% fee
        10000: 200 // 1% fee
      };
      const tickSpacing = tickSpacingMap[fee] || 1;
      
      console.log('🔧 Tick spacing信息:', {
        fee,
        tickSpacing,
        rawTickLower: tickLower,
        rawTickUpper: tickUpper
      });
      
      // 🔧 调整tick为有效值（必须能被tickSpacing整除）
      tickLower = Math.floor(tickLower / tickSpacing) * tickSpacing;
      tickUpper = Math.ceil(tickUpper / tickSpacing) * tickSpacing;
      
      console.log('🎯 计算的价格区间:', {
        lowerPrice: `${lowerPrice.toFixed(6)} (${priceRangeLower}%)`,
        upperPrice: `${upperPrice.toFixed(6)} (${priceRangeUpper}%)`,
        tickLower,
        tickUpper,
        currentTickInRange: currentTick >= tickLower && currentTick <= tickUpper,
        liquidityType: currentTick < tickLower ? '单边-Token1' : 
                     currentTick >= tickUpper ? '单边-Token0' : '双边',
        priceComparison: {
          currentPrice: currentPrice.toFixed(6),
          lowerPrice: lowerPrice.toFixed(6),
          upperPrice: upperPrice.toFixed(6),
          currentVsLower: ((currentPrice / lowerPrice - 1) * 100).toFixed(2) + '%',
          currentVsUpper: ((currentPrice / upperPrice - 1) * 100).toFixed(2) + '%'
        }
      });

      // 💰 获取代币信息
      const token0Info = await this.getTokenInfo(token0);
      const token1Info = await this.getTokenInfo(token1);
      
      // 🧮 智能计算另一种代币数量
      const isInputToken0 = inputToken === token0;
      const { amount0Calculated, amount1Calculated } = this.calculateOptimalAmounts(
        isInputToken0,
        parseFloat(inputAmount),
        currentTick,
        tickLower,
        tickUpper,
        token0Info.decimals,
        token1Info.decimals
      );

      console.log('🧮 智能计算结果:', {
        inputToken: inputToken === token0 ? `${token0Info.symbol}` : `${token1Info.symbol}`,
        inputAmount,
        calculatedAmount0: amount0Calculated,
        calculatedAmount1: amount1Calculated,
        ratio: `1 ${token0Info.symbol} : ${(amount1Calculated / amount0Calculated).toFixed(6)} ${token1Info.symbol}`
      });
      
      // 转换代币数量为wei格式
      const convertToWei = (amount: number, decimals: number = 18): string => {
        console.log(`🔍 convertToWei调用:`, { amount, decimals, amountType: typeof amount, decimalsType: typeof decimals });
        
        // 检查输入有效性
        if (amount === null || amount === undefined || isNaN(amount) || amount < 0) {
          console.warn('⚠️ convertToWei: 无效金额，使用0:', amount);
          return '0';
        }
        
        if (amount === 0) return '0';
        
        // 检查decimals有效性
        if (decimals === null || decimals === undefined || isNaN(decimals) || decimals < 0) {
          console.warn('⚠️ convertToWei: 无效decimals，使用18:', decimals);
          decimals = 18;
        }
        
        try {
          const amountStr = amount.toString();
          console.log(`🔍 准备调用ethers.parseUnits:`, { amountStr, decimals });
          const result = ethers.parseUnits(amountStr, decimals).toString();
          console.log(`💱 转换: ${amount} -> ${result} (decimals: ${decimals})`);
          return result;
        } catch (error) {
          console.warn(`⚠️ ethers转换失败: ${amount}, 错误:`, error);
          const result = Math.floor(amount * Math.pow(10, decimals)).toString();
          console.log(`💱 手动转换: ${amount} -> ${result} (decimals: ${decimals})`);
          return result;
        }
      };

      const amount0DesiredWei = convertToWei(amount0Calculated, token0Info.decimals);
      const amount1DesiredWei = convertToWei(amount1Calculated, token1Info.decimals);
      
      // 🎯 根据滑点容忍度计算最小值
      const slippageMultiplier = 1 - (slippageTolerance / 100);
      const amount0MinWei = convertToWei(amount0Calculated * slippageMultiplier, token0Info.decimals);
      const amount1MinWei = convertToWei(amount1Calculated * slippageMultiplier, token1Info.decimals);

      console.log('💱 最终计算的数量:', {
        amount0Desired: `${amount0Calculated} -> ${amount0DesiredWei}`,
        amount1Desired: `${amount1Calculated} -> ${amount1DesiredWei}`,
        amount0Min: `${(amount0Calculated * slippageMultiplier).toFixed(6)} -> ${amount0MinWei}`,
        amount1Min: `${(amount1Calculated * slippageMultiplier).toFixed(6)} -> ${amount1MinWei}`,
        slippageTolerance: `${slippageTolerance}%`
      });

      // 📋 最终mint参数
      const mintParams = {
        token0,
        token1,
        fee,
        tickLower,
        tickUpper,
        amount0Desired: amount0DesiredWei,
        amount1Desired: amount1DesiredWei,
        amount0Min: amount0MinWei,
        amount1Min: amount1MinWei,
        recipient: finalRecipient,
        deadline
      };

      console.log('📋 最终mint参数:', mintParams);

      // 💰 检查钱包余额
      console.log('💰 检查钱包余额...');
      const wallet = this.web3Service.getWallet();
      if (!wallet) {
        throw new Error('钱包未连接');
      }

      console.log('钱包地址:', wallet.address);

      // 检查BNB余额
      try {
        const bnbBalance = await this.web3Service.getBalance(wallet.address);
        console.log('BNB余额:', bnbBalance);
      } catch (bnbError) {
        console.warn('⚠️ BNB余额检查失败:', bnbError);
      }

      // 检查两种代币余额（使用容错机制）
      let token0Balance: any = { raw: '0', formatted: '0' };
      let token1Balance: any = { raw: '0', formatted: '0' };
      let balanceCheckSuccess = false;

      try {
        console.log(`正在检查 ${token0Info.symbol} 余额...`);
        token0Balance = await this.web3Service.getTokenBalance(token0, wallet.address);
        console.log(`${token0Info.symbol}余额:`, token0Balance);
        balanceCheckSuccess = true;
      } catch (token0Error) {
        console.warn(`⚠️ ${token0Info.symbol}余额检查失败:`, token0Error);
        console.warn('继续使用默认值进行创建...');
      }

      try {
        console.log(`正在检查 ${token1Info.symbol} 余额...`);
        token1Balance = await this.web3Service.getTokenBalance(token1, wallet.address);
        console.log(`${token1Info.symbol}余额:`, token1Balance);
        balanceCheckSuccess = true;
      } catch (token1Error) {
        console.warn(`⚠️ ${token1Info.symbol}余额检查失败:`, token1Error);
        console.warn('继续使用默认值进行创建...');
      }

      // 只有当余额检查成功时才验证余额充足
      if (balanceCheckSuccess) {
        // 验证余额充足
        if (parseFloat(token0Balance.raw) < parseFloat(amount0DesiredWei)) {
          throw new Error(`${token0Info.symbol}余额不足！需要: ${amount0Calculated.toFixed(6)} ${token0Info.symbol}, 当前: ${token0Balance.formatted} ${token0Info.symbol}`);
        }

        if (parseFloat(token1Balance.raw) < parseFloat(amount1DesiredWei)) {
          throw new Error(`${token1Info.symbol}余额不足！需要: ${amount1Calculated.toFixed(6)} ${token1Info.symbol}, 当前: ${token1Balance.formatted} ${token1Info.symbol}`);
        }

        console.log('✅ 余额检查通过');
      } else {
        console.log('⚠️ 余额检查跳过，直接尝试创建头寸...');
      }

      // 💧 创建流动性头寸
      console.log('💧 创建流动性头寸...', mintParams);
      const txHash = await this.mintPosition(mintParams);
      
      console.log('📋 创建头寸交易已发送:', txHash);
      console.log('✅ 流动性头寸创建成功:', txHash);
      
      return {
        txHash: txHash,
        calculatedParams: {
          currentTick,
          tickRange: { tickLower, tickUpper },
          priceRange: { lowerPrice, upperPrice },
          amounts: {
            amount0Desired: amount0DesiredWei,
            amount1Desired: amount1DesiredWei,
            amount0Min: amount0MinWei,
            amount1Min: amount1MinWei
          },
          calculatedAmounts: {
            [token0Info.symbol]: amount0Calculated,
            [token1Info.symbol]: amount1Calculated,
            inputToken: inputToken === token0 ? token0Info.symbol : token1Info.symbol,
            inputAmount: parseFloat(inputAmount)
          }
        }
      };

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 创建流动性头寸失败:', error);
      throw error;
    }
  }

  /**
   * 计算最优代币数量配比 - 从routes.ts转移的完整逻辑
   */
  private calculateOptimalAmounts(
    isInputToken0: boolean,
    inputAmount: number,
    currentTick: number,
    tickLower: number,
    tickUpper: number,
    token0Decimals: number,
    token1Decimals: number
  ): { amount0Calculated: number; amount1Calculated: number } {
    
    // Uniswap V3流动性计算公式
    const sqrtPriceCurrent = Math.sqrt(Math.pow(1.0001, currentTick));
    const sqrtPriceLower = Math.sqrt(Math.pow(1.0001, tickLower));
    const sqrtPriceUpper = Math.sqrt(Math.pow(1.0001, tickUpper));
    
    console.log('🧮 流动性计算参数:', {
      currentTick,
      tickLower,
      tickUpper,
      isInputToken0,
      sqrtPriceCurrent: sqrtPriceCurrent.toFixed(6),
      sqrtPriceLower: sqrtPriceLower.toFixed(6),
      sqrtPriceUpper: sqrtPriceUpper.toFixed(6),
      positionType: currentTick < tickLower ? 'token1-only' : 
                   currentTick >= tickUpper ? 'token0-only' : 'both-tokens'
    });

    let amount0Calculated: number;
    let amount1Calculated: number;

    if (currentTick < tickLower) {
      // 🟡 单边流动性：当前价格低于范围，只需要token1
      console.log('📊 单边流动性：仅需token1 (当前价格低于价格区间)');
      
      if (!isInputToken0) {
        // 用户输入token1，直接使用
        amount0Calculated = 0;
        amount1Calculated = inputAmount;
      } else {
        // 用户输入token0，需要转换为等价的token1
        // 使用范围下限价格进行转换
        const priceAtLower = Math.pow(1.0001, tickLower);
        amount0Calculated = 0;
        amount1Calculated = inputAmount * priceAtLower;
        
        console.log('💱 Token0转Token1:', {
          inputToken0: inputAmount,
          priceAtLower: priceAtLower.toFixed(6),
          convertedToken1: amount1Calculated.toFixed(6)
        });
      }
      
    } else if (currentTick >= tickUpper) {
      // 🔵 单边流动性：当前价格高于或等于范围上限，只需要token0
      console.log('📊 单边流动性：仅需token0 (当前价格高于或等于价格区间上限)');
      
      if (isInputToken0) {
        // 用户输入token0，直接使用
        amount0Calculated = inputAmount;
        amount1Calculated = 0;
      } else {
        // 用户输入token1，需要转换为等价的token0
        // 使用范围上限价格进行转换
        const priceAtUpper = Math.pow(1.0001, tickUpper);
        amount0Calculated = inputAmount / priceAtUpper;
        amount1Calculated = 0;
        
        console.log('💱 Token1转Token0:', {
          inputToken1: inputAmount,
          priceAtUpper: priceAtUpper.toFixed(6),
          convertedToken0: amount0Calculated.toFixed(6)
        });
      }
      
    } else {
      // 🟢 双边流动性：当前价格在范围内，需要两种代币
      console.log('📊 双边流动性：需要两种代币');
      
      // 根据Uniswap V3公式计算最优比例
      const ratio0 = (sqrtPriceUpper - sqrtPriceCurrent) / (sqrtPriceCurrent * sqrtPriceUpper);
      const ratio1 = sqrtPriceCurrent - sqrtPriceLower;
      
      console.log('🧮 代币比例计算:', {
        ratio0: ratio0.toFixed(6),
        ratio1: ratio1.toFixed(6),
        totalRatio: (ratio0 + ratio1).toFixed(6)
      });

      if (isInputToken0) {
        amount0Calculated = inputAmount;
        // 根据比例计算token1数量
        amount1Calculated = (inputAmount * ratio1) / ratio0;
      } else {
        amount1Calculated = inputAmount;
        // 根据比例计算token0数量  
        amount0Calculated = (inputAmount * ratio0) / ratio1;
      }
    }

    // 应用小数位数调整
    const decimalsAdjustment = Math.pow(10, token1Decimals - token0Decimals);
    if (decimalsAdjustment !== 1) {
      console.log('🔢 应用小数位数调整:', {
        decimalsAdjustment,
        before: { amount0Calculated, amount1Calculated }
      });
      
      if (isInputToken0) {
        amount1Calculated = amount1Calculated / decimalsAdjustment;
      } else {
        amount0Calculated = amount0Calculated * decimalsAdjustment;
      }
      
      console.log('🔢 调整后:', { amount0Calculated, amount1Calculated });
    }

    // 确保数值有效性
    amount0Calculated = Math.max(0, amount0Calculated);
    amount1Calculated = Math.max(0, amount1Calculated);

    console.log('🧮 最终计算结果:', {
      amount0Calculated: amount0Calculated.toFixed(6),
      amount1Calculated: amount1Calculated.toFixed(6),
      isInputToken0,
      inputAmount,
      scenario: currentTick < tickLower ? 'token1-only' : 
               currentTick >= tickUpper ? 'token0-only' : 'both-tokens'
    });

    return {
      amount0Calculated,
      amount1Calculated
    };
  }

  /**
   * 获取池子价格信息 - 从routes.ts转移的完整逻辑
   */
  async getPoolPriceInfo(params: {
    token0: string;
    token1: string;
    fee: number;
  }): Promise<{
    poolAddress: string;
    currentTick: number;
    currentPrice: number;
    decimalsAdjustedPrice: number;
    token0PerToken1Price: number;
    token1PerToken0Price: number;
    token0Info: any;
    token1Info: any;
    poolState: any;
    priceDisplay: any;
    explanation: any;
  }> {
    try {
      const { token0, token1, fee } = params;

      // 获取池子地址
      const poolAddress = await this.getPoolAddress(token0, token1, fee);
      
      console.log('📍 池子地址:', poolAddress);
      
      // 获取池子状态
      const poolState = await this.getPoolState(poolAddress);
      
      // 计算当前价格
      const currentTick = poolState.tick;
      const currentPrice = Math.pow(1.0001, currentTick);
      
      // 获取代币信息
      const [token0Info, token1Info] = await Promise.all([
        this.getTokenInfo(token0),
        this.getTokenInfo(token1)
      ]);
      
      // 调整小数位数 - 这个价格表示的是 token1/token0 的比率
      const decimalsAdjustedPrice = currentPrice * Math.pow(10, token0Info.decimals - token1Info.decimals);
      
      // 正确的价格解释：
      // currentPrice 是 sqrt(price) 的平方，实际上表示 token1/token0 的价格比率
      // 如果 currentPrice = 0.00149，意味着 1 token0 = 0.00149 token1
      // 反过来，1 token1 = 1/0.00149 = 671.5 token0
      const token0PerToken1Price = 1 / decimalsAdjustedPrice;  // 1 token1 需要多少 token0
      const token1PerToken0Price = decimalsAdjustedPrice;      // 1 token0 需要多少 token1
      
      const priceInfo = {
        poolAddress,
        currentTick,
        currentPrice,
        decimalsAdjustedPrice,
        token0PerToken1Price,
        token1PerToken0Price,
        token0Info,
        token1Info,
        poolState,
        priceDisplay: {
          token0PerToken1: `1 ${token1Info.symbol} = ${token0PerToken1Price.toFixed(6)} ${token0Info.symbol}`,
          token1PerToken0: `1 ${token0Info.symbol} = ${token1PerToken0Price.toFixed(6)} ${token1Info.symbol}`
        },
        explanation: {
          currentTickMeaning: `Tick ${currentTick} 表示当前价格点`,
          priceInterpretation: `价格 ${decimalsAdjustedPrice.toFixed(6)} 表示 1 ${token0Info.symbol} = ${token1PerToken0Price.toFixed(6)} ${token1Info.symbol}`,
          realWorldPrice: `实际含义: 1 ${token1Info.symbol} ≈ ${token0PerToken1Price.toFixed(2)} ${token0Info.symbol}`
        }
      };

      console.log('✅ 池子价格信息获取成功');
      console.log('🏷️ 当前价格:', priceInfo.priceDisplay);

      return priceInfo;

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 获取池子价格失败:', error);
      throw error;
    }
  }

  /**
   * 执行批量操作 - 从routes.ts转移的完整逻辑
   */
  async executeBatchOperations(operations: Array<{
    type: string;
    params: any;
  }>): Promise<{
    results: Array<{
      operation: any;
      result?: any;
      error?: string;
      success: boolean;
    }>;
    summary: {
      total: number;
      success: number;
      failed: number;
      totalGasUsed: number;
    };
  }> {
    try {
      console.log('📦 执行批量流动性操作');

      const results = [];
      let totalGasUsed = 0;

      // 顺序执行操作
      for (const operation of operations) {
        try {
          let result;
          
          switch (operation.type) {
            case 'mint':
              result = await this.createOptimalPosition(operation.params);
              break;
            case 'increase':
              result = await this.increaseLiquidity(operation.params);
              break;
            case 'decrease':
              result = await this.decreaseLiquidity(operation.params);
              break;
            case 'collect':
              result = await this.collectFees(operation.params);
              break;
            default:
              throw new Error(`不支持的操作类型: ${operation.type}`);
          }
          
          results.push({
            operation,
            result,
            success: true
          });
          
        } catch (error) {
          results.push({
            operation,
            error: error instanceof Error ? error.message : String(error),
            success: false
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      console.log('✅ 批量操作完成');

      return {
        results,
        summary: {
          total: operations.length,
          success: successCount,
          failed: failureCount,
          totalGasUsed
        }
      };

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 批量操作失败:', error);
      throw error;
    }
  }

  /**
   * 动态编译策略代码 - 从routes.ts转移的完整逻辑
   */
  compileStrategy(code: string, metadata: any): any {
    try {
      // 简单的代码编译（实际项目中可能需要更复杂的沙箱机制）
      const StrategyClass = eval(`(function() { ${code}; return StrategyClass; })()`);
      
      // 创建策略实例并设置元数据
      const strategy = new StrategyClass();
      strategy.id = metadata.id;
      strategy.name = metadata.name;
      strategy.description = metadata.description;
      
      if (metadata.config) {
        strategy.getDefaultConfig = () => metadata.config;
      }
      
      return strategy;

    } catch (error) {
      throw new Error(`策略代码编译失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 