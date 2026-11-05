import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { UserJsonStore } from '../durable/user-json-store'
import { ReplayService, type ReplayStep } from './replay.service'

export type ReplayCategory = 'browser' | 'terminal' | 'tool' | 'message' | 'approval' | 'system' | 'error'

export interface TimelineStep extends ReplayStep {
  category: ReplayCategory
  cumulativeTokens: number
  cumulativeCostUsd: number
}

export interface ReplayFork {
  id: string
  userId: string
  sourceRunId: string
  sourceConversationId: string
  forkConversationId: string
  forkRunId: string
  forkStep: number
  title: string
  model?: string
  modelProvider?: string
  instructions?: string
  seededSteps: ReplayStep[]
  createdAt: string
}

export interface DiffRow {
  index: number
  status: 'same' | 'changed' | 'added' | 'removed'
  original?: ReplayStep
  fork?: ReplayStep
}

const BROWSER = /browser|web|navigate|click|screenshot|playwright|puppeteer|page/i
const TERMINAL = /shell|bash|terminal|exec|command|run_code|sandbox|powershell|cmd/i

export function categorize(step: ReplayStep): ReplayCategory {
  if (step.kind === 'error') return 'error'
  if (step.kind === 'approval') return 'approval'
  if (step.kind === 'tool_call' || step.kind === 'tool_result') {
    const name = step.toolName ?? step.title
    if (step.screenshot || BROWSER.test(name)) return 'browser'
    if (TERMINAL.test(name)) return 'terminal'
    return 'tool'
  }
  if (step.kind === 'user' || step.kind === 'agent') return 'message'
  return 'system'
}

const sig = (s: ReplayStep) =>
  JSON.stringify([s.kind, s.toolName ?? '', s.title, s.content ?? '', s.input ?? null, s.output ?? null, s.status ?? ''])

/** Pure diff by index; first divergent index is reported separately. */
export function diffSteps(original: ReplayStep[], fork: ReplayStep[]) {
  const n = Math.max(original.length, fork.length)
  const rows: DiffRow[] = []
  let firstDivergence: number | null = null
  for (let i = 0; i < n; i++) {
    const o = original[i]
    const f = fork[i]
    let status: DiffRow['status']
    if (o && f) status = sig(o) === sig(f) ? 'same' : 'changed'
    else if (o) status = 'removed'
    else status = 'added'
    if (status !== 'same' && firstDivergence === null) firstDivergence = i
    rows.push({ index: i, status, original: o, fork: f })
  }
  return {
    firstDivergence,
    counts: {
      same: rows.filter((r) => r.status === 'same').length,
      changed: rows.filter((r) => r.status === 'changed').length,
      added: rows.filter((r) => r.status === 'added').length,
      removed: rows.filter((r) => r.status === 'removed').length,
    },
    rows,
  }
}

const safeParse = (s?: string | null): any => {
  if (!s) return undefined
  try { return JSON.parse(s) } catch { return s }
}

@Injectable()
export class ReplayForkService {
  private readonly forks = new UserJsonStore<ReplayFork>('replay-forks', 200)

  constructor(
    private readonly prisma: PrismaService,
    private readonly replay: ReplayService,
  ) {}

  async timeline(userId: string, runId: string) {
    const detail = await this.replay.getRun(userId, runId)
    let tokens = 0
    let cost = 0
    const steps: TimelineStep[] = detail.steps.map((s) => {
      if (s.kind !== 'metric') {
        tokens += s.tokens ?? 0
        cost += s.costUsd ?? 0
      }
      return { ...s, category: categorize(s), cumulativeTokens: tokens, cumulativeCostUsd: Number(cost.toFixed(6)) }
    })
    const categories: Record<string, number> = {}
    for (const s of steps) categories[s.category] = (categories[s.category] ?? 0) + 1
    return { run: detail.run, totals: detail.totals, categories, steps }
  }

  async step(userId: string, runId: string, index: number) {
    const tl = await this.timeline(userId, runId)
    const step = tl.steps[index]
    if (!step) throw new NotFoundException('Step not found')
    return { step, previous: tl.steps[index - 1] ?? null, next: tl.steps[index + 1] ?? null, total: tl.steps.length }
  }

  async fork(
    userId: string,
    runId: string,
    dto: { stepIndex: number; model?: string; modelProvider?: string; instructions?: string; title?: string },
  ) {
    const detail = await this.replay.getRun(userId, runId)
    if (dto.stepIndex < 0 || dto.stepIndex >= detail.steps.length) throw new BadRequestException('stepIndex out of range')
    const seeded = detail.steps.slice(0, dto.stepIndex + 1)
    const cutoff = new Date(seeded[seeded.length - 1].at).getTime()
    const windowStart = new Date(new Date(detail.steps[0].at).getTime() - 1000)

    const source = await this.prisma.conversation.findFirst({ where: { id: detail.run.conversationId, userId } })
    if (!source) throw new NotFoundException('Source conversation not found')

    // Seed context: text messages from the original conversation up to the fork point.
    const msgs = await this.prisma.message.findMany({
      where: { conversationId: source.id, createdAt: { gte: windowStart, lte: new Date(cutoff + 1) }, role: { in: ['user', 'agent', 'system'] } },
      orderBy: { createdAt: 'asc' },
    })

    const title = (dto.title?.trim() || `Fork of ${source.title ?? 'run'} @ step ${dto.stepIndex + 1}`).slice(0, 160)
    const model = dto.model?.trim() || source.model || null
    const modelProvider = dto.modelProvider?.trim() || source.modelProvider || null
    const now = new Date()
    const conv = await this.prisma.conversation.create({
      data: { userId, title, model, modelProvider, personality: source.personality, lastMessageAt: now },
    })
    if (dto.instructions?.trim()) {
      await this.prisma.message.create({
        data: { conversationId: conv.id, role: 'system', content: dto.instructions.trim().slice(0, 4000), metadata: JSON.stringify({ fork: true }) },
      })
    }
    for (const m of msgs) {
      await this.prisma.message.create({
        data: { conversationId: conv.id, role: m.role, content: m.content, status: 'done', metadata: JSON.stringify({ forkedFrom: m.id }) },
      })
    }
    const forkRun = await this.prisma.agentRun.create({
      data: {
        conversationId: conv.id,
        userId,
        status: 'idle',
        metadata: JSON.stringify({ fork: { sourceRunId: runId, stepIndex: dto.stepIndex } }),
      },
    })
    const record: ReplayFork = {
      id: randomUUID(),
      userId,
      sourceRunId: runId,
      sourceConversationId: source.id,
      forkConversationId: conv.id,
      forkRunId: forkRun.id,
      forkStep: dto.stepIndex,
      title,
      model: model ?? undefined,
      modelProvider: modelProvider ?? undefined,
      instructions: dto.instructions?.trim() || undefined,
      seededSteps: seeded,
      createdAt: now.toISOString(),
    }
    this.forks.save(userId, [...this.forks.load(userId), record])
    return { ...this.summary(record), seededMessages: msgs.length }
  }

  list(userId: string, sourceRunId?: string) {
    return this.forks
      .load(userId)
      .filter((f) => !sourceRunId || f.sourceRunId === sourceRunId)
      .map((f) => this.summary(f))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  private summary(f: ReplayFork) {
    return {
      id: f.id,
      sourceRunId: f.sourceRunId,
      forkConversationId: f.forkConversationId,
      forkRunId: f.forkRunId,
      forkStep: f.forkStep,
      title: f.title,
      model: f.model ?? null,
      modelProvider: f.modelProvider ?? null,
      instructions: f.instructions ?? null,
      createdAt: f.createdAt,
    }
  }

  private find(userId: string, id: string) {
    const f = this.forks.load(userId).find((x) => x.id === id)
    if (!f) throw new NotFoundException('Fork not found')
    return f
  }

  /** Seeded steps + whatever has happened in the fork conversation since the fork was created. */
  private async forkSteps(userId: string, f: ReplayFork): Promise<ReplayStep[]> {
    const created = new Date(f.createdAt)
    const msgs = await this.prisma.message.findMany({
      where: { conversationId: f.forkConversationId, createdAt: { gt: new Date(created.getTime() + 1000) } },
      orderBy: { createdAt: 'asc' },
    })
    const steps: ReplayStep[] = [...f.seededSteps]
    const t0 = new Date(f.seededSteps[0]?.at ?? f.createdAt).getTime()
    for (const m of msgs) {
      const at = m.createdAt.toISOString()
      const base = { at, offsetMs: m.createdAt.getTime() - t0, status: m.status }
      const call = safeParse(m.toolCallJson)
      const result = safeParse(m.toolResultJson)
      if (call) {
        steps.push({ ...base, index: steps.length, kind: 'tool_call', title: `Tool call: ${call?.name ?? call?.toolName ?? 'tool'}`, toolName: call?.name ?? call?.toolName, input: call?.input ?? call?.arguments ?? call })
      }
      if (result !== undefined) {
        steps.push({ ...base, index: steps.length, kind: 'tool_result', title: 'Tool result', output: result })
      }
      if (!call && result === undefined) {
        const kind = m.role === 'user' ? 'user' : m.role === 'agent' ? 'agent' : 'system'
        steps.push({ ...base, index: steps.length, kind, title: kind === 'user' ? 'User message' : kind === 'agent' ? 'Agent reply' : 'System', content: m.content })
      }
    }
    void userId
    return steps
  }

  async detail(userId: string, id: string) {
    const f = this.find(userId, id)
    const steps = await this.forkSteps(userId, f)
    return { fork: this.summary(f), steps: steps.map((s) => ({ ...s, category: categorize(s) })) }
  }

  async diff(userId: string, id: string) {
    const f = this.find(userId, id)
    const [orig, forkSteps] = await Promise.all([this.replay.getRun(userId, f.sourceRunId), this.forkSteps(userId, f)])
    const sum = (arr: ReplayStep[], k: 'tokens' | 'costUsd') => arr.filter((s) => s.kind !== 'metric').reduce((n, s) => n + (s[k] ?? 0), 0)
    const d = diffSteps(orig.steps, forkSteps)
    return {
      fork: this.summary(f),
      ...d,
      totals: {
        original: { steps: orig.steps.length, tokens: sum(orig.steps, 'tokens'), costUsd: sum(orig.steps, 'costUsd') },
        fork: { steps: forkSteps.length, tokens: sum(forkSteps, 'tokens'), costUsd: sum(forkSteps, 'costUsd') },
      },
    }
  }
}
