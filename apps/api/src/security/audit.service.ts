import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from './encryption.service'
import { AuditEvent, AuditSeverity, AuditCategory } from '@openagents/shared'

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
  ) {}

  /**
   * Log an audit event
   */
  async logEvent(
    userId: string,
    event: AuditEvent,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      // Encrypt sensitive metadata if present
      let encryptedMetadata: string | null = null
      if (metadata && Object.keys(metadata).length > 0) {
        encryptedMetadata = this.encryptionService.encryptField(JSON.stringify(metadata))
      }

      await this.prisma.auditLog.create({
        data: {
          userId,
          category: event.category,
          action: event.action,
          resource: event.resource,
          severity: event.severity,
          description: event.description,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          metadata: encryptedMetadata,
          timestamp: event.timestamp || new Date(),
        },
      })

      // Log high severity events immediately
      if (event.severity === AuditSeverity.HIGH || event.severity === AuditSeverity.CRITICAL) {
        this.logger.warn(`Security event: ${event.action} - ${event.description}`)
      }
    } catch (error) {
      this.logger.error('Failed to log audit event', error)
    }
  }

  /**
   * Log authentication events
   */
  async logAuthEvent(
    userId: string,
    action: 'login' | 'logout' | 'login_failed' | 'password_change' | 'token_refresh',
    ipAddress?: string,
    userAgent?: string,
    success: boolean = true,
  ): Promise<void> {
    await this.logEvent(userId, {
      category: AuditCategory.AUTHENTICATION,
      action,
      resource: 'auth',
      severity: success ? AuditSeverity.LOW : AuditSeverity.MEDIUM,
      description: `Authentication ${action}`,
      ipAddress,
      userAgent,
      timestamp: new Date(),
    })
  }

  /**
   * Log data access events
   */
  async logDataAccess(
    userId: string,
    resourceType: string,
    resourceId: string,
    action: 'read' | 'write' | 'delete' | 'export',
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.logEvent(userId, {
      category: AuditCategory.DATA_ACCESS,
      action,
      resource: `${resourceType}:${resourceId}`,
      severity: action === 'delete' ? AuditSeverity.HIGH : AuditSeverity.MEDIUM,
      description: `${action} access to ${resourceType}`,
      ipAddress,
      userAgent,
      timestamp: new Date(),
    })
  }

  /**
   * Log configuration changes
   */
  async logConfigChange(
    userId: string,
    configType: string,
    changes: Record<string, any>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.logEvent(userId, {
      category: AuditCategory.CONFIGURATION,
      action: 'config_change',
      resource: configType,
      severity: AuditSeverity.MEDIUM,
      description: `Configuration change: ${configType}`,
      ipAddress,
      userAgent,
      timestamp: new Date(),
      metadata: changes,
    })
  }

  /**
   * Log security violations
   */
  async logSecurityViolation(
    userId: string,
    violationType: string,
    description: string,
    severity: AuditSeverity = AuditSeverity.MEDIUM,
    ipAddress?: string,
    userAgent?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.logEvent(userId, {
      category: AuditCategory.SECURITY,
      action: 'violation',
      resource: 'security',
      severity,
      description: `Security violation: ${violationType} - ${description}`,
      ipAddress,
      userAgent,
      timestamp: new Date(),
      metadata,
    })
  }

  /**
   * Get audit events with filtering
   */
  async getAuditEvents(
    userId?: string,
    category?: AuditCategory,
    severity?: AuditSeverity,
    startDate?: Date,
    endDate?: Date,
    limit: number = 100,
    offset: number = 0,
  ) {
    const where: any = {}

    if (userId) where.userId = userId
    if (category) where.category = category
    if (severity) where.severity = severity
    if (startDate || endDate) {
      where.timestamp = {}
      if (startDate) where.timestamp.gte = startDate
      if (endDate) where.timestamp.lte = endDate
    }

    const [events, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ])

    return {
      events: events.map(event => ({
        ...event,
        metadata: event.metadata ? JSON.parse(this.encryptionService.decryptField(event.metadata)) : null,
      })),
      total,
      hasMore: offset + limit < total,
    }
  }

  /**
   * Generate security report
   */
  async generateSecurityReport(startDate: Date, endDate: Date) {
    const [authEvents, dataEvents, violations] = await Promise.all([
      this.prisma.auditLog.groupBy({
        by: ['action'],
        _count: { action: true },
        where: {
          category: AuditCategory.AUTHENTICATION,
          timestamp: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        _count: { action: true },
        where: {
          category: AuditCategory.DATA_ACCESS,
          timestamp: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          category: AuditCategory.SECURITY,
          timestamp: { gte: startDate, lte: endDate },
        },
      }),
    ])

    // Get failed login attempts by IP
    const failedLogins = await this.prisma.auditLog.groupBy({
      by: ['ipAddress'],
      _count: { ipAddress: true },
      where: {
        action: 'login_failed',
        timestamp: { gte: startDate, lte: endDate },
      },
      orderBy: { _count: { ipAddress: 'desc' } },
      take: 10,
    })

    return {
      period: { start: startDate, end: endDate },
      authentication: {
        total: authEvents.reduce((sum, event) => sum + event._count.action, 0),
        byAction: authEvents.reduce((acc, event) => {
          acc[event.action] = event._count.action
          return acc
        }, {} as Record<string, number>),
      },
      dataAccess: {
        total: dataEvents.reduce((sum, event) => sum + event._count.action, 0),
        byAction: dataEvents.reduce((acc, event) => {
          acc[event.action] = event._count.action
          return acc
        }, {} as Record<string, number>),
      },
      securityViolations: violations,
      failedLoginAttempts: failedLogins.map(f => ({
        ipAddress: f.ipAddress,
        attempts: f._count.ipAddress,
      })),
      recommendations: this.generateSecurityRecommendations(authEvents, dataEvents, violations),
    }
  }

  /**
   * Generate security recommendations
   */
  private generateSecurityRecommendations(
    authEvents: Array<{ action: string; _count: { action: number } }>,
    dataEvents: Array<{ action: string; _count: { action: number } }>,
    violations: number,
  ): string[] {
    const recommendations = []

    const failedLogins = authEvents.find(e => e.action === 'login_failed')?._count.action || 0
    const deleteEvents = dataEvents.find(e => e.action === 'delete')?._count.action || 0

    if (failedLogins > 100) {
      recommendations.push('Consider implementing rate limiting for login attempts')
    }

    if (deleteEvents > 50) {
      recommendations.push('Review data deletion policies and implement additional approvals')
    }

    if (violations > 10) {
      recommendations.push('High number of security violations detected - review security policies')
    }

    if (violations === 0 && failedLogins === 0 && deleteEvents === 0) {
      recommendations.push('No security issues detected - maintain current practices')
    }

    return recommendations
  }

  /**
   * Detect suspicious activity patterns
   */
  async detectSuspiciousActivity(timeWindow: number = 3600000): Promise<Array<{
    userId: string;
    type: string;
    description: string;
    severity: AuditSeverity;
    ipAddress?: string;
  }>> {
    const now = new Date()
    const windowStart = new Date(now.getTime() - timeWindow)

    // Check for multiple failed logins
    const failedLogins = await this.prisma.auditLog.groupBy({
      by: ['userId', 'ipAddress'],
      _count: { userId: true },
      where: {
        action: 'login_failed',
        timestamp: { gte: windowStart, lte: now },
      },
    })

    const suspiciousActivities = []

    for (const login of failedLogins) {
      if (login._count.userId > 5) {
        suspiciousActivities.push({
          userId: login.userId,
          type: 'brute_force_attempt',
          description: `Multiple failed login attempts (${login._count.userId}) from ${login.ipAddress}`,
          severity: AuditSeverity.HIGH,
          ipAddress: login.ipAddress ?? undefined,
        })
      }
    }

    // Check for unusual data access patterns
    const dataAccess = await this.prisma.auditLog.groupBy({
      by: ['userId', 'action'],
      _count: { userId: true },
      where: {
        category: AuditCategory.DATA_ACCESS,
        timestamp: { gte: windowStart, lte: now },
      },
    })

    for (const access of dataAccess) {
      if (access.action === 'delete' && access._count.userId > 10) {
        suspiciousActivities.push({
          userId: access.userId,
          type: 'mass_data_deletion',
          description: `High number of delete operations (${access._count.userId})`,
          severity: AuditSeverity.CRITICAL,
        })
      }
    }

    return suspiciousActivities
  }

  /**
   * Export audit logs
   */
  async exportAuditLogs(
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' = 'json',
  ): Promise<string> {
    const events = await this.getAuditEvents(undefined, undefined, undefined, startDate, endDate, 10000)

    if (format === 'csv') {
      // Convert to CSV format
      const headers = ['timestamp', 'userId', 'category', 'action', 'resource', 'severity', 'description', 'ipAddress', 'userAgent']
      const rows = events.events.map(event => [
        event.timestamp.toISOString(),
        event.userId,
        event.category,
        event.action,
        event.resource,
        event.severity,
        event.description,
        event.ipAddress || '',
        event.userAgent || '',
      ])

      return [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    }

    return JSON.stringify(events.events, null, 2)
  }
}