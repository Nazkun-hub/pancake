/**
 * 策略配置表单组件
 * 提供完整的策略参数配置界面
 */

export class StrategyFormComponent {
  constructor(container, api) {
    this.container = container;
    this.api = api;
    this.formData = {};
    this.isSubmitting = false;
    this.poolTokenInfo = null; // 存储池子的代币信息
  }

  /**
   * 渲染策略配置表单
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="strategy-form-wrapper">
        <div class="form-section">
          <h3>基础配置</h3>
          
          <!-- 池地址 -->
          <div class="form-group">
            <label for="poolAddress">流动性池地址 <span class="required">*</span></label>
            <input 
              type="text" 
              id="poolAddress" 
              name="poolAddress"
              placeholder="0x... (输入PancakeSwap V3池地址)"
              required
            />
            <small class="form-help">输入目标流动性池的合约地址</small>
            <div class="form-error" id="poolAddressError"></div>
          </div>

          <!-- 主要代币选择 -->
          <div class="form-group">
            <label for="mainToken">主要代币 <span class="required">*</span></label>
            <select id="mainToken" name="mainToken" required>
              <option value="">选择主要投入的代币</option>
              <option value="token0">Token0 (池中第一个代币)</option>
              <option value="token1">Token1 (池中第二个代币)</option>
            </select>
            <small class="form-help">以哪个代币为主要投入</small>
            <div id="mainTokenInfo" class="token-info hidden"></div>
          </div>

          <!-- 代币数量 -->
          <div class="form-group">
            <label for="amount">投入数量 <span class="required">*</span></label>
            <input 
              type="number" 
              id="amount" 
              name="amount"
              step="0.000001"
              min="0.000001"
              placeholder="请输入投入的代币数量"
              required
            />
            <small class="form-help">投入的主要代币数量</small>
            <div class="form-error" id="amountError"></div>
          </div>
        </div>

        <div class="form-section">
          <h3>价格范围设置</h3>
          
          <!-- 价格范围百分比 -->
          <div class="form-row">
            <div class="form-group">
              <label for="lowerPercent">下限百分比 <span class="required">*</span></label>
              <input 
                type="number" 
                id="lowerPercent" 
                name="lowerPercent"
                step="0.1"
                min="-50"
                max="0"
                value="-5"
                required
              />
              <small class="form-help">相对当前价格的下限百分比</small>
            </div>
            
            <div class="form-group">
              <label for="upperPercent">上限百分比 <span class="required">*</span></label>
              <input 
                type="number" 
                id="upperPercent" 
                name="upperPercent"
                step="0.1"
                min="0"
                max="50"
                value="5"
                required
              />
              <small class="form-help">相对当前价格的上限百分比</small>
            </div>
          </div>

          <div class="range-preview">
            <div class="range-info">
              <span class="range-label">价格范围预览:</span>
              <span id="rangePreview">请输入价格范围</span>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3>风险控制参数</h3>
          
          <!-- OKX DEX 交易滑点 -->
          <div class="form-group">
            <label for="okxSlippage">OKX交易滑点 (%) <span class="required">*</span></label>
            <input 
              type="number" 
              id="okxSlippage" 
              name="okxSlippage"
              step="0.01"
              min="0.01"
              max="1"
              value="0.05"
              required
            />
            <small class="form-help">OKX DEX API代币交换的滑点容忍度 (最大1%)</small>
          </div>

          <!-- PancakeSwap 流动性滑点 -->
          <div class="form-group">
            <label for="liquiditySlippage">流动性滑点 (%) <span class="required">*</span></label>
            <input 
              type="number" 
              id="liquiditySlippage" 
              name="liquiditySlippage"
              step="0.5"
              min="0.5"
              max="50"
              value="20"
              required
            />
            <small class="form-help">PancakeSwap提供流动性时的滑点容忍度</small>
          </div>

          <!-- 交换缓冲百分比 -->
          <div class="form-group">
            <label for="swapBuffer">交换缓冲百分比 (%) <span class="required">*</span></label>
            <input 
              type="number" 
              id="swapBuffer" 
              name="swapBuffer"
              step="0.1"
              min="0"
              max="5"
              value="1"
              required
            />
            <small class="form-help">代币交换时的额外缓冲，防止价格波动造成不足</small>
          </div>

          <!-- 监控超时时间 -->
          <div class="form-group">
            <label for="timeoutSeconds">超时时间 (秒) <span class="required">*</span></label>
            <input 
              type="number" 
              id="timeoutSeconds" 
              name="timeoutSeconds"
              step="1"
              min="5"
              max="3600"
              value="60"
              required
            />
            <small class="form-help">价格超出范围后等待的时间，超时则退出策略</small>
          </div>
        </div>

        <div class="form-section">
          <h3>退出设置</h3>
          
          <!-- 退出代币选择 -->
          <div class="form-group">
            <label for="exitToken">退出时卖出代币 <span class="required">*</span></label>
            <select id="exitToken" name="exitToken" required>
              <option value="">选择要卖出的代币</option>
              <option value="token0">Token0 (池中第一个代币)</option>
              <option value="token1">Token1 (池中第二个代币)</option>
            </select>
            <small class="form-help">策略退出时，选择卖出哪个代币换成另一个代币</small>
            <div id="exitTokenInfo" class="token-info hidden"></div>
          </div>
        </div>

        <!-- 表单操作按钮 -->
        <div class="form-actions">
          <button type="button" class="btn btn-outline" id="previewBtn">
            <span class="btn-icon">👁️</span>
            预览配置
          </button>
          
          <button type="submit" class="btn btn-primary" id="submitBtn">
            <span class="btn-icon">🚀</span>
            <span class="btn-text">创建策略</span>
            <span class="btn-loading" style="display: none;">
              <span class="spinner"></span>
              创建中...
            </span>
          </button>
        </div>

        <!-- 配置预览弹窗 -->
        <div id="configPreview" class="config-preview" style="display: none;">
          <div class="preview-content">
            <h4>策略配置预览</h4>
            <div id="previewDetails"></div>
            <div class="preview-actions">
              <button type="button" class="btn btn-outline" id="closePreview">关闭</button>
              <button type="button" class="btn btn-primary" id="confirmCreate">确认创建</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.initializeForm();
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    const form = this.container.querySelector('.strategy-form-wrapper');
    if (!form) return;

    // 表单字段变化事件
    form.addEventListener('input', (e) => {
      this.handleFieldChange(e.target);
    });

    // 表单提交事件
    const submitBtn = form.querySelector('#submitBtn');
    submitBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // 预览按钮
    const previewBtn = form.querySelector('#previewBtn');
    previewBtn?.addEventListener('click', () => {
      this.showConfigPreview();
    });

    // 预览弹窗事件
    const closePreview = form.querySelector('#closePreview');
    closePreview?.addEventListener('click', () => {
      this.hideConfigPreview();
    });

    const confirmCreate = form.querySelector('#confirmCreate');
    confirmCreate?.addEventListener('click', () => {
      this.hideConfigPreview();
      this.handleSubmit();
    });
  }

  /**
   * 初始化表单
   */
  initializeForm() {
    // 设置默认值
    this.updateRangePreview();
    
    // 添加实时验证
    this.setupRealTimeValidation();
  }

  /**
   * 设置实时验证
   */
  setupRealTimeValidation() {
    const form = this.container.querySelector('.strategy-form-wrapper');
    if (!form) return;

    // 池地址验证 - 失去焦点时验证
    const poolAddress = form.querySelector('#poolAddress');
    poolAddress?.addEventListener('blur', () => {
      const address = poolAddress.value.trim();
      if (address) {
        this.validatePoolAddress(address);
      }
    });

    // 池地址输入时清除错误状态
    poolAddress?.addEventListener('input', () => {
      this.clearFieldError('poolAddress');
      // 如果地址被清空，重置代币选择
      if (!poolAddress.value.trim()) {
        this.resetTokenSelections();
      }
    });

    // 价格范围实时更新
    const lowerPercent = form.querySelector('#lowerPercent');
    const upperPercent = form.querySelector('#upperPercent');
    
    [lowerPercent, upperPercent].forEach(input => {
      input?.addEventListener('input', () => {
        this.updateRangePreview();
        this.validatePriceRange();
      });
    });
  }

  /**
   * 处理字段变化
   */
  handleFieldChange(field) {
    const { name, value } = field;
    this.formData[name] = value;

    // 清除错误状态
    this.clearFieldError(field);

    // 特殊处理
    if (name === 'lowerPercent' || name === 'upperPercent') {
      this.updateRangePreview();
    }
  }

  /**
   * 更新价格范围预览
   */
  updateRangePreview() {
    const form = this.container.querySelector('.strategy-form-wrapper');
    if (!form) return;

    const lowerPercent = parseFloat(form.querySelector('#lowerPercent')?.value || 0);
    const upperPercent = parseFloat(form.querySelector('#upperPercent')?.value || 0);
    const preview = form.querySelector('#rangePreview');

    if (preview) {
      if (lowerPercent < upperPercent) {
        preview.textContent = `当前价格 ${lowerPercent >= 0 ? '+' : ''}${lowerPercent}% ~ +${upperPercent}%`;
        preview.className = 'range-valid';
      } else {
        preview.textContent = '⚠️ 上限必须大于下限';
        preview.className = 'range-invalid';
      }
    }
  }

  /**
   * 验证池地址
   */
  async validatePoolAddress(address) {
    const errorElement = this.container.querySelector('#poolAddressError');
    if (!errorElement) return false;

    if (!address) {
      this.showFieldError('poolAddress', '池地址不能为空');
      this.resetTokenSelections();
      return false;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      this.showFieldError('poolAddress', '池地址格式不正确');
      this.resetTokenSelections();
      return false;
    }

    try {
      // 显示加载状态
      this.setTokenSelectionsLoading(true);
      
      // 获取池子的代币信息
      const poolInfo = await this.api.getPoolTokenInfo(address);
      
      if (poolInfo && poolInfo.success && poolInfo.token0 && poolInfo.token1) {
        // 保存代币信息
        this.poolTokenInfo = poolInfo;
        
        // 更新代币选择框
        this.updateTokenSelections(poolInfo);
        
        this.clearFieldError('poolAddress');
        this.showNotification(`池子代币信息已加载: ${poolInfo.token0.symbol}/${poolInfo.token1.symbol}`, 'success');
        return true;
      } else {
        throw new Error(poolInfo.error || '无法获取池子代币信息');
      }

    } catch (error) {
      console.error('获取池子信息失败:', error);
      this.showFieldError('poolAddress', '池地址无效或获取信息失败');
      this.resetTokenSelections();
      return false;
    } finally {
      this.setTokenSelectionsLoading(false);
    }
  }

  /**
   * 验证价格范围
   */
  validatePriceRange() {
    const form = this.container.querySelector('.strategy-form-wrapper');
    if (!form) return false;

    const lowerPercent = parseFloat(form.querySelector('#lowerPercent')?.value || 0);
    const upperPercent = parseFloat(form.querySelector('#upperPercent')?.value || 0);

    if (lowerPercent >= upperPercent) {
      this.showFieldError('upperPercent', '上限必须大于下限');
      return false;
    }

    this.clearFieldError('lowerPercent');
    this.clearFieldError('upperPercent');
    return true;
  }

  /**
   * 显示字段错误
   */
  showFieldError(fieldName, message) {
    const field = this.container.querySelector(`[name="${fieldName}"]`);
    const errorElement = this.container.querySelector(`#${fieldName}Error`);
    
    if (field) field.classList.add('error');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
  }

  /**
   * 清除字段错误
   */
  clearFieldError(fieldOrName) {
    const fieldName = typeof fieldOrName === 'string' ? fieldOrName : fieldOrName.name;
    const field = this.container.querySelector(`[name="${fieldName}"]`);
    const errorElement = this.container.querySelector(`#${fieldName}Error`);
    
    if (field) field.classList.remove('error');
    if (errorElement) {
      errorElement.style.display = 'none';
      errorElement.textContent = '';
    }
  }

  /**
   * 显示配置预览
   */
  showConfigPreview() {
    if (!this.validateForm()) {
      this.showNotification('请先完善表单配置', 'warning');
      return;
    }

    const config = this.getFormData();
    const preview = this.container.querySelector('#configPreview');
    const details = this.container.querySelector('#previewDetails');

    if (details) {
      details.innerHTML = `
        <div class="config-item">
          <label>流动性池地址:</label>
          <span>${config.poolAddress}</span>
        </div>
        <div class="config-item">
          <label>主要代币:</label>
          <span>${this.getTokenDisplayName(config.mainToken)}</span>
        </div>
        <div class="config-item">
          <label>投入数量:</label>
          <span>${config.amount}</span>
        </div>
        <div class="config-item">
          <label>价格范围:</label>
          <span>${config.lowerPercent}% ~ +${config.upperPercent}%</span>
        </div>
        <div class="config-item">
          <label>OKX交易滑点:</label>
          <span>${config.okxSlippage}%</span>
        </div>
        <div class="config-item">
          <label>流动性滑点:</label>
          <span>${config.liquiditySlippage}%</span>
        </div>
        <div class="config-item">
          <label>交换缓冲:</label>
          <span>${config.swapBuffer}%</span>
        </div>
        <div class="config-item">
          <label>超时时间:</label>
          <span>${config.timeoutSeconds}秒</span>
        </div>
        <div class="config-item">
          <label>退出时卖出:</label>
          <span>${this.getTokenDisplayName(config.exitToken)}</span>
        </div>
      `;
    }

    if (preview) {
      preview.style.display = 'flex';
    }
  }

  /**
   * 隐藏配置预览
   */
  hideConfigPreview() {
    const preview = this.container.querySelector('#configPreview');
    if (preview) {
      preview.style.display = 'none';
    }
  }

  /**
   * 验证整个表单
   */
  validateForm() {
    let isValid = true;

    // 验证必填字段
    const requiredFields = ['poolAddress', 'mainToken', 'amount', 'lowerPercent', 'upperPercent', 'okxSlippage', 'liquiditySlippage', 'swapBuffer', 'timeoutSeconds', 'exitToken'];
    
    requiredFields.forEach(fieldName => {
      const field = this.container.querySelector(`[name="${fieldName}"]`);
      if (!field) {
        console.error(`字段 ${fieldName} 未找到`);
        isValid = false;
        return;
      }
      
      const value = field.value ? field.value.trim() : '';
      
      if (!value) {
        this.showFieldError(fieldName, '此字段为必填项');
        isValid = false;
      } else {
        this.clearFieldError(fieldName);
      }
    });

    // 验证价格范围
    if (!this.validatePriceRange()) {
      isValid = false;
    }

    // 验证数值范围
    const amount = parseFloat(this.container.querySelector('#amount')?.value || 0);
    if (amount <= 0) {
      this.showFieldError('amount', '投入数量必须大于0');
      isValid = false;
    }

    return isValid;
  }

  /**
   * 获取表单数据
   */
  getFormData() {
    const form = this.container.querySelector('.strategy-form-wrapper');
    if (!form) {
      console.error('表单容器未找到');
      return {};
    }

    // 手动收集表单数据，而不是使用FormData
    const data = {};
    
    // 收集所有input和select元素的值
    const fields = form.querySelectorAll('input[name], select[name]');
    
    fields.forEach(field => {
      if (field.name) {
        data[field.name] = field.value || '';
      }
    });

    // 转换数值类型
    ['amount', 'lowerPercent', 'upperPercent', 'okxSlippage', 'liquiditySlippage', 'swapBuffer', 'timeoutSeconds'].forEach(field => {
      if (data[field] && data[field] !== '') {
        const numValue = parseFloat(data[field]);
        if (!isNaN(numValue)) {
          data[field] = numValue;
        }
      }
    });

    return data;
  }

  /**
   * 处理表单提交
   */
  async handleSubmit() {
    if (this.isSubmitting) return;

    if (!this.validateForm()) {
      this.showNotification('请检查表单配置', 'error');
      return;
    }

    this.isSubmitting = true;
    this.setSubmittingState(true);

    try {
      const config = this.getFormData();
      
      console.log('提交策略配置:', config);
      
      // 调用API创建策略
      const result = await this.api.createStrategy(config);
      
      if (result.success) {
        this.showNotification('策略创建成功！', 'success');
        this.resetForm();
        
        // 触发策略创建成功事件
        if (window.app) {
          window.app.onStrategyCreated(result.data);
        }
      } else {
        throw new Error(result.error || '创建策略失败');
      }

    } catch (error) {
      console.error('创建策略失败:', error);
      this.showNotification(`创建策略失败: ${error.message}`, 'error');
    } finally {
      this.isSubmitting = false;
      this.setSubmittingState(false);
    }
  }

  /**
   * 设置提交状态
   */
  setSubmittingState(isSubmitting) {
    const submitBtn = this.container.querySelector('#submitBtn');
    const btnText = submitBtn?.querySelector('.btn-text');
    const btnLoading = submitBtn?.querySelector('.btn-loading');

    if (submitBtn) {
      submitBtn.disabled = isSubmitting;
      
      if (btnText) btnText.style.display = isSubmitting ? 'none' : 'inline';
      if (btnLoading) btnLoading.style.display = isSubmitting ? 'inline' : 'none';
    }
  }

  /**
   * 重置表单
   */
  resetForm() {
    const form = this.container.querySelector('.strategy-form-wrapper');
    if (!form) return;

    // 清除所有输入
    form.querySelectorAll('input, select').forEach(field => {
      if (field.type === 'number') {
        field.value = field.getAttribute('value') || '';
      } else {
        field.value = '';
      }
      this.clearFieldError(field);
    });

    // 重置默认值
    form.querySelector('#lowerPercent').value = '-5';
    form.querySelector('#upperPercent').value = '5';
    form.querySelector('#okxSlippage').value = '0.5';
    form.querySelector('#liquiditySlippage').value = '20';
    form.querySelector('#swapBuffer').value = '1';
    form.querySelector('#timeoutSeconds').value = '60';

    // 重置代币选择
    this.resetTokenSelections();

    this.updateRangePreview();
    this.formData = {};
  }

  /**
   * 显示通知
   */
  showNotification(message, type = 'info') {
    if (window.app && typeof window.app.showNotification === 'function') {
      window.app.showNotification(message, type);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  /**
   * 重置代币选择
   */
  resetTokenSelections() {
    const form = this.container.querySelector('.strategy-form-wrapper');
    if (!form) return;

    const mainTokenSelect = form.querySelector('#mainToken');
    const exitTokenSelect = form.querySelector('#exitToken');

    // 重置为默认选项
    mainTokenSelect.innerHTML = `
      <option value="">选择主要投入的代币</option>
      <option value="token0">Token0 (池中第一个代币)</option>
      <option value="token1">Token1 (池中第二个代币)</option>
    `;
    mainTokenSelect.value = '';

    exitTokenSelect.innerHTML = `
      <option value="">选择要卖出的代币</option>
      <option value="token0">Token0 (池中第一个代币)</option>
      <option value="token1">Token1 (池中第二个代币)</option>
    `;
    exitTokenSelect.value = '';

    // 清除代币信息
    this.poolTokenInfo = null;
    
    // 隐藏代币信息显示
    this.hideTokenInfo();
  }

  /**
   * 设置代币选择加载状态
   */
  setTokenSelectionsLoading(isLoading) {
    const form = this.container.querySelector('.strategy-form-wrapper');
    if (!form) return;

    const mainTokenSelect = form.querySelector('#mainToken');
    const exitTokenSelect = form.querySelector('#exitToken');

    if (isLoading) {
      mainTokenSelect.innerHTML = `<option value="">🔄 加载代币信息中...</option>`;
      exitTokenSelect.innerHTML = `<option value="">🔄 加载代币信息中...</option>`;
      mainTokenSelect.disabled = true;
      exitTokenSelect.disabled = true;
    } else {
      mainTokenSelect.disabled = false;
      exitTokenSelect.disabled = false;
    }
  }

  /**
   * 更新代币选择
   */
  updateTokenSelections(poolInfo) {
    const form = this.container.querySelector('.strategy-form-wrapper');
    if (!form) return;

    const mainTokenSelect = form.querySelector('#mainToken');
    const exitTokenSelect = form.querySelector('#exitToken');

    // 构建选项HTML，显示具体的代币名称
    const token0Display = `${poolInfo.token0.symbol} (${poolInfo.token0.name})`;
    const token1Display = `${poolInfo.token1.symbol} (${poolInfo.token1.name})`;

    // 更新主要代币选择框
    mainTokenSelect.innerHTML = `
      <option value="">选择主要投入的代币</option>
      <option value="token0">${token0Display}</option>
      <option value="token1">${token1Display}</option>
    `;

    // 更新退出代币选择框
    exitTokenSelect.innerHTML = `
      <option value="">选择要卖出的代币</option>
      <option value="token0">${token0Display}</option>
      <option value="token1">${token1Display}</option>
    `;

    // 默认选择第一个代币作为主要代币
    mainTokenSelect.value = 'token0';
    
    // 默认选择第二个代币作为退出代币 (与主要代币不同)
    exitTokenSelect.value = 'token1';

    // 触发change事件以更新表单数据
    mainTokenSelect.dispatchEvent(new Event('change'));
    exitTokenSelect.dispatchEvent(new Event('change'));

    // 显示代币信息
    this.updateTokenInfo();
  }

  /**
   * 更新代币信息显示
   */
  updateTokenInfo() {
    const form = this.container.querySelector('.strategy-form-wrapper');
    if (!form || !this.poolTokenInfo) return;

    const mainTokenInfo = form.querySelector('#mainTokenInfo');
    const exitTokenInfo = form.querySelector('#exitTokenInfo');

    if (mainTokenInfo && this.poolTokenInfo.token0 && this.poolTokenInfo.token1) {
      mainTokenInfo.innerHTML = `
        <div class="token-item">
          <span class="token-symbol">Token0: ${this.poolTokenInfo.token0.symbol}</span>
          <span class="token-name">${this.poolTokenInfo.token0.name}</span>
        </div>
        <div class="token-item">
          <span class="token-symbol">Token1: ${this.poolTokenInfo.token1.symbol}</span>
          <span class="token-name">${this.poolTokenInfo.token1.name}</span>
        </div>
      `;
      mainTokenInfo.classList.remove('hidden');
    }

    if (exitTokenInfo && this.poolTokenInfo.token0 && this.poolTokenInfo.token1) {
      exitTokenInfo.innerHTML = `
        <div class="token-item">
          <span class="token-symbol">Token0: ${this.poolTokenInfo.token0.symbol}</span>
          <span class="token-name">${this.poolTokenInfo.token0.name}</span>
        </div>
        <div class="token-item">
          <span class="token-symbol">Token1: ${this.poolTokenInfo.token1.symbol}</span>
          <span class="token-name">${this.poolTokenInfo.token1.name}</span>
        </div>
      `;
      exitTokenInfo.classList.remove('hidden');
    }
  }

  /**
   * 隐藏代币信息显示
   */
  hideTokenInfo() {
    const form = this.container.querySelector('.strategy-form-wrapper');
    if (!form) return;

    const mainTokenInfo = form.querySelector('#mainTokenInfo');
    const exitTokenInfo = form.querySelector('#exitTokenInfo');

    if (mainTokenInfo) {
      mainTokenInfo.classList.add('hidden');
    }

    if (exitTokenInfo) {
      exitTokenInfo.classList.add('hidden');
    }
  }

  /**
   * 获取代币显示名称
   */
  getTokenDisplayName(token) {
    if (!token) return '未选择';
    
    const poolInfo = this.poolTokenInfo;
    if (poolInfo && poolInfo.token0 && poolInfo.token1) {
      if (token === 'token0') {
        return `${poolInfo.token0.symbol} (${poolInfo.token0.name})`;
      } else if (token === 'token1') {
        return `${poolInfo.token1.symbol} (${poolInfo.token1.name})`;
      }
    }
    
    // 如果没有代币信息，显示默认名称
    return token === 'token0' ? 'Token0' : token === 'token1' ? 'Token1' : '未知代币';
  }
} 