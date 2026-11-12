'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { DurableRun, DurableRunSummary, DurableStepInput, DurableStepKind } from '@openagents/sdk'
import { Pause, Play, Plus, RefreshCw, Repeat, Square, Trash2, X } from 'lucide-react'

const STATUS_STYLE: Record<string, string> = {
  running: 'bg-sky-100 text-sky-800',
  paused: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-200 text-slate-700',
  pending: 'bg-slate-100 text-slate-600',
  succeeded: 'bg-emerald-100 text-emerald-800',
  skipped: 'bg-slate-200 text-slate-600',
}

export default function DurableAgentsPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [runs, setRuns] = useState<DurableRunSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<DurableRun | null>(null)
  const [title, setTitle] = useState('')
  const [steps, setSteps] = useState<DurableStepInput[]>([{ kind: 'llm', instruction: '' }])
  const [busy, setBusy] = useState(false)
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selected

  const refresh = useCallback(async () => {
    try {
      setRuns(await sdk.durable.list())
      if (selectedRef.current) setDetail(await sdk.durable.get(selectedRef.current))
    } catch (e: any) {
      addToast('error', e?.message ?? 'Failed to load durable runs')
    }
  }, [addToast])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 3000)
    return () => clearInterval(t)
  }, [refresh])

  useEffect(() => {
    if (!selected) return setDetail(null)
    sdk.durable.get(selected).then(setDetail).catch(() => setDetail(null))
  }, [selected])

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      addToast('success', ok)
      await refresh()
    } catch (e: any) {
      addToast('error', e?.message ?? 'Action failed')
    }
  }

  const patchStep = (i: number, p: Partial<DurableStepInput>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)))

  const create = async () => {
    if (!title.trim()) return addToast('error', 'Give the run a title')
    const clean = steps.filter((s) => (s.kind === 'tool' ? s.tool?.trim() : s.kind === 'delay' ? true : s.instruction?.trim()))
    if (!clean.length) return addToast('error', 'Add at least one complete step')
    setBusy(true)
    try {
      const run = await sdk.durable.create({ title: title.trim(), steps: clean })
      setTitle('')
      setSteps([{ kind: 'llm', instruction: '' }])
      setSelected(run.id)
      addToast('success', 'Durable run started')
      await refresh()
    } catch (e: any) {
      addToast('error', e?.message ?? 'Failed to create run')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4 pb-24">
        <header className="oa-float-card flex items-start gap-3 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Repeat size={18} />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Durable Long-Running Agents</h1>
            <p className="text-xs text-[var(--muted)]">
              Checkpointed multi-step runs that persist after every step, retry with backoff, survive API restarts and auto-resume on boot.
            </p>
          </div>
        </header>

        <section className="oa-float-card space-y-3 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">New durable run</h2>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Run title"
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
          />
          {steps.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-xs text-[var(--muted)]">{i + 1}.</span>
              <select
                value={s.kind}
                onChange={(e) => patchStep(i, { kind: e.target.value as DurableStepKind })}
                className="rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-xs"
              >
                <option value="llm">LLM</option>
                <option value="tool">Tool</option>
                <option value="delay">Delay</option>
                <option value="note">Note</option>
              </select>
              {s.kind === 'tool' && (
                <input
                  value={s.tool ?? ''}
                  onChange={(e) => patchStep(i, { tool: e.target.value })}
                  placeholder="tool name"
                  className="w-40 rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-xs"
                />
              )}
              {s.kind === 'delay' ? (
                <input
                  type="number"
                  min={0}
                  value={s.delayMs ?? 1000}
                  onChange={(e) => patchStep(i, { delayMs: Number(e.target.value) })}
                  className="w-32 rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-xs"
                />
              ) : (
                <input
                  value={s.kind === 'tool' ? JSON.stringify(s.input ?? {}) : s.instruction ?? ''}
                  onChange={(e) => {
                    if (s.kind !== 'tool') return patchStep(i, { instruction: e.target.value })
                    try {
                      patchStep(i, { input: JSON.parse(e.target.value || '{}') })
                    } catch {
                      /* ignore until JSON is valid */
                    }
                  }}
                  placeholder={s.kind === 'tool' ? 'input JSON, e.g. {"query":"..."}' : 'instruction'}
                  className="w-full min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-xs sm:min-w-[200px]"
                />
              )}
              <button onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} disabled={steps.length === 1} className="p-1 disabled:opacity-30">
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={() => setSteps((x) => [...x, { kind: 'llm', instruction: '' }])}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs"
            >
              <Plus size={13} /> Add step
            </button>
            <button
              onClick={create}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              <Play size={13} /> Start run
            </button>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <aside className="oa-float-card max-h-[600px] overflow-y-auto p-4 lg:col-span-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Runs ({runs.length})</h2>
              <button onClick={() => void refresh()} className="p-1">
                <RefreshCw size={13} />
              </button>
            </div>
            {runs.length === 0 && <p className="text-xs text-[var(--muted)]">No durable runs yet.</p>}
            <ul className="space-y-2">
              {runs.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelected(r.id)}
                    className={`w-full rounded-xl border p-3 text-left text-xs ${
                      selected === r.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-[var(--border)] bg-white/75 text-[var(--tone-strong)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{r.title}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${STATUS_STYLE[r.status] ?? ''}`}>{r.status}</span>
                    </div>
                    <div className="mt-1 opacity-75">
                      {Math.min(r.cursor, r.totalSteps)}/{r.totalSteps} steps · {new Date(r.createdAt).toLocaleString()}
                      {r.resumes > 0 && ` · resumed ${r.resumes}×`}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <main className="oa-float-card space-y-4 p-5 lg:col-span-8">
            {!detail ? (
              <p className="py-8 text-center text-sm text-[var(--muted)]">Select a run to see its step timeline.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--tone-strong)]">{detail.title}</h2>
                    <p className="text-[11px] text-[var(--muted)]">
                      max {detail.maxAttempts} attempts · backoff {detail.backoffMs}ms ×2ⁿ
                      {detail.waitUntil && ` · waiting until ${new Date(detail.waitUntil).toLocaleTimeString()}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {detail.status === 'running' && (
                      <button onClick={() => act(() => sdk.durable.pause(detail.id), 'Paused')} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs">
                        <Pause size={13} /> Pause
                      </button>
                    )}
                    {(detail.status === 'paused' || detail.status === 'failed') && (
                      <button onClick={() => act(() => sdk.durable.resume(detail.id), 'Resumed')} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white">
                        <Play size={13} /> {detail.status === 'failed' ? 'Retry' : 'Resume'}
                      </button>
                    )}
                    {(detail.status === 'running' || detail.status === 'paused') && (
                      <button onClick={() => act(() => sdk.durable.cancel(detail.id), 'Cancelled')} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
                        <Square size={13} /> Cancel
                      </button>
                    )}
                    {detail.status !== 'running' && (
                      <button
                        onClick={() => act(async () => { await sdk.durable.remove(detail.id); setSelected(null) }, 'Deleted')}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                {detail.error && <p className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{detail.error}</p>}
                <ol className="space-y-2 border-l-2 border-[var(--border)] pl-4">
                  {detail.steps.map((s) => (
                    <li key={s.index} className="relative text-xs">
                      <span className={`absolute -left-[22px] top-1 h-3 w-3 rounded-full ${s.status === 'succeeded' ? 'bg-emerald-500' : s.status === 'failed' ? 'bg-rose-500' : s.status === 'running' ? 'animate-pulse bg-sky-500' : 'bg-slate-300'}`} />
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--tone-strong)]">
                          {s.index + 1}. {s.name}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase">{s.kind}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${STATUS_STYLE[s.status] ?? ''}`}>{s.status}</span>
                        {s.attempts.length > 1 && <span className="text-[var(--muted)]">{s.attempts.length} attempts</span>}
                      </div>
                      {s.output && <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-[11px]">{s.output}</pre>}
                      {s.error && <p className="mt-1 text-rose-700">{s.error}</p>}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
