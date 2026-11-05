import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { governanceFile, readJson, serialize, writeJson } from './governance.store'

export type RuleEffect = 'deny' | 'require_approval' | 'warn' | 'allow'
export type RuleScope = 'local' | 'external_read' | 'external_write' | 'system_mutation'

export interface RuleMatch {
  /** Tool name globs (e.g. "gmail_*", "shell_execute"). Empty = any tool. */
  tools?: string[]
  scopes?: RuleScope[]
  /** Matches when policy risk score is >= this value. */
  minRiskScore?: number
  /** Matches when estimated cost of the action exceeds this (USD). */
  costOverUsd?: number
  /** Matches when cumulative estimated spend today (UTC) incl. this action exceeds this (USD). */
  dailySpendOverUsd?: number
  /** Matches when any recipient email domain is NOT in this list. */
  recipientDomainNotIn?: string[]
  /** Matches when any recipient email domain IS in this list. */
  recipientDomainIn?: string[]
  /** Matches when any URL host in the input is in / not in the lists (suffix match). */
  urlHostIn?: string[]
  urlHostNotIn?: string[]
  /** Case-insensitive substrings searched in the serialised input. */
  inputContains?: string[]
}

export interface PolicyRule {
  id: string
  name: string
  description?: string
  enabled: boolean
  effect: RuleEffect
  /** Lower number is evaluated first (only affects log ordering; the strictest effect wins). */
  priority: number
  match: RuleMatch
  createdAt: string
  updatedAt: string
}

export interface ActionContext {
  toolName: string
  input: Record<string, unknown>
  scope?: RuleScope
  riskScore?: number
  estimatedCostUsd?: number
}

export interface RuleEvaluation {
  decision: 'allow' | 'warn' | 'require_approval' | 'deny'
  matched: Array<{ ruleId: string; name: string; effect: RuleEffect; reasons: string[] }>
  evaluatedRules: number
}

export interface EvaluationLogEntry {
  id: string
  at: string
  toolName: string
  decision: RuleEvaluation['decision']
  dryRun: boolean
  matched: RuleEvaluation['matched']
  inputPreview: string
}

const MAX_RULES = 100
const EFFECT_RANK: Record<RuleEffect, number> = { allow: 0, warn: 1, require_approval: 2, deny: 3 }
const EMAIL_RE = /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi
const URL_RE = /\bhttps?:\/\/[^\s"'<>)]+/gi
const SENSITIVE_KEY = /token|secret|password|authorization|api[_-]?key|credential|cookie/i

function globToRegex(glob: string) {
  const escaped = glob.trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

function collectStrings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 4 || out.length > 200) return out
  if (typeof value === 'string') out.push(value.slice(0, 5000))
  else if (Array.isArray(value)) value.slice(0, 50).forEach((v) => collectStrings(v, out, depth + 1))
  else if (value && typeof value === 'object') Object.values(value as object).slice(0, 50).forEach((v) => collectStrings(v, out, depth + 1))
  return out
}

function hostMatches(host: string, list: string[]) {
  const h = host.toLowerCase()
  return list.some((d) => {
    const x = d.trim().toLowerCase().replace(/^@/, '')
    return h === x || h.endsWith(`.${x}`)
  })
}

@Injectable()
export class PolicyRulesService {
  /** userId -> yyyy-mm-dd -> spend (in-memory; resets on restart). */
  private spend = new Map<string, { day: string; total: number }>()

  private rulesFile(userId: string) {
    return governanceFile(userId, 'policy-rules.json')
  }
  private logFile(userId: string) {
    return governanceFile(userId, 'policy-eval-log.json')
  }

  async list(userId: string): Promise<PolicyRule[]> {
    const rules = await readJson<PolicyRule[]>(this.rulesFile(userId), [])
    return rules.sort((a, b) => a.priority - b.priority)
  }

  async upsert(userId: string, input: Partial<PolicyRule> & { name: string; effect: RuleEffect }, id?: string): Promise<PolicyRule> {
    return serialize(`rules:${userId}`, async () => {
      const rules = await readJson<PolicyRule[]>(this.rulesFile(userId), [])
      const now = new Date().toISOString()
      const idx = id ? rules.findIndex((r) => r.id === id) : -1
      if (id && idx < 0) throw new Error('Rule not found')
      if (idx < 0 && rules.length >= MAX_RULES) throw new Error(`Rule limit (${MAX_RULES}) reached`)
      const base: PolicyRule = idx >= 0 ? rules[idx] : { id: randomUUID(), name: '', enabled: true, effect: 'deny', priority: 100, match: {}, createdAt: now, updatedAt: now }
      const next: PolicyRule = {
        ...base,
        name: input.name,
        description: input.description ?? base.description,
        enabled: input.enabled ?? base.enabled,
        effect: input.effect,
        priority: input.priority ?? base.priority,
        match: input.match ?? base.match,
        updatedAt: now,
      }
      if (idx >= 0) rules[idx] = next
      else rules.push(next)
      await writeJson(this.rulesFile(userId), rules)
      return next
    })
  }

  async remove(userId: string, id: string): Promise<boolean> {
    return serialize(`rules:${userId}`, async () => {
      const rules = await readJson<PolicyRule[]>(this.rulesFile(userId), [])
      const next = rules.filter((r) => r.id !== id)
      if (next.length === rules.length) return false
      await writeJson(this.rulesFile(userId), next)
      return true
    })
  }

  /** Pure evaluation of a rule set against an action. */
  evaluateRules(rules: PolicyRule[], ctx: ActionContext, dailySpendBefore = 0): RuleEvaluation {
    const strings = collectStrings(ctx.input)
    const haystack = strings.join('\n')
    const lowerHay = haystack.toLowerCase()
    const emails = [...haystack.matchAll(EMAIL_RE)].map((m) => m[1].toLowerCase())
    const hosts: string[] = []
    for (const u of haystack.match(URL_RE) ?? []) {
      try { hosts.push(new URL(u).hostname) } catch { /* skip */ }
    }
    const cost = ctx.estimatedCostUsd ?? 0
    const active = rules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority)
    const matched: RuleEvaluation['matched'] = []

    for (const rule of active) {
      const m = rule.match ?? {}
      const reasons: string[] = []
      let ok = true
      const need = (cond: boolean, reason: string) => {
        if (!cond) ok = false
        else reasons.push(reason)
      }
      if (m.tools?.length) need(m.tools.some((g) => globToRegex(g).test(ctx.toolName)), `tool ${ctx.toolName} matches ${m.tools.join(', ')}`)
      if (ok && m.scopes?.length) need(!!ctx.scope && m.scopes.includes(ctx.scope), `scope ${ctx.scope}`)
      if (ok && typeof m.minRiskScore === 'number') need((ctx.riskScore ?? 0) >= m.minRiskScore, `risk ${ctx.riskScore ?? 0} ≥ ${m.minRiskScore}`)
      if (ok && typeof m.costOverUsd === 'number') need(cost > m.costOverUsd, `cost $${cost.toFixed(3)} > $${m.costOverUsd}`)
      if (ok && typeof m.dailySpendOverUsd === 'number') need(dailySpendBefore + cost > m.dailySpendOverUsd, `daily spend $${(dailySpendBefore + cost).toFixed(3)} > $${m.dailySpendOverUsd}`)
      if (ok && m.recipientDomainNotIn?.length) {
        const bad = emails.filter((d) => !hostMatches(d, m.recipientDomainNotIn!))
        need(bad.length > 0, `recipient domain outside allow-list: ${[...new Set(bad)].join(', ')}`)
      }
      if (ok && m.recipientDomainIn?.length) {
        const hit = emails.filter((d) => hostMatches(d, m.recipientDomainIn!))
        need(hit.length > 0, `recipient domain blocked: ${[...new Set(hit)].join(', ')}`)
      }
      if (ok && m.urlHostIn?.length) {
        const hit = hosts.filter((h) => hostMatches(h, m.urlHostIn!))
        need(hit.length > 0, `URL host matched: ${[...new Set(hit)].join(', ')}`)
      }
      if (ok && m.urlHostNotIn?.length) {
        const bad = hosts.filter((h) => !hostMatches(h, m.urlHostNotIn!))
        need(bad.length > 0, `URL host outside allow-list: ${[...new Set(bad)].join(', ')}`)
      }
      if (ok && m.inputContains?.length) {
        const hit = m.inputContains.filter((s) => s && lowerHay.includes(s.toLowerCase()))
        need(hit.length > 0, `input contains "${hit[0]}"`)
      }
      // A rule with an empty match block matches everything (explicit catch-all).
      if (ok) matched.push({ ruleId: rule.id, name: rule.name, effect: rule.effect, reasons })
    }

    let decision: RuleEvaluation['decision'] = 'allow'
    for (const m of matched) if (EFFECT_RANK[m.effect] > EFFECT_RANK[decision]) decision = m.effect
    return { decision, matched, evaluatedRules: active.length }
  }

  /** Live evaluation used by the tool execution path. Records spend when not denied. */
  async evaluateForTool(userId: string, ctx: ActionContext): Promise<RuleEvaluation> {
    const rules = await this.list(userId)
    if (!rules.length) return { decision: 'allow', matched: [], evaluatedRules: 0 }
    const day = new Date().toISOString().slice(0, 10)
    const s = this.spend.get(userId)
    const before = s && s.day === day ? s.total : 0
    const result = this.evaluateRules(rules, ctx, before)
    if (result.decision === 'allow' || result.decision === 'warn') {
      this.spend.set(userId, { day, total: before + (ctx.estimatedCostUsd ?? 0) })
    }
    if (result.matched.length) await this.log(userId, ctx, result, false)
    return result
  }

  async dryRun(userId: string, ctx: ActionContext, inlineRules?: PolicyRule[]) {
    const rules = inlineRules ?? (await this.list(userId))
    const s = this.spend.get(userId)
    const day = new Date().toISOString().slice(0, 10)
    const result = this.evaluateRules(rules, ctx, s && s.day === day ? s.total : 0)
    await this.log(userId, ctx, result, true)
    return result
  }

  private async log(userId: string, ctx: ActionContext, result: RuleEvaluation, dryRun: boolean) {
    const preview = JSON.stringify(ctx.input, (k, v) => (SENSITIVE_KEY.test(k) ? '[redacted]' : v)) ?? ''
    await serialize(`rulelog:${userId}`, async () => {
      const file = this.logFile(userId)
      const list = await readJson<EvaluationLogEntry[]>(file, [])
      list.unshift({
        id: randomUUID(),
        at: new Date().toISOString(),
        toolName: ctx.toolName,
        decision: result.decision,
        dryRun,
        matched: result.matched,
        inputPreview: preview.slice(0, 300),
      })
      await writeJson(file, list.slice(0, 200))
    }).catch(() => undefined)
  }

  async evaluationLog(userId: string, limit = 50) {
    const list = await readJson<EvaluationLogEntry[]>(this.logFile(userId), [])
    return list.slice(0, Math.min(Math.max(limit, 1), 200))
  }
}
