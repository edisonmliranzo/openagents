'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { ReplayForkDiff, ReplayForkSummary, ReplayRunSummary, ReplayTimeline } from '@openagents/sdk'
import { GitBranch, Rewind } from 'lucide-react'

const CAT_STYLE: Record<string, string> = {
  browser: 'bg-sky-500',
  terminal: 'bg-slate-800',
  tool: 'bg-indigo-500',
  message: 'bg-emerald-500',
  approval: 'bg-amber-500',
  system: 'bg-slate-400',
  error: 'bg-rose-500',
}
const DIFF_STYLE: Record<string, string> = {
  same: 'bg-white',
  changed: 'bg-amber-50',
  added: 'bg-emerald-50',
  removed: 'bg-rose-50',
}

const brief = (s: { title: string; content?: string; output?: unknown }) =>
  (s.content ?? (s.output !== undefined ? JSON.stringify(s.output) : '') ?? '').toString().slice(0, 160)

export default function ReplayRewindPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [runs, setRuns] = useState<ReplayRunSummary[]>([])
  const [runId, setRunId] = useState<string | null>(null)
  const [tl, setTl] = useState<ReplayTimeline | null>(null)
  const [cursor, setCursor] = useState(0)
  const [forks, setForks] = useState<ReplayForkSummary[]>([])
  const [diff, setDiff] = useState<ReplayForkDiff | null>(null)
  const [model, setModel] = useState('')
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false)

  const loadForks = useCallback(async (id: string) => {
    try {
      setForks(await sdk.replay.forks(id))
    } catch {
      setForks([])
    }
  }, [])

  useEffect(() => {
    sdk.replay
      .runs(50)
      .then((l) => {
        setRuns(l)
        if (l[0]) setRunId(l[0].id)
      })
      .catch((e: any) => addToast('error', e?.message ?? 'Failed to load runs'))
  }, [addToast])

  useEffect(() => {
    if (!runId) return
    setDiff(null)
    sdk.replay
      .timeline(runId)
      .then((t) => {
        setTl(t)
        setCursor(0)
      })
      .catch((e: any) => addToast('error', e?.message ?? 'Failed to load timeline'))
    void loadForks(runId)
  }, [runId, addToast, loadForks])

  const steps = tl?.steps ?? []
  const step = steps[cursor]

  const fork = async () => {
    if (!runId || !step) return
    setBusy(true)
    try {
      const f = await sdk.replay.fork(runId, {
        stepIndex: cursor,
        model: model.trim() || undefined,
        instructions: instructions.trim() || undefined,
      })
      addToast('success', `Forked into conversation ${f.forkConversationId.slice(0, 8)} (${f.seededMessages} messages seeded)`)
      await loadForks(runId)
      setDiff(await sdk.replay.forkDiff(f.id))
    } catch (e: any) {
      addToast('error', e?.message ?? 'Fork failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4 pb-24">
        <header className="oa-float-card flex items-start gap-3 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Rewind size={18} />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Computer-Use Replay &amp; Rewind</h1>
            <p className="text-xs text-[var(--muted)]">Scrub a run's browser, terminal and tool steps, fork from any step with a different model or instructions, and diff the result.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <aside className="oa-float-card max-h-[520px] overflow-y-auto p-4 lg:col-span-3">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Runs ({runs.length})</h2>
            <ul className="space-y-2">
              {runs.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setRunId(r.id)}
                    className={`w-full rounded-xl border p-2 text-left text-xs ${runId === r.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-[var(--border)] bg-white/75'}`}
                  >
                    <div className="truncate font-semibold">{r.conversationTitle || `Run ${r.id.slice(0, 8)}`}</div>
                    <div className="opacity-75">{new Date(r.startedAt).toLocaleString()}</div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <main className="space-y-4 lg:col-span-9">
            {!tl || steps.length === 0 ? (
              <div className="oa-float-card p-8 text-center text-sm text-[var(--muted)]">Select a run with recorded steps.</div>
            ) : (
              <>
                <section className="oa-float-card space-y-3 p-5">
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {Object.entries(tl.categories).map(([c, n]) => (
                      <span key={c} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
                        <span className={`h-2 w-2 rounded-full ${CAT_STYLE[c] ?? 'bg-slate-400'}`} /> {c} {n}
                      </span>
                    ))}
                  </div>
                  <div className="flex h-5 items-stretch gap-px">
                    {steps.map((s) => (
                      <button
                        key={s.index}
                        title={`${s.index + 1}. ${s.title}`}
                        onClick={() => setCursor(s.index)}
                        className={`min-w-[3px] flex-1 rounded-sm ${CAT_STYLE[s.category] ?? 'bg-slate-400'} ${s.index === cursor ? 'ring-2 ring-slate-900 ring-offset-1' : s.index > cursor ? 'opacity-30' : ''}`}
                      />
                    ))}
                  </div>
                  <input type="range" min={0} max={steps.length - 1} value={cursor} onChange={(e) => setCursor(Number(e.target.value))} className="w-full" />
                  <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                    <span>
                      Step {cursor + 1} / {steps.length}
                    </span>
                    <span>
                      +{step?.offsetMs}ms · {step?.cumulativeTokens.toLocaleString()} tok · ${step?.cumulativeCostUsd.toFixed(4)}
                    </span>
                  </div>
                </section>

                {step && (
                  <section className="oa-float-card space-y-2 p-5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${CAT_STYLE[step.category]}`} />
                      <span className="font-semibold text-[var(--tone-strong)]">{step.title}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase">{step.kind}</span>
                      {step.status && <span className="text-[var(--muted)]">{step.status}</span>}
                    </div>
                    {step.screenshot && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={step.screenshot} alt={step.title ? `Agent step screenshot: ${step.title}` : 'Agent execution step screenshot'} className="max-h-64 rounded-lg border border-[var(--border)]" />
                    )}
                    {step.content && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2">{step.content}</pre>}
                    {step.input !== undefined ? <pre className="max-h-40 overflow-auto rounded-lg bg-slate-50 p-2">in: {JSON.stringify(step.input, null, 2)}</pre> : null}
                    {step.output !== undefined ? <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-2">out: {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}</pre> : null}

                    <div className="space-y-2 border-t border-[var(--border)] pt-3">
                      <div className="font-semibold text-[var(--tone-strong)]">Fork from step {cursor + 1}</div>
                      <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Different model (optional)" className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5" />
                      <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Different instructions (optional)" rows={2} className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5" />
                      <button onClick={fork} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white disabled:opacity-50">
                        <GitBranch size={13} /> {busy ? 'Forking…' : 'Fork from here'}
                      </button>
                    </div>
                  </section>
                )}

                <section className="oa-float-card space-y-3 p-5 text-xs">
                  <h2 className="font-semibold uppercase tracking-wider text-[var(--muted)]">Forks ({forks.length})</h2>
                  <div className="flex flex-wrap gap-2">
                    {forks.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => sdk.replay.forkDiff(f.id).then(setDiff).catch((e: any) => addToast('error', e?.message ?? 'Diff failed'))}
                        className="rounded-lg border border-[var(--border)] bg-white px-2 py-1"
                      >
                        {f.title}
                      </button>
                    ))}
                  </div>
                  {diff && (
                    <div className="space-y-2">
                      <p className="text-[var(--muted)]">
                        {diff.fork.title} · same {diff.counts.same} · changed {diff.counts.changed} · added {diff.counts.added} · removed {diff.counts.removed}
                        {diff.firstDivergence !== null && ` · first divergence at step ${diff.firstDivergence + 1}`}
                      </p>
                      <p className="text-[var(--muted)]">
                        Original {diff.totals.original.steps} steps / {diff.totals.original.tokens} tok — Fork {diff.totals.fork.steps} steps / {diff.totals.fork.tokens} tok
                        {diff.fork.model && ` · model ${diff.fork.model}`}
                      </p>
                      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)]">
                        <div className="bg-slate-100 p-2 font-semibold">Original</div>
                        <div className="bg-slate-100 p-2 font-semibold">Fork</div>
                        {diff.rows.map((r) => (
                          <div key={r.index} className="contents">
                            <div className={`p-2 ${DIFF_STYLE[r.status]}`}>{r.original ? <><b>{r.index + 1}. {r.original.title}</b><div className="truncate text-[var(--muted)]">{brief(r.original)}</div></> : <i className="text-[var(--muted)]">—</i>}</div>
                            <div className={`p-2 ${DIFF_STYLE[r.status]}`}>{r.fork ? <><b>{r.index + 1}. {r.fork.title}</b><div className="truncate text-[var(--muted)]">{brief(r.fork)}</div></> : <i className="text-[var(--muted)]">—</i>}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
