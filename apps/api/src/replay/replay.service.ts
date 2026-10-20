import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export type ReplayStepKind = 'user' | 'agent' | 'system' | 'tool_call' | 'tool_result' | 'approval' | 'metric' | 'error'

export interface ReplayStep {
  index: number
  at: string
  offsetMs: number
  kind: ReplayStepKind
  title: string
  content?: string
  toolName?: string
  input?: unknown
  output?: unknown
  status?: string
  screenshot?: string
  tokens?: number
  costUsd?: number
  durationMs?: number
}

const parse = (s: string | null | undefined): any => {
  if (!s) return undefined
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

/** Find a screenshot (data URL / http URL / base64 png) anywhere in a tool result. */
function findScreenshot(value: any, depth = 0): string | undefined {
  if (!value || depth > 4) return undefined
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) return value
    return undefined
  }
  if (typeof value !== 'object') return undefined
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string' && /screenshot|image/i.test(k)) {
      if (v.startsWith('data:image/') || /^https?:\/\//.test(v)) return v
      if (/^[A-Za-z0-9+/=]{200,}$/.test(v)) return `data:image/png;base64,${v}`
    }
    const nested = findScreenshot(v, depth + 1)
    if (nested) return nested
  }
  return undefined
}

function usageOf(meta: any): { tokens?: number; costUsd?: number } {
  if (!meta || typeof meta !== 'object') return {}
  const u = meta.usage ?? meta
  const tokens =
    Number(u.totalTokens ?? u.total_tokens ?? u.tokens ?? 0) ||
    Number(u.inputTokens ?? u.input_tokens ?? 0) + Number(u.outputTokens ?? u.output_tokens ?? 0) ||
    undefined
  const costUsd = Number(meta.costUsd ?? u.costUsd ?? u.cost ?? 0) || undefined
  return { tokens, costUsd }
}

@Injectable()
export class ReplayService {
  constructor(private readonly prisma: PrismaService) {}

  async listRuns(userId: string, limit = 50, conversationId?: string) {
    const runs = await this.prisma.agentRun.findMany({
      where: { conversation: { userId }, ...(conversationId ? { conversationId } : {}) },
      orderBy: { startedAt: 'desc' },
      take: Math.max(1, Math.min(200, limit)),
      include: { conversation: { select: { title: true } } },
    })
    return runs.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      conversationTitle: r.conversation?.title ?? null,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs: r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
      error: r.error,
    }))
  }

  async getRun(userId: string, id: string) {
    const run = await this.prisma.agentRun.findFirst({
      where: { id, conversation: { userId } },
      include: { conversation: { select: { title: true, model: true, modelProvider: true } } },
    })
    if (!run) throw new NotFoundException('Run not found')

    // Window: from run start until finish, or until the next run in the conversation starts.
    const next = await this.prisma.agentRun.findFirst({
      where: { conversationId: run.conversationId, startedAt: { gt: run.startedAt } },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true },
    })
    const start = new Date(run.startedAt.getTime() - 5_000) // include the triggering user message
    const end = run.finishedAt ? new Date(run.finishedAt.getTime() + 2_000) : next?.startedAt ?? new Date()
    const window = { gte: start, lte: end }

    const [messages, approvals, metrics] = await Promise.all([
      this.prisma.message.findMany({ where: { conversationId: run.conversationId, createdAt: window }, orderBy: { createdAt: 'asc' } }),
      this.prisma.approval.findMany({ where: { conversationId: run.conversationId, userId, createdAt: window } }).catch(() => []),
      this.prisma.metricLog
        .findMany({ where: { userId, conversationId: run.conversationId, createdAt: window }, orderBy: { createdAt: 'asc' } })
        .catch(() => []),
    ])

    const raw: Omit<ReplayStep, 'index' | 'offsetMs'>[] = []
    for (const m of messages) {
      const meta = parse(m.metadata)
      const usage = usageOf(meta)
      const toolCall = parse(m.toolCallJson)
      const toolResult = parse(m.toolResultJson)
      if (toolCall) {
        raw.push({
          at: m.createdAt.toISOString(),
          kind: 'tool_call',
          title: `Tool call: ${toolCall?.name ?? toolCall?.toolName ?? 'tool'}`,
          toolName: toolCall?.name ?? toolCall?.toolName,
          input: toolCall?.input ?? toolCall?.arguments ?? toolCall,
          status: m.status,
          ...usage,
        })
      }
      if (toolResult !== undefined) {
        raw.push({
          at: m.createdAt.toISOString(),
          kind: 'tool_result',
          title: `Tool result${toolCall?.name ? `: ${toolCall.name}` : ''}`,
          output: toolResult,
          screenshot: findScreenshot(toolResult),
          status: m.status,
        })
      }
      if (m.content?.trim() && !(toolCall && m.role === 'tool')) {
        const kind: ReplayStepKind = m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : m.status === 'error' ? 'error' : 'agent'
        raw.push({
          at: m.createdAt.toISOString(),
          kind,
          title: kind === 'user' ? 'User message' : kind === 'agent' ? 'Agent response' : kind === 'error' ? 'Error' : 'System',
          content: m.content,
          status: m.status,
          ...(toolCall ? {} : usage),
        })
      }
    }
    for (const a of approvals) {
      raw.push({
        at: (a.resolvedAt ?? a.createdAt).toISOString(),
        kind: 'approval',
        title: `Approval ${a.status}: ${a.toolName}`,
        toolName: a.toolName,
        input: parse(a.toolInput),
        status: a.status,
      })
    }
    for (const x of metrics) {
      if (!x.tokensUsed && !x.costUsd && !x.durationMs) continue
      raw.push({
        at: x.createdAt.toISOString(),
        kind: 'metric',
        title: `${x.metricType} ${x.action}${x.toolName ? ` · ${x.toolName}` : ''}${x.model ? ` · ${x.model}` : ''}`,
        toolName: x.toolName ?? undefined,
        tokens: x.tokensUsed ?? undefined,
        costUsd: x.costUsd ?? undefined,
        durationMs: x.durationMs ?? undefined,
      })
    }
    if (run.error) raw.push({ at: (run.finishedAt ?? end).toISOString(), kind: 'error', title: 'Run error', content: run.error })

    raw.sort((a, b) => a.at.localeCompare(b.at))
    const t0 = raw.length ? new Date(raw[0].at).getTime() : run.startedAt.getTime()
    const steps: ReplayStep[] = raw.map((s, index) => ({ ...s, index, offsetMs: new Date(s.at).getTime() - t0 }))

    // Prefer metric logs for totals; fall back to per-message usage.
    const metricTokens = (metrics as Array<{ tokensUsed?: number | null }>).reduce((n, x) => n + (x.tokensUsed ?? 0), 0)
    const metricCost = (metrics as Array<{ costUsd?: number | null }>).reduce((n, x) => n + (x.costUsd ?? 0), 0)
    const stepTokens = steps.filter((s) => s.kind !== 'metric').reduce((n, s) => n + (s.tokens ?? 0), 0)
    const stepCost = steps.filter((s) => s.kind !== 'metric').reduce((n, s) => n + (s.costUsd ?? 0), 0)

    return {
      run: {
        id: run.id,
        conversationId: run.conversationId,
        conversationTitle: run.conversation?.title ?? null,
        model: run.conversation?.model ?? null,
        provider: run.conversation?.modelProvider ?? null,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        error: run.error,
        metadata: parse(run.metadata) ?? null,
      },
      totals: {
        steps: steps.length,
        toolCalls: steps.filter((s) => s.kind === 'tool_call').length,
        approvals: steps.filter((s) => s.kind === 'approval').length,
        tokens: metricTokens || stepTokens,
        costUsd: Number((metricCost || stepCost).toFixed(6)),
        durationMs: steps.length ? steps[steps.length - 1].offsetMs : 0,
      },
      steps,
    }
  }
}
