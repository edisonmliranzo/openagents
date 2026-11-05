import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { DocumentStore } from '../prisma/document-store.service'
import { LLMService } from '../agent/llm.service'
import { UsersService } from '../users/users.service'
import { AgentPresetsService } from '../agent-presets/agent-presets.service'
import { AgentVersionsService } from '../agent-versions/agent-versions.service'
import { askAs, newId, parseModelRef, preferredTarget } from '../smart-router/ask'

export type AssertionType = 'contains' | 'notContains' | 'regex' | 'jsonSchema' | 'judge'

export interface EvalAssertion {
  type: AssertionType
  /** contains / notContains / regex pattern */
  value?: string
  caseSensitive?: boolean
  /** jsonSchema */
  schema?: Record<string, any>
  /** judge */
  rubric?: string
  /** judge pass threshold (0-10, default 7) */
  minScore?: number
}

export interface EvalCase { id: string; name?: string; prompt: string; assertions: EvalAssertion[] }

export interface EvalSuite {
  id: string
  name: string
  description?: string
  system?: string
  cases: EvalCase[]
  baselineRunId?: string
  createdAt: string
  updatedAt: string
}

export interface AssertionResult { type: AssertionType; passed: boolean; detail: string; judgeScore?: number }
export interface CaseResult {
  caseId: string
  name?: string
  score: number
  passed: boolean
  output: string
  assertions: AssertionResult[]
  error?: string
  durationMs: number
}
export interface SuiteRun {
  id: string
  suiteId: string
  at: string
  target: { presetId?: string; versionId?: string; provider: string; model?: string; label: string }
  cases: CaseResult[]
  score: number
  passRate: number
  durationMs: number
}

const SUITES_KIND = 'eval_suites'
const RUNS_KIND = 'eval_suite_runs'
const MAX_SUITES = 20
const MAX_CASES = 30
const MAX_ASSERTIONS = 10
const MAX_RUNS_PER_SUITE = 30
const CONCURRENCY = 3

/** Minimal JSON-schema subset validator (type, enum, required, properties, items, bounds). */
export function validateSchema(value: any, schema: any, path = '$'): string[] {
  const errs: string[] = []
  if (!schema || typeof schema !== 'object') return errs
  const t = schema.type
  const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value
  if (t) {
    const types = Array.isArray(t) ? t : [t]
    const ok = types.some((x: string) => x === actual || (x === 'integer' && Number.isInteger(value)) || (x === 'number' && actual === 'number'))
    if (!ok) return [`${path}: expected ${types.join('|')}, got ${actual}`]
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e: any) => JSON.stringify(e) === JSON.stringify(value))) errs.push(`${path}: not in enum`)
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errs.push(`${path}: < minimum`)
    if (typeof schema.maximum === 'number' && value > schema.maximum) errs.push(`${path}: > maximum`)
  }
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) errs.push(`${path}: shorter than minLength`)
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) errs.push(`${path}: longer than maxLength`)
  }
  if (actual === 'object') {
    for (const k of Array.isArray(schema.required) ? schema.required : []) if (!(k in value)) errs.push(`${path}.${k}: required`)
    for (const [k, sub] of Object.entries(schema.properties ?? {})) if (k in value) errs.push(...validateSchema(value[k], sub, `${path}.${k}`))
  }
  if (actual === 'array' && schema.items) value.slice(0, 100).forEach((v: any, i: number) => errs.push(...validateSchema(v, schema.items, `${path}[${i}]`)))
  return errs.slice(0, 10)
}

function extractJson(text: string): any {
  const m = text.match(/[\[{][\s\S]*[\]}]/)
  return JSON.parse(m ? m[0] : text)
}

const round1 = (n: number) => Number(n.toFixed(1))

@Injectable()
export class EvalSuitesService {
  private readonly logger = new Logger(EvalSuitesService.name)
  private readonly running = new Set<string>()

  constructor(
    private readonly docs: DocumentStore,
    private readonly llm: LLMService,
    private readonly users: UsersService,
    private readonly presets: AgentPresetsService,
    private readonly versions: AgentVersionsService,
  ) {}

  // ── Suites CRUD ──────────────────────────────────────────────────────────
  private loadSuites(userId: string) { return this.docs.read<EvalSuite[]>(userId, SUITES_KIND, () => []) }

  private sanitizeCases(cases: any[] | undefined): EvalCase[] {
    if (!Array.isArray(cases)) return []
    if (cases.length > MAX_CASES) throw new BadRequestException(`A suite holds at most ${MAX_CASES} cases.`)
    return cases.map((c) => {
      const prompt = String(c?.prompt ?? '').trim().slice(0, 4000)
      if (!prompt) throw new BadRequestException('Every case needs a prompt.')
      const assertions: EvalAssertion[] = (Array.isArray(c.assertions) ? c.assertions : []).slice(0, MAX_ASSERTIONS).map((a: any) => this.sanitizeAssertion(a))
      return { id: String(c.id ?? '').slice(0, 40) || newId('case'), name: c.name ? String(c.name).slice(0, 120) : undefined, prompt, assertions }
    })
  }

  private sanitizeAssertion(a: any): EvalAssertion {
    const type = a?.type as AssertionType
    if (!['contains', 'notContains', 'regex', 'jsonSchema', 'judge'].includes(type)) throw new BadRequestException(`Unknown assertion type "${a?.type}".`)
    const out: EvalAssertion = { type }
    if (type === 'contains' || type === 'notContains' || type === 'regex') {
      const value = String(a.value ?? '')
      if (!value) throw new BadRequestException(`${type} needs a value.`)
      if (value.length > 300) throw new BadRequestException('Assertion value too long (max 300).')
      if (type === 'regex') {
        if (/\([^)]*[+*][^)]*\)[+*{]/.test(value)) throw new BadRequestException('Regex rejected: nested quantifiers are not allowed.')
        try { new RegExp(value) } catch { throw new BadRequestException('Invalid regex.') }
      }
      out.value = value
      out.caseSensitive = Boolean(a.caseSensitive)
    } else if (type === 'jsonSchema') {
      let schema = a.schema
      if (typeof schema === 'string') { try { schema = JSON.parse(schema) } catch { throw new BadRequestException('schema must be valid JSON.') } }
      if (!schema || typeof schema !== 'object' || JSON.stringify(schema).length > 5000) throw new BadRequestException('schema must be a JSON object under 5KB.')
      out.schema = schema
    } else {
      const rubric = String(a.rubric ?? '').trim().slice(0, 1500)
      if (!rubric) throw new BadRequestException('judge needs a rubric.')
      out.rubric = rubric
      const ms = Number(a.minScore)
      out.minScore = Number.isFinite(ms) ? Math.max(0, Math.min(10, ms)) : 7
    }
    return out
  }

  listSuites(userId: string) { return this.loadSuites(userId) }

  async getSuite(userId: string, id: string): Promise<EvalSuite> {
    const s = (await this.loadSuites(userId)).find((x) => x.id === id)
    if (!s) throw new NotFoundException('Suite not found.')
    return s
  }

  async createSuite(userId: string, input: { name: string; description?: string; system?: string; cases?: any[] }) {
    const suites = await this.loadSuites(userId)
    if (suites.length >= MAX_SUITES) throw new BadRequestException(`At most ${MAX_SUITES} suites.`)
    const now = new Date().toISOString()
    const suite: EvalSuite = {
      id: newId('suite'),
      name: String(input.name ?? '').trim().slice(0, 120) || 'Untitled suite',
      description: input.description ? String(input.description).slice(0, 500) : undefined,
      system: input.system ? String(input.system).slice(0, 4000) : undefined,
      cases: this.sanitizeCases(input.cases),
      createdAt: now,
      updatedAt: now,
    }
    suites.push(suite)
    await this.docs.write(userId, SUITES_KIND, suites)
    return suite
  }

  async updateSuite(userId: string, id: string, input: { name?: string; description?: string; system?: string; cases?: any[] }) {
    const suites = await this.loadSuites(userId)
    const s = suites.find((x) => x.id === id)
    if (!s) throw new NotFoundException('Suite not found.')
    if (input.name !== undefined) s.name = String(input.name).trim().slice(0, 120) || s.name
    if (input.description !== undefined) s.description = String(input.description).slice(0, 500)
    if (input.system !== undefined) s.system = String(input.system).slice(0, 4000)
    if (input.cases !== undefined) s.cases = this.sanitizeCases(input.cases)
    s.updatedAt = new Date().toISOString()
    await this.docs.write(userId, SUITES_KIND, suites)
    return s
  }

  async deleteSuite(userId: string, id: string) {
    const suites = await this.loadSuites(userId)
    if (!suites.some((x) => x.id === id)) throw new NotFoundException('Suite not found.')
    await this.docs.write(userId, SUITES_KIND, suites.filter((x) => x.id !== id))
    await this.docs.remove(userId, RUNS_KIND, id)
    return { ok: true }
  }

  // ── Running ──────────────────────────────────────────────────────────────
  private loadRuns(userId: string, suiteId: string) { return this.docs.read<SuiteRun[]>(userId, RUNS_KIND, () => [], suiteId) }

  async listRuns(userId: string, suiteId: string) {
    await this.getSuite(userId, suiteId)
    return (await this.loadRuns(userId, suiteId)).slice().reverse().map((r) => ({
      id: r.id, at: r.at, target: r.target, score: r.score, passRate: r.passRate, durationMs: r.durationMs, cases: r.cases.length,
    }))
  }

  async getRun(userId: string, suiteId: string, runId: string): Promise<SuiteRun> {
    await this.getSuite(userId, suiteId)
    const r = (await this.loadRuns(userId, suiteId)).find((x) => x.id === runId)
    if (!r) throw new NotFoundException('Run not found.')
    return r
  }

  private async resolveTarget(userId: string, t: { presetId?: string; versionId?: string; model?: string } = {}) {
    const base = await preferredTarget(this.users, userId)
    let provider = base.provider
    let model = base.model
    let system: string | undefined
    let label = 'current settings'
    if (t.presetId) {
      const preset: any = await this.presets.get(userId, t.presetId)
      const s = preset?.settings ?? {}
      provider = s.preferredProvider ?? provider
      model = s.preferredModel ?? model
      system = s.customSystemPrompt ?? undefined
      label = `preset: ${preset?.name ?? t.presetId}`
    } else if (t.versionId) {
      const v: any = await this.versions.getVersion(userId, t.versionId)
      const s = v?.settings ?? {}
      provider = s.preferredProvider ?? provider
      model = s.preferredModel ?? model
      system = s.customSystemPrompt ?? undefined
      label = `version: ${v?.label ?? v?.id ?? t.versionId}`
    }
    const override = parseModelRef(t.model)
    if (t.model && !override) throw new BadRequestException('model must look like "provider:model".')
    if (override) { provider = override.provider; model = override.model ?? model; label = `${label} → ${t.model}` }
    return { provider: String(provider), model: model ? String(model) : undefined, system, label }
  }

  async runSuite(userId: string, suiteId: string, target: { presetId?: string; versionId?: string; model?: string } = {}): Promise<SuiteRun> {
    const suite = await this.getSuite(userId, suiteId)
    if (!suite.cases.length) throw new BadRequestException('Suite has no cases.')
    const key = `${userId}:${suiteId}`
    if (this.running.has(key)) throw new BadRequestException('This suite is already running.')
    this.running.add(key)
    try {
      const resolved = await this.resolveTarget(userId, target)
      const started = Date.now()
      const results: CaseResult[] = new Array(suite.cases.length)
      let next = 0
      const worker = async () => {
        while (next < suite.cases.length) {
          const i = next++
          results[i] = await this.runCase(userId, suite, suite.cases[i], resolved)
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, suite.cases.length) }, worker))
      const score = round1(results.reduce((s, r) => s + r.score, 0) / results.length)
      const run: SuiteRun = {
        id: newId('erun'),
        suiteId,
        at: new Date().toISOString(),
        target: { presetId: target.presetId, versionId: target.versionId, provider: resolved.provider, model: resolved.model, label: resolved.label },
        cases: results,
        score,
        passRate: round1((results.filter((r) => r.passed).length / results.length) * 100),
        durationMs: Date.now() - started,
      }
      const runs = await this.loadRuns(userId, suiteId)
      runs.push(run)
      await this.docs.write(userId, RUNS_KIND, runs.slice(-MAX_RUNS_PER_SUITE), suiteId)
      return run
    } finally {
      this.running.delete(key)
    }
  }

  private async runCase(userId: string, suite: EvalSuite, c: EvalCase, t: { provider: string; model?: string; system?: string }): Promise<CaseResult> {
    const started = Date.now()
    let output = ''
    try {
      output = await askAs(this.llm, this.users, userId, {
        provider: t.provider,
        model: t.model,
        system: t.system ?? suite.system ?? 'You are OpenAgents answering an evaluation task. Follow the instructions exactly.',
        prompt: c.prompt,
      })
    } catch (e: any) {
      return { caseId: c.id, name: c.name, score: 0, passed: false, output: '', assertions: [], error: String(e?.message ?? e).slice(0, 300), durationMs: Date.now() - started }
    }
    const assertions: AssertionResult[] = []
    for (const a of c.assertions) assertions.push(await this.evalAssertion(userId, a, c, output, t))
    const passedCount = assertions.filter((a) => a.passed).length
    const score = assertions.length ? round1((passedCount / assertions.length) * 100) : output ? 100 : 0
    return { caseId: c.id, name: c.name, score, passed: assertions.every((a) => a.passed) && Boolean(output), output: output.slice(0, 4000), assertions, durationMs: Date.now() - started }
  }

  async evalAssertion(userId: string, a: EvalAssertion, c: EvalCase, output: string, t: { provider: string; model?: string }): Promise<AssertionResult> {
    const text = output.slice(0, 20000)
    switch (a.type) {
      case 'contains':
      case 'notContains': {
        const has = a.caseSensitive ? text.includes(a.value!) : text.toLowerCase().includes(a.value!.toLowerCase())
        const passed = a.type === 'contains' ? has : !has
        return { type: a.type, passed, detail: `${a.type} "${a.value}": ${passed ? 'ok' : 'failed'}` }
      }
      case 'regex': {
        try {
          const passed = new RegExp(a.value!, a.caseSensitive ? '' : 'i').test(text)
          return { type: a.type, passed, detail: `/${a.value}/: ${passed ? 'matched' : 'no match'}` }
        } catch { return { type: a.type, passed: false, detail: 'invalid regex' } }
      }
      case 'jsonSchema': {
        try {
          const errs = validateSchema(extractJson(text), a.schema)
          return { type: a.type, passed: errs.length === 0, detail: errs.length ? errs.join('; ') : 'schema valid' }
        } catch { return { type: a.type, passed: false, detail: 'output is not valid JSON' } }
      }
      case 'judge': {
        try {
          const verdict = await askAs(this.llm, this.users, userId, {
            provider: t.provider,
            model: t.model,
            system: 'You are a strict evaluator. Score the CANDIDATE ANSWER against the RUBRIC. Reply with exactly one integer 0-10 on the first line, then a one-sentence reason.',
            prompt: `REQUEST:\n${c.prompt.slice(0, 1500)}\n\nRUBRIC:\n${a.rubric}\n\nCANDIDATE ANSWER:\n${text.slice(0, 3000)}`,
          })
          const m = verdict.match(/\d+(\.\d+)?/)
          const js = m ? Math.max(0, Math.min(10, parseFloat(m[0]))) : 0
          const min = a.minScore ?? 7
          return { type: a.type, passed: js >= min, judgeScore: js, detail: `judge ${js}/10 (needs ${min})` }
        } catch (e: any) {
          return { type: a.type, passed: false, detail: `judge failed: ${String(e?.message ?? e).slice(0, 100)}` }
        }
      }
    }
    return { type: a.type, passed: false, detail: 'unsupported' }
  }

  // ── Baseline / compare / gate ────────────────────────────────────────────
  async setBaseline(userId: string, suiteId: string, runId: string | null) {
    const suites = await this.loadSuites(userId)
    const s = suites.find((x) => x.id === suiteId)
    if (!s) throw new NotFoundException('Suite not found.')
    if (runId) await this.getRun(userId, suiteId, runId)
    s.baselineRunId = runId ?? undefined
    s.updatedAt = new Date().toISOString()
    await this.docs.write(userId, SUITES_KIND, suites)
    return { ok: true, baselineRunId: s.baselineRunId ?? null }
  }

  async compare(userId: string, suiteId: string, runId?: string, againstId?: string) {
    const suite = await this.getSuite(userId, suiteId)
    const runs = await this.loadRuns(userId, suiteId)
    const current = runId ? runs.find((r) => r.id === runId) : runs[runs.length - 1]
    if (!current) throw new NotFoundException('No run to compare.')
    const baseId = againstId ?? suite.baselineRunId
    const baseline = baseId ? runs.find((r) => r.id === baseId) : undefined
    if (!baseline) return { runId: current.id, baselineRunId: null, score: current.score, baselineScore: null, scoreDelta: null, cases: [], regressions: [], improvements: [] }
    const cases = current.cases.map((c) => {
      const b = baseline.cases.find((x) => x.caseId === c.caseId)
      const delta = b ? round1(c.score - b.score) : null
      const status = !b ? 'new' : b.passed && !c.passed ? 'regression' : !b.passed && c.passed ? 'improvement' : delta! <= -10 ? 'regression' : delta! >= 10 ? 'improvement' : 'same'
      return { caseId: c.caseId, name: c.name, score: c.score, baselineScore: b?.score ?? null, delta, passed: c.passed, baselinePassed: b?.passed ?? null, status }
    })
    return {
      runId: current.id,
      baselineRunId: baseline.id,
      score: current.score,
      baselineScore: baseline.score,
      scoreDelta: round1(current.score - baseline.score),
      cases,
      regressions: cases.filter((c) => c.status === 'regression').map((c) => c.caseId),
      improvements: cases.filter((c) => c.status === 'improvement').map((c) => c.caseId),
    }
  }

  /** CI gate: pass/fail with score delta vs. baseline. Optionally triggers a fresh run first. */
  async gate(userId: string, suiteId: string, opts: { runId?: string; run?: boolean; presetId?: string; versionId?: string; model?: string; maxDrop?: number; minScore?: number; failOnCaseRegression?: boolean } = {}) {
    let runId = opts.runId
    if (opts.run) runId = (await this.runSuite(userId, suiteId, opts)).id
    const cmp = await this.compare(userId, suiteId, runId)
    const maxDrop = Math.max(0, Math.min(100, Number(opts.maxDrop ?? 5)))
    const reasons: string[] = []
    if (cmp.baselineScore === null) reasons.push('no baseline set (only minScore is enforced)')
    else if (cmp.scoreDelta! < -maxDrop) reasons.push(`score dropped ${Math.abs(cmp.scoreDelta!)} points (limit ${maxDrop})`)
    if (opts.minScore !== undefined && cmp.score < opts.minScore) reasons.push(`score ${cmp.score} below minimum ${opts.minScore}`)
    if (opts.failOnCaseRegression && cmp.regressions.length) reasons.push(`${cmp.regressions.length} case regression(s)`)
    const failed = reasons.filter((r) => !r.startsWith('no baseline'))
    return {
      pass: failed.length === 0,
      score: cmp.score,
      baselineScore: cmp.baselineScore,
      scoreDelta: cmp.scoreDelta,
      runId: cmp.runId,
      baselineRunId: cmp.baselineRunId,
      regressions: cmp.regressions,
      reasons,
    }
  }
}
