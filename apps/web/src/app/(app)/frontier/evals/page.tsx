'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { EvalSuiteRow, EvalCaseDef, EvalAssertionDef, EvalSuiteRunSummary, EvalSuiteRunDetail, EvalSuiteComparison, EvalGateResult } from '@openagents/sdk'
import { Loader2, Plus, Trash2 } from 'lucide-react'

const inputCls = 'oa-input-surface h-10 w-full rounded-xl px-3 text-sm outline-none'
const areaCls = 'oa-input-surface w-full rounded-xl p-3 text-sm outline-none'
const btnCls = 'oa-accent-button h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50'

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="oa-float-card p-5">
      <h2 className="text-sm font-semibold text-[var(--tone-strong)]">{title}</h2>
      {subtitle && <p className="mb-3 text-xs text-[var(--muted)]">{subtitle}</p>}
      {children}
    </section>
  )
}

const statusCls: Record<string, string> = {
  regression: 'bg-red-100 text-red-800',
  improvement: 'bg-emerald-100 text-emerald-800',
  new: 'bg-sky-100 text-sky-800',
  same: 'bg-slate-100 text-slate-600',
}

function newAssertion(type: EvalAssertionDef['type'] = 'contains'): EvalAssertionDef {
  return type === 'judge' ? { type, rubric: '', minScore: 7 } : type === 'jsonSchema' ? { type, schema: '{"type":"object"}' } : { type, value: '' }
}

export default function EvalSuitesPage() {
  const [suites, setSuites] = useState<EvalSuiteRow[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ name: string; system: string; cases: EvalCaseDef[] } | null>(null)
  const [runs, setRuns] = useState<EvalSuiteRunSummary[]>([])
  const [detail, setDetail] = useState<EvalSuiteRunDetail | null>(null)
  const [cmp, setCmp] = useState<EvalSuiteComparison | null>(null)
  const [gate, setGate] = useState<EvalGateResult | null>(null)
  const [presets, setPresets] = useState<Array<{ id: string; name: string }>>([])
  const [presetId, setPresetId] = useState('')
  const [modelOverride, setModelOverride] = useState('')
  const [maxDrop, setMaxDrop] = useState(5)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const wrap = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null)
    try { await fn() } catch (e: any) { setError(e?.message ?? 'Request failed') } finally { setBusy(null) }
  }

  const loadSuites = useCallback(async () => {
    try { setSuites(await sdk.evalSuites.list()) } catch (e: any) { setError(e?.message ?? 'Failed to load suites') }
  }, [])

  useEffect(() => {
    void loadSuites()
    ;(sdk as any).agentPresets?.list?.().then((p: any[]) => setPresets(p.map((x) => ({ id: x.id, name: x.name })))).catch(() => undefined)
  }, [loadSuites])

  const refreshRuns = useCallback(async (id: string, runId?: string) => {
    const r = await sdk.evalSuites.runs(id)
    setRuns(r)
    const target = runId ?? r[0]?.id
    if (target) {
      setDetail(await sdk.evalSuites.runDetail(id, target))
      setCmp(await sdk.evalSuites.compare(id, target))
    } else { setDetail(null); setCmp(null) }
  }, [])

  const select = (s: EvalSuiteRow) => {
    setSel(s.id); setGate(null)
    setDraft({ name: s.name, system: s.system ?? '', cases: s.cases.map((c) => ({ ...c, assertions: c.assertions.map((a) => ({ ...a, schema: typeof a.schema === 'object' ? JSON.stringify(a.schema) : a.schema })) })) })
    void refreshRuns(s.id).catch((e) => setError(e?.message))
  }

  const current = suites.find((s) => s.id === sel)
  const target = () => ({ ...(presetId ? { presetId } : {}), ...(modelOverride.trim() ? { model: modelOverride.trim() } : {}) })

  const createSuite = () => wrap('create', async () => {
    const s = await sdk.evalSuites.create({ name: 'New suite', cases: [] })
    await loadSuites(); select(s)
  })
  const saveSuite = () => sel && draft && wrap('save', async () => {
    const s = await sdk.evalSuites.update(sel, { name: draft.name, system: draft.system, cases: draft.cases })
    await loadSuites(); select(s)
  })
  const setCase = (i: number, c: Partial<EvalCaseDef>) => setDraft((d) => d && { ...d, cases: d.cases.map((x, j) => (j === i ? { ...x, ...c } : x)) })
  const setAssertion = (i: number, k: number, a: Partial<EvalAssertionDef>) =>
    setDraft((d) => d && { ...d, cases: d.cases.map((x, j) => (j === i ? { ...x, assertions: x.assertions.map((y, m) => (m === k ? { ...y, ...a } : y)) } : x)) })

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5 pb-24">
        <header>
          <h1 className="text-xl font-extrabold text-[var(--tone-strong)]">Agent Evals &amp; Regression Gate</h1>
          <p className="text-xs text-[var(--muted)]">Golden task suites with assertions, scored runs, baseline comparison, and a CI gate: <code>POST /api/v1/eval/suites/:id/gate</code></p>
        </header>
        {error && <p className="rounded-xl bg-red-100 px-3 py-2 text-xs text-red-800">{error}</p>}

        <Card title="Suites">
          <div className="flex flex-wrap gap-2">
            {suites.map((s) => (
              <button key={s.id} onClick={() => select(s)} className={`rounded-xl px-3 py-2 text-sm ${s.id === sel ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{s.name} <span className="text-[11px] opacity-70">({s.cases.length})</span></button>
            ))}
            <button className="flex items-center gap-1 rounded-xl border border-dashed border-slate-400 px-3 py-2 text-sm" disabled={busy === 'create'} onClick={createSuite}><Plus size={13} /> New suite</button>
          </div>
        </Card>

        {sel && draft && (
          <Card title="Suite editor" subtitle="Each case is a prompt plus assertions (contains / not contains / regex / JSON schema / judge rubric).">
            <div className="space-y-3">
              <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Suite name" />
              <textarea className={areaCls} rows={2} value={draft.system} onChange={(e) => setDraft({ ...draft, system: e.target.value })} placeholder="Optional system prompt (overridden by preset/version prompt)" />
              {draft.cases.map((c, i) => (
                <div key={i} className="space-y-2 rounded-xl bg-slate-100/60 p-3">
                  <div className="flex gap-2">
                    <input className={inputCls} value={c.name ?? ''} onChange={(e) => setCase(i, { name: e.target.value })} placeholder={`Case ${i + 1} name`} />
                    <button aria-label="Remove case" onClick={() => setDraft({ ...draft, cases: draft.cases.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
                  </div>
                  <textarea className={areaCls} rows={2} value={c.prompt} onChange={(e) => setCase(i, { prompt: e.target.value })} placeholder="Prompt" />
                  {c.assertions.map((a, k) => (
                    <div key={k} className="flex gap-2">
                      <select className="oa-input-surface h-10 rounded-xl px-2 text-sm" value={a.type} onChange={(e) => setAssertion(i, k, newAssertion(e.target.value as any))}>
                        <option value="contains">contains</option><option value="notContains">not contains</option><option value="regex">regex</option><option value="jsonSchema">JSON schema</option><option value="judge">judge rubric</option>
                      </select>
                      {a.type === 'judge' ? (
                        <>
                          <input className={inputCls} value={a.rubric ?? ''} onChange={(e) => setAssertion(i, k, { rubric: e.target.value })} placeholder="Rubric, e.g. 'Explains the trade-offs clearly'" />
                          <input type="number" min={0} max={10} className="oa-input-surface h-10 w-20 rounded-xl px-2 text-sm" value={a.minScore ?? 7} onChange={(e) => setAssertion(i, k, { minScore: Number(e.target.value) })} title="Min judge score" />
                        </>
                      ) : a.type === 'jsonSchema' ? (
                        <input className={`${inputCls} font-mono`} value={typeof a.schema === 'string' ? a.schema : JSON.stringify(a.schema ?? {})} onChange={(e) => setAssertion(i, k, { schema: e.target.value })} />
                      ) : (
                        <input className={inputCls} value={a.value ?? ''} onChange={(e) => setAssertion(i, k, { value: e.target.value })} placeholder={a.type === 'regex' ? 'Regular expression' : 'Text'} />
                      )}
                      <button aria-label="Remove assertion" onClick={() => setCase(i, { assertions: c.assertions.filter((_, m) => m !== k) })}><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button className="flex items-center gap-1 text-xs font-medium" onClick={() => setCase(i, { assertions: [...c.assertions, newAssertion()] })}><Plus size={12} /> Assertion</button>
                </div>
              ))}
              <div className="flex gap-2">
                <button className="flex items-center gap-1 text-sm font-medium" onClick={() => setDraft({ ...draft, cases: [...draft.cases, { prompt: '', assertions: [newAssertion()] }] })}><Plus size={14} /> Add case</button>
                <div className="flex-1" />
                <button className="text-sm text-red-700" onClick={() => wrap('del', async () => { await sdk.evalSuites.remove(sel); setSel(null); setDraft(null); await loadSuites() })}>Delete suite</button>
                <button className={btnCls} disabled={busy === 'save'} onClick={saveSuite}>{busy === 'save' ? 'Saving…' : 'Save suite'}</button>
              </div>
            </div>
          </Card>
        )}

        {sel && (
          <Card title="Run & gate" subtitle="Target an agent preset and/or a provider:model override (default: your current settings).">
            <div className="flex flex-wrap items-end gap-2">
              <select className="oa-input-surface h-10 rounded-xl px-2 text-sm" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                <option value="">Current settings</option>
                {presets.map((p) => <option key={p.id} value={p.id}>Preset: {p.name}</option>)}
              </select>
              <input className={`${inputCls} max-w-xs`} value={modelOverride} onChange={(e) => setModelOverride(e.target.value)} placeholder="provider:model (optional)" />
              <button className={btnCls} disabled={busy === 'run' || !current?.cases.length} onClick={() => wrap('run', async () => { const r = await sdk.evalSuites.run(sel, target()); await refreshRuns(sel, r.id) })}>{busy === 'run' ? 'Running…' : 'Run suite'}</button>
              <label className="text-xs text-[var(--muted)]">Max drop
                <input type="number" min={0} max={100} className="oa-input-surface ml-1 h-10 w-16 rounded-xl px-2 text-sm" value={maxDrop} onChange={(e) => setMaxDrop(Number(e.target.value))} />
              </label>
              <button className={btnCls} disabled={busy === 'gate'} onClick={() => wrap('gate', async () => { setGate(await sdk.evalSuites.gate(sel, { maxDrop, runId: detail?.id })); })}>Check gate</button>
            </div>
            {gate && (
              <p className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${gate.pass ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                {gate.pass ? 'PASS' : 'FAIL'} — score {gate.score}{gate.scoreDelta !== null ? ` (Δ ${gate.scoreDelta > 0 ? '+' : ''}${gate.scoreDelta} vs baseline ${gate.baselineScore})` : ''}
                {gate.reasons.length > 0 && <span className="block text-xs font-normal">{gate.reasons.join('; ')}</span>}
              </p>
            )}
          </Card>
        )}

        {sel && runs.length > 0 && (
          <Card title="Runs" subtitle="Click a run to inspect it. Set a run as the baseline to enable regression detection.">
            <div className="space-y-1">
              {runs.map((r) => (
                <div key={r.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-xs ${detail?.id === r.id ? 'bg-slate-200/70' : 'bg-slate-100/50'}`}>
                  <button className="flex-1 text-left" onClick={() => wrap('detail', async () => { setDetail(await sdk.evalSuites.runDetail(sel, r.id)); setCmp(await sdk.evalSuites.compare(sel, r.id)) })}>
                    {new Date(r.at).toLocaleString()} · {r.target.label} {r.target.model ? `(${r.target.model})` : ''} · <b>{r.score}</b>/100 · {r.passRate}% pass
                  </button>
                  {current?.baselineRunId === r.id
                    ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">baseline</span>
                    : <button className="font-medium underline" onClick={() => wrap('base', async () => { await sdk.evalSuites.setBaseline(sel, r.id); await loadSuites(); await refreshRuns(sel, r.id) })}>Set baseline</button>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {detail && (
          <Card title="Results & baseline comparison" subtitle={cmp?.baselineRunId ? `Score ${cmp.score} vs baseline ${cmp.baselineScore} (Δ ${cmp.scoreDelta})` : 'No baseline set — comparison unavailable.'}>
            <div className="space-y-2">
              {detail.cases.map((c) => {
                const row = cmp?.cases.find((x) => x.caseId === c.caseId)
                return (
                  <details key={c.caseId} className={`rounded-xl p-3 text-xs ${row?.status === 'regression' ? 'bg-red-50 ring-1 ring-red-300' : 'bg-slate-100/60'}`}>
                    <summary className="flex cursor-pointer items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 ${c.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{c.passed ? 'pass' : 'fail'}</span>
                      <span className="flex-1">{c.name || c.caseId}</span>
                      <b>{c.score}</b>
                      {row && row.delta !== null && <span className={`rounded-full px-2 py-0.5 ${statusCls[row.status]}`}>{row.status} {row.delta > 0 ? '+' : ''}{row.delta}</span>}
                    </summary>
                    <ul className="mt-2 list-disc pl-5">{c.assertions.map((a, i) => <li key={i} className={a.passed ? 'text-emerald-700' : 'text-red-700'}>{a.detail}</li>)}</ul>
                    {c.error && <p className="mt-1 text-red-700">{c.error}</p>}
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-white/70 p-2">{c.output}</pre>
                  </details>
                )
              })}
            </div>
          </Card>
        )}
        {busy === 'run' && <p className="flex items-center gap-2 text-xs text-[var(--muted)]"><Loader2 className="animate-spin" size={14} /> Running suite…</p>}
      </div>
    </div>
  )
}
