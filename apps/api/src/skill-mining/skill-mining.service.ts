import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { SkillRegistryService } from '../skill-registry/skill-registry.service'
import { UserJsonStore } from '../keys-sync/user-json-store'

export type ProposalStatus = 'pending' | 'approved' | 'rejected'
export interface SkillProposalStep { tool: string; description: string }
export interface SkillProposalInput { name: string; type: 'string'; description: string }
export interface SkillProposal {
  id: string
  signature: string
  skillId: string
  name: string
  description: string
  steps: SkillProposalStep[]
  inputs: SkillProposalInput[]
  occurrences: number
  sources: { messages: number; tasks: number; conversations: number }
  examples: string[]
  status: ProposalStatus
  createdAt: string
  updatedAt: string
  decidedAt?: string
  registeredVersion?: string
}
interface MiningFile { proposals: SkillProposal[]; lastMinedAt?: string }

const MIN_OCCURRENCES = 3
const MIN_STEPS = 2
const MAX_STEPS = 12

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
const pretty = (t: string) => t.replace(/[_\-.]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

function toolNamesFrom(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    const arr = Array.isArray(v) ? v : Array.isArray(v?.toolCalls) ? v.toolCalls : [v]
    return arr.map((c: any) => c?.name ?? c?.toolName ?? c?.function?.name).filter((n: any) => typeof n === 'string' && n)
  } catch {
    return []
  }
}

@Injectable()
export class SkillMiningService {
  private readonly store = new UserJsonStore<MiningFile>('SKILL_MINING_DATA_DIR', 'skill-mining', () => ({ proposals: [] }))

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SkillRegistryService,
  ) {}

  list(userId: string, status?: string) {
    return this.store.read(userId).then((f) => ({
      lastMinedAt: f.lastMinedAt ?? null,
      proposals: f.proposals.filter((p) => !status || p.status === status).sort((a, b) => b.occurrences - a.occurrences),
    }))
  }

  async get(userId: string, id: string) {
    const p = (await this.store.read(userId)).proposals.find((x) => x.id === id)
    if (!p) throw new NotFoundException('Proposal not found')
    return p
  }

  /** Scans recent conversations and completed tasks for repeated successful tool sequences. */
  async mine(userId: string) {
    const seqs = new Map<string, { tools: string[]; msgs: number; tasks: number; convs: Set<string>; examples: string[] }>()
    const add = (tools: string[], kind: 'msgs' | 'tasks', conv: string, example: string) => {
      // collapse immediate repeats (retries / loops) and bound length
      const t = tools.filter((n, i) => n !== tools[i - 1]).slice(0, MAX_STEPS)
      if (t.length < MIN_STEPS) return
      const key = t.join('>')
      const e = seqs.get(key) ?? { tools: t, msgs: 0, tasks: 0, convs: new Set<string>(), examples: [] }
      e[kind]++
      e.convs.add(conv)
      if (example && e.examples.length < 3 && !e.examples.includes(example)) e.examples.push(example)
      seqs.set(key, e)
    }

    const messages = await this.prisma.message.findMany({
      where: { conversation: { userId } },
      orderBy: [{ conversationId: 'asc' }, { createdAt: 'asc' }],
      select: { conversationId: true, role: true, content: true, status: true, toolCallJson: true, toolResultJson: true },
      take: 8000,
    }).catch(() => [])

    let conv = ''
    let goal = ''
    let tools: string[] = []
    let failed = false
    const flush = () => {
      if (tools.length && !failed) add(tools, 'msgs', conv, goal)
      tools = []
      failed = false
    }
    for (const m of messages) {
      if (m.conversationId !== conv) { flush(); conv = m.conversationId; goal = '' }
      if (m.role === 'user') { flush(); goal = (m.content ?? '').replace(/\s+/g, ' ').slice(0, 120); continue }
      if (m.status === 'error') failed = true
      if (m.toolResultJson && /"(error|isError)"\s*:\s*(true|"[^"]+")/.test(m.toolResultJson)) failed = true
      tools.push(...toolNamesFrom(m.toolCallJson))
    }
    flush()

    const tasks = await this.prisma.agentTask.findMany({
      where: { userId, status: 'done' },
      select: { id: true, goal: true, plan: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }).catch(() => [])
    for (const t of tasks) {
      try {
        const plan = JSON.parse(t.plan || '[]')
        const names = (Array.isArray(plan) ? plan : []).map((s: any) => s?.tool ?? s?.toolName ?? s?.action).filter((n: any) => typeof n === 'string' && n)
        add(names, 'tasks', `task:${t.id}`, (t.goal ?? '').replace(/\s+/g, ' ').slice(0, 120))
      } catch { /* ignore malformed plan */ }
    }

    const now = new Date().toISOString()
    let created = 0
    let updated = 0
    await this.store.update(userId, (f) => {
      for (const [key, s] of seqs) {
        const count = s.msgs + s.tasks
        if (count < MIN_OCCURRENCES) continue
        const signature = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)
        const sources = { messages: s.msgs, tasks: s.tasks, conversations: s.convs.size }
        const existing = f.proposals.find((p) => p.signature === signature)
        if (existing) {
          if (existing.status === 'pending') { existing.occurrences = count; existing.sources = sources; existing.updatedAt = now; updated++ }
          continue
        }
        const name = s.tools.length <= 3 ? s.tools.map(pretty).join(' → ') : `${pretty(s.tools[0])} → … → ${pretty(s.tools[s.tools.length - 1])}`
        f.proposals.push({
          id: crypto.randomUUID(),
          signature,
          skillId: slug(`auto-${s.tools.slice(0, 3).join('-')}-${signature.slice(0, 4)}`),
          name: name.slice(0, 80),
          description: `Repeatable workflow (${s.tools.length} steps) observed ${count} times: ${s.tools.join(' → ')}`.slice(0, 280),
          steps: s.tools.map((tool, i) => ({ tool, description: `Step ${i + 1}: run ${tool}` })),
          inputs: [{ name: 'goal', type: 'string', description: 'What you want this workflow to accomplish this time' }],
          occurrences: count,
          sources,
          examples: s.examples,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        created++
      }
      f.lastMinedAt = now
    })
    return { scanned: { messages: messages.length, tasks: tasks.length }, patterns: seqs.size, created, updated, minOccurrences: MIN_OCCURRENCES }
  }

  async edit(userId: string, id: string, patch: Partial<Pick<SkillProposal, 'name' | 'description' | 'skillId' | 'steps' | 'inputs'>>) {
    return this.store.update(userId, (f) => {
      const p = f.proposals.find((x) => x.id === id)
      if (!p) throw new NotFoundException('Proposal not found')
      if (p.status !== 'pending') throw new BadRequestException('Only pending proposals can be edited')
      if (patch.name !== undefined) p.name = patch.name.slice(0, 80)
      if (patch.description !== undefined) p.description = patch.description.slice(0, 280)
      if (patch.skillId !== undefined) p.skillId = slug(patch.skillId) || p.skillId
      if (patch.steps?.length) p.steps = patch.steps.slice(0, MAX_STEPS)
      if (patch.inputs) p.inputs = patch.inputs.slice(0, 10)
      p.updatedAt = new Date().toISOString()
      return { ...p }
    })
  }

  async reject(userId: string, id: string) {
    return this.store.update(userId, (f) => {
      const p = f.proposals.find((x) => x.id === id)
      if (!p) throw new NotFoundException('Proposal not found')
      p.status = 'rejected'
      p.decidedAt = new Date().toISOString()
      return { ...p }
    })
  }

  async remove(userId: string, id: string) {
    await this.store.update(userId, (f) => {
      const i = f.proposals.findIndex((x) => x.id === id)
      if (i < 0) throw new NotFoundException('Proposal not found')
      f.proposals.splice(i, 1)
    })
    return { ok: true }
  }

  /** Approves (optionally with edits) and publishes into the skill registry. */
  async approve(userId: string, id: string, patch?: Parameters<SkillMiningService['edit']>[2]) {
    if (patch && Object.keys(patch).length) await this.edit(userId, id, patch)
    const p = await this.get(userId, id)
    if (p.status !== 'pending') throw new BadRequestException(`Proposal already ${p.status}`)
    const tools = [...new Set(p.steps.map((s) => s.tool))]
    const appendix = [
      `Workflow "${p.name}":`,
      ...p.steps.map((s, i) => `${i + 1}. [${s.tool}] ${s.description}`),
      p.inputs.length ? `Inputs: ${p.inputs.map((i) => i.name).join(', ')}` : '',
    ].filter(Boolean).join('\n')
    const version = `1.${Math.max(0, Math.floor(Date.now() / 1000) % 100000)}.0`
    await this.registry.publish(userId, {
      skill: { id: p.skillId, title: p.name, description: p.description, tools, promptAppendix: appendix },
      version,
      changelog: `Auto-proposed from ${p.occurrences} repeated successful runs; approved by user.`,
    } as any)
    return this.store.update(userId, (f) => {
      const x = f.proposals.find((q) => q.id === id)!
      x.status = 'approved'
      x.decidedAt = new Date().toISOString()
      x.registeredVersion = version
      return { ...x }
    })
  }
}
