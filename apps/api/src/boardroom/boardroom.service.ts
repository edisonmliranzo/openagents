import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { DocumentStore } from '../prisma/document-store.service'
import { LLMService } from '../agent/llm.service'
import { UsersService } from '../users/users.service'
import { CostService } from '../cost/cost.service'
import { scoreConsensus } from '../war-rooms/consensus'
import { approxTokens, askAs, newId, parseModelRef, preferredTarget } from '../smart-router/ask'

export interface BoardAgent { name: string; role: string }
export interface RubricCriterion { name: string; weight: number; description?: string }

export interface BoardArgument {
  agent: string
  role: string
  text: string
  error?: string
  scores?: Record<string, number>
  /** Weighted 0-100 */
  total?: number
  judgeNote?: string
}

export interface BoardRound { index: number; arguments: BoardArgument[]; consensus?: number; judged: boolean }

export interface BoardVerdict {
  winner: string
  summary: string
  confidence: number
  /** Winner's weighted average 0-100 */
  finalScore: number
  agentTotals: Array<{ agent: string; avg: number }>
  dissent: Array<{ agent: string; note: string }>
}

export interface BoardSession {
  id: string
  question: string
  status: 'running' | 'done' | 'failed'
  phase: string
  createdAt: string
  updatedAt: string
  config: {
    agents: BoardAgent[]
    rounds: number
    rubric: RubricCriterion[]
    model: { provider: string; model?: string }
    judge: { provider: string; model?: string }
    maxCalls: number
    maxCostUsd: number
  }
  rounds: BoardRound[]
  verdict?: BoardVerdict
  calls: number
  estCostUsd: number
  stoppedEarly?: string
  error?: string
}

const KIND = 'boardroom_session'
const INDEX_KIND = 'boardroom_index'
const MAX_INDEX = 30

export const DEFAULT_SPECIALISTS: BoardAgent[] = [
  { name: 'Analyst', role: 'Quantitative analyst: argue from data, numbers and first-principles reasoning.' },
  { name: 'Skeptic', role: 'Devil\'s advocate: find flaws, hidden assumptions and failure modes in other positions.' },
  { name: 'Domain Expert', role: 'Seasoned domain expert: ground the answer in established practice and real-world precedent.' },
  { name: 'Risk Officer', role: 'Risk and compliance officer: focus on safety, legal, security and downside exposure.' },
  { name: 'Strategist', role: 'Pragmatic strategist: weigh trade-offs, cost, timeline and what to do next.' },
]

export const DEFAULT_RUBRIC: RubricCriterion[] = [
  { name: 'accuracy', weight: 30, description: 'Factually correct and free of errors' },
  { name: 'reasoning', weight: 25, description: 'Logical, well-structured argument' },
  { name: 'evidence', weight: 20, description: 'Specific, concrete support rather than vague claims' },
  { name: 'risk-awareness', weight: 15, description: 'Acknowledges uncertainty and downsides' },
  { name: 'clarity', weight: 10, description: 'Concise and easy to act on' },
]

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

@Injectable()
export class BoardroomService {
  private readonly logger = new Logger(BoardroomService.name)
  private readonly active = new Set<string>() // `${userId}` with a live session
  private readonly liveIds = new Set<string>()

  constructor(
    private readonly docs: DocumentStore,
    private readonly llm: LLMService,
    private readonly users: UsersService,
    private readonly costs: CostService,
  ) {}

  defaults() {
    return { specialists: DEFAULT_SPECIALISTS, rubric: DEFAULT_RUBRIC, limits: { minAgents: 2, maxAgents: 5, maxRounds: 3, maxCalls: 30 } }
  }

  async start(
    userId: string,
    input: { question: string; agents?: BoardAgent[]; rounds?: number; rubric?: RubricCriterion[]; model?: string; judgeModel?: string; maxCostUsd?: number },
  ): Promise<BoardSession> {
    const question = String(input.question ?? '').trim().slice(0, 4000)
    if (!question) throw new BadRequestException('question is required.')
    if (this.active.has(userId)) throw new BadRequestException('A boardroom session is already running. Wait for it to finish.')

    let agents = (input.agents?.length ? input.agents : DEFAULT_SPECIALISTS.slice(0, 3)).map((a) => ({
      name: String(a?.name ?? '').trim().slice(0, 40),
      role: String(a?.role ?? '').trim().slice(0, 300),
    }))
    agents = agents.filter((a) => a.name)
    if (agents.length < 2 || agents.length > 5) throw new BadRequestException('A boardroom needs 2-5 named specialist agents.')
    if (new Set(agents.map((a) => a.name.toLowerCase())).size !== agents.length) throw new BadRequestException('Agent names must be unique.')
    agents = agents.map((a) => ({ ...a, role: a.role || 'General specialist.' }))

    const rounds = Math.max(1, Math.min(3, Math.round(Number(input.rounds ?? 2)) || 2))
    let rubric: RubricCriterion[] = (input.rubric?.length ? input.rubric : DEFAULT_RUBRIC).slice(0, 6).map((c) => ({
      name: String(c?.name ?? '').trim().slice(0, 40),
      weight: Math.max(1, Math.min(100, Number(c?.weight) || 10)),
      description: c?.description ? String(c.description).slice(0, 200) : undefined,
    }))
    rubric = rubric.filter((c) => c.name)
    if (!rubric.length) rubric = DEFAULT_RUBRIC

    const base = await preferredTarget(this.users, userId)
    const model = (input.model ? parseModelRef(input.model) : null) ?? base
    if (input.model && !parseModelRef(input.model)) throw new BadRequestException('model must look like "provider:model".')
    const judge = (input.judgeModel ? parseModelRef(input.judgeModel) : null) ?? model
    if (input.judgeModel && !parseModelRef(input.judgeModel)) throw new BadRequestException('judgeModel must look like "provider:model".')

    const maxCalls = Math.min(30, rounds * (agents.length + 1) + 1)
    const now = new Date().toISOString()
    const session: BoardSession = {
      id: newId('board'),
      question,
      status: 'running',
      phase: 'starting',
      createdAt: now,
      updatedAt: now,
      config: { agents, rounds, rubric, model, judge, maxCalls, maxCostUsd: Math.max(0.01, Math.min(5, Number(input.maxCostUsd ?? 0.5) || 0.5)) },
      rounds: [],
      calls: 0,
      estCostUsd: 0,
    }
    await this.save(userId, session)
    this.active.add(userId)
    this.liveIds.add(session.id)
    void this.execute(userId, session).finally(() => {
      this.active.delete(userId)
      this.liveIds.delete(session.id)
    })
    return session
  }

  private async save(userId: string, s: BoardSession) {
    s.updatedAt = new Date().toISOString()
    await this.docs.write(userId, KIND, s, s.id)
  }

  private async updateIndex(userId: string, s: BoardSession) {
    const idx = await this.docs.read<any[]>(userId, INDEX_KIND, () => [])
    const entry = { id: s.id, question: clip(s.question, 140), status: s.status, createdAt: s.createdAt, winner: s.verdict?.winner ?? null, finalScore: s.verdict?.finalScore ?? null, agents: s.config.agents.length, rounds: s.rounds.length, estCostUsd: Number(s.estCostUsd.toFixed(6)) }
    const next = [entry, ...idx.filter((e) => e.id !== s.id)].slice(0, MAX_INDEX)
    await this.docs.write(userId, INDEX_KIND, next)
  }

  async list(userId: string) {
    return this.docs.read<any[]>(userId, INDEX_KIND, () => [])
  }

  async get(userId: string, id: string): Promise<BoardSession> {
    const s = await this.docs.read<BoardSession | null>(userId, KIND, () => null, id)
    if (!s) throw new NotFoundException('Session not found.')
    if (s.status === 'running' && !this.liveIds.has(s.id)) {
      s.status = 'failed'
      s.error = 'Interrupted (server restarted).'
      await this.save(userId, s)
      await this.updateIndex(userId, s)
    }
    return s
  }

  async remove(userId: string, id: string) {
    await this.docs.remove(userId, KIND, id)
    const idx = await this.docs.read<any[]>(userId, INDEX_KIND, () => [])
    await this.docs.write(userId, INDEX_KIND, idx.filter((e) => e.id !== id))
    return { ok: true }
  }

  /** One capped, cost-tracked LLM call. Throws when a cap is reached. */
  private async call(userId: string, s: BoardSession, who: 'agent' | 'judge', system: string, prompt: string): Promise<string> {
    if (s.calls >= s.config.maxCalls) throw new Error('call cap reached')
    if (s.estCostUsd >= s.config.maxCostUsd) throw new Error('cost cap reached')
    const target = who === 'judge' ? s.config.judge : s.config.model
    s.calls += 1
    const text = await askAs(this.llm, this.users, userId, { provider: target.provider, model: target.model, system, prompt })
    const inTok = approxTokens(system + prompt)
    const outTok = approxTokens(text)
    s.estCostUsd += CostService.estimate(target.model ?? 'default', inTok, outTok)
    this.costs.record({ userId, provider: target.provider, model: target.model ?? 'default', inputTokens: inTok, outputTokens: outTok, conversationId: 'boardroom' })
    return text
  }

  private weighted(scores: Record<string, number>, rubric: RubricCriterion[]): number {
    const totalW = rubric.reduce((a, c) => a + c.weight, 0)
    const sum = rubric.reduce((a, c) => a + (Math.max(0, Math.min(10, Number(scores[c.name]) || 0)) / 10) * c.weight, 0)
    return Number(((sum / totalW) * 100).toFixed(1))
  }

  private async execute(userId: string, s: BoardSession) {
    try {
      const { agents, rubric, rounds } = s.config
      const rubricText = rubric.map((c) => `- ${c.name} (weight ${c.weight}): ${c.description ?? ''}`).join('\n')
      for (let r = 1; r <= rounds; r++) {
        s.phase = `round ${r}: specialists arguing`
        await this.save(userId, s)
        const prev = s.rounds[r - 2]
        const round: BoardRound = { index: r, arguments: [], judged: false }
        s.rounds.push(round)
        const results = await Promise.all(
          agents.map(async (a): Promise<BoardArgument> => {
            const others = prev?.arguments.filter((x) => x.agent !== a.name && x.text) ?? []
            const mine = prev?.arguments.find((x) => x.agent === a.name)
            const system = `You are ${a.name}, a specialist on a decision board. ${a.role}\nBe concrete, <=180 words. State uncertainty honestly.`
            const prompt = prev
              ? `Question: ${s.question}\n\nYour previous argument (judge score ${mine?.total ?? 'n/a'}/100, note: ${mine?.judgeNote ?? 'none'}):\n${clip(mine?.text ?? '', 1200)}\n\nOther board members:\n${others.map((o) => `[${o.agent}] (score ${o.total ?? 'n/a'}): ${clip(o.text, 900)}`).join('\n\n')}\n\nRebut where you disagree, concede where they are right, and give your improved position.`
              : `Question: ${s.question}\n\nGive your independent position.`
            try {
              return { agent: a.name, role: a.role, text: await this.call(userId, s, 'agent', system, prompt) }
            } catch (e: any) {
              return { agent: a.name, role: a.role, text: '', error: String(e?.message ?? e).slice(0, 200) }
            }
          }),
        )
        round.arguments = results
        const valid = results.filter((x) => x.text)
        if (!valid.length) throw new Error(results[0]?.error ?? 'All specialists failed.')
        round.consensus = scoreConsensus(valid.map((x) => ({ name: x.agent, text: x.text }))).score

        s.phase = `round ${r}: judge scoring`
        await this.save(userId, s)
        await this.judgeRound(userId, s, round, rubricText)
        await this.save(userId, s)

        if (r < rounds && (round.consensus ?? 0) >= 85) { s.stoppedEarly = `Consensus reached after round ${r} (${round.consensus}).`; break }
        if (s.calls + agents.length + 2 > s.config.maxCalls || s.estCostUsd >= s.config.maxCostUsd) { if (r < rounds) s.stoppedEarly = 'Call/cost cap reached.'; break }
      }
      await this.finalize(userId, s, rubricText)
      s.status = 'done'
      s.phase = 'complete'
    } catch (e: any) {
      s.status = 'failed'
      s.error = String(e?.message ?? e).slice(0, 300)
      this.logger.warn(`Boardroom ${s.id} failed: ${s.error}`)
    }
    await this.save(userId, s).catch(() => undefined)
    await this.updateIndex(userId, s).catch(() => undefined)
  }

  private async judgeRound(userId: string, s: BoardSession, round: BoardRound, rubricText: string) {
    const valid = round.arguments.filter((a) => a.text)
    const names = s.config.rubric.map((c) => c.name)
    try {
      const raw = await this.call(
        userId, s, 'judge',
        'You are an impartial judge scoring arguments from a decision board against a rubric. Ignore rhetoric and authority; reward correctness and evidence. Reply JSON only.',
        `Question: ${s.question}\n\nRubric (score each 0-10):\n${rubricText}\n\n${valid.map((a) => `### ${a.agent}\n${clip(a.text, 1500)}`).join('\n\n')}\n\nReply: {"scores":{"<agent>":{${names.map((n) => `"${n}":0-10`).join(',')},"note":"<=20 words"}}}`,
      )
      const m = raw.match(/\{[\s\S]*\}/)
      const parsed = m ? JSON.parse(m[0]) : null
      for (const a of valid) {
        const sc = parsed?.scores?.[a.agent]
        if (!sc || typeof sc !== 'object') continue
        a.scores = Object.fromEntries(names.map((n) => [n, Math.max(0, Math.min(10, Number(sc[n]) || 0))]))
        a.total = this.weighted(a.scores, s.config.rubric)
        a.judgeNote = sc.note ? String(sc.note).slice(0, 200) : undefined
      }
      round.judged = valid.some((a) => a.total !== undefined)
    } catch (e: any) {
      this.logger.debug(`Judge failed for round ${round.index}: ${e?.message ?? e}`)
    }
  }

  private async finalize(userId: string, s: BoardSession, rubricText: string) {
    s.phase = 'judge: final verdict'
    await this.save(userId, s)
    const totals = s.config.agents.map((a) => {
      const scored = s.rounds.flatMap((r) => r.arguments).filter((x) => x.agent === a.name && x.total !== undefined)
      return { agent: a.name, avg: scored.length ? Number((scored.reduce((t, x) => t + (x.total ?? 0), 0) / scored.length).toFixed(1)) : 0 }
    }).sort((a, b) => b.avg - a.avg)
    const last = s.rounds[s.rounds.length - 1]
    const lastValid = last.arguments.filter((a) => a.text)
    let verdict: BoardVerdict = {
      winner: totals[0]?.agent ?? lastValid[0].agent,
      summary: lastValid.find((a) => a.agent === totals[0]?.agent)?.text ?? lastValid[0].text,
      confidence: 50,
      finalScore: totals[0]?.avg ?? 0,
      agentTotals: totals,
      dissent: [],
    }
    try {
      const raw = await this.call(
        userId, s, 'judge',
        'You are the chair judge of a decision board. Issue a final verdict. Be honest about disagreement; do not paper over dissent. Reply JSON only.',
        `Question: ${s.question}\n\nRubric:\n${rubricText}\n\nAverage judge scores: ${totals.map((t) => `${t.agent}=${t.avg}`).join(', ')}\n\nFinal-round positions:\n${lastValid.map((a) => `### ${a.agent} (score ${a.total ?? 'n/a'})\n${clip(a.text, 1200)}`).join('\n\n')}\n\nReply: {"winner":"<agent name>","confidence":0-100,"summary":"final answer <=250 words","dissent":[{"agent":"<name>","note":"unresolved disagreement <=40 words"}]}`,
      )
      const m = raw.match(/\{[\s\S]*\}/)
      const p = m ? JSON.parse(m[0]) : null
      if (p && typeof p.summary === 'string') {
        const names = s.config.agents.map((a) => a.name)
        const winner = names.includes(p.winner) ? p.winner : verdict.winner
        verdict = {
          winner,
          summary: p.summary.trim(),
          confidence: Math.max(0, Math.min(100, Number(p.confidence) || 50)),
          finalScore: totals.find((t) => t.agent === winner)?.avg ?? verdict.finalScore,
          agentTotals: totals,
          dissent: (Array.isArray(p.dissent) ? p.dissent : [])
            .filter((d: any) => names.includes(d?.agent) && d?.note)
            .slice(0, 5)
            .map((d: any) => ({ agent: d.agent, note: String(d.note).slice(0, 300) })),
        }
      } else if (raw) {
        verdict.summary = raw
      }
    } catch (e: any) {
      this.logger.debug(`Final verdict failed: ${e?.message ?? e}`)
    }
    s.verdict = verdict
  }
}
