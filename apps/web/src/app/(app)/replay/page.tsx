'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Cpu,
  History,
  Play,
  ShieldAlert,
  Terminal,
  Wrench,
} from 'lucide-react'

type ReplayStepKind = 'user' | 'agent' | 'system' | 'tool_call' | 'tool_result' | 'approval' | 'metric' | 'error'

interface ReplayRunSummary {
  id: string
  conversationId: string
  conversationTitle: string | null
  status: string
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  error: string | null
}

interface ReplayStep {
  index: number
  at: string
  offsetMs: number
  kind: ReplayStepKind
  title: string
  content?: string
  toolName?: string
  input?: unknown
  output?: unknown
  status?: string
  screenshot?: string
  tokens?: number
  costUsd?: number
  durationMs?: number
}

interface ReplayRunDetail {
  run: ReplayRunSummary & { model: string | null; provider: string | null; metadata: unknown }
  totals: { steps: number; toolCalls: number; approvals: number; tokens: number; costUsd: number; durationMs: number }
  steps: ReplayStep[]
}

const KIND_STYLE: Record<ReplayStepKind, string> = {
  user: 'bg-sky-100 text-sky-800',
  agent: 'bg-emerald-100 text-emerald-800',
  system: 'bg-slate-200 text-slate-700',
  tool_call: 'bg-indigo-100 text-indigo-800',
  tool_result: 'bg-violet-100 text-violet-800',
  approval: 'bg-amber-100 text-amber-800',
  metric: 'bg-teal-100 text-teal-800',
  error: 'bg-rose-100 text-rose-800',
}

export default function ReplayPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [runs, setRuns] = useState<ReplayRunSummary[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ReplayRunDetail | null>(null)
  const [cursor, setCursor] = useState<number>(0)

  const loadRuns = useCallback(async () => {
    try {
      const list = await sdk.client.get<ReplayRunSummary[]>('/api/v1/replay/runs?limit=50')
      setRuns(list)
      if (!selectedRunId && list.length > 0) setSelectedRunId(list[0].id)
    } catch (e: any) {
      addToast('error', e?.message ?? 'Failed to load runs')
    }
  }, [addToast, selectedRunId])

  const loadRunDetail = useCallback(
    async (id: string) => {
      try {
        const d = await sdk.client.get<ReplayRunDetail>(`/api/v1/replay/runs/${encodeURIComponent(id)}`)
        setDetail(d)
        setCursor(0)
      } catch (e: any) {
        addToast('error', e?.message ?? 'Failed to load replay')
      }
    },
    [addToast],
  )

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  useEffect(() => {
    if (selectedRunId) void loadRunDetail(selectedRunId)
  }, [selectedRunId, loadRunDetail])

  const steps = detail?.steps ?? []
  const currentStep = steps[cursor] ?? null

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4 pb-24">
        <header className="oa-float-card flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <History size={18} />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Agent Sandbox Time-Travel Replay</h1>
              <p className="text-xs text-[var(--muted)]">
                Scrub step-by-step through agent executions: inspect tool inputs/outputs, approval gates, token usage, and latency.
              </p>
            </div>
          </div>

          {detail && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 font-medium text-[var(--tone-strong)]">
                <Wrench size={13} /> {detail.totals.toolCalls} tools
              </span>
              <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 font-medium text-[var(--tone-strong)]">
                <ShieldAlert size={13} /> {detail.totals.approvals} approvals
              </span>
              <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 font-medium text-[var(--tone-strong)]">
                <Cpu size={13} /> {detail.totals.tokens.toLocaleString()} tok
              </span>
              <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 font-medium text-[var(--tone-strong)]">
                <Coins size={13} /> ${detail.totals.costUsd.toFixed(4)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 font-medium text-[var(--tone-strong)]">
                <Clock size={13} /> {(detail.totals.durationMs / 1000).toFixed(1)}s
              </span>
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <aside className="oa-float-card max-h-[600px] overflow-y-auto p-4 lg:col-span-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Recent Agent Runs ({runs.length})
            </h2>
            {runs.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No agent runs recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {runs.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelectedRunId(r.id)}
                      className={`w-full rounded-xl border p-3 text-left text-xs transition ${
                        selectedRunId === r.id
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-[var(--border)] bg-white/75 text-[var(--tone-strong)] hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">
                          {r.conversationTitle || `Run ${r.id.slice(0, 8)}`}
                        </span>
                        <span className="rounded px-1.5 py-0.5 text-[10px] uppercase opacity-80">{r.status}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] opacity-75">
                        <span>{new Date(r.startedAt).toLocaleString()}</span>
                        {r.durationMs != null && <span>{(r.durationMs / 1000).toFixed(1)}s</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <main className="space-y-4 lg:col-span-8">
            {!detail || steps.length === 0 ? (
              <div className="oa-float-card p-8 text-center text-sm text-[var(--muted)]">
                Select a run on the left to inspect its interactive timeline.
              </div>
            ) : (
              <>
                <section className="oa-float-card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCursor((c) => Math.max(0, c - 1))}
                        disabled={cursor <= 0}
                        className="rounded-lg border border-[var(--border)] bg-white p-1.5 disabled:opacity-40"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        onClick={() => setCursor((c) => Math.min(steps.length - 1, c + 1))}
                        disabled={cursor >= steps.length - 1}
                        className="rounded-lg border border-[var(--border)] bg-white p-1.5 disabled:opacity-40"
                      >
                        <ChevronRight size={16} />
                      </button>
                      <span className="text-xs font-semibold text-[var(--tone-strong)]">
                        Step {cursor + 1} of {steps.length}
                      </span>
                    </div>
                    {currentStep && (
                      <span className="text-xs text-[var(--muted)]">+{currentStep.offsetMs}ms from start</span>
                    )}
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, steps.length - 1)}
                    value={cursor}
                    onChange={(e) => setCursor(Number(e.target.value))}
                    className="mt-3 w-full accent-slate-900"
                  />

                  <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
                    {steps.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCursor(idx)}
                        className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                          idx === cursor ? 'bg-slate-900 text-white' : KIND_STYLE[s.kind] ?? 'bg-slate-100'
                        }`}
                      >
                        {idx + 1}. {s.kind}
                      </button>
                    ))}
                  </div>
                </section>

                {currentStep && (
                  <section className="oa-float-card space-y-3 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${KIND_STYLE[currentStep.kind]}`}>
                          {currentStep.kind}
                        </span>
                        <h3 className="text-sm font-semibold text-[var(--tone-strong)]">{currentStep.title}</h3>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                        {currentStep.durationMs != null && <span>{currentStep.durationMs}ms</span>}
                        {currentStep.tokens != null && <span>{currentStep.tokens} tokens</span>}
                        {currentStep.costUsd != null && <span>${currentStep.costUsd.toFixed(5)}</span>}
                      </div>
                    </div>

                    {currentStep.content && (
                      <div className="whitespace-pre-wrap rounded-xl bg-white/80 p-3.5 text-xs leading-relaxed text-[var(--tone-strong)]">
                        {currentStep.content}
                      </div>
                    )}

                    {currentStep.input !== undefined && (
                      <div>
                        <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase text-[var(--muted)]">
                          <Play size={11} /> Tool / Step Input
                        </div>
                        <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-3 font-mono text-xs text-slate-100">
                          {typeof currentStep.input === 'string'
                            ? currentStep.input
                            : JSON.stringify(currentStep.input, null, 2)}
                        </pre>
                      </div>
                    )}

                    {currentStep.output !== undefined && (
                      <div>
                        <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase text-[var(--muted)]">
                          <Terminal size={11} /> Tool / Step Output
                        </div>
                        <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 font-mono text-xs text-emerald-300">
                          {typeof currentStep.output === 'string'
                            ? currentStep.output
                            : JSON.stringify(currentStep.output, null, 2)}
                        </pre>
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
