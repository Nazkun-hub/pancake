import * as CryptoJS from 'crypto-js';
import { OKXConfig } from '../types';

/**
 * OKX API 认证管理器
 * 修复签名验证问题 (50113错误)
 */
export class AuthManager {
  private config: OKXConfig;

  constructor(config: OKXConfig) {
    this.config = config;
  }

  /**
   * 生成API请求头
   * @param timestamp Unix毫秒时间戳
   * @param method HTTP方法 (大写)
   * @param requestPath 完整请求路径 (包含/api/v5前缀)
   * @param body 请求体或查询字符串
   */
  public getHeaders(
    timestamp: string,
    method: string,
    requestPath: string,
    body: string = ''
  ): Record<string, string> {
    // 确保方法名大写
    const upperMethod = method.toUpperCase();
    
    // 构建签名字符串：timestamp + method + requestPath + body
    const stringToSign = timestamp + upperMethod + requestPath + body;
    
    // 使用HMAC-SHA256计算签名，并转换为Base64
    const signature = CryptoJS.enc.Base64.stringify(
      CryptoJS.HmacSHA256(stringToSign, this.config.secretKey)
    );

    // 调试输出
    console.log('🔐 签名计算详情:');
    console.log(`   时间戳: ${timestamp}`);
    console.log(`   方法: ${upperMethod}`);
    console.log(`   路径: ${requestPath}`);
    console.log(`   Body: ${body || '(空)'}`);
    console.log(`   签名字符串: ${stringToSign}`);
    console.log(`   签名结果: ${signature.substring(0, 20)}...`);

    return {
      'Content-Type': 'application/json',
      'OK-ACCESS-KEY': this.config.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.config.apiPassphrase,
      'OK-ACCESS-PROJECT': this.config.projectId,
    };
  }

  /**
   * 生成当前Unix毫秒时间戳
   * OKX API要求使用Unix毫秒时间戳，不是ISO格式
   */
  public generateTimestamp(): string {
    return Date.now().toString();
  }

  /**
   * 验证配置有效性
   */
  public validateConfig(): boolean {
    const { apiKey, secretKey, apiPassphrase, projectId } = this.config;
    const isValid = !!(apiKey && secretKey && apiPassphrase && projectId);
    
    if (!isValid) {
      console.error('❌ OKX API配置不完整:');
      console.error(`   API Key: ${apiKey ? '✓' : '✗'}`);
      console.error(`   Secret Key: ${secretKey ? '✓' : '✗'}`);
      console.error(`   Passphrase: ${apiPassphrase ? '✓' : '✗'}`);
      console.error(`   Project ID: ${projectId ? '✓' : '✗'}`);
    }
    
    return isValid;
  }
} 