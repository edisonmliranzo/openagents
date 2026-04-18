import { AuditSeverity, AuditCategory } from '@openagents/shared'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  ConversationLineageGraph,
  CreateDataLineageInput,
  DataLineageRecord,
  LineageGraphEdge,
  LineageGraphNode,
  LineageToolInfluence,
  LineageToolStatus,
} from '@openagents/shared'

export interface AnomalyAlert {
  toolName: string
  recentCount: number
  avgPerSession: number
  ratio: number
  severity: 'low' | 'medium' | 'high'
  detectedAt: string
}

const LINEAGE_FILE = 'LINEAGE.json'
const STORE_VERSION = 1
const MAX_RECORDS_PER_USER = 6000
const MAX_RETENTION_DAYS = 60

interface LineageStoreFile {
  version: number
  records: DataLineageRecord[]
}

@Injectable()
export class DataLineageService {
  private readonly logger = new Logger(DataLineageService.name)
  private readonly loadedUsers = new Set<string>()
  private readonly recordsByUser = new Map<string, DataLineageRecord[]>()

  async recordMessage(input: CreateDataLineageInput): Promise<DataLineageRecord> {
    await this.ensureLoaded(input.userId)

    const now = new Date().toISOString()
    const record: DataLineageRecord = {
      id: randomUUID(),
      userId: input.userId,
      conversationId: input.conversationId.trim(),
      messageId: input.messageId.trim(),
      source: this.sanitizeSource(input.source),
      ...(input.runId?.trim() ? { runId: input.runId.trim() } : {}),
      createdAt: now,
      memoryFiles: this.sanitizeStringList(input.memoryFiles, 32, 120),
      memorySummaryIds: this.sanitizeStringList(input.memorySummaryIds, 80, 120),
      tools: this.sanitizeTools(input.tools),
      approvals: this.sanitizeStringList(input.approvals, 80, 120),
      externalSources: this.sanitizeExternalSources(input.externalSources),
      notes: this.sanitizeStringList(input.notes, 24, 300),
    }

    const records = [...(this.recordsByUser.get(input.userId) ?? []), record]
    this.recordsByUser.set(input.userId, this.retainRecords(records))
    await this.persist(input.userId)
    return record
  }

  async listRecent(userId: string, limit = 60) {
    await this.ensureLoaded(userId)
    const safeLimit = Math.max(1, Math.min(limit, 300))
    return [...(this.recordsByUser.get(userId) ?? [])]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, safeLimit)
  }

  async listConversation(userId: string, conversationId: string, limit = 60) {
    await this.ensureLoaded(userId)
    const safeLimit = Math.max(1, Math.min(limit, 300))
    return [...(this.recordsByUser.get(userId) ?? [])]
      .filter((record) => record.conversationId === conversationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, safeLimit)
  }

  async getByMessage(userId: string, messageId: string) {
    await this.ensureLoaded(userId)
    return (this.recordsByUser.get(userId) ?? []).find((record) => record.messageId === messageId) ?? null
  }

  async getByMessageOrThrow(userId: string, messageId: string) {
    const record = await this.getByMessage(userId, messageId)
    if (!record) throw new NotFoundException(`Lineage for message "${messageId}" not found.`)
    return record
  }

  /**
   * Anomaly detection: compare recent tool call rate to baseline.
   * Returns an alert if any tool is called ≥ 3x the user's per-session average.
   */
  async detectAnomalies(userId: string): Promise<{ alerts: AnomalyAlert[] }> {
    await this.ensureLoaded(userId)
    const records = [...(this.recordsByUser.get(userId) ?? [])]
    if (records.length < 5) return { alerts: [] }

    const toolCountsBySession = new Map<string, Map<string, number>>()
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    const recentCounts = new Map<string, number>()

    for (const record of records) {
      const sessionKey = record.runId ?? record.conversationId
      if (!toolCountsBySession.has(sessionKey)) {
        toolCountsBySession.set(sessionKey, new Map())
      }
      const sessionCounts = toolCountsBySession.get(sessionKey)!
      const ts = new Date(record.createdAt).getTime()
      for (const tool of record.tools) {
        sessionCounts.set(tool.toolName, (sessionCounts.get(tool.toolName) ?? 0) + 1)
        if (ts >= oneHourAgo) {
          recentCounts.set(tool.toolName, (recentCounts.get(tool.toolName) ?? 0) + 1)
        }
      }
    }

    const toolTotals = new Map<string, { total: number; sessions: number }>()
    for (const sessionCounts of toolCountsBySession.values()) {
      for (const [toolName, count] of sessionCounts) {
        const existing = toolTotals.get(toolName) ?? { total: 0, sessions: 0 }
        toolTotals.set(toolName, { total: existing.total + count, sessions: existing.sessions + 1 })
      }
    }

    const alerts: AnomalyAlert[] = []
    for (const [toolName, recentCount] of recentCounts) {
      const stats = toolTotals.get(toolName)
      if (!stats || stats.sessions < 3) continue
      const avgPerSession = stats.total / stats.sessions
      if (avgPerSession < 1) continue
      const ratio = recentCount / avgPerSession
      if (ratio >= 3) {
        alerts.push({
          toolName,
          recentCount,
          avgPerSession: Math.round(avgPerSession * 10) / 10,
          ratio: Math.round(ratio * 10) / 10,
          severity: ratio >= 10 ? 'high' : ratio >= 5 ? 'medium' : 'low',
          detectedAt: new Date().toISOString(),
        })
      }
    }

    return { alerts }
  }

  async buildConversationGraph(userId: string, conversationId: string, limit = 80): Promise<ConversationLineageGraph> {
    const records = await this.listConversation(userId, conversationId, limit)
    const nodes: LineageGraphNode[] = []
    const edges: LineageGraphEdge[] = []
    const seenNodes = new Set<string>()
    const seenEdges = new Set<string>()

    const pushNode = (node: LineageGraphNode) => {
      if (seenNodes.has(node.id)) return
      seenNodes.add(node.id)
      nodes.push(node)
    }

    const pushEdge = (edge: LineageGraphEdge) => {
      const key = `${edge.from}:${edge.to}:${edge.label}`
      if (seenEdges.has(key)) return
      seenEdges.add(key)
      edges.push(edge)
    }

    for (const record of records) {
      const messageNodeId = `message:${record.messageId}`
      pushNode({
        id: messageNodeId,
        kind: 'message',
        label: record.messageId,
        metadata: {
          source: record.source,
          createdAt: record.createdAt,
          runId: record.runId ?? null,
        },
      })

      for (const file of record.memoryFiles) {
        const nodeId = `memory_file:${file}`
        pushNode({ id: nodeId, kind: 'memory_file', label: file })
        pushEdge({ from: messageNodeId, to: nodeId, label: 'used_memory_file' })
      }

      for (const approvalId of record.approvals) {
        const nodeId = `approval:${approvalId}`
        pushNode({ id: nodeId, kind: 'approval', label: approvalId })
        pushEdge({ from: messageNodeId, to: nodeId, label: 'linked_approval' })
      }

      for (const note of record.notes) {
        const nodeId = `note:${record.messageId}:${note}`
        pushNode({ id: nodeId, kind: 'note', label: note })
        pushEdge({ from: messageNodeId, to: nodeId, label: 'annotation' })
      }

      for (const external of record.externalSources) {
        const nodeId = `external:${external}`
        pushNode({ id: nodeId, kind: 'external_source', label: external })
        pushEdge({ from: messageNodeId, to: nodeId, label: 'referenced_external_source' })
      }

      for (const tool of record.tools) {
        const nodeId = `tool:${record.messageId}:${tool.toolName}`
        pushNode({
          id: nodeId,
          kind: 'tool',
          label: tool.toolName,
          metadata: {
            status: tool.status,
            requiresApproval: tool.requiresApproval,
            approvalId: tool.approvalId ?? null,
          },
        })
        pushEdge({ from: messageNodeId, to: nodeId, label: 'invoked_tool' })
        if (tool.approvalId) {
          pushEdge({ from: nodeId, to: `approval:${tool.approvalId}`, label: 'gated_by' })
        }
      }
    }

    return {
      conversationId,
      nodes,
      edges,
      generatedAt: new Date().toISOString(),
    }
  }

  extractExternalSources(value: unknown): string[] {
    const rendered = this.stringifyUnknown(value)
    if (!rendered) return []
    const matches = rendered.match(/https?:\/\/[^\s"'`<>]+/g) ?? []
    const deduped: string[] = []
    const seen = new Set<string>()
    for (const raw of matches) {
      const normalized = raw.trim().replace(/[),.;]+$/, '')
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      deduped.push(normalized)
      if (deduped.length >= 80) break
    }
    return deduped
  }

  private sanitizeSource(source: DataLineageRecord['source']) {
    if (
      source === 'agent'
      || source === 'approval'
      || source === 'workflow'
      || source === 'playbook'
      || source === 'system'
    ) return source
    return 'system'
  }

  private sanitizeTools(raw: unknown): LineageToolInfluence[] {
    if (!Array.isArray(raw)) return []
    const out: LineageToolInfluence[] = []
    for (const candidate of raw) {
      if (!candidate || typeof candidate !== 'object') continue
      const record = candidate as Partial<LineageToolInfluence>
      const toolName = this.optionalText(record.toolName)?.slice(0, 120)
      if (!toolName) continue
      const status = this.sanitizeToolStatus(record.status)
      if (!status) continue
      const influence: LineageToolInfluence = {
        toolName,
        status,
        requiresApproval: Boolean(record.requiresApproval),
        ...(this.optionalText(record.approvalId) ? { approvalId: this.optionalText(record.approvalId)! } : {}),
        ...(this.asRecord(record.input) ? { input: this.asRecord(record.input)! } : {}),
        ...(record.outputPreview != null
          ? { outputPreview: String(record.outputPreview).slice(0, 2000) }
          : {}),
        ...(record.error != null ? { error: String(record.error).slice(0, 1000) } : {}),
      }
      out.push(influence)
      if (out.length >= 80) break
    }
    return out
  }

  private sanitizeToolStatus(value: unknown): LineageToolStatus | null {
    if (value === 'executed' || value === 'failed' || value === 'pending_approval') return value
    return null
  }

  private sanitizeExternalSources(raw: unknown) {
    const sources = this.sanitizeStringList(raw, 80, 600)
    const valid: string[] = []
    for (const source of sources) {
      if (!source.startsWith('http://') && !source.startsWith('https://')) continue
      valid.push(source)
      if (valid.length >= 80) break
    }
    return valid
  }

  private sanitizeStringList(raw: unknown, maxItems: number, maxLen: number) {
    if (!Array.isArray(raw)) return []
    const values: string[] = []
    const seen = new Set<string>()
    for (const entry of raw) {
      const value = this.optionalText(entry)
      if (!value) continue
      const clipped = value.slice(0, maxLen)
      if (seen.has(clipped)) continue
      seen.add(clipped)
      values.push(clipped)
      if (values.length >= maxItems) break
    }
    return values
  }

  private retainRecords(records: DataLineageRecord[]) {
    const cutoff = Date.now() - MAX_RETENTION_DAYS * 24 * 60 * 60 * 1000
    return records
      .filter((record) => {
        const ts = new Date(record.createdAt).getTime()
        return Number.isFinite(ts) && ts >= cutoff
      })
      .slice(-MAX_RECORDS_PER_USER)
  }

  private async ensureLoaded(userId: string) {
    if (this.loadedUsers.has(userId)) return
    const store = await this.readStore(this.storeFilePath(userId))
    const records = (store.records ?? [])
      .filter((record) => record.userId === userId)
      .map((record) => this.sanitizeStoredRecord(record, userId))
      .filter((record): record is DataLineageRecord => Boolean(record))
    this.recordsByUser.set(userId, this.retainRecords(records))
    this.loadedUsers.add(userId)
  }

  private sanitizeStoredRecord(record: DataLineageRecord, userId: string): DataLineageRecord | null {
    if (!record || typeof record !== 'object') return null
    const createdAt = this.normalizeIso(record.createdAt)
    const messageId = this.optionalText(record.messageId)
    const conversationId = this.optionalText(record.conversationId)
    if (!createdAt || !messageId || !conversationId) return null

    return {
      id: this.optionalText(record.id) ?? randomUUID(),
      userId,
      messageId,
      conversationId,
      source: this.sanitizeSource(record.source),
      ...(this.optionalText(record.runId) ? { runId: this.optionalText(record.runId)! } : {}),
      createdAt,
      memoryFiles: this.sanitizeStringList(record.memoryFiles, 32, 120),
      memorySummaryIds: this.sanitizeStringList(record.memorySummaryIds, 80, 120),
      tools: this.sanitizeTools(record.tools),
      approvals: this.sanitizeStringList(record.approvals, 80, 120),
      externalSources: this.sanitizeExternalSources(record.externalSources),
      notes: this.sanitizeStringList(record.notes, 24, 300),
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  }

  private optionalText(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed || null
  }

  private normalizeIso(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
  }

  private stringifyUnknown(value: unknown) {
    if (value == null) return ''
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  private async persist(userId: string) {
    const filePath = this.storeFilePath(userId)
    const payload: LineageStoreFile = {
      version: STORE_VERSION,
      records: this.recordsByUser.get(userId) ?? [],
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
  }

  private async readStore(filePath: string): Promise<LineageStoreFile> {
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<LineageStoreFile>
      return {
        version: Number.isFinite(parsed.version) ? Number(parsed.version) : STORE_VERSION,
        records: Array.isArray(parsed.records) ? parsed.records : [],
      }
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : ''
      if (message && !message.toLowerCase().includes('no such file')) {
        this.logger.warn(`Failed to load lineage store: ${message}`)
      }
      return { version: STORE_VERSION, records: [] }
    }
  }

  private storeFilePath(userId: string) {
    const root = (process.env.MEMORY_FILES_ROOT ?? path.resolve(process.cwd(), 'data', 'memory')).trim()
    return path.join(root, userId, LINEAGE_FILE)
  }
}
