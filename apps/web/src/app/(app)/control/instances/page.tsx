'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { PlatformFleetSnapshot } from '@openagents/shared'

function statusClass(status: 'healthy' | 'degraded' | 'offline') {
  if (status === 'healthy') return 'bg-emerald-100 text-emerald-700'
  if (status === 'degraded') return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-700'
}

export default function InstancesPage() {
  const [snapshot, setSnapshot] = useState<PlatformFleetSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const result = await sdk.platform.fleet()
      setSnapshot(result)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load fleet snapshot')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Managed Runtime Fleet</h1>
          <p className="mt-1 text-sm text-slate-500">Health status for API, runtime, scheduler, channels, and control plane.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nodes</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{snapshot?.summary.nodes ?? 0}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Healthy</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-700">{snapshot?.summary.healthy ?? 0}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Degraded</p>
          <p className="mt-2 text-3xl font-semibold text-amber-700">{snapshot?.summary.degraded ?? 0}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Offline</p>
          <p className="mt-2 text-3xl font-semibold text-red-700">{snapshot?.summary.offline ?? 0}</p>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active Sessions</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{snapshot?.summary.activeSessions ?? 0}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pending Approvals</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{snapshot?.summary.pendingApprovals ?? 0}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Stale Cron Jobs</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{snapshot?.summary.staleCronJobs ?? 0}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Failing Cron Jobs</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{snapshot?.summary.failingCronJobs ?? 0}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Node Status</h2>
        <div className="mt-4 space-y-3">
          {(snapshot?.nodes ?? []).map((node) => (
            <article key={node.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{node.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{node.details}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{new Date(node.updatedAt).toLocaleString()}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(node.status)}`}>
                  {node.status}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(node.metrics).map(([key, value]) => (
                  <span key={key} className="rounded bg-white px-2 py-1 font-mono text-[10px] text-slate-600">
                    {key}: {value === null ? 'n/a' : String(value)}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}

