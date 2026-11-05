import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { DocumentStore } from '../prisma/document-store.service'
import { LLMService } from '../agent/llm.service'
import { UsersService } from '../users/users.service'
import { CostService, DEFAULT_ROUTER_SETTINGS } from '../cost/cost.service'
import { ModelRouterService } from '../cost/model-router.service'
import { approxTokens, askAs, newId } from './ask'

export interface RouterRung { provider: string; model: string }

export interface SmartRouterPolicy {
  enabled: boolean
  /** Cheapest → strongest. The last rung is the "top model" used as the savings baseline. */
  ladder: RouterRung[]
  /** Escalate when self-reported/heuristic confidence is below this (0-100). */
  minConfidence: number
  /** Max number of escalations after the first attempt. */
  maxEscalations: number
  checks: { refusal: boolean; malformed: boolean; lowConfidence: boolean }
  /** Complexity score thresholds (0-100) used to pick the starting rung. */
  standardAt: number
  complexAt: number
  updatedAt?: string
}

export interface RouterAttempt {
  provider: string
  model: string
  confidence: number
  accepted: boolean
  failReason?: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export interface SmartRouterRun {
  id: string
  at: string
  promptPreview: string
  complexity: number
  tier: string
  startRung: number
  finalModel: string
  finalProvider: string
  escalations: number
  attempts: RouterAttempt[]
  costUsd: number
  baselineCostUsd: number
  savedUsd: number
}

const POLICY_KIND = 'smart_router_policy'
const RUNS_KIND = 'smart_router_runs'
const MAX_RUNS = 500

const REFUSAL = /^\s*(i('m| am) (sorry|unable|not able)|sorry,? (but )?i|i can(no|')t (help|assist|comply|do)|i won't|as an ai( language model)?,? i)/i
const HEDGES = ['i think', 'i\'m not sure', 'not certain', 'might be', 'possibly', 'perhaps', 'i guess', 'unclear', 'cannot verify', 'i don\'t know']

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : dflt
}

@Injectable()
export class SmartRouterService {
  private readonly logger = new Logger(SmartRouterService.name)

  constructor(
    private readonly docs: DocumentStore,
    private readonly llm: LLMService,
    private readonly users: UsersService,
    private readonly costs: CostService,
    private readonly classifier: ModelRouterService,
  ) {}

  private defaultPolicy(): SmartRouterPolicy {
    const t = DEFAULT_ROUTER_SETTINGS.tiers
    return {
      enabled: true,
      ladder: [t.simple, t.standard, t.complex].map((r) => ({ ...r })),
      minConfidence: 60,
      maxEscalations: 2,
      checks: { refusal: true, malformed: true, lowConfidence: true },
      standardAt: 15,
      complexAt: 45,
    }
  }

  async getPolicy(userId: string): Promise<SmartRouterPolicy> {
    const raw = await this.docs.read<Partial<SmartRouterPolicy>>(userId, POLICY_KIND, () => ({}))
    const d = this.defaultPolicy()
    // Default ladder follows the user's cost-router tiers when they have configured them.
    if (!raw.ladder) {
      const cs = await this.costs.getRouterSettings(userId).catch(() => null)
      if (cs?.tiers) d.ladder = [cs.tiers.simple, cs.tiers.standard, cs.tiers.complex].map((r) => ({ provider: r.provider, model: r.model }))
    }
    return { ...d, ...raw, checks: { ...d.checks, ...(raw.checks ?? {}) } } as SmartRouterPolicy
  }

  async setPolicy(userId: string, input: Partial<SmartRouterPolicy>): Promise<SmartRouterPolicy> {
    const cur = await this.getPolicy(userId)
    let ladder = cur.ladder
    if (input.ladder !== undefined) {
      if (!Array.isArray(input.ladder) || input.ladder.length < 2 || input.ladder.length > 6) {
        throw new BadRequestException('ladder must contain 2-6 models (cheapest to strongest).')
      }
      ladder = input.ladder.map((r) => {
        const provider = String(r?.provider ?? '').trim().toLowerCase()
        const model = String(r?.model ?? '').trim()
        if (!/^[a-z0-9_-]{2,40}$/.test(provider) || !model || model.length > 120) throw new BadRequestException('Invalid ladder entry.')
        return { provider, model }
      })
      // Stable sort cheapest first so "cheapest that fits" holds.
      ladder = ladder
        .map((r, i) => ({ r, i, p: CostService.estimate(r.model, 1000, 1000) }))
        .sort((a, b) => a.p - b.p || a.i - b.i)
        .map((x) => x.r)
    }
    const next: SmartRouterPolicy = {
      enabled: input.enabled === undefined ? cur.enabled : Boolean(input.enabled),
      ladder,
      minConfidence: clampInt(input.minConfidence, 0, 100, cur.minConfidence),
      maxEscalations: clampInt(input.maxEscalations, 0, 4, cur.maxEscalations),
      checks: {
        refusal: input.checks?.refusal ?? cur.checks.refusal,
        malformed: input.checks?.malformed ?? cur.checks.malformed,
        lowConfidence: input.checks?.lowConfidence ?? cur.checks.lowConfidence,
      },
      standardAt: clampInt(input.standardAt, 0, 100, cur.standardAt),
      complexAt: clampInt(input.complexAt, 0, 100, cur.complexAt),
      updatedAt: new Date().toISOString(),
    }
    if (next.complexAt < next.standardAt) throw new BadRequestException('complexAt must be >= standardAt.')
    await this.docs.write(userId, POLICY_KIND, next)
    return next
  }

  private startIndex(score: number, p: SmartRouterPolicy): number {
    const top = p.ladder.length - 1
    if (score >= p.complexAt) return top
    if (score >= p.standardAt) return Math.min(top, Math.max(0, Math.floor(top / 2)))
    return 0
  }

  async preview(userId: string, prompt: string, toolCount?: number) {
    const p = await this.getPolicy(userId)
    const text = String(prompt ?? '').slice(0, 8000)
    if (!text.trim()) throw new BadRequestException('prompt is required.')
    const c = this.classifier.classify(text, toolCount ?? 0)
    const start = p.enabled ? this.startIndex(c.score, p) : p.ladder.length - 1
    const chain = p.ladder.slice(start, start + 1 + p.maxEscalations)
    // Escalation always ends at the strongest model when the budget allows it.
    const top = p.ladder[p.ladder.length - 1]
    if (chain.length && chain[chain.length - 1] !== top && start + p.maxEscalations >= p.ladder.length - 1) chain.push(top)
    const inTok = approxTokens(text)
    const outTok = Math.max(150, Math.min(1500, inTok * 2))
    const est = (r: RouterRung) => CostService.estimate(r.model, inTok, outTok)
    return {
      enabled: p.enabled,
      chosen: p.ladder[start],
      startRung: start,
      complexity: c.score,
      tier: c.tier,
      escalationPath: [...new Map(chain.map((r) => [`${r.provider}:${r.model}`, r])).values()],
      reasoning: [
        ...c.reasons,
        `complexity ${c.score}/100 → tier ${c.tier} → rung ${start + 1} of ${p.ladder.length}`,
        p.enabled ? `escalates up to ${p.maxEscalations}× if confidence < ${p.minConfidence}, refusal, or malformed output` : 'router disabled: always using top model',
      ],
      estimatedCostUsd: est(p.ladder[start]),
      topModelCostUsd: est(top),
      estimatedSavingsUsd: Math.max(0, est(top) - est(p.ladder[start])),
    }
  }

  /** Evaluate an answer; returns a failure reason or null when acceptable. */
  checkAnswer(answer: string, confidence: number, p: SmartRouterPolicy, expectJson: boolean): string | null {
    if (!answer.trim()) return 'empty answer'
    if (p.checks.refusal && REFUSAL.test(answer)) return 'refusal'
    if (p.checks.malformed && expectJson) {
      const m = answer.match(/[\[{][\s\S]*[\]}]/)
      try { JSON.parse(m ? m[0] : answer) } catch { return 'malformed JSON' }
    }
    if (p.checks.lowConfidence && confidence < p.minConfidence) return `low confidence (${confidence} < ${p.minConfidence})`
    return null
  }

  private extractConfidence(raw: string): { text: string; confidence: number } {
    const m = raw.match(/\n?\s*CONFIDENCE:\s*(\d{1,3})\s*%?\s*$/i)
    let text = raw
    let confidence: number
    if (m) {
      text = raw.slice(0, m.index).trim()
      confidence = Math.max(0, Math.min(100, parseInt(m[1], 10)))
    } else {
      confidence = 80
    }
    const lower = text.toLowerCase()
    const hedges = HEDGES.filter((h) => lower.includes(h)).length
    confidence -= Math.min(30, hedges * 8)
    if (text.length < 15) confidence -= 20
    return { text, confidence: Math.max(0, Math.min(100, confidence)) }
  }

  async run(userId: string, input: { prompt: string; system?: string; expectJson?: boolean }) {
    const prompt = String(input.prompt ?? '').slice(0, 8000)
    if (!prompt.trim()) throw new BadRequestException('prompt is required.')
    const p = await this.getPolicy(userId)
    const c = this.classifier.classify(prompt, 0)
    const start = p.enabled ? this.startIndex(c.score, p) : p.ladder.length - 1
    const top = p.ladder[p.ladder.length - 1]
    const expectJson = Boolean(input.expectJson)
    const system = `${String(input.system ?? 'You are a helpful assistant.').slice(0, 2000)}\n${expectJson ? 'Reply with valid JSON only.\n' : ''}After your answer, add a final line exactly like: CONFIDENCE: <0-100> (how sure you are the answer is correct and complete).`

    const attempts: RouterAttempt[] = []
    let answer = ''
    let idx = start
    let escalations = 0
    for (;;) {
      const rung = p.ladder[idx]
      let raw = ''
      let failReason: string | null = null
      let confidence = 0
      try {
        raw = await askAs(this.llm, this.users, userId, { provider: rung.provider, model: rung.model, system, prompt })
        const parsed = this.extractConfidence(raw)
        answer = parsed.text
        confidence = parsed.confidence
        failReason = this.checkAnswer(answer, confidence, p, expectJson)
      } catch (e: any) {
        failReason = `error: ${String(e?.message ?? e).slice(0, 120)}`
      }
      const inTok = approxTokens(system + prompt)
      const outTok = approxTokens(raw)
      const cost = CostService.estimate(rung.model, inTok, outTok)
      attempts.push({ ...rung, confidence, accepted: !failReason, failReason: failReason ?? undefined, inputTokens: inTok, outputTokens: outTok, costUsd: cost })
      this.costs.record({ userId, provider: rung.provider, model: rung.model, inputTokens: inTok, outputTokens: outTok, conversationId: 'smart-router' })
      if (!failReason) break
      if (!p.enabled || escalations >= p.maxEscalations || idx >= p.ladder.length - 1) break
      escalations += 1
      // Jump straight to the top model on the last allowed escalation.
      idx = escalations >= p.maxEscalations ? p.ladder.length - 1 : idx + 1
    }

    const final = attempts[attempts.length - 1]
    const costUsd = attempts.reduce((s, a) => s + a.costUsd, 0)
    const lastOut = Math.max(1, final.outputTokens)
    const baselineCostUsd = CostService.estimate(top.model, approxTokens(system + prompt), lastOut)
    const run: SmartRouterRun = {
      id: newId('sr'),
      at: new Date().toISOString(),
      promptPreview: prompt.slice(0, 120),
      complexity: c.score,
      tier: c.tier,
      startRung: start,
      finalModel: final.model,
      finalProvider: final.provider,
      escalations: attempts.length - 1,
      attempts,
      costUsd: Number(costUsd.toFixed(6)),
      baselineCostUsd: Number(baselineCostUsd.toFixed(6)),
      savedUsd: Number((baselineCostUsd - costUsd).toFixed(6)),
    }
    const runs = await this.docs.read<SmartRouterRun[]>(userId, RUNS_KIND, () => [])
    runs.push(run)
    await this.docs.write(userId, RUNS_KIND, runs.slice(-MAX_RUNS))
    return { answer, accepted: !final.failReason, run }
  }

  async savings(userId: string, days = 30) {
    const since = Date.now() - clampInt(days, 1, 365, 30) * 86_400_000
    const runs = (await this.docs.read<SmartRouterRun[]>(userId, RUNS_KIND, () => [])).filter((r) => Date.parse(r.at) >= since)
    const sum = (f: (r: SmartRouterRun) => number) => runs.reduce((s, r) => s + f(r), 0)
    const byModel: Record<string, { runs: number; costUsd: number }> = {}
    const daily: Record<string, { date: string; costUsd: number; baselineCostUsd: number; savedUsd: number; runs: number }> = {}
    for (const r of runs) {
      const k = `${r.finalProvider}:${r.finalModel}`
      byModel[k] = byModel[k] ?? { runs: 0, costUsd: 0 }
      byModel[k].runs += 1
      byModel[k].costUsd += r.costUsd
      const d = r.at.slice(0, 10)
      daily[d] = daily[d] ?? { date: d, costUsd: 0, baselineCostUsd: 0, savedUsd: 0, runs: 0 }
      daily[d].runs += 1
      daily[d].costUsd += r.costUsd
      daily[d].baselineCostUsd += r.baselineCostUsd
      daily[d].savedUsd += r.savedUsd
    }
    const baseline = sum((r) => r.baselineCostUsd)
    const actual = sum((r) => r.costUsd)
    return {
      days,
      runs: runs.length,
      actualCostUsd: Number(actual.toFixed(6)),
      baselineCostUsd: Number(baseline.toFixed(6)),
      savedUsd: Number((baseline - actual).toFixed(6)),
      savedPct: baseline > 0 ? Number((((baseline - actual) / baseline) * 100).toFixed(1)) : 0,
      escalatedRuns: runs.filter((r) => r.escalations > 0).length,
      escalationRate: runs.length ? Number((runs.filter((r) => r.escalations > 0).length / runs.length).toFixed(3)) : 0,
      byModel,
      daily: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)),
      recent: runs.slice(-15).reverse(),
    }
  }
}
