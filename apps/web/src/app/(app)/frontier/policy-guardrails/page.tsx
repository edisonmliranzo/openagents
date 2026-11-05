'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { GovPolicyRule, GovRuleEffect, GovRuleEvaluation, GovEvaluationLogEntry, GovRuleInput } from '@openagents/sdk'
import { Loader2, Plus, ShieldCheck, Trash2, FlaskConical } from 'lucide-react'

const inputCls = 'oa-input-surface h-10 w-full rounded-xl px-3 text-sm outline-none'
const btnCls = 'oa-accent-button h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50'
const EFFECTS: GovRuleEffect[] = ['deny', 'require_approval', 'warn', 'allow']
const effectTone: Record<string, string> = {
  deny: 'bg-red-100 text-red-700',
  require_approval: 'bg-amber-100 text-amber-700',
  warn: 'bg-yellow-100 text-yellow-700',
  allow: 'bg-emerald-100 text-emerald-700',
}

const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

export default function PolicyGuardrailsPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [rules, setRules] = useState<GovPolicyRule[]>([])
  const [log, setLog] = useState<GovEvaluationLogEntry[]>([])
  const [busy, setBusy] = useState(false)

  // editor
  const [name, setName] = useState('')
  const [effect, setEffect] = useState<GovRuleEffect>('deny')
  const [tools, setTools] = useState('')
  const [domainsNotIn, setDomainsNotIn] = useState('')
  const [domainsIn, setDomainsIn] = useState('')
  const [hostsIn, setHostsIn] = useState('')
  const [contains, setContains] = useState('')
  const [costOver, setCostOver] = useState('')
  const [dailyOver, setDailyOver] = useState('')
  const [minRisk, setMinRisk] = useState('')

  // tester
  const [testTool, setTestTool] = useState('gmail_send')
  const [testInput, setTestInput] = useState('{\n  "to": "someone@outside.com",\n  "subject": "Hi"\n}')
  const [testCost, setTestCost] = useState('')
  const [testResult, setTestResult] = useState<GovRuleEvaluation | null>(null)

  const load = useCallback(async () => {
    try {
      const [r, l] = await Promise.all([sdk.governance.policyRules.list(), sdk.governance.policyRules.log(50)])
      setRules(r)
      setLog(l)
    } catch (e: any) {
      addToast('error', e?.message ?? 'Failed to load rules')
    }
  }, [addToast])

  useEffect(() => { void load() }, [load])

  const buildRule = (): GovRuleInput => {
    const match: GovRuleInput['match'] = {}
    if (csv(tools).length) match.tools = csv(tools)
    if (csv(domainsNotIn).length) match.recipientDomainNotIn = csv(domainsNotIn)
    if (csv(domainsIn).length) match.recipientDomainIn = csv(domainsIn)
    if (csv(hostsIn).length) match.urlHostIn = csv(hostsIn)
    if (csv(contains).length) match.inputContains = csv(contains)
    if (costOver.trim()) match.costOverUsd = Number(costOver)
    if (dailyOver.trim()) match.dailySpendOverUsd = Number(dailyOver)
    if (minRisk.trim()) match.minRiskScore = Number(minRisk)
    return { name: name.trim() || 'Untitled rule', effect, match }
  }

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    try {
      await fn()
      if (ok) addToast('success', ok)
    } catch (e: any) {
      addToast('error', e?.message ?? 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const save = () => run(async () => {
    await sdk.governance.policyRules.create(buildRule())
    setName('')
    await load()
  }, 'Rule saved')

  const test = () => run(async () => {
    let input: Record<string, unknown> = {}
    try { input = JSON.parse(testInput || '{}') } catch { throw new Error('Sample input must be valid JSON') }
    setTestResult(await sdk.governance.policyRules.test({
      toolName: testTool,
      input,
      estimatedCostUsd: testCost.trim() ? Number(testCost) : undefined,
      draftRule: name.trim() ? buildRule() : undefined,
    }))
    await load()
  })

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><ShieldCheck size={18} /></span>
        <div>
          <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Policy-as-Code Guardrails</h1>
          <p className="text-xs text-[var(--muted)]">Declarative rules evaluated before every tool call. The strictest matching effect wins: deny &gt; require approval &gt; warn &gt; allow.</p>
        </div>
      </header>

      <section className="oa-float-card space-y-3 p-5">
        <h2 className="text-sm font-semibold text-[var(--tone-strong)]">Rule editor</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input className={inputCls} placeholder="Rule name (e.g. Block external email)" value={name} onChange={(e) => setName(e.target.value)} />
          <select className={inputCls} value={effect} onChange={(e) => setEffect(e.target.value as GovRuleEffect)}>
            {EFFECTS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <input className={inputCls} placeholder="Tools (globs, comma-separated): gmail_*, shell_execute" value={tools} onChange={(e) => setTools(e.target.value)} />
          <input className={inputCls} placeholder="Recipient domain NOT in: mycompany.com" value={domainsNotIn} onChange={(e) => setDomainsNotIn(e.target.value)} />
          <input className={inputCls} placeholder="Recipient domain IN (blocked): competitor.com" value={domainsIn} onChange={(e) => setDomainsIn(e.target.value)} />
          <input className={inputCls} placeholder="URL host IN: pastebin.com, evil.example" value={hostsIn} onChange={(e) => setHostsIn(e.target.value)} />
          <input className={inputCls} placeholder="Input contains: password, wire transfer" value={contains} onChange={(e) => setContains(e.target.value)} />
          <input className={inputCls} placeholder="Cost over (USD, per action)" value={costOver} onChange={(e) => setCostOver(e.target.value)} />
          <input className={inputCls} placeholder="Daily spend over (USD)" value={dailyOver} onChange={(e) => setDailyOver(e.target.value)} />
          <input className={inputCls} placeholder="Min risk score (0-100)" value={minRisk} onChange={(e) => setMinRisk(e.target.value)} />
        </div>
        <p className="text-[11px] text-[var(--muted)]">All filled conditions must match (AND). Leave all empty to match every action.</p>
        <button className={btnCls} disabled={busy || !name.trim()} onClick={save}>
          {busy ? <Loader2 size={14} className="inline animate-spin" /> : <Plus size={14} className="mr-1 inline" />}Save rule
        </button>
      </section>

      <section className="oa-float-card space-y-3 p-5">
        <h2 className="text-sm font-semibold text-[var(--tone-strong)]">Saved rules ({rules.length})</h2>
        {rules.length === 0 && <p className="text-xs text-[var(--muted)]">No rules yet. Without rules every tool call is allowed by this layer.</p>}
        {rules.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-black/5 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{r.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${effectTone[r.effect]}`}>{r.effect}</span>
                {!r.enabled && <span className="text-[10px] text-[var(--muted)]">disabled</span>}
              </div>
              <pre className="mt-1 overflow-x-auto text-[11px] text-[var(--muted)]">{JSON.stringify(r.match)}</pre>
            </div>
            <div className="flex shrink-0 gap-2">
              <button className="text-xs underline" disabled={busy} onClick={() => run(async () => {
                await sdk.governance.policyRules.update(r.id, { name: r.name, effect: r.effect, match: r.match, enabled: !r.enabled, priority: r.priority })
                await load()
              })}>{r.enabled ? 'Disable' : 'Enable'}</button>
              <button aria-label="Delete rule" disabled={busy} onClick={() => run(async () => { await sdk.governance.policyRules.remove(r.id); await load() }, 'Rule deleted')}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </section>

      <section className="oa-float-card space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--tone-strong)]"><FlaskConical size={14} />Dry-run: test a sample action</h2>
        <p className="text-xs text-[var(--muted)]">Nothing executes. If the editor above has a name, that draft rule is tested instead of the saved set.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <input className={inputCls} value={testTool} onChange={(e) => setTestTool(e.target.value)} placeholder="Tool name" />
          <input className={inputCls} value={testCost} onChange={(e) => setTestCost(e.target.value)} placeholder="Estimated cost USD (optional)" />
        </div>
        <textarea className="oa-input-surface h-28 w-full rounded-xl p-3 font-mono text-xs outline-none" value={testInput} onChange={(e) => setTestInput(e.target.value)} />
        <button className={btnCls} disabled={busy || !testTool.trim()} onClick={test}>Evaluate</button>
        {testResult && (
          <div className="rounded-xl border border-black/5 p-3 text-sm">
            <div>Decision: <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${effectTone[testResult.decision]}`}>{testResult.decision}</span> <span className="text-xs text-[var(--muted)]">({testResult.evaluatedRules} rules evaluated)</span></div>
            {testResult.matched.map((m) => (
              <div key={m.ruleId} className="mt-1 text-xs"><b>{m.name}</b> → {m.effect}: {m.reasons.join('; ') || 'catch-all'}</div>
            ))}
          </div>
        )}
      </section>

      <section className="oa-float-card space-y-2 p-5">
        <h2 className="text-sm font-semibold text-[var(--tone-strong)]">Evaluation log</h2>
        {log.length === 0 && <p className="text-xs text-[var(--muted)]">No evaluations recorded yet.</p>}
        {log.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-2 border-b border-black/5 pb-2 text-xs">
            <span className="text-[var(--muted)]">{new Date(l.at).toLocaleString()}</span>
            <code>{l.toolName}</code>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${effectTone[l.decision]}`}>{l.decision}</span>
            {l.dryRun && <span className="text-[10px] text-[var(--muted)]">dry-run</span>}
            <span className="truncate text-[var(--muted)]">{l.matched.map((m) => m.name).join(', ')}</span>
          </div>
        ))}
      </section>
    </div>
  )
}
