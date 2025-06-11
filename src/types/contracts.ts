/**
 * PancakeSwap V3 合约类型定义和ABI
 */

// Position Manager合约ABI - 核心方法
export const POSITION_MANAGER_ABI = [
  // Mint新头寸
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  
  // 增加流动性
  "function increaseLiquidity((uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)",
  
  // 减少流动性
  "function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint256 amount0, uint256 amount1)",
  
  // 收取手续费
  "function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) external payable returns (uint256 amount0, uint256 amount1)",
  
  // 销毁头寸
  "function burn(uint256 tokenId) external payable",
  
  // 获取头寸信息
  "function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)"
];

// ERC20代币合约ABI - 授权相关
export const ERC20_ABI = [
  "function balanceOf(address owner) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
  "function totalSupply() external view returns (uint256)"
];

// Factory合约ABI - 池子创建和查询
export const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
  "function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)"
];

// Pool合约ABI - 池子状态查询
export const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() external view returns (uint128)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function fee() external view returns (uint24)",
  "function tickSpacing() external view returns (int24)"
];

// 合约地址
export const CONTRACT_ADDRESSES = {
  // BSC主网地址
  POSITION_MANAGER: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
  FACTORY: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  SWAP_ROUTER: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
  // 常用代币地址
  WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  USDT: '0x55d398326f99059fF775485246999027B3197955',
  CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56'
};

// Mint参数类型
export interface MintParams {
  token0: string;
  token1: string;
  fee: number; // 手续费等级 (500, 2500, 10000)
  tickLower: number;
  tickUpper: number;
  amount0Desired: string;
  amount1Desired: string;
  amount0Min: string;
  amount1Min: string;
  recipient: string;
  deadline: number;
}

// 增加流动性参数
export interface IncreaseLiquidityParams {
  tokenId: string;
  amount0Desired: string;
  amount1Desired: string;
  amount0Min: string;
  amount1Min: string;
  deadline: number;
}

// 减少流动性参数
export interface DecreaseLiquidityParams {
  tokenId: string;
  liquidity: string;
  amount0Min: string;
  amount1Min: string;
  deadline: number;
}

// 收取手续费参数
export interface CollectParams {
  tokenId: string;
  recipient: string;
  amount0Max: string;
  amount1Max: string;
}

// 头寸信息
export interface PositionInfo {
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
}

// 池子状态信息
export interface PoolState {
  sqrtPriceX96: string;
  tick: number;
  observationIndex: number;
  observationCardinality: number;
  observationCardinalityNext: number;
  feeProtocol: number;
  unlocked: boolean;
}

// 交易参数
export interface TransactionParams {
  to: string;
  data: string;
  value?: string;
  gasLimit?: string;
  gasPrice?: string;
}

// 手续费等级
export enum FeeAmount {
  LOWEST = 100,
  LOW = 500,
  MEDIUM = 2500,
  HIGH = 10000
}

// Tick间距映射
export const TICK_SPACINGS: { [amount in FeeAmount]: number } = {
  [FeeAmount.LOWEST]: 1,
  [FeeAmount.LOW]: 10,
  [FeeAmount.MEDIUM]: 50,
  [FeeAmount.HIGH]: 200
}; 