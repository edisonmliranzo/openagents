'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { KnowledgeGapRow } from '@openagents/sdk'
import { Activity, BrainCircuit, Gauge, GraduationCap, Sparkles } from 'lucide-react'
import clsx from 'clsx'

interface Intelligence {
  cache: { entries: number; totalHits: number }
  routing: Array<{ taskClass: string; model: string; samples: number; avgDurationMs: number; successRate: number }>
}

interface EvalResults {
  latest: Array<{ id: string; score: number; model: string | null; createdAt: string }>
  trend: Array<{ taskId: string; average: number; runs: number }>
}

export default function MindPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null)
  const [gaps, setGaps] = useState<KnowledgeGapRow[]>([])
  const [evals, setEvals] = useState<EvalResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [intel, gapRows, evalRows] = await Promise.all([
        sdk.client.get<Intelligence>('/api/v1/agent/intelligence'),
        sdk.study.gaps(),
        sdk.client.get<EvalResults>('/api/v1/eval/results'),
      ])
      setIntelligence(intel)
      setGaps(Array.isArray(gapRows) ? gapRows : [])
      setEvals(evalRows)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load mind state')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { void load() }, [load])

  async function studyNow() {
    setBusy('study')
    try {
      const res = await sdk.study.run()
      addToast('success', `Studied ${res.studied} of ${res.attempted} gaps.`)
      await load()
    } catch (err: any) {
      addToast('error', err?.message ?? 'Study run failed')
    } finally {
      setBusy(null)
    }
  }

  async function evalNow() {
    setBusy('eval')
    try {
      const res = await sdk.client.post<{ ran: number; averageScore: number | null }>('/api/v1/eval/run')
      addToast('success', res.averageScore != null ? `Eval average: ${res.averageScore}/10` : 'No golden tasks yet — add some to benchmark.')
      await load()
    } catch (err: any) {
      addToast('error', err?.message ?? 'Eval run failed')
    } finally {
      setBusy(null)
    }
  }

  const openGaps = gaps.filter((g) => g.status === 'open')
  const studiedGaps = gaps.filter((g) => g.status === 'studied')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="oa-gradient-text text-2xl font-semibold">Mind</h1>
          <p className="mt-1 text-sm text-slate-500">What your agent knows, how it routes, what it&apos;s learning.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void studyNow()}
            disabled={busy !== null || openGaps.length === 0}
            className="oa-send-button inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold"
          >
            <GraduationCap size={14} /> {busy === 'study' ? 'Studying…' : 'Study gaps now'}
          </button>
          <button
            type="button"
            onClick={() => void evalNow()}
            disabled={busy !== null}
            className="oa-soft-button inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold"
          >
            <Gauge size={14} /> {busy === 'eval' ? 'Running…' : 'Run benchmark'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="oa-card-elevated rounded-2xl p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Sparkles size={12} /> Instant answers
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{intelligence?.cache.totalHits ?? 0}</p>
          <p className="text-[11px] text-slate-400">cache hits · {intelligence?.cache.entries ?? 0} cached answers</p>
        </div>
        <div className="oa-card-elevated rounded-2xl p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <BrainCircuit size={12} /> Knowledge gaps
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{openGaps.length}</p>
          <p className="text-[11px] text-slate-400">{studiedGaps.length} studied &amp; saved to library</p>
        </div>
        <div className="oa-card-elevated rounded-2xl p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Activity size={12} /> Benchmark
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {evals && evals.trend.length > 0
              ? (evals.trend.reduce((sum, t) => sum + t.average, 0) / evals.trend.length).toFixed(1)
              : '—'}
            <span className="text-sm font-normal text-slate-400"> /10</span>
          </p>
          <p className="text-[11px] text-slate-400">{evals?.trend.length ?? 0} golden tasks tracked</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="oa-card-elevated rounded-2xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Learned routing — what works best for you</p>
          <div className="mt-3 space-y-2">
            {(intelligence?.routing ?? []).length === 0 && (
              <p className="text-[13px] text-slate-400">No routing data yet — chat a bit and the agent starts tracking which models win per task type.</p>
            )}
            {(intelligence?.routing ?? []).slice(0, 8).map((row) => (
              <div key={`${row.taskClass}-${row.model}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2 dark:border-[#232837] dark:bg-[#141824]">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-slate-700 dark:text-slate-200">{row.model}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">{row.taskClass} · {row.samples} runs · {(row.avgDurationMs / 1000).toFixed(1)}s avg</p>
                </div>
                <span className={clsx(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  row.successRate >= 0.8 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : row.successRate >= 0.5 ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300'
                      : 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
                )}>
                  {(row.successRate * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="oa-card-elevated rounded-2xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Things it&apos;s figuring out</p>
          <div className="mt-3 space-y-2">
            {gaps.length === 0 && (
              <p className="text-[13px] text-slate-400">No knowledge gaps detected. It notices when answers fail and queues them for study.</p>
            )}
            {gaps.slice(0, 8).map((gap) => (
              <div key={gap.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2 dark:border-[#232837] dark:bg-[#141824]">
                <p className="min-w-0 truncate text-[12px] text-slate-700 dark:text-slate-200">{gap.label}</p>
                <span className={clsx(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
                  gap.status === 'studied' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : gap.status === 'studying' ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-[#232837] dark:text-slate-300',
                )}>
                  {gap.status} ×{gap.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">Refreshing…</p>}
    </div>
  )
}
