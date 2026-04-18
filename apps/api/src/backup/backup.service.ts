import { AuditSeverity, AuditCategory } from '@openagents/shared'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../security/audit.service'
import { ConfigService } from '@nestjs/config'
import { join } from 'path'
import { promises as fs } from 'fs'
import { createWriteStream, existsSync } from 'fs'
import { createGzip } from 'zlib'
import { pipeline } from 'stream/promises'

export interface BackupInfo {
  id: string
  createdAt: Date
  type: 'daily' | 'hourly' | 'manual'
  dataSize: number
  files: string[]
  status: 'completed' | 'failed' | 'in_progress'
  checksum: string
  retentionDays: number
}

export interface BackupConfig {
  enabled: boolean
  autoBackup: boolean
  backupInterval: 'daily' | 'hourly' | '4times_daily'
  backupTime: string // HH:mm format for daily, or array of times for 4times_daily
  retentionDays: number
  backupLocation: string
  compressionEnabled: boolean
  encryptionEnabled: boolean
  databases: string[]
}

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name)
  private backupConfig: BackupConfig
  private activeBackups: Map<string, Promise<BackupInfo>> = new Map()
  private schedulerInterval?: NodeJS.Timeout

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private configService: ConfigService,
  ) {
    this.backupConfig = {
      enabled: this.configService.get<boolean>('BACKUP_ENABLED', true),
      autoBackup: this.configService.get<boolean>('BACKUP_AUTO_BACKUP', true),
      backupInterval: this.configService.get<'daily' | 'hourly' | '4times_daily'>('BACKUP_INTERVAL', 'daily'),
      backupTime: this.configService.get<string>('BACKUP_TIME', '02:00'),
      retentionDays: this.configService.get<number>('BACKUP_RETENTION_DAYS', 30),
      backupLocation: this.configService.get<string>('BACKUP_LOCATION', './backups'),
      compressionEnabled: this.configService.get<boolean>('BACKUP_COMPRESSION', true),
      encryptionEnabled: this.configService.get<boolean>('BACKUP_ENCRYPTION', true),
      databases: this.configService.get<string[]>('BACKUP_DATABASES', ['main']),
    }
  }

  onModuleInit() {
    if (this.backupConfig.enabled && this.backupConfig.autoBackup) {
      this.startScheduler()
    }
  }

  private startScheduler() {
    // Schedule based on backup interval
    switch (this.backupConfig.backupInterval) {
      case 'hourly':
        this.schedulerInterval = setInterval(() => {
          this.createBackup('hourly')
        }, 60 * 60 * 1000) // Every hour
        break
      
      case 'daily':
        // Run daily at specified time
        this.schedulerInterval = setInterval(() => {
          this.createBackup('daily')
        }, 24 * 60 * 60 * 1000) // Every day
        break
      
      case '4times_daily':
        // Run every 6 hours (4 times per day)
        this.schedulerInterval = setInterval(() => {
          this.createBackup('hourly') // Use hourly type for frequent backups
        }, 6 * 60 * 60 * 1000) // Every 6 hours
        break
    }

    this.logger.log(`Backup scheduler started with interval: ${this.backupConfig.backupInterval}`)
  }

  /**
   * Create a manual backup on demand
   */
  async createManualBackup(userId: string): Promise<BackupInfo> {
    const backupId = this.generateBackupId('manual')
    
    this.logger.log(`Starting manual backup: ${backupId}`)
    
    const backupPromise = this.performBackup(backupId, 'manual')
    this.activeBackups.set(backupId, backupPromise)

    try {
      const backupInfo = await backupPromise
      this.activeBackups.delete(backupId)

      // Log backup creation
      await this.auditService.logEvent(userId, {
        category: AuditCategory.BACKUP,
        action: 'manual_backup_created',
        resource: backupId,
        severity: AuditSeverity.LOW,
        description: `Manual backup created successfully: ${backupId}`,
        timestamp: new Date(),
        metadata: { backupType: 'manual', dataSize: backupInfo.dataSize },
      })

      return backupInfo
    } catch (error) {
      this.activeBackups.delete(backupId)
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Manual backup failed: ${errorMsg}`)
      throw error
    }
  }

  /**
   * Create an automatic backup
   */
  private async createBackup(type: 'daily' | 'hourly'): Promise<BackupInfo> {
    const backupId = this.generateBackupId(type)
    
    this.logger.log(`Starting ${type} backup: ${backupId}`)
    
    const backupPromise = this.performBackup(backupId, type)
    this.activeBackups.set(backupId, backupPromise)

    try {
      const backupInfo = await backupPromise
      this.activeBackups.delete(backupId)
      
      this.logger.log(`${type} backup completed: ${backupId}`)
      return backupInfo
    } catch (error) {
      this.activeBackups.delete(backupId)
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`${type} backup failed: ${errorMsg}`)
      throw error
    }
  }

  /**
   * Perform the actual backup process
   */
  private async performBackup(backupId: string, type: 'daily' | 'hourly' | 'manual'): Promise<BackupInfo> {
    const startTime = Date.now()
    const backupPath = join(this.backupConfig.backupLocation, backupId)
    
    // Ensure backup directory exists
    await fs.mkdir(backupPath, { recursive: true })

    const backupInfo: BackupInfo = {
      id: backupId,
      createdAt: new Date(),
      type,
      dataSize: 0,
      files: [],
      status: 'in_progress',
      checksum: '',
      retentionDays: this.backupConfig.retentionDays,
    }

    try {
      // 1. Backup database
      const dbBackupFile = await this.backupDatabase(backupPath)
      backupInfo.files.push(dbBackupFile)

      // 2. Backup configuration files
      const configFiles = await this.backupConfiguration(backupPath)
      backupInfo.files.push(...configFiles)

      // 3. Backup user data (if needed)
      const userDataFiles = await this.backupUserData(backupPath)
      backupInfo.files.push(...userDataFiles)

      // 4. Calculate total size
      backupInfo.dataSize = await this.calculateBackupSize(backupPath)

      // 5. Generate checksum
      backupInfo.checksum = await this.generateChecksum(backupPath)

      // 6. Create manifest file
      await this.createManifestFile(backupPath, backupInfo)

      backupInfo.status = 'completed'

      // Log successful backup
      await this.auditService.logEvent('system', {
        category: AuditCategory.BACKUP,
        action: 'backup_completed',
        resource: backupId,
        severity: AuditSeverity.LOW,
        description: `Backup completed successfully: ${backupId}`,
        timestamp: new Date(),
        metadata: { 
          backupType: type, 
          dataSize: backupInfo.dataSize, 
          files: backupInfo.files.length 
        },
      })

      // Clean up old backups
      await this.cleanupOldBackups()

      return backupInfo
    } catch (error) {
      backupInfo.status = 'failed'
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Backup failed: ${errorMsg}`)
      throw error
    } finally {
      const duration = Date.now() - startTime
      this.logger.log(`Backup ${backupId} took ${duration}ms`)
    }
  }

  /**
   * Backup database to SQL dump file
   */
  private async backupDatabase(backupPath: string): Promise<string> {
    const dumpFile = join(backupPath, 'database_dump.sql')
    
    // Get database connection info
    const dbUrl = this.configService.get<string>('DATABASE_URL')
    if (!dbUrl) {
      throw new Error('Database URL not configured')
    }

    // For Prisma/PostgreSQL, we use pg_dump
    const { spawn } = require('child_process')
    
    return new Promise((resolve, reject) => {
      const dumpProcess = spawn('pg_dump', [
        dbUrl,
        '--no-password',
        '--verbose',
        '--clean',
        '--no-owner',
        '--no-privileges',
        '-f', dumpFile
      ])

      dumpProcess.on('close', (code: number) => {
        if (code === 0) {
          resolve(dumpFile)
        } else {
          reject(new Error(`Database backup failed with code ${code}`))
        }
      })

      dumpProcess.on('error', reject)
    })
  }

  /**
   * Backup configuration files
   */
  private async backupConfiguration(backupPath: string): Promise<string[]> {
    const configFiles: string[] = []
    const configDir = join(backupPath, 'config')
    await fs.mkdir(configDir, { recursive: true })

    // Backup environment files
    const envFiles = ['/.env', '/.env.production', '/.env.local']
    
    for (const envFile of envFiles) {
      try {
        const sourcePath = join(process.cwd(), envFile)
        const targetPath = join(configDir, `env${envFile}`)
        
        if (existsSync(sourcePath)) {
          await fs.copyFile(sourcePath, targetPath)
          configFiles.push(targetPath)
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        this.logger.warn(`Could not backup config file ${envFile}: ${errorMsg}`)
      }
    }

    // Backup package.json and package-lock.json
    const packageFiles = ['/package.json', '/package-lock.json', '/pnpm-lock.yaml']
    
    for (const packageFile of packageFiles) {
      try {
        const sourcePath = join(process.cwd(), packageFile)
        const targetPath = join(configDir, packageFile.replace('/', ''))
        
        if (existsSync(sourcePath)) {
          await fs.copyFile(sourcePath, targetPath)
          configFiles.push(targetPath)
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        this.logger.warn(`Could not backup ${packageFile}: ${errorMsg}`)
      }
    }

    return configFiles
  }

  /**
   * Backup user data and uploads
   */
  private async backupUserData(backupPath: string): Promise<string[]> {
    const userDataFiles: string[] = []
    const userDataDir = join(backupPath, 'user_data')
    
    // Backup uploads directory if it exists
    const uploadsDir = join(process.cwd(), 'uploads')
    if (existsSync(uploadsDir)) {
      await fs.mkdir(userDataDir, { recursive: true })
      await this.copyDirectory(uploadsDir, join(userDataDir, 'uploads'))
      userDataFiles.push(join(userDataDir, 'uploads'))
    }

    return userDataFiles
  }

  /**
   * Calculate total backup size
   */
  private async calculateBackupSize(backupPath: string): Promise<number> {
    let totalSize = 0
    
    const calculateSize = async (path: string) => {
      const stats = await fs.stat(path)
      if (stats.isFile()) {
        totalSize += stats.size
      } else if (stats.isDirectory()) {
        const files = await fs.readdir(path)
        for (const file of files) {
          await calculateSize(join(path, file))
        }
      }
    }

    await calculateSize(backupPath)
    return totalSize
  }

  /**
   * Generate checksum for backup integrity
   */
  private async generateChecksum(backupPath: string): Promise<string> {
    // Simple checksum implementation using file sizes and modification times
    const crypto = require('crypto')
    const hash = crypto.createHash('sha256')
    
    const addFileToHash = async (path: string) => {
      const stats = await fs.stat(path)
      if (stats.isFile()) {
        hash.update(`${path}:${stats.size}:${stats.mtime.getTime()}`)
      } else if (stats.isDirectory()) {
        const files = await fs.readdir(path)
        for (const file of files) {
          await addFileToHash(join(path, file))
        }
      }
    }

    await addFileToHash(backupPath)
    return hash.digest('hex')
  }

  /**
   * Create backup manifest file
   */
  private async createManifestFile(backupPath: string, backupInfo: BackupInfo): Promise<void> {
    const manifestPath = join(backupPath, 'backup_manifest.json')
    const manifest = {
      version: '1.0',
      backupInfo,
      systemInfo: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        timestamp: new Date().toISOString(),
      }
    }

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  }

  /**
   * Clean up old backups based on retention policy
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backupDir = this.backupConfig.backupLocation
      if (!existsSync(backupDir)) {
        return
      }

      const directories = await fs.readdir(backupDir)
      const now = Date.now()
      const retentionMs = this.backupConfig.retentionDays * 24 * 60 * 60 * 1000

      for (const dir of directories) {
        const dirPath = join(backupDir, dir)
        const stats = await fs.stat(dirPath)
        
        if (stats.isDirectory() && (now - stats.mtime.getTime()) > retentionMs) {
          await fs.rmdir(dirPath, { recursive: true })
          this.logger.log(`Removed old backup: ${dir}`)

          // Log cleanup action
          await this.auditService.logEvent('system', {
            category: AuditCategory.BACKUP,
            action: 'backup_cleanup',
            resource: dir,
            severity: AuditSeverity.LOW,
            description: `Removed backup due to retention policy: ${dir}`,
            timestamp: new Date(),
          })
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Backup cleanup failed: ${errorMsg}`)
    }
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.mkdir(target, { recursive: true })
    const entries = await fs.readdir(source, { withFileTypes: true })

    for (const entry of entries) {
      const sourcePath = join(source, entry.name)
      const targetPath = join(target, entry.name)

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath)
      } else {
        await fs.copyFile(sourcePath, targetPath)
      }
    }
  }

  /**
   * Get backup configuration
   */
  getBackupConfig(): BackupConfig {
    return { ...this.backupConfig }
  }

  /**
   * Update backup configuration
   */
  async updateBackupConfig(config: Partial<BackupConfig>, userId: string): Promise<void> {
    this.backupConfig = { ...this.backupConfig, ...config }
    
    // Log configuration change
    await this.auditService.logEvent(userId, {
      category: AuditCategory.BACKUP,
      action: 'config_updated',
      resource: 'backup_config',
      severity: AuditSeverity.MEDIUM,
      description: 'Backup configuration updated',
      timestamp: new Date(),
      metadata: { config },
    })
  }

  /**
   * Get list of available backups
   */
  async listBackups(): Promise<BackupInfo[]> {
    const backupDir = this.backupConfig.backupLocation
    const backups: BackupInfo[] = []

    if (!existsSync(backupDir)) {
      return backups
    }

    const directories = await fs.readdir(backupDir)
    
    for (const dir of directories) {
      const manifestPath = join(backupDir, dir, 'backup_manifest.json')
      
      if (existsSync(manifestPath)) {
        try {
          const manifestData = await fs.readFile(manifestPath, 'utf8')
          const manifest = JSON.parse(manifestData)
          backups.push(manifest.backupInfo)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      this.logger.warn(`Could not read manifest for backup ${dir}: ${errorMsg}`)
        }
      }
    }

    return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  /**
   * Get backup status
   */
  getBackupStatus(): {
    enabled: boolean
    activeBackups: number
    lastBackup: Date | null
    nextBackup: Date | null
  } {
    return {
      enabled: this.backupConfig.enabled,
      activeBackups: this.activeBackups.size,
      lastBackup: null, // Would need to be implemented with actual backup tracking
      nextBackup: this.getNextBackupTime(),
    }
  }

  /**
   * Get next backup time based on configuration
   */
  private getNextBackupTime(): Date {
    const now = new Date()
    const next = new Date(now)

    switch (this.backupConfig.backupInterval) {
      case 'hourly':
        next.setHours(next.getHours() + 1)
        next.setMinutes(0, 0, 0)
        break
      case 'daily':
        next.setDate(next.getDate() + 1)
        next.setHours(2, 0, 0, 0) // 2 AM
        break
      case '4times_daily':
        const times = [6, 12, 18, 0] // 6 AM, 12 PM, 6 PM, 12 AM
        const currentHour = now.getHours()
        
        // Find next time slot
        let nextTime = times[0]
        for (const time of times) {
          if (time > currentHour) {
            nextTime = time
            break
          }
        }

        if (nextTime <= currentHour) {
          next.setDate(next.getDate() + 1)
        }
        
        next.setHours(nextTime, 0, 0, 0)
        break
    }

    return next
  }

  /**
   * Generate unique backup ID
   */
  private generateBackupId(type: 'daily' | 'hourly' | 'manual'): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    return `backup_${type}_${timestamp}`
  }
}