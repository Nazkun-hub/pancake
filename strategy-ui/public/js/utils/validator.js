/**
 * 数据验证工具函数
 */

/**
 * 验证以太坊地址
 */
export function isValidAddress(address) {
  if (!address) return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * 验证数字
 */
export function isValidNumber(value, min = null, max = null) {
  const num = parseFloat(value);
  if (isNaN(num)) return false;
  if (min !== null && num < min) return false;
  if (max !== null && num > max) return false;
  return true;
}

/**
 * 验证策略参数
 */
export function validateStrategyParams(params) {
  const errors = [];
  
  if (!isValidAddress(params.poolAddress)) {
    errors.push('无效的池地址');
  }
  
  if (!isValidNumber(params.amount, 0)) {
    errors.push('金额必须大于0');
  }
  
  if (!isValidNumber(params.lowerTick) || !isValidNumber(params.upperTick)) {
    errors.push('价格区间无效');
  }
  
  if (params.lowerTick >= params.upperTick) {
    errors.push('下限价格必须小于上限价格');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * 验证表单数据
 */
export function validateForm(formData, rules) {
  const errors = {};
  
  for (const [field, fieldRules] of Object.entries(rules)) {
    const value = formData[field];
    
    if (fieldRules.required && (!value || value.toString().trim() === '')) {
      errors[field] = '此字段为必填项';
      continue;
    }
    
    if (value && fieldRules.type === 'number' && !isValidNumber(value, fieldRules.min, fieldRules.max)) {
      errors[field] = `数值必须在 ${fieldRules.min || 0} 到 ${fieldRules.max || '无限制'} 之间`;
      continue;
    }
    
    if (value && fieldRules.type === 'address' && !isValidAddress(value)) {
      errors[field] = '无效的地址格式';
      continue;
    }
    
    if (value && fieldRules.pattern && !fieldRules.pattern.test(value)) {
      errors[field] = fieldRules.message || '格式不正确';
      continue;
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
} 