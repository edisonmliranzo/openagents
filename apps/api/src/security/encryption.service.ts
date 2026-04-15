import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'

export interface EncryptionResult {
  encrypted: string
  iv: string
  authTag?: string
}

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name)
  private readonly algorithm = 'aes-256-gcm'
  private readonly key: Buffer

  constructor(private configService: ConfigService) {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY')
    if (!encryptionKey) {
      this.logger.warn('ENCRYPTION_KEY not set, using default key (INSECURE)')
    }
    // Use provided key or generate a default (for development only)
    this.key = crypto.createHash('sha256').update(encryptionKey || 'default-dev-key-change-in-production').digest()
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(data: string): EncryptionResult {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv)
    
    let encrypted = cipher.update(data, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const authTag = cipher.getAuthTag().toString('hex')

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag,
    }
  }

  /**
   * Decrypt encrypted data
   */
  decrypt(result: EncryptionResult): string {
    const iv = Buffer.from(result.iv, 'hex')
    const authTag = Buffer.from(result.authTag!, 'hex')
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv)
    
    decipher.setAuthTag(authTag)
    
    let decrypted = decipher.update(result.encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  }

  /**
   * Hash data (one-way encryption)
   */
  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex')
  }

  /**
   * Generate a secure random token
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex')
  }

  /**
   * Encrypt API keys and secrets
   */
  encryptApiKey(apiKey: string): string {
    const result = this.encrypt(apiKey)
    return JSON.stringify(result)
  }

  /**
   * Decrypt API keys and secrets
   */
  decryptApiKey(encryptedKey: string): string {
    const result: EncryptionResult = JSON.parse(encryptedKey)
    return this.decrypt(result)
  }

  /**
   * Verify data integrity using HMAC
   */
  hmac(data: string, secret?: string): string {
    const key = secret ? crypto.createHash('sha256').update(secret).digest() : this.key
    return crypto.createHmac('sha256', key).update(data).digest('hex')
  }

  /**
   * Verify HMAC signature
   */
  verifyHmac(data: string, signature: string, secret?: string): boolean {
    const expectedSignature = this.hmac(data, secret)
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))
  }

  /**
   * Encrypt field-level data for database storage
   */
  encryptField(value: string): string {
    const result = this.encrypt(value)
    return `${result.encrypted}:${result.iv}:${result.authTag}`
  }

  /**
   * Decrypt field-level data from database
   */
  decryptField(encryptedValue: string): string {
    const [encrypted, iv, authTag] = encryptedValue.split(':')
    return this.decrypt({ encrypted, iv, authTag })
  }
}