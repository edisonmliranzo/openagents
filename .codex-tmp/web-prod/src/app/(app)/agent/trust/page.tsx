'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { CronHealthSummary, NanobotTrustSnapshot } from '@openagents/shared'

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-700 bg-emerald-100'
  if (score >= 60) return 'text-amber-700 bg-amber-100'
  return 'text-red-700 bg-red-100'
}

function usd(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export default function TrustPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [snapshot, setSnapshot] = useState<NanobotTrustSnapshot | null>(null)
  const [cronHealth, setCronHealth] = useState<CronHealthSummary | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [trust, health] = await Promise.all([
        sdk.nanobot.trust(),
        sdk.nanobot.cronHealth(),
      ])
      setSnapshot(trust)
      setCronHealth(health)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load trust dashboard')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSelfHeal() {
    setIsRunning(true)
    setError('')
    try {
      const report = await sdk.nanobot.cronSelfHeal()
      await load()
      addToast('success', `Self-heal: ${report.healedCount} healed, ${report.skippedCount} skipped`)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to run self-heal')
      addToast('error', err?.message ?? 'Failed to run self-heal')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Trust Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Autonomy, memory, tool reliability, safety, and cost confidence in one view.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => void handleSelfHeal()}
            disabled={isRunning}
            className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
          >
            {isRunning ? 'Running...' : 'Run Self-heal'}
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Overall Trust</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{snapshot?.overallScore ?? 0}</p>
          <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${scoreColor(snapshot?.overallScore ?? 0)}`}>
            score / 100
          </span>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tool Success</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {Math.round((snapshot?.tools.successRate ?? 0) * 100)}%
          </p>
          <p className="mt-1 text-xs text-slate-500">{snapshot?.tools.totalCalls ?? 0} calls in 30d</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Estimated 30d Cost</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{usd(snapshot?.cost.estimated30dUsd ?? 0)}</p>
          <p className="mt-1 text-xs text-slate-500">daily avg {usd(snapshot?.cost.avgDailyUsd ?? 0)}</p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Trust Signals</h2>
          <div className="mt-3 space-y-2">
            {snapshot && (
              <>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Autonomy</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${scoreColor(snapshot.autonomy.score)}`}>
                      {snapshot.autonomy.score}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{snapshot.autonomy.rationale}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Memory</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${scoreColor(snapshot.memory.score)}`}>
                      {snapshot.memory.score}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{snapshot.memory.rationale}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    present: {snapshot.memory.presentFiles.join(', ') || '(none)'}
                  </p>
                  {snapshot.memory.missingFiles.length > 0 && (
                    <p className="text-[11px] text-red-600">
                      missing: {snapshot.memory.missingFiles.join(', ')}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Safety</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${scoreColor(snapshot.safety.score)}`}>
                      {snapshot.safety.score}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{snapshot.safety.rationale}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    pending approvals: {snapshot.safety.pendingApprovals} | failed runs 24h: {snapshot.safety.failedRuns24h}
                  </p>
                </div>
              </>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Cron Health</h2>
          <p className="mt-1 text-sm text-slate-500">Self-healing monitors stale and failing jobs with retries/backoff.</p>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-600">
              Jobs: {cronHealth?.totals.jobs ?? 0} | Enabled: {cronHealth?.totals.enabledJobs ?? 0}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Stale: {cronHealth?.totals.staleJobs ?? 0} | Failing: {cronHealth?.totals.failingJobs ?? 0}
            </p>
          </div>

          <div className="mt-3 space-y-2">
            {(cronHealth?.failingJobs ?? []).slice(0, 6).map((job) => (
              <div key={job.jobId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">{job.name}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  failures: {job.consecutiveFailures} | retry due: {job.retryDueAt ?? 'now'}
                </p>
              </div>
            ))}
            {(cronHealth?.failingJobs.length ?? 0) === 0 && (
              <p className="text-sm text-slate-500">No failing jobs detected.</p>
            )}
          </div>
        </article>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}

