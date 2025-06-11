/**
 * 合约服务 - PancakeSwap V3基础合约交互
 * 职责：纯粹的合约基础交互，不包含复杂的流动性逻辑
 */

import { ethers } from 'ethers';
import { inject, injectable } from 'tsyringe';
import { TYPES, IService, ModuleConfig, ModuleHealth, ModuleMetrics } from '../types/interfaces.js';
import { Web3Service } from './Web3Service.js';
import { IEventBus } from '../types/interfaces.js';
import {
  ERC20_ABI,
  FACTORY_ABI,
  POOL_ABI,
  CONTRACT_ADDRESSES
} from '../types/contracts.js';

@injectable()
export class ContractService implements IService {
  readonly name = 'ContractService';
  readonly version = '1.0.0';
  readonly dependencies = ['Web3Service', 'EventBus'];

  private factoryContract: ethers.Contract | null = null;
  
  private readonly metrics: ModuleMetrics = {
      uptime: 0,
      requestCount: 0,
      errorCount: 0,
      lastActivity: Date.now()
    };

  constructor(
    @inject(TYPES.Web3Service) private web3Service: Web3Service,
    @inject(TYPES.EventBus) private eventBus: IEventBus
  ) {}

  async initialize(config: ModuleConfig): Promise<void> {
    try {
      console.log('🔗 初始化ContractService...');

      const provider = this.web3Service.getProvider();
      if (!provider) {
        throw new Error('Provider未初始化');
      }

      // 初始化Factory合约实例
      this.factoryContract = new ethers.Contract(
        CONTRACT_ADDRESSES.FACTORY,
        FACTORY_ABI,
        provider
      );

      console.log('✅ ContractService初始化完成');
      console.log('📍 Factory:', CONTRACT_ADDRESSES.FACTORY);

    } catch (error) {
      console.error('❌ ContractService初始化失败:', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    console.log('🚀 ContractService已启动');
    this.metrics.uptime = Date.now();
  }

  async stop(): Promise<void> {
    console.log('🛑 ContractService已停止');
  }

  async healthCheck(): Promise<ModuleHealth> {
    try {
      const isProviderConnected = this.web3Service.getProvider() !== null;
      const isContractsReady = this.factoryContract !== null;
      
      if (!isProviderConnected || !isContractsReady) {
        return {
          status: 'error',
          message: `合约服务状态异常: Provider=${isProviderConnected ? '已连接' : '未连接'}, Contracts=${isContractsReady ? '已初始化' : '未初始化'}`,
          timestamp: Date.now()
        };
      }

      // 测试合约调用
      if (this.factoryContract) {
        await this.factoryContract.getPool(
          CONTRACT_ADDRESSES.WBNB,
          CONTRACT_ADDRESSES.USDT,
          500
        );
      }

      return {
        status: 'healthy',
        message: '合约服务运行正常',
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

  getMetrics(): ModuleMetrics {
    return {
      ...this.metrics,
      uptime: this.metrics.uptime ? Date.now() - this.metrics.uptime : 0
    };
  }

  async execute(params: any): Promise<any> {
    throw new Error('通用execute方法未实现，请使用具体的方法');
  }

  validate(params: any): boolean {
    return typeof params === 'object' && params !== null;
  }

  /**
   * 代币授权
   */
  async approveToken(tokenAddress: string, amount: string): Promise<string> {
    try {
      this.metrics.requestCount++;
      this.metrics.lastActivity = Date.now();

      const wallet = this.web3Service.getWallet();
      if (!wallet) {
        throw new Error('钱包未连接');
      }

      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
      
      const tx = await tokenContract.approve(
        CONTRACT_ADDRESSES.POSITION_MANAGER,
        amount,
        { gasLimit: '100000' }
      );

      console.log(`✅ 代币授权交易发送: ${tx.hash}`);
      return tx.hash;

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
      this.metrics.requestCount++;
      this.metrics.lastActivity = Date.now();

      const provider = this.web3Service.getProvider();
      if (!provider) throw new Error('Provider未初始化');

      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      
      const allowance = await tokenContract.allowance(
        ownerAddress,
        CONTRACT_ADDRESSES.POSITION_MANAGER
      );
      
      return allowance.toString();

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 检查授权额度失败:', error);
      throw error;
    }
  }

  /**
   * 获取池子地址
   */
  async getPoolAddress(token0: string, token1: string, fee: number): Promise<string> {
    try {
      this.metrics.requestCount++;
      this.metrics.lastActivity = Date.now();

      if (!this.factoryContract) throw new Error('Factory合约未初始化');

      const poolAddress = await this.factoryContract.getPool(token0, token1, fee);
      
      if (poolAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error(`池子不存在: ${token0}/${token1}/${fee}`);
      }

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
  async getPoolState(poolAddress: string): Promise<{
    sqrtPriceX96: string;
    tick: number;
    observationIndex: number;
    observationCardinality: number;
    observationCardinalityNext: number;
    feeProtocol: number;
    unlocked: boolean;
  }> {
    try {
      this.metrics.requestCount++;
      this.metrics.lastActivity = Date.now();

      const provider = this.web3Service.getProvider();
      if (!provider) throw new Error('Provider未初始化');

      const poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
      
      const slot0 = await poolContract.slot0();

      return {
        sqrtPriceX96: slot0.sqrtPriceX96.toString(),
        tick: parseInt(slot0.tick.toString()),
        observationIndex: parseInt(slot0.observationIndex.toString()),
        observationCardinality: parseInt(slot0.observationCardinality.toString()),
        observationCardinalityNext: parseInt(slot0.observationCardinalityNext.toString()),
        feeProtocol: parseInt(slot0.feeProtocol.toString()),
        unlocked: slot0.unlocked
      };

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 获取池子状态失败:', error);
      throw error;
    }
  }

  /**
   * 获取代币信息
   */
  async getTokenInfo(tokenAddress: string): Promise<{
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: string;
  }> {
    try {
      this.metrics.requestCount++;
      this.metrics.lastActivity = Date.now();

      const provider = this.web3Service.getProvider();
      if (!provider) throw new Error('Provider未初始化');

      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.totalSupply()
      ]);

      return {
        address: tokenAddress,
        name,
        symbol,
        decimals: parseInt(decimals.toString()),
        totalSupply: totalSupply.toString()
      };

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 获取代币信息失败:', error);
      throw error;
    }
  }

  /**
   * 获取可用tick间距
   */
  getTickSpacing(fee: number): number {
    const spacingMap: { [key: number]: number } = {
      500: 10,
      3000: 60,
      10000: 200
    };
    return spacingMap[fee] || 60;
  }

  /**
   * 获取最近的可用tick
   */
  nearestUsableTick(tick: number, tickSpacing: number): number {
    return Math.round(tick / tickSpacing) * tickSpacing;
  }

  /**
   * 创建流动性头寸
   */
  async mintPosition(mintParams: {
    token0: string;
    token1: string;
    fee: number;
    tickLower: number;
    tickUpper: number;
    amount0Desired: string;
    amount1Desired: string;
    amount0Min: string;
    amount1Min: string;
    recipient: string;
    deadline: number;
  }): Promise<string> {
    try {
      this.metrics.requestCount++;
      this.metrics.lastActivity = Date.now();

      const wallet = this.web3Service.getWallet();
      if (!wallet) {
        throw new Error('钱包未连接');
      }

      // 这里需要使用Position Manager合约的ABI
      const positionManagerContract = new ethers.Contract(
        CONTRACT_ADDRESSES.POSITION_MANAGER,
        [
          'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)'
        ],
        wallet
      );

      const tx = await positionManagerContract.mint(mintParams, {
        gasLimit: '500000'
      });

      console.log(`✅ 铸造头寸交易发送: ${tx.hash}`);
      return tx.hash;

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 铸造头寸失败:', error);
      throw error;
    }
  }

  /**
   * 获取头寸信息
   */
  async getPosition(tokenId: string): Promise<{
    nonce: string;
    operator: string;
    token0: string;
    token1: string;
    fee: number;
    tickLower: number;
    tickUpper: number;
    liquidity: string;
    feeGrowthInside0LastX128: string;
    feeGrowthInside1LastX128: string;
    tokensOwed0: string;
    tokensOwed1: string;
  }> {
    try {
      this.metrics.requestCount++;
      this.metrics.lastActivity = Date.now();

      const provider = this.web3Service.getProvider();
      if (!provider) throw new Error('Provider未初始化');

      const positionManagerContract = new ethers.Contract(
        CONTRACT_ADDRESSES.POSITION_MANAGER,
        [
          'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)'
        ],
        provider
      );

      const position = await positionManagerContract.positions(tokenId);

      return {
        nonce: position.nonce.toString(),
        operator: position.operator,
        token0: position.token0,
        token1: position.token1,
        fee: position.fee,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        liquidity: position.liquidity.toString(),
        feeGrowthInside0LastX128: position.feeGrowthInside0LastX128.toString(),
        feeGrowthInside1LastX128: position.feeGrowthInside1LastX128.toString(),
        tokensOwed0: position.tokensOwed0.toString(),
        tokensOwed1: position.tokensOwed1.toString()
      };

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 获取头寸信息失败:', error);
      throw error;
    }
  }

  /**
   * 减少流动性
   */
  async decreaseLiquidity(decreaseParams: {
    tokenId: string;
    liquidity: string;
    amount0Min: string;
    amount1Min: string;
    deadline: number;
  }): Promise<string> {
    try {
      this.metrics.requestCount++;
      this.metrics.lastActivity = Date.now();

      const wallet = this.web3Service.getWallet();
      if (!wallet) {
        throw new Error('钱包未连接');
      }

      const positionManagerContract = new ethers.Contract(
        CONTRACT_ADDRESSES.POSITION_MANAGER,
        [
          'function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint256 amount0, uint256 amount1)'
        ],
        wallet
      );

      const tx = await positionManagerContract.decreaseLiquidity(decreaseParams, {
        gasLimit: '300000'
      });

      console.log(`✅ 减少流动性交易发送: ${tx.hash}`);
      return tx.hash;

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 减少流动性失败:', error);
      throw error;
    }
  }

  /**
   * 收取手续费
   */
  async collectFees(collectParams: {
    tokenId: string;
    recipient: string;
    amount0Max: string;
    amount1Max: string;
  }): Promise<string> {
    try {
      this.metrics.requestCount++;
      this.metrics.lastActivity = Date.now();

      const wallet = this.web3Service.getWallet();
      if (!wallet) {
        throw new Error('钱包未连接');
      }

      const positionManagerContract = new ethers.Contract(
        CONTRACT_ADDRESSES.POSITION_MANAGER,
        [
          'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) external payable returns (uint256 amount0, uint256 amount1)'
        ],
        wallet
      );

      const tx = await positionManagerContract.collect(collectParams, {
        gasLimit: '200000'
      });

      console.log(`✅ 收取手续费交易发送: ${tx.hash}`);
      return tx.hash;

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
      this.metrics.requestCount++;
      this.metrics.lastActivity = Date.now();

      const wallet = this.web3Service.getWallet();
      if (!wallet) {
        throw new Error('钱包未连接');
      }

      const positionManagerContract = new ethers.Contract(
        CONTRACT_ADDRESSES.POSITION_MANAGER,
        [
          'function burn(uint256 tokenId) external payable'
        ],
        wallet
      );

      const tx = await positionManagerContract.burn(tokenId, {
        gasLimit: '150000'
      });

      console.log(`✅ 销毁头寸交易发送: ${tx.hash}`);
      return tx.hash;

    } catch (error) {
      this.metrics.errorCount++;
      console.error('❌ 销毁头寸失败:', error);
      throw error;
    }
  }
} 