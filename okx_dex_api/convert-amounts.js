// 代币数量转换脚本
const Web3 = require('web3');

// 原始数值
const fromTokenAmount = '20411380966689003';
const minReturnAmount = '12860335665166604371';

console.log('=== 代币数量转换 ===\n');

// 常见的代币精度转换
const decimalsOptions = [6, 8, 9, 18]; // 常见的代币精度

decimalsOptions.forEach(decimals => {
    console.log(`使用 ${decimals} 位精度:`);
    
    const fromAmount = parseFloat(fromTokenAmount) / Math.pow(10, decimals);
    const minReturn = parseFloat(minReturnAmount) / Math.pow(10, decimals);
    
    console.log(`  fromTokenAmount: ${fromAmount.toFixed(decimals)} 个代币`);
    console.log(`  minReturnAmount: ${minReturn.toFixed(decimals)} 个代币`);
    console.log(`  交换比率: 1 输入代币 ≈ ${(minReturn/fromAmount).toFixed(6)} 输出代币`);
    console.log('');
});

// 特别显示18位精度（最常见）
console.log('=== 最可能的结果 (18位精度) ===');
const fromAmount18 = parseFloat(fromTokenAmount) / Math.pow(10, 18);
const minReturn18 = parseFloat(minReturnAmount) / Math.pow(10, 18);

console.log(`输入数量 (fromTokenAmount): ${fromAmount18.toFixed(8)} 个代币`);
console.log(`最小返回数量 (minReturnAmount): ${minReturn18.toFixed(8)} 个代币`);
console.log(`交换比率: 1 输入代币 = ${(minReturn18/fromAmount18).toFixed(2)} 输出代币`);

// 计算滑点保护百分比
const expectedReturn = minReturn18 / (1 - 0.005); // 假设0.5%滑点
console.log(`\n=== 滑点分析 ===`);
console.log(`如果滑点容忍度为 0.5%:`);
console.log(`  预期返回数量: ${expectedReturn.toFixed(8)} 个代币`);
console.log(`  最小返回数量: ${minReturn18.toFixed(8)} 个代币`);
console.log(`  滑点保护差额: ${(expectedReturn - minReturn18).toFixed(8)} 个代币`); 