'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type {
  MissionControlEvent,
  MissionControlEventStatus,
  MissionControlEventType,
} from '@openagents/shared'

const TYPE_OPTIONS: MissionControlEventType[] = [
  'run',
  'tool_call',
  'approval',
  'workflow_run',
  'playbook_run',
  'version_change',
  'failure',
]

const STATUS_OPTIONS: MissionControlEventStatus[] = [
  'started',
  'success',
  'failed',
  'pending',
  'approved',
  'denied',
  'info',
]

function formatRelative(iso: string) {
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return 'n/a'
  const delta = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (delta < 60) return `${delta}s ago`
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  if (delta < 86_400) return `${Math.floor(delta / 3600)}h ago`
  return `${Math.floor(delta / 86_400)}d ago`
}

function statusClass(status: MissionControlEventStatus) {
  if (status === 'success' || status === 'approved') return 'bg-emerald-100 text-emerald-700'
  if (status === 'failed' || status === 'denied') return 'bg-red-100 text-red-700'
  if (status === 'pending' || status === 'started') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-700'
}

function typeClass(type: MissionControlEventType) {
  if (type === 'failure') return 'bg-red-100 text-red-700'
  if (type === 'version_change') return 'bg-violet-100 text-violet-700'
  if (type === 'playbook_run') return 'bg-cyan-100 text-cyan-700'
  if (type === 'workflow_run') return 'bg-indigo-100 text-indigo-700'
  return 'bg-slate-100 text-slate-700'
}

function mergeEvents(base: MissionControlEvent[], incoming: MissionControlEvent[]) {
  const byId = new Map<string, MissionControlEvent>()
  for (const event of [...base, ...incoming]) byId.set(event.id, event)
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export default function MissionControlPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [events, setEvents] = useState<MissionControlEvent[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<MissionControlEventType[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<MissionControlEventStatus[]>([])
  const [sourceFilter, setSourceFilter] = useState('')
  const [limit, setLimit] = useState(60)
  const [isAutoRefresh, setIsAutoRefresh] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState('')

  const fetchLatest = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    setError('')
    try {
      const result = await sdk.missionControl.listEvents({
        limit,
        types: selectedTypes,
        statuses: selectedStatuses,
        source: sourceFilter.trim() || undefined,
      })
      setEvents(result.events)
      setNextCursor(result.nextCursor)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load mission control events'
      setError(message)
      if (!silent) addToast('error', message)
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [addToast, limit, selectedStatuses, selectedTypes, sourceFilter])

  useEffect(() => {
    void fetchLatest()
  }, [fetchLatest])

  useEffect(() => {
    if (!isAutoRefresh) return
    const id = window.setInterval(() => {
      void fetchLatest(true)
    }, 5000)
    return () => window.clearInterval(id)
  }, [fetchLatest, isAutoRefresh])

  async function loadMore() {
    if (!nextCursor) return
    setIsLoadingMore(true)
    setError('')
    try {
      const result = await sdk.missionControl.listEvents({
        limit,
        cursor: nextCursor,
        types: selectedTypes,
        statuses: selectedStatuses,
        source: sourceFilter.trim() || undefined,
      })
      setEvents((prev) => mergeEvents(prev, result.events))
      setNextCursor(result.nextCursor)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load more events'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoadingMore(false)
    }
  }

  function toggleType(type: MissionControlEventType) {
    setSelectedTypes((prev) => (
      prev.includes(type)
        ? prev.filter((entry) => entry !== type)
        : [...prev, type]
    ))
  }

  function toggleStatus(status: MissionControlEventStatus) {
    setSelectedStatuses((prev) => (
      prev.includes(status)
        ? prev.filter((entry) => entry !== status)
        : [...prev, status]
    ))
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Mission Control Timeline</h1>
          <p className="mt-1 text-sm text-slate-500">
            Unified event feed for runs, approvals, version changes, and failures.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={isAutoRefresh}
              onChange={(event) => setIsAutoRefresh(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-200"
            />
            Auto refresh
          </label>
          <button
            type="button"
            onClick={() => void fetchLatest()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Types</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((type) => {
                const active = selectedTypes.includes(type)
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleType(type)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      active
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {type}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Statuses</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((status) => {
                const active = selectedStatuses.includes(status)
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleStatus(status)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      active
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {status}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <label className="text-xs font-medium text-slate-500">
              Source contains
              <input
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
                placeholder="workflow, playbook, agent-versions..."
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <label className="text-xs font-medium text-slate-500">
              Page size
              <input
                type="number"
                min={10}
                max={200}
                value={limit}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value || '60', 10)
                  setLimit(Number.isFinite(parsed) ? Math.max(10, Math.min(parsed, 200)) : 60)
                }}
                className="mt-1 h-10 w-28 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <button
              type="button"
              onClick={() => {
                setSelectedTypes([])
                setSelectedStatuses([])
                setSourceFilter('')
              }}
              className="mt-[18px] h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Clear filters
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Timeline</h2>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {events.length} events
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {events.length === 0 && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
              No events found for current filters.
            </p>
          )}

          {events.map((event) => (
            <article key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${typeClass(event.type)}`}>
                    {event.type}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(event.status)}`}>
                    {event.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <Activity size={12} />
                  {formatRelative(event.createdAt)} ({new Date(event.createdAt).toLocaleString()})
                </div>
              </div>

              <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                <p>source: <span className="font-mono text-slate-700">{event.source}</span></p>
                <p>id: <span className="font-mono text-slate-700">{event.id}</span></p>
                <p>run: <span className="font-mono text-slate-700">{event.runId ?? '-'}</span></p>
                <p>conversation: <span className="font-mono text-slate-700">{event.conversationId ?? '-'}</span></p>
              </div>

              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">payload</summary>
                <pre className="mt-2 overflow-x-auto rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-600">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </details>
            </article>
          ))}
        </div>

        {nextCursor && (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={isLoadingMore}
            className="mt-3 inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {isLoadingMore ? 'Loading...' : 'Load more'}
          </button>
        )}
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
