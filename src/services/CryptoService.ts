/**
 * PancakeSwap V3 流动性管理系统 - 私钥加密解密服务
 * 使用AES-256-GCM算法加密私钥，确保资产安全
 */

import { injectable, inject } from 'tsyringe';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { IEventBus, Event, TYPES } from '../types/interfaces.js';

// 加密密钥文件名
export const ENCRYPTED_WALLET_FILENAME = '.encrypted_pancake_wallet.dat';
// 默认加密密钥存储路径
export const DEFAULT_ENCRYPTION_PATH = path.join(process.cwd());

export interface EncryptedData {
  encryptedData: string;
  iv: string;
  salt: string;
  timestamp: number;
  version: string;
}

export interface CryptoServiceConfig {
  encryptionPath?: string;
  filename?: string;
}

@injectable()
export class CryptoService {
  private encryptionPath: string;
  private filename: string;
  private isUnlocked: boolean = false;
  private currentPrivateKey: string | null = null;

  constructor(
    @inject(TYPES.EventBus) private eventBus: IEventBus
  ) {
    this.encryptionPath = DEFAULT_ENCRYPTION_PATH;
    this.filename = ENCRYPTED_WALLET_FILENAME;
    
    // 移除立即发布事件，因为此时EventBus可能还没有启动
    // 事件发布将在需要时异步进行
  }

  /**
   * 发布事件到事件总线（异步安全）
   */
  private async publishEvent(type: string, data: any): Promise<void> {
    try {
      const event: Event = {
        type,
        data,
        timestamp: Date.now(),
        source: 'CryptoService'
      };
      await this.eventBus.publish(event);
    } catch (error) {
      // 如果EventBus还没启动，静默忽略错误
      console.warn('⚠️ 事件发布失败（EventBus可能还没启动）:', error);
    }
  }

  /**
   * 加密私钥
   * @param privateKey 要加密的私钥
   * @param password 加密密码
   * @returns 加密数据对象
   */
  public encryptPrivateKey(privateKey: string, password: string): EncryptedData {
    try {
      // 验证私钥格式
      if (!this.isValidPrivateKey(privateKey)) {
        throw new Error('私钥格式无效');
      }

      // 生成随机盐值
      const salt = crypto.randomBytes(16).toString('hex');
      
      // 从密码和盐值生成密钥
      const key = crypto.scryptSync(password, salt, 32);
      
      // 生成随机初始化向量
      const iv = crypto.randomBytes(16);
      
      // 创建加密器
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      
      // 加密私钥
      let encrypted = cipher.update(privateKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // 获取认证标签
      const authTag = cipher.getAuthTag().toString('hex');
      
      // 组合加密数据和认证标签
      const encryptedData = encrypted + ':' + authTag;
      
      const result: EncryptedData = {
        encryptedData,
        iv: iv.toString('hex'),
        salt,
        timestamp: Date.now(),
        version: '1.0.0'
      };

      // 异步发布事件，不阻塞主流程
      this.publishEvent('PrivateKeyEncrypted', {
        success: true,
        timestamp: result.timestamp
      }).catch(() => {}); // 忽略发布错误

      return result;
    } catch (error) {
      // 异步发布事件，不阻塞主流程
      this.publishEvent('PrivateKeyEncryptionFailed', { 
        error: error instanceof Error ? error.message : String(error) 
      }).catch(() => {});
      throw new Error(`私钥加密失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 解密私钥
   * @param encryptedData 加密数据
   * @param iv 初始化向量
   * @param salt 盐值
   * @param password 解密密码
   * @returns 解密后的私钥
   */
  public decryptPrivateKey(encryptedData: string, iv: string, salt: string, password: string): string {
    try {
      // 分离加密数据和认证标签
      const [encrypted, authTag] = encryptedData.split(':');
      
      if (!encrypted || !authTag) {
        throw new Error('加密数据格式无效');
      }

      // 从密码和盐值生成密钥
      const key = crypto.scryptSync(password, salt, 32);
      
      // 创建解密器
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm', 
        key, 
        Buffer.from(iv, 'hex')
      );
      
      // 设置认证标签
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      // 解密私钥
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      // 验证解密后的私钥
      if (!this.isValidPrivateKey(decrypted)) {
        throw new Error('解密后的私钥格式无效');
      }

      this.publishEvent('PrivateKeyDecrypted', {
        success: true,
        timestamp: Date.now()
      }).catch(() => {});

      return decrypted;
    } catch (error) {
      this.publishEvent('PrivateKeyDecryptionFailed', { 
        error: error instanceof Error ? error.message : String(error) 
      }).catch(() => {});
      throw new Error('解密失败，密码可能不正确或数据已损坏');
    }
  }

  /**
   * 保存加密的私钥到文件
   * @param encryptedData 加密数据对象
   * @param customPath 自定义文件路径
   */
  public saveEncryptedWallet(encryptedData: EncryptedData, customPath?: string): string {
    try {
      const filePath = customPath || this.getWalletFilePath();
      
      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // 将加密数据保存为JSON格式
      fs.writeFileSync(
        filePath, 
        JSON.stringify(encryptedData, null, 2), 
        { encoding: 'utf8', mode: 0o600 } // 仅所有者可读写
      );

      this.publishEvent('WalletSaved', {
        filePath,
        timestamp: encryptedData.timestamp
      }).catch(() => {});

      return filePath;
    } catch (error) {
      this.publishEvent('WalletSaveFailed', { 
        error: error instanceof Error ? error.message : String(error) 
      }).catch(() => {});
      throw new Error(`保存钱包文件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 从文件加载加密的私钥
   * @param customPath 自定义文件路径
   * @returns 加密数据对象
   */
  public loadEncryptedWallet(customPath?: string): EncryptedData {
    try {
      const filePath = customPath || this.getWalletFilePath();
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`加密钱包文件不存在: ${filePath}`);
      }
      
      // 从文件读取加密数据
      const fileContent = fs.readFileSync(filePath, { encoding: 'utf8' });
      const data = JSON.parse(fileContent) as EncryptedData;

      // 验证数据格式
      if (!data.encryptedData || !data.iv || !data.salt) {
        throw new Error('钱包文件格式无效');
      }

      this.publishEvent('WalletLoaded', {
        filePath,
        timestamp: data.timestamp
      }).catch(() => {});

      return data;
    } catch (error) {
      this.publishEvent('WalletLoadFailed', { 
        error: error instanceof Error ? error.message : String(error) 
      }).catch(() => {});
      throw error;
    }
  }

  /**
   * 解锁钱包
   */
  public async unlockWallet(password: string, customPath?: string): Promise<boolean> {
    try {
      const encryptedData = this.loadEncryptedWallet(customPath);
      const privateKey = this.decryptPrivateKey(
        encryptedData.encryptedData,
        encryptedData.iv,
        encryptedData.salt,
        password
      );

      this.currentPrivateKey = privateKey;
      this.isUnlocked = true;

      this.publishEvent('WalletUnlocked', {
        timestamp: Date.now(),
        success: true
      }).catch(() => {});

      return true;
    } catch (error) {
      this.publishEvent('WalletUnlockFailed', { 
        error: error instanceof Error ? error.message : String(error) 
      }).catch(() => {});
      return false;
    }
  }

  /**
   * 锁定钱包
   */
  public lockWallet(): void {
    this.currentPrivateKey = null;
    this.isUnlocked = false;

    this.publishEvent('WalletLocked', {
      timestamp: Date.now()
    }).catch(() => {});
  }

  /**
   * 检查钱包是否已解锁
   */
  public isWalletUnlocked(): boolean {
    return this.isUnlocked && this.currentPrivateKey !== null;
  }

  /**
   * 获取当前私钥（仅在钱包解锁状态下）
   */
  public getCurrentPrivateKey(): string | null {
    if (!this.isUnlocked) {
      throw new Error('钱包未解锁，无法获取私钥');
    }
    return this.currentPrivateKey;
  }

  /**
   * 检查钱包文件是否存在
   */
  public hasWalletFile(customPath?: string): boolean {
    const filePath = customPath || this.getWalletFilePath();
    return fs.existsSync(filePath);
  }

  /**
   * 删除钱包文件
   */
  public deleteWalletFile(customPath?: string): boolean {
    try {
      const filePath = customPath || this.getWalletFilePath();
      
      if (!fs.existsSync(filePath)) {
        return false;
      }
      
      fs.unlinkSync(filePath);

      this.publishEvent('WalletFileDeleted', {
        filePath,
        timestamp: Date.now()
      }).catch(() => {});

      return true;
    } catch (error) {
      this.publishEvent('WalletFileDeletionFailed', { 
        error: error instanceof Error ? error.message : String(error) 
      }).catch(() => {});
      return false;
    }
  }

  /**
   * 获取钱包文件完整路径
   */
  public getWalletFilePath(): string {
    return path.resolve(this.encryptionPath, this.filename);
  }

  /**
   * 验证私钥格式（BSC/以太坊私钥）
   */
  private isValidPrivateKey(privateKey: string): boolean {
    // 移除0x前缀
    const cleanKey = privateKey.replace(/^0x/, '');
    
    // 检查长度（64个十六进制字符）
    if (cleanKey.length !== 64) {
      return false;
    }
    
    // 检查是否为有效的十六进制字符串
    return /^[a-fA-F0-9]+$/.test(cleanKey);
  }

  /**
   * 获取钱包状态信息
   */
  public getWalletStatus(): {
    hasWalletFile: boolean;
    isUnlocked: boolean;
    walletFilePath: string;
  } {
    return {
      hasWalletFile: this.hasWalletFile(),
      isUnlocked: this.isUnlocked,
      walletFilePath: this.getWalletFilePath()
    };
  }
} 