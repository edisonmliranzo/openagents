import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common'
import { createHash } from 'node:crypto'
import Bull, { type Queue } from 'bull'
import type {
  CiFailureClass,
  CiIncident,
  CiIncidentStatus,
  CiHealerJobData,
  CreateCiIncidentInput,
} from '@openagents/shared'
import { CI_HEALER_JOB_NAMES, QUEUE_NAMES } from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'

const FAILURE_CLASSES: CiFailureClass[] = [
  'flake',
  'test_failure',
  'build_failure',
  'dependency_failure',
  'environment_failure',
  'unknown',
]

const INCIDENT_STATUSES: CiIncidentStatus[] = [
  'queued',
  'analyzing',
  'auto_retrying',
  'patch_proposed',
  'resolved',
  'failed',
]

@Injectable()
export class CiHealerService implements OnModuleDestroy {
  private readonly logger = new Logger(CiHealerService.name)
  private readonly ciHealerQueue?: Queue<CiHealerJobData>
  private processingMode: 'inline' | 'queue'

  constructor(private prisma: PrismaService) {
    const configuredMode = (process.env.CI_HEALER_PROCESSING_MODE ?? 'inline').toLowerCase()
    this.processingMode = configuredMode === 'queue' ? 'queue' : 'inline'

    const redisUrl = process.env.REDIS_URL
    if (this.processingMode === 'queue' && !redisUrl) {
      this.logger.warn('CI_HEALER_PROCESSING_MODE=queue but REDIS_URL is missing. Falling back to inline processing.')
      this.processingMode = 'inline'
      return
    }

    if (this.processingMode === 'queue' && redisUrl) {
      this.ciHealerQueue = new Bull<CiHealerJobData>(QUEUE_NAMES.ciHealer, redisUrl)
      this.ciHealerQueue.on('error', (error) => {
        this.logger.error('CI healer queue error', error?.stack ?? String(error))
      })
    }
  }

  async onModuleDestroy() {
    if (this.ciHealerQueue) {
      await this.ciHealerQueue.close()
    }
  }

  async createIncident(input: CreateCiIncidentInput): Promise<CiIncident> {
    const userId = (input.userId ?? '').trim()
    const provider = (input.provider ?? '').trim().slice(0, 80)
    const repo = (input.repo ?? '').trim().slice(0, 240)

    if (!userId) throw new BadRequestException('userId is required.')
    if (!provider) throw new BadRequestException('provider is required.')
    if (!repo) throw new BadRequestException('repo is required.')

    const branch = this.normalizeOptionalText(input.branch, 180)
    const pipelineId = this.normalizeOptionalText(input.pipelineId, 180)
    const jobName = this.normalizeOptionalText(input.jobName, 180)
    const commitSha = this.normalizeOptionalText(input.commitSha, 80)
    const logExcerpt = this.normalizeOptionalText(input.logExcerpt, 20_000)
    const artifactUrls = this.normalizeUrls(input.artifactUrls)

    const failureClass = this.classifyFailure(logExcerpt, jobName)
    const fingerprint = this.buildFingerprint(repo, commitSha, jobName, logExcerpt)

    const row = await this.prisma.ciIncident.create({
      data: {
        userId,
        provider,
        repo,
        branch,
        pipelineId,
        jobName,
        commitSha,
        logExcerpt,
        artifactUrls: JSON.stringify(artifactUrls),
        failureClass,
        status: 'queued',
        failureFingerprint: fingerprint,
        metadata: input.metadata ? this.safeSerialize(input.metadata) : null,
      },
    })

    await this.dispatchProcessing(row.id)

    return this.toIncident(row)
  }

  async listIncidents(userId: string, status?: CiIncidentStatus, limit = 30): Promise<CiIncident[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100))
    const rows = await this.prisma.ciIncident.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: safeLimit,
    })

    return rows.map((row) => this.toIncident(row))
  }

  async getIncident(userId: string, incidentId: string): Promise<CiIncident> {
    const row = await this.prisma.ciIncident.findUnique({ where: { id: incidentId } })
    if (!row) throw new NotFoundException(`CI incident "${incidentId}" not found.`)
    if (row.userId !== userId) throw new ForbiddenException()
    return this.toIncident(row)
  }

  async processIncident(incidentId: string): Promise<CiIncident> {
    const existing = await this.prisma.ciIncident.findUnique({ where: { id: incidentId } })
    if (!existing) throw new NotFoundException(`CI incident "${incidentId}" not found.`)
    if (existing.status === 'resolved' || existing.status === 'patch_proposed') {
      return this.toIncident(existing)
    }

    const failureClass = existing.failureClass && FAILURE_CLASSES.includes(existing.failureClass as CiFailureClass)
      ? (existing.failureClass as CiFailureClass)
      : this.classifyFailure(existing.logExcerpt, existing.jobName)

    const summary = this.buildSummary(failureClass, existing.repo, existing.jobName)
    const suggestedFix = this.buildSuggestedFix(failureClass)

    let status: CiIncidentStatus
    let retryCount = existing.retryCount
    let prUrl: string | null = existing.prUrl

    if (failureClass === 'flake' || failureClass === 'environment_failure') {
      status = 'resolved'
      retryCount += 1
    } else if (failureClass === 'test_failure' || failureClass === 'build_failure' || failureClass === 'dependency_failure') {
      status = 'patch_proposed'
      prUrl = existing.prUrl ?? this.syntheticPullRequestUrl(existing.repo, existing.id)
    } else {
      status = 'failed'
    }

    const row = await this.prisma.ciIncident.update({
      where: { id: incidentId },
      data: {
        status,
        failureClass,
        summary,
        suggestedFix,
        retryCount,
        prUrl,
      },
    })

    return this.toIncident(row)
  }

  private async dispatchProcessing(incidentId: string) {
    if (this.ciHealerQueue) {
      await this.ciHealerQueue.add(
        CI_HEALER_JOB_NAMES.run,
        { incidentId, source: 'webhook' },
        {
          jobId: `ci-incident:${incidentId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      )
      return
    }

    if (this.processingMode === 'inline') {
      void this.processIncident(incidentId).catch((error) => {
        this.logger.warn(`Inline CI healer processing failed (${incidentId}): ${this.safeError(error)}`)
      })
    }
  }

  private classifyFailure(logExcerpt: string | null, jobName: string | null): CiFailureClass {
    const text = `${logExcerpt ?? ''}\n${jobName ?? ''}`.toLowerCase()
    if (!text.trim()) return 'unknown'

    if (/(timeout|timed out|econnreset|flaky|retry succeeded|transient)/i.test(text)) return 'flake'
    if (/(assertion|jest|vitest|pytest|failing test|test suite failed|snapshot)/i.test(text)) return 'test_failure'
    if (/(webpack|tsc|compile error|syntax error|build failed|type error)/i.test(text)) return 'build_failure'
    if (/(npm err|pnpm err|dependency|module not found|lockfile|version conflict)/i.test(text)) return 'dependency_failure'
    if (/(out of memory|oom|disk quota|network unavailable|runner offline|permission denied|dns)/i.test(text)) return 'environment_failure'
    return 'unknown'
  }

  private buildSummary(failureClass: CiFailureClass, repo: string, jobName: string | null) {
    const label = jobName ? `${repo} (${jobName})` : repo
    if (failureClass === 'flake') return `Likely transient/flaky failure detected for ${label}.`
    if (failureClass === 'test_failure') return `Test regression pattern detected for ${label}.`
    if (failureClass === 'build_failure') return `Build/compile failure detected for ${label}.`
    if (failureClass === 'dependency_failure') return `Dependency resolution failure detected for ${label}.`
    if (failureClass === 'environment_failure') return `Environment/runner instability detected for ${label}.`
    return `Could not confidently classify CI failure for ${label}.`
  }

  private buildSuggestedFix(failureClass: CiFailureClass) {
    if (failureClass === 'flake') {
      return 'Retry failed job once, isolate flaky tests, and raise test-level timeout diagnostics.'
    }
    if (failureClass === 'test_failure') {
      return 'Reproduce failing tests locally, inspect changed assertions, and submit a patch with updated tests.'
    }
    if (failureClass === 'build_failure') {
      return 'Run type-check/build locally, fix compiler errors, and re-run CI before merge.'
    }
    if (failureClass === 'dependency_failure') {
      return 'Refresh lockfile, align dependency versions, and verify deterministic install in CI.'
    }
    if (failureClass === 'environment_failure') {
      return 'Re-run job on clean runner and verify resource/network quotas.'
    }
    return 'Escalate for human triage with complete logs and artifacts.'
  }

  private toIncident(row: {
    id: string
    userId: string
    provider: string
    repo: string
    branch: string | null
    pipelineId: string | null
    jobName: string | null
    commitSha: string | null
    failureClass: string
    status: string
    summary: string | null
    suggestedFix: string | null
    prUrl: string | null
    retryCount: number
    failureFingerprint: string | null
    metadata: string | null
    createdAt: Date
    updatedAt: Date
  }): CiIncident {
    const failureClass = FAILURE_CLASSES.includes(row.failureClass as CiFailureClass)
      ? (row.failureClass as CiFailureClass)
      : 'unknown'
    const status = INCIDENT_STATUSES.includes(row.status as CiIncidentStatus)
      ? (row.status as CiIncidentStatus)
      : 'failed'

    return {
      id: row.id,
      userId: row.userId,
      provider: row.provider,
      repo: row.repo,
      branch: row.branch,
      pipelineId: row.pipelineId,
      jobName: row.jobName,
      commitSha: row.commitSha,
      failureClass,
      status,
      summary: row.summary,
      suggestedFix: row.suggestedFix,
      prUrl: row.prUrl,
      retryCount: row.retryCount,
      failureFingerprint: row.failureFingerprint,
      metadata: this.parseRecordJson(row.metadata),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private normalizeOptionalText(value: string | undefined, maxLength: number) {
    const normalized = (value ?? '').trim()
    return normalized ? normalized.slice(0, maxLength) : null
  }

  private normalizeUrls(values: string[] | undefined) {
    if (!Array.isArray(values)) return []
    const urls: string[] = []
    for (const raw of values) {
      const value = typeof raw === 'string' ? raw.trim().slice(0, 1000) : ''
      if (!value) continue
      urls.push(value)
      if (urls.length >= 25) break
    }
    return urls
  }

  private buildFingerprint(repo: string, commitSha: string | null, jobName: string | null, logExcerpt: string | null) {
    const material = [
      repo.trim(),
      commitSha?.trim() ?? '',
      jobName?.trim() ?? '',
      (logExcerpt ?? '').slice(0, 1500),
    ].join('|')

    return createHash('sha256').update(material).digest('hex').slice(0, 40)
  }

  private syntheticPullRequestUrl(repo: string, incidentId: string) {
    const normalizedRepo = repo.replace(/\.git$/i, '').replace(/\/+$/, '')
    if (/^https?:\/\//i.test(normalizedRepo)) {
      return `${normalizedRepo}/pull/new/ci-healer-${incidentId.slice(0, 8)}`
    }
    return null
  }

  private parseRecordJson(raw: string | null): Record<string, unknown> | null {
    if (!raw) return null
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      return parsed as Record<string, unknown>
    } catch {
      return null
    }
  }

  private safeSerialize(value: unknown) {
    try {
      return JSON.stringify(value) ?? ''
    } catch {
      return String(value)
    }
  }

  private safeError(error: unknown) {
    if (error instanceof Error) return error.message
    return typeof error === 'string' ? error : 'Unknown error'
  }
}
