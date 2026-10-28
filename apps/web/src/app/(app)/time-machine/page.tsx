'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  GitCommit,
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import type {
  ContradictionAlert,
  TemporalEventNode,
  TimeMachineState,
} from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

const SAMPLE_QUESTIONS = [
  'What changed in our streaming & pre-plan architecture today?',
  'What is our current public visitor lock policy on https://openagents.us/?',
  'Which Frontier DNA engines were added and what contradictions were flagged?',
]

export default function TimeMachinePage() {
  const addToast = useUIStore((s) => s.addToast)
  const [state, setState] = useState<TimeMachineState | null>(null)
  const [loading, setLoading] = useState(false)
  const [querying, setQuerying] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const [question, setQuestion] = useState(SAMPLE_QUESTIONS[0])
  const [asOfFilter, setAsOfFilter] = useState<string>('ALL')
  const [sourceFilter, setSourceFilter] = useState<'all' | TemporalEventNode['source']>('all')

  const loadState = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sdk.agenticSuite.getTimeMachineState()
      setState(res)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load Time-Machine state')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadState()
  }, [loadState])

  async function handleQuery(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) {
      addToast('warning', 'Enter a temporal query first')
      return
    }
    setQuerying(true)
    try {
      const promptWithWindow =
        asOfFilter === 'ALL'
          ? question.trim()
          : `[As of ${asOfFilter}] ${question.trim()}`
      const res = await sdk.agenticSuite.queryTimeMachine({ question: promptWithWindow })
      setState(res)
      addToast('success', 'Synthesized temporal ledger answer')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Temporal query failed')
    } finally {
      setQuerying(false)
    }
  }

  async function handleResolveContradiction(alertId: string) {
    setResolvingId(alertId)
    try {
      const res = await sdk.agenticSuite.resolveContradiction(alertId)
      setState(res)
      addToast('success', 'Contradiction resolved and policy superseded')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to resolve contradiction')
    } finally {
      setResolvingId(null)
    }
  }

  const events: TemporalEventNode[] = state?.events ?? []
  const contradictions: ContradictionAlert[] = state?.contradictions ?? []
  const openContradictionsCount = contradictions.filter((c) => !c.resolved).length

  const filteredEvents = events.filter((ev) => {
    if (sourceFilter !== 'all' && ev.source !== sourceFilter) return false
    return true
  })

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              OpenAgents Knowledge Time-Machine &amp; Contradiction Detector
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Temporal git/memory/decision ledger with point-in-time state queries and automated policy contradiction alerts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
            {openContradictionsCount} Active Contradiction{openContradictionsCount === 1 ? '' : 's'}
          </span>
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-400">
            {events.length} Temporal Snapshot{events.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => void loadState()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* Temporal Query Bar & Point-in-Time Picker */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Point-in-Time Knowledge Query (&ldquo;What did we know or decide as of date X?&rdquo;)
            </h2>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-500 dark:text-slate-400">Temporal Window:</span>
            {(['ALL', 'Today', '3 days ago', 'Last week'] as const).map((windowLabel) => (
              <button
                key={windowLabel}
                type="button"
                onClick={() => setAsOfFilter(windowLabel)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  asOfFilter === windowLabel
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {windowLabel}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleQuery} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask what changed, why a decision was made, or check if a new rule contradicts past commits..."
            className="h-10 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={querying || !question.trim()}
            className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-5 text-xs font-semibold text-white hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50"
          >
            {querying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Query Time-Machine
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {SAMPLE_QUESTIONS.map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => setQuestion(sample)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 hover:border-indigo-400 hover:text-indigo-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400 dark:hover:border-indigo-500/50 dark:hover:text-indigo-300"
            >
              {sample}
            </button>
          ))}
        </div>

        {state?.lastQueryAnswer && (
          <div className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
            <div className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-400">
              <Sparkles className="h-3.5 w-3.5" />
              Temporal Synthesis Result ({asOfFilter})
            </div>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800 dark:text-slate-200">
              {state.lastQueryAnswer}
            </p>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Contradiction Detector */}
        <div className="space-y-4 lg:col-span-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Policy &amp; Decision Contradiction Detector ({contradictions.length})
                </h2>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Flags conflicting instructions across sessions
              </span>
            </div>

            <div className="space-y-3">
              {contradictions.map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-xl border p-4 transition ${
                    alert.resolved
                      ? 'border-emerald-500/25 bg-emerald-500/5'
                      : alert.severity === 'high'
                        ? 'border-rose-500/35 bg-rose-500/5'
                        : 'border-amber-500/35 bg-amber-500/5'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          alert.resolved
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : alert.severity === 'high'
                              ? 'bg-rose-500/20 text-rose-400'
                              : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {alert.resolved ? 'Resolved' : `${alert.severity} Contradiction`}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">#{alert.id}</span>
                    </div>

                    {!alert.resolved ? (
                      <button
                        type="button"
                        onClick={() => void handleResolveContradiction(alert.id)}
                        disabled={resolvingId === alert.id}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {resolvingId === alert.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Mark Resolved
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Superseded
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200/80 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-950/70">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Earlier Statement ({alert.earlierDate})
                      </div>
                      <p className="mt-1 text-xs text-slate-600 line-through dark:text-slate-400">
                        {alert.earlierStatement}
                      </p>
                    </div>

                    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                        Newer Statement ({alert.newerDate})
                      </div>
                      <p className="mt-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                        {alert.newerStatement}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-100/80 p-2.5 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <div>
                      <span className="font-semibold">Recommended Resolution: </span>
                      {alert.resolutionSuggestion}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right: Chronological Knowledge & Commit Timeline */}
        <div className="space-y-4 lg:col-span-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <GitCommit className="h-4 w-4 text-indigo-400" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Chronological Event &amp; Decision Ledger ({filteredEvents.length})
                </h2>
              </div>

              <div className="flex flex-wrap gap-1">
                {(['all', 'commit', 'decision', 'goal', 'memory'] as const).map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setSourceFilter(src)}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${
                      sourceFilter === src
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {src}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative space-y-4 before:absolute before:bottom-2 before:left-3 before:top-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
              {filteredEvents.map((ev) => (
                <div key={ev.id} className="relative pl-8">
                  <span className="absolute left-1.5 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-indigo-400 bg-slate-950" />
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded bg-indigo-500/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-indigo-400">
                        {ev.source}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {new Date(ev.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                      {ev.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {ev.summary}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
