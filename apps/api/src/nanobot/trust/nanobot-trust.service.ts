import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { MemoryService } from '../../memory/memory.service'
import { SystemService } from '../../system/system.service'
import { NanobotConfigService } from '../config/nanobot-config.service'
import type { NanobotTrustSnapshot } from '../types'

const CORE_MEMORY_FILES = ['SOUL.md', 'USER.md', 'MEMORY.md', 'HEARTBEAT.md'] as const

@Injectable()
export class NanobotTrustService {
  constructor(
    private prisma: PrismaService,
    private memory: MemoryService,
    private system: SystemService,
    private config: NanobotConfigService,
  ) {}

  async snapshot(userId: string): Promise<NanobotTrustSnapshot> {
    const now = new Date()
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const [
      memoryResult,
      toolResult,
      safetyResult,
      costs,
    ] = await Promise.all([
      this.computeMemory(userId),
      this.computeTools(userId, since30d),
      this.computeSafety(userId, since24h),
      this.system.costs(userId, since30d.toISOString(), now.toISOString()),
    ])

    const autonomy = this.computeAutonomy()
    const cost = this.computeCost(costs)

    const overallScore = this.roundScore(
      autonomy.score * 0.24
      + memoryResult.score * 0.24
      + toolResult.score * 0.2
      + safetyResult.score * 0.2
      + cost.score * 0.12,
    )

    return {
      generatedAt: now.toISOString(),
      overallScore,
      autonomy,
      memory: memoryResult,
      tools: toolResult,
      safety: safetyResult,
      cost,
    }
  }

  private computeAutonomy() {
    const cfg = this.config.toJSON()
    let score = cfg.enabled ? 62 : 28
    score += Math.min(20, Math.round((cfg.maxLoopSteps / 16) * 20))
    if (cfg.shadowMode) score -= 8
    score = this.roundScore(score)
    return {
      score,
      enabled: cfg.enabled,
      shadowMode: cfg.shadowMode,
      maxLoopSteps: cfg.maxLoopSteps,
      rationale: cfg.enabled
        ? 'Runtime autonomy enabled with loop budget and live execution.'
        : 'Runtime autonomy disabled; manual/agent-only execution path.',
    }
  }

  private async computeMemory(userId: string) {
    const presentFiles: string[] = []
    const missingFiles: string[] = []
    const timestamps: number[] = []

    for (const fileName of CORE_MEMORY_FILES) {
      try {
        const doc = await this.memory.readFile(userId, fileName)
        presentFiles.push(fileName)
        const ts = new Date(doc.updatedAt).getTime()
        if (Number.isFinite(ts)) timestamps.push(ts)
      } catch {
        missingFiles.push(fileName)
      }
    }

    let score = (presentFiles.length / CORE_MEMORY_FILES.length) * 100
    if (timestamps.length > 0) {
      const latest = Math.max(...timestamps)
      const ageDays = (Date.now() - latest) / (24 * 60 * 60 * 1000)
      if (ageDays > 14) score -= 15
      else if (ageDays > 7) score -= 8
    }
    score = this.roundScore(score)

    return {
      score,
      presentFiles,
      missingFiles,
      rationale: missingFiles.length === 0
        ? 'Core memory documents are available for stable long-term context.'
        : `Missing core memory files: ${missingFiles.join(', ')}.`,
    }
  }

  private async computeTools(userId: string, since: Date) {
    const rows = await this.prisma.message.findMany({
      where: {
        role: 'tool',
        conversation: { userId },
        createdAt: { gte: since },
      },
      select: {
        status: true,
        toolCallJson: true,
      },
    })

    const totalCalls = rows.length
    const successCount = rows.filter((row) => row.status === 'done').length
    const successRate = totalCalls > 0 ? successCount / totalCalls : 1
    const failingMap = new Map<string, number>()

    for (const row of rows) {
      if (row.status !== 'error') continue
      const tool = this.parseToolName(row.toolCallJson) ?? 'unknown'
      failingMap.set(tool, (failingMap.get(tool) ?? 0) + 1)
    }

    const failingTools = [...failingMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool, failures]) => ({ tool, failures }))

    const score = this.roundScore(
      totalCalls === 0 ? 80 : successRate * 100,
    )

    return {
      score,
      totalCalls,
      successRate: this.round(successRate),
      failingTools,
      rationale: totalCalls === 0
        ? 'No recent tool calls; default trust posture applied.'
        : `Tool success rate over 30 days: ${(successRate * 100).toFixed(1)}%.`,
    }
  }

  private async computeSafety(userId: string, since: Date) {
    const [pendingApprovals, failedRuns24h] = await Promise.all([
      this.prisma.approval.count({ where: { userId, status: 'pending' } }),
      this.prisma.agentRun.count({
        where: {
          status: 'error',
          startedAt: { gte: since },
          conversation: { userId },
        },
      }),
    ])

    let score = 92
    score -= Math.min(35, pendingApprovals * 4)
    score -= Math.min(35, failedRuns24h * 7)
    score = this.roundScore(score)

    return {
      score,
      pendingApprovals,
      failedRuns24h,
      rationale: pendingApprovals > 0 || failedRuns24h > 0
        ? 'Pending approvals or recent failures are reducing safety confidence.'
        : 'No pending approvals and no recent failed runs.',
    }
  }

  private computeCost(costs: Awaited<ReturnType<SystemService['costs']>>) {
    const total = costs.totals.estimatedTotalCostUsd
    const days = Math.max(1, costs.daily.length || 30)
    const avgDailyUsd = total / days

    let score = 88
    if (total > 150) score = 42
    else if (total > 80) score = 58
    else if (total > 30) score = 70
    else if (total > 10) score = 80

    return {
      score: this.roundScore(score),
      estimated30dUsd: this.round(total),
      avgDailyUsd: this.round(avgDailyUsd),
      rationale: `Estimated 30-day spend is $${this.round(total).toFixed(2)}.`,
    }
  }

  private parseToolName(raw: string | null) {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as { name?: unknown }
      return typeof parsed?.name === 'string' ? parsed.name.trim() : null
    } catch {
      return null
    }
  }

  private round(value: number) {
    return Math.round(value * 10000) / 10000
  }

  private roundScore(value: number) {
    return Math.max(0, Math.min(100, Math.round(value)))
  }
}

