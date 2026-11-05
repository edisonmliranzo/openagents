'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { SmartRouterPolicy, SmartRouterPreview, SmartRouterSavings, RouterRung } from '@openagents/sdk'
import { Loader2, Plus, Trash2 } from 'lucide-react'

const inputCls = 'oa-input-surface h-10 w-full rounded-xl px-3 text-sm outline-none'
const btnCls = 'oa-accent-button h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50'
const usd = (n: number) => `$${n.toFixed(n < 0.01 ? 5 : 3)}`

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="oa-float-card p-5">
      <h2 className="text-sm font-semibold text-[var(--tone-strong)]">{title}</h2>
      {subtitle && <p className="mb-3 text-xs text-[var(--muted)]">{subtitle}</p>}
      {children}
    </section>
  )
}

export default function SmartRouterPage() {
  const [policy, setPolicy] = useState<SmartRouterPolicy | null>(null)
  const [savings, setSavings] = useState<SmartRouterSavings | null>(null)
  const [prompt, setPrompt] = useState('')
  const [preview, setPreview] = useState<SmartRouterPreview | null>(null)
  const [answer, setAnswer] = useState<{ answer: string; accepted: boolean; attempts: number; saved: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([sdk.smartRouter.getPolicy(), sdk.smartRouter.savings(30)])
      setPolicy(p)
      setSavings(s)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load router')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const wrap = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null); setNotice(null)
    try { await fn() } catch (e: any) { setError(e?.message ?? 'Request failed') } finally { setBusy(null) }
  }

  const patch = (next: Partial<SmartRouterPolicy>) => setPolicy((p) => (p ? { ...p, ...next } : p))
  const setRung = (i: number, r: Partial<RouterRung>) => policy && patch({ ladder: policy.ladder.map((x, j) => (j === i ? { ...x, ...r } : x)) })

  const save = () => policy && wrap('save', async () => {
    const saved = await sdk.smartRouter.setPolicy({
      enabled: policy.enabled, ladder: policy.ladder, minConfidence: policy.minConfidence, maxEscalations: policy.maxEscalations,
      checks: policy.checks, standardAt: policy.standardAt, complexAt: policy.complexAt,
    })
    setPolicy(saved)
    setNotice('Policy saved (ladder sorted cheapest → strongest).')
  })

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-5 pb-24">
        <header>
          <h1 className="text-xl font-extrabold text-[var(--tone-strong)]">Cost-Aware Model Router</h1>
          <p className="text-xs text-[var(--muted)]">Starts on the cheapest model that fits the task, escalates when the answer is refused, malformed or low-confidence, and tracks savings versus always using the top model.</p>
        </header>
        {error && <p className="rounded-xl bg-red-100 px-3 py-2 text-xs text-red-800">{error}</p>}
        {notice && <p className="rounded-xl bg-emerald-100 px-3 py-2 text-xs text-emerald-800">{notice}</p>}

        <Card title="Savings dashboard" subtitle="Last 30 days of routed runs">
          {!savings ? <Loader2 className="animate-spin" size={16} /> : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Saved', `${usd(savings.savedUsd)} (${savings.savedPct}%)`],
                  ['Actual cost', usd(savings.actualCostUsd)],
                  ['Top-model baseline', usd(savings.baselineCostUsd)],
                  ['Escalation rate', `${Math.round(savings.escalationRate * 100)}% of ${savings.runs} runs`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-slate-100/70 p-3">
                    <p className="text-[11px] text-[var(--muted)]">{k}</p>
                    <p className="text-sm font-semibold text-[var(--tone-strong)]">{v}</p>
                  </div>
                ))}
              </div>
              {savings.daily.length > 0 && (
                <div className="flex h-20 items-end gap-1">
                  {savings.daily.map((d) => {
                    const max = Math.max(...savings.daily.map((x) => x.baselineCostUsd), 1e-9)
                    return (
                      <div key={d.date} title={`${d.date}: saved ${usd(d.savedUsd)}`} className="flex flex-1 flex-col justify-end">
                        <div className="rounded-t bg-slate-300" style={{ height: `${(d.baselineCostUsd / max) * 100}%` }}>
                          <div className="w-full rounded-t bg-emerald-500" style={{ height: `${d.baselineCostUsd ? (d.costUsd / d.baselineCostUsd) * 100 : 0}%`, marginTop: 'auto' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {savings.recent.length > 0 && (
                <table className="w-full text-left text-xs">
                  <thead className="text-[var(--muted)]"><tr><th>Prompt</th><th>Model</th><th>Esc.</th><th>Cost</th><th>Saved</th></tr></thead>
                  <tbody>
                    {savings.recent.map((r) => (
                      <tr key={r.id} className="border-t border-slate-200/60">
                        <td className="max-w-[200px] truncate py-1">{r.promptPreview}</td>
                        <td>{r.finalModel}</td><td>{r.escalations}</td><td>{usd(r.costUsd)}</td>
                        <td className={r.savedUsd >= 0 ? 'text-emerald-700' : 'text-red-700'}>{usd(r.savedUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </Card>

        <Card title="Router config" subtitle="Model ladder (cheapest → strongest). The last rung is the savings baseline.">
          {!policy ? <Loader2 className="animate-spin" size={16} /> : (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.enabled} onChange={(e) => patch({ enabled: e.target.checked })} /> Router enabled</label>
              {policy.ladder.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <span className="flex h-10 w-8 items-center justify-center text-xs text-[var(--muted)]">{i + 1}</span>
                  <input className={inputCls} value={r.provider} onChange={(e) => setRung(i, { provider: e.target.value })} placeholder="provider" />
                  <input className={inputCls} value={r.model} onChange={(e) => setRung(i, { model: e.target.value })} placeholder="model" />
                  <button className="px-2 text-slate-500 disabled:opacity-30" disabled={policy.ladder.length <= 2} onClick={() => patch({ ladder: policy.ladder.filter((_, j) => j !== i) })} aria-label="Remove rung"><Trash2 size={14} /></button>
                </div>
              ))}
              {policy.ladder.length < 6 && (
                <button className="flex items-center gap-1 text-xs font-medium text-[var(--tone-strong)]" onClick={() => patch({ ladder: [...policy.ladder, { provider: 'openai', model: 'gpt-4o' }] })}><Plus size={12} /> Add model</button>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([
                  ['Min confidence', 'minConfidence', 0, 100], ['Max escalations', 'maxEscalations', 0, 4],
                  ['Standard at (score)', 'standardAt', 0, 100], ['Complex at (score)', 'complexAt', 0, 100],
                ] as const).map(([label, key, min, max]) => (
                  <label key={key} className="text-xs text-[var(--muted)]">{label}
                    <input type="number" min={min} max={max} className={inputCls} value={policy[key]} onChange={(e) => patch({ [key]: Number(e.target.value) } as any)} />
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                {(['refusal', 'malformed', 'lowConfidence'] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={policy.checks[k]} onChange={(e) => patch({ checks: { ...policy.checks, [k]: e.target.checked } })} /> Escalate on {k}</label>
                ))}
              </div>
              <button className={btnCls} disabled={busy === 'save'} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save policy'}</button>
            </div>
          )}
        </Card>

        <Card title="Preview tester" subtitle="See which model would be chosen and why. 'Run routed' makes real (billed) model calls.">
          <textarea className="oa-input-surface min-h-[90px] w-full rounded-xl p-3 text-sm outline-none" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Paste a prompt…" maxLength={8000} />
          <div className="mt-2 flex gap-2">
            <button className={btnCls} disabled={!prompt.trim() || busy === 'preview'} onClick={() => wrap('preview', async () => { setPreview(await sdk.smartRouter.preview(prompt)); setAnswer(null) })}>Preview route</button>
            <button className={btnCls} disabled={!prompt.trim() || busy === 'run'} onClick={() => wrap('run', async () => {
              const r = await sdk.smartRouter.run({ prompt })
              setAnswer({ answer: r.answer, accepted: r.accepted, attempts: r.run.attempts.length, saved: r.run.savedUsd })
              await load()
            })}>{busy === 'run' ? 'Running…' : 'Run routed'}</button>
          </div>
          {preview && (
            <div className="mt-3 space-y-1 text-xs">
              <p className="text-sm font-semibold text-[var(--tone-strong)]">{preview.chosen.provider} / {preview.chosen.model} <span className="font-normal text-[var(--muted)]">(complexity {preview.complexity}, {preview.tier})</span></p>
              <ul className="list-disc pl-5 text-[var(--muted)]">{preview.reasoning.map((r, i) => <li key={i}>{r}</li>)}</ul>
              <p>Escalation path: {preview.escalationPath.map((r) => r.model).join(' → ')}</p>
              <p>Est. {usd(preview.estimatedCostUsd)} vs top model {usd(preview.topModelCostUsd)} — saves ~{usd(preview.estimatedSavingsUsd)}</p>
            </div>
          )}
          {answer && (
            <div className="mt-3 rounded-xl bg-slate-100/70 p-3 text-xs">
              <p className="mb-1 text-[var(--muted)]">{answer.accepted ? 'Accepted' : 'Not accepted (all attempts failed checks)'} after {answer.attempts} attempt(s); saved {usd(answer.saved)}</p>
              <p className="whitespace-pre-wrap text-sm">{answer.answer}</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
