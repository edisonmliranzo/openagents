import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from './audit.service'

// Define types locally to avoid import issues
export enum AuditSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ComplianceFramework {
  SOC2 = 'soc2',
  GDPR = 'gdpr',
  HIPAA = 'hipaa',
  ISO27001 = 'iso27001',
  PCI_DSS = 'pci_dss',
}

export interface ComplianceRequirement {
  id: string
  framework: ComplianceFramework
  requirementId: string
  name: string
  description: string
  status: 'compliant' | 'non_compliant' | 'partial' | 'not_applicable'
  evidence?: string[]
  lastReviewed: Date
  nextReview: Date
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name)

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * Get compliance requirements for a framework
   */
  getRequirements(framework: ComplianceFramework): ComplianceRequirement[] {
    const requirements: ComplianceRequirement[] = []

    switch (framework) {
      case ComplianceFramework.GDPR:
        requirements.push(
          {
            id: 'gdpr-1',
            framework,
            requirementId: 'GDPR-Art5',
            name: 'Data Minimization',
            description: 'Personal data must be adequate, relevant and limited to what is necessary',
            status: 'compliant',
            lastReviewed: new Date(),
            nextReview: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
          {
            id: 'gdpr-2',
            framework,
            requirementId: 'GDPR-Art17',
            name: 'Right to Erasure',
            description: 'Data subjects have the right to have their personal data erased',
            status: 'compliant',
            lastReviewed: new Date(),
            nextReview: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
          {
            id: 'gdpr-3',
            framework,
            requirementId: 'GDPR-Art32',
            name: 'Security of Processing',
            description: 'Implement appropriate technical and organizational measures to ensure security',
            status: 'compliant',
            lastReviewed: new Date(),
            nextReview: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        )
        break

      case ComplianceFramework.SOC2:
        requirements.push(
          {
            id: 'soc2-1',
            framework,
            requirementId: 'SOC2-CC6.1',
            name: 'Logical Access Security',
            description: 'The entity implements logical access security measures',
            status: 'compliant',
            lastReviewed: new Date(),
            nextReview: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
          {
            id: 'soc2-2',
            framework,
            requirementId: 'SOC2-CC7.2',
            name: 'System Monitoring',
            description: 'The entity monitors system components for anomalies',
            status: 'compliant',
            lastReviewed: new Date(),
            nextReview: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        )
        break

      case ComplianceFramework.HIPAA:
        requirements.push(
          {
            id: 'hipaa-1',
            framework,
            requirementId: 'HIPAA-164.312',
            name: 'Technical Safeguards',
            description: 'Implement technical security measures to protect ePHI',
            status: 'compliant',
            lastReviewed: new Date(),
            nextReview: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        )
        break

      case ComplianceFramework.ISO27001:
        requirements.push(
          {
            id: 'iso-1',
            framework,
            requirementId: 'ISO-A.9.4.2',
            name: 'Secure Log-on Procedures',
            description: 'Access to systems and applications shall be controlled by a secure log-on procedure',
            status: 'compliant',
            lastReviewed: new Date(),
            nextReview: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        )
        break

      case ComplianceFramework.PCI_DSS:
        requirements.push(
          {
            id: 'pci-1',
            framework,
            requirementId: 'PCI-DSS-3.4',
            name: 'Render PAN Unreadable',
            description: 'Render PAN unreadable anywhere it is stored',
            status: 'compliant',
            lastReviewed: new Date(),
            nextReview: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        )
        break
    }

    return requirements
  }

  /**
   * Run compliance assessment
   */
  async runComplianceAssessment(framework: ComplianceFramework, userId?: string): Promise<{
    framework: ComplianceFramework
    requirements: ComplianceRequirement[]
    overallStatus: 'compliant' | 'non_compliant' | 'partial'
    complianceScore: number
    findings: string[]
    recommendations: string[]
  }> {
    const requirements = this.getRequirements(framework)
    const findings: string[] = []
    const recommendations: string[] = []
    let compliantCount = 0

    // Check encryption at rest
    const hasEncryption = process.env.ENCRYPTION_KEY ? true : false
    if (!hasEncryption) {
      findings.push('Encryption at rest is not configured')
      recommendations.push('Set ENCRYPTION_KEY environment variable')
    } else {
      compliantCount++
    }

    // Check audit logging
    const recentAuditLogs = await this.prisma.auditLog.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    })
    if (recentAuditLogs === 0) {
      findings.push('No audit logs in the last 24 hours')
      recommendations.push('Ensure audit logging is enabled and functioning')
    } else {
      compliantCount++
    }

    // Check access controls
    const usersWithAdminRole = await this.prisma.user.count({
      where: { role: 'admin' },
    })
    const totalUsers = await this.prisma.user.count()
    if (totalUsers > 0 && usersWithAdminRole / totalUsers > 0.5) {
      findings.push('Too many users have admin role')
      recommendations.push('Implement principle of least privilege')
    } else {
      compliantCount++
    }

    // Check data retention
    const oldConversations = await this.prisma.conversation.count({
      where: {
        createdAt: { lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
      },
    })
    if (oldConversations > 1000) {
      findings.push('Large number of conversations older than 1 year')
      recommendations.push('Implement data retention policy')
    } else {
      compliantCount++
    }

    const totalChecks = 4
    const complianceScore = (compliantCount / totalChecks) * 100
    const overallStatus = complianceScore === 100 ? 'compliant' : complianceScore >= 50 ? 'partial' : 'non_compliant'

    // Log compliance check
    if (userId) {
      await this.auditService.logEvent(userId, {
        category: 'compliance' as any,
        action: 'compliance_assessment',
        resource: framework,
        severity: AuditSeverity.LOW,
        description: `Compliance assessment completed for ${framework}`,
        timestamp: new Date(),
        metadata: { score: complianceScore, status: overallStatus },
      })
    }

    return {
      framework,
      requirements,
      overallStatus,
      complianceScore,
      findings,
      recommendations,
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    frameworks: ComplianceFramework[] = Object.values(ComplianceFramework),
    userId?: string,
  ): Promise<{
    generatedAt: Date
    reports: Array<{
      framework: ComplianceFramework
      status: 'compliant' | 'non_compliant' | 'partial'
      score: number
      findings: string[]
      recommendations: string[]
    }>
    overallStatus: 'compliant' | 'non_compliant' | 'partial'
    overallScore: number
  }> {
    const reports = await Promise.all(
      frameworks.map(framework => this.runComplianceAssessment(framework, userId)),
    )

    const overallScore = reports.reduce((sum, r) => sum + r.complianceScore, 0) / reports.length
    const overallStatus = overallScore === 100 ? 'compliant' : overallScore >= 50 ? 'partial' : 'non_compliant'

    return {
      generatedAt: new Date(),
      reports: reports.map(r => ({
        framework: r.framework,
        status: r.overallStatus,
        score: r.complianceScore,
        findings: r.findings,
        recommendations: r.recommendations,
      })),
      overallStatus,
      overallScore,
    }
  }

  /**
   * Check data subject rights (GDPR)
   */
  async checkDataSubjectRights(userId: string): Promise<{
    canExport: boolean
    canDelete: boolean
    canRectify: boolean
    exportData: Promise<any>
    deleteData: Promise<void>
  }> {
    return {
      canExport: true,
      canDelete: true,
      canRectify: true,
      exportData: this.exportUserData(userId),
      deleteData: this.deleteUserData(userId),
    }
  }

  /**
   * Export user data for GDPR compliance
   */
  async exportUserData(userId: string): Promise<any> {
    const [user, conversations, memories, auditLogs] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          conversations: { take: 100 },
          memories: { take: 100 },
        },
      }),
      this.prisma.conversation.findMany({
        where: { userId },
        take: 100,
        include: { messages: { take: 100 } },
      }),
      this.prisma.memory.findMany({
        where: { userId },
        take: 100,
      }),
      this.prisma.auditLog.findMany({
        where: { userId },
        take: 100,
      }),
    ])

    return {
      user: {
        id: user?.id,
        email: user?.email,
        name: user?.name,
        createdAt: user?.createdAt,
      },
      conversations,
      memories,
      auditLogs,
      exportedAt: new Date().toISOString(),
    }
  }

  /**
   * Delete user data for GDPR right to erasure
   */
  async deleteUserData(userId: string): Promise<void> {
    // Anonymize user data instead of hard delete to maintain referential integrity
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: `deleted_${userId}@deleted.com`,
        name: 'Deleted User',
        avatarUrl: null,
      },
    })

    // Delete personal data
    await Promise.all([
      this.prisma.memory.deleteMany({ where: { userId } }),
      this.prisma.conversation.deleteMany({ where: { userId } }),
      this.prisma.deviceInstall.deleteMany({ where: { userId } }),
    ])

    this.logger.log(`User data deleted for user ${userId}`)
  }

  /**
   * Check data retention compliance
   */
  async checkDataRetention(): Promise<{
    conversationsOlderThan1Year: number
    conversationsOlderThan2Years: number
    recommendations: string[]
  }> {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000)

    const [olderThan1Year, olderThan2Years] = await Promise.all([
      this.prisma.conversation.count({ where: { createdAt: { lt: oneYearAgo } } }),
      this.prisma.conversation.count({ where: { createdAt: { lt: twoYearsAgo } } }),
    ])

    const recommendations: string[] = []

    if (olderThan2Years > 100) {
      recommendations.push('Consider implementing automatic data archival for conversations older than 2 years')
    }

    if (olderThan1Year > 1000) {
      recommendations.push('Consider implementing data retention policy with automatic cleanup')
    }

    return {
      conversationsOlderThan1Year: olderThan1Year,
      conversationsOlderThan2Years: olderThan2Years,
      recommendations,
    }
  }
}