import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common'
import Bull, { type Queue } from 'bull'
import type {
  CreateExtractionJobInput,
  ExtractionJob,
  ExtractionStatus,
  ExtractionValidationIssue,
  ExtractionJobData,
} from '@openagents/shared'
import { EXTRACTION_JOB_NAMES, QUEUE_NAMES } from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'

const EXTRACTION_STATUSES: ExtractionStatus[] = ['queued', 'processing', 'completed', 'failed', 'needs_review']

@Injectable()
export class ExtractionService implements OnModuleDestroy {
  private readonly logger = new Logger(ExtractionService.name)
  private readonly extractionQueue?: Queue<ExtractionJobData>
  private processingMode: 'inline' | 'queue'

  constructor(private prisma: PrismaService) {
    const configuredMode = (process.env.EXTRACTION_PROCESSING_MODE ?? 'inline').toLowerCase()
    this.processingMode = configuredMode === 'queue' ? 'queue' : 'inline'

    const redisUrl = process.env.REDIS_URL
    if (this.processingMode === 'queue' && !redisUrl) {
      this.logger.warn('EXTRACTION_PROCESSING_MODE=queue but REDIS_URL is missing. Falling back to inline processing.')
      this.processingMode = 'inline'
      return
    }

    if (this.processingMode === 'queue' && redisUrl) {
      this.extractionQueue = new Bull<ExtractionJobData>(QUEUE_NAMES.extractionJobs, redisUrl)
      this.extractionQueue.on('error', (error) => {
        this.logger.error('Extraction queue error', error?.stack ?? String(error))
      })
    }
  }

  async onModuleDestroy() {
    if (this.extractionQueue) {
      await this.extractionQueue.close()
    }
  }

  async createJob(userId: string, input: CreateExtractionJobInput): Promise<ExtractionJob> {
    const sourceUri = (input.sourceUri ?? '').trim().slice(0, 1_000)
    const schemaVersion = (input.schemaVersion ?? '').trim().slice(0, 120)
    const schema = this.asRecord(input.schema)

    if (!sourceUri) throw new BadRequestException('sourceUri is required.')
    if (!schemaVersion) throw new BadRequestException('schemaVersion is required.')
    if (!schema) throw new BadRequestException('schema must be a JSON object.')

    const row = await this.prisma.extractionJob.create({
      data: {
        userId,
        sourceKind: input.sourceKind,
        sourceUri,
        schemaVersion,
        schemaJson: this.safeSerialize(schema),
        optionsJson: input.options ? this.safeSerialize(input.options) : null,
        status: 'queued',
        reviewerStatus: 'pending',
        validationIssues: '[]',
      },
    })

    await this.dispatchProcessing(row.id, row.userId)

    return this.toExtractionJob(row)
  }

  async listJobs(userId: string, status?: ExtractionStatus, limit = 30): Promise<ExtractionJob[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100))
    const rows = await this.prisma.extractionJob.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: safeLimit,
    })

    return rows.map((row) => this.toExtractionJob(row))
  }

  async getJob(userId: string, id: string): Promise<ExtractionJob> {
    const row = await this.prisma.extractionJob.findUnique({ where: { id } })
    if (!row) throw new NotFoundException(`Extraction job "${id}" not found.`)
    if (row.userId !== userId) throw new ForbiddenException()
    return this.toExtractionJob(row)
  }

  async processJob(extractionId: string): Promise<ExtractionJob> {
    const existing = await this.prisma.extractionJob.findUnique({ where: { id: extractionId } })
    if (!existing) throw new NotFoundException(`Extraction job "${extractionId}" not found.`)

    if (existing.status === 'completed' || existing.status === 'needs_review') {
      return this.toExtractionJob(existing)
    }

    await this.prisma.extractionJob.update({
      where: { id: extractionId },
      data: { status: 'processing' },
    })

    const schema = this.parseRecordJson(existing.schemaJson) ?? {}
    const output = this.buildOutput(existing.sourceUri, existing.sourceKind, schema)
    const validationIssues = this.validateOutput(schema, output)

    const hasError = validationIssues.some((issue) => issue.level === 'error')
    const baseConfidence = hasError ? 0.42 : 0.82
    const confidencePenalty = validationIssues.length * 0.06
    const confidence = Math.max(0, Math.min(1, baseConfidence - confidencePenalty))
    const status: ExtractionStatus = hasError ? 'needs_review' : 'completed'

    const row = await this.prisma.extractionJob.update({
      where: { id: extractionId },
      data: {
        status,
        outputJson: this.safeSerialize(output),
        confidence,
        failureReason: hasError ? 'Validation issues detected in extracted payload.' : null,
        validationIssues: this.safeSerialize(validationIssues),
      },
    })

    return this.toExtractionJob(row)
  }

  private async dispatchProcessing(extractionId: string, requestedBy: string) {
    if (this.extractionQueue) {
      await this.extractionQueue.add(
        EXTRACTION_JOB_NAMES.run,
        {
          extractionId,
          requestedBy,
        },
        {
          jobId: `extraction:${extractionId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      )
      return
    }

    if (this.processingMode === 'inline') {
      void this.processJob(extractionId).catch((error) => {
        this.logger.warn(`Inline extraction processing failed (${extractionId}): ${this.safeError(error)}`)
      })
    }
  }

  private toExtractionJob(row: {
    id: string
    userId: string
    sourceKind: string
    sourceUri: string
    schemaVersion: string
    status: string
    outputJson: string | null
    confidence: number
    reviewerStatus: string | null
    failureReason: string | null
    validationIssues: string
    createdAt: Date
    updatedAt: Date
  }): ExtractionJob {
    const status = EXTRACTION_STATUSES.includes(row.status as ExtractionStatus)
      ? (row.status as ExtractionStatus)
      : 'failed'

    return {
      id: row.id,
      userId: row.userId,
      sourceKind: row.sourceKind === 'pdf' || row.sourceKind === 'email' || row.sourceKind === 'web' || row.sourceKind === 'text'
        ? row.sourceKind
        : 'text',
      sourceUri: row.sourceUri,
      schemaVersion: row.schemaVersion,
      status,
      outputJson: this.parseRecordJson(row.outputJson),
      confidence: Math.max(0, Math.min(1, row.confidence)),
      reviewerStatus: row.reviewerStatus === 'pending' || row.reviewerStatus === 'approved' || row.reviewerStatus === 'rejected'
        ? row.reviewerStatus
        : null,
      failureReason: row.failureReason,
      validationIssues: this.parseValidationIssues(row.validationIssues),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private buildOutput(sourceUri: string, sourceKind: string, schema: Record<string, unknown>) {
    const now = new Date().toISOString()
    const out: Record<string, unknown> = {
      source_uri: sourceUri,
      source_kind: sourceKind,
      extracted_at: now,
    }

    const properties = this.asRecord(schema.properties)
    if (!properties) return out

    for (const [field, definition] of Object.entries(properties).slice(0, 30)) {
      const normalizedField = field.trim().toLowerCase()
      const def = this.asRecord(definition) ?? {}
      const declaredType = typeof def.type === 'string' ? def.type : 'string'

      if (normalizedField.includes('url')) {
        out[field] = sourceUri
      } else if (normalizedField.includes('date') || normalizedField.includes('time')) {
        out[field] = now
      } else if (normalizedField.includes('summary') || normalizedField.includes('description')) {
        out[field] = `Auto-extracted summary from ${sourceKind} source.`
      } else if (declaredType === 'number' || declaredType === 'integer') {
        out[field] = 1
      } else if (declaredType === 'boolean') {
        out[field] = true
      } else if (declaredType === 'array') {
        out[field] = []
      } else if (declaredType === 'object') {
        out[field] = {}
      } else {
        out[field] = `Extracted value for ${field}`
      }
    }

    return out
  }

  private validateOutput(schema: Record<string, unknown>, output: Record<string, unknown>): ExtractionValidationIssue[] {
    const issues: ExtractionValidationIssue[] = []

    const required = Array.isArray(schema.required)
      ? schema.required.filter((value): value is string => typeof value === 'string')
      : []

    for (const key of required) {
      if (!(key in output) || output[key] == null || output[key] === '') {
        issues.push({
          path: key,
          message: 'Missing required field',
          level: 'error',
        })
      }
    }

    const properties = this.asRecord(schema.properties)
    if (!properties) return issues

    for (const [key, rawDefinition] of Object.entries(properties)) {
      const definition = this.asRecord(rawDefinition)
      if (!definition) continue
      const type = typeof definition.type === 'string' ? definition.type : null
      const value = output[key]

      if (value == null || !type) continue
      if (type === 'string' && typeof value !== 'string') {
        issues.push({ path: key, message: 'Expected string value', level: 'warning' })
      } else if ((type === 'number' || type === 'integer') && typeof value !== 'number') {
        issues.push({ path: key, message: 'Expected numeric value', level: 'warning' })
      } else if (type === 'boolean' && typeof value !== 'boolean') {
        issues.push({ path: key, message: 'Expected boolean value', level: 'warning' })
      } else if (type === 'array' && !Array.isArray(value)) {
        issues.push({ path: key, message: 'Expected array value', level: 'warning' })
      } else if (type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
        issues.push({ path: key, message: 'Expected object value', level: 'warning' })
      }
    }

    return issues
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

  private parseValidationIssues(raw: string): ExtractionValidationIssue[] {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const record = item as Partial<ExtractionValidationIssue>
          const path = typeof record.path === 'string' ? record.path : 'root'
          const message = typeof record.message === 'string' ? record.message : 'Unknown issue'
          const level = record.level === 'error' || record.level === 'warning' ? record.level : 'warning'
          return { path, message, level }
        })
    } catch {
      return []
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
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
