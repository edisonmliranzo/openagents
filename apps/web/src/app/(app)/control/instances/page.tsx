'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { SessionRow } from '@openagents/shared'

interface InstanceHealthRow {
  id: string
  label: string
  status: 'ok' | 'warn'
  details: string
  updatedAt: string
}

function timeAgo(epochMs: number | null | undefined) {
  if (!epochMs) return 'n/a'
  const deltaMs = Date.now() - epochMs
  const deltaMin = Math.max(0, Math.floor(deltaMs / 60000))
  if (deltaMin < 1) return 'just now'
  if (deltaMin < 60) return `${deltaMin}m ago`
  const deltaHours = Math.floor(deltaMin / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`
  return `${Math.floor(deltaHours / 24)}d ago`
}

export default function InstancesPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [conversationCount, setConversationCount] = useState(0)
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [sessionsResult, conversations, approvals] = await Promise.all([
        sdk.sessions.list({ activeMinutes: 240, includeGlobal: true, includeUnknown: true, limit: 300 }),
        sdk.conversations.list(),
        sdk.approvals.list('pending'),
      ])
      setSessions(sessionsResult.sessions)
      setConversationCount(conversations.length)
      setPendingApprovals(approvals.length)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load instances')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const activeDirectSessions = useMemo(
    () => sessions.filter((session) => session.kind === 'direct'),
    [sessions],
  )

  const newestSessionUpdate = useMemo(
    () =>
      activeDirectSessions.reduce(
        (latest, row) => Math.max(latest, row.updatedAt ?? 0),
        0,
      ),
    [activeDirectSessions],
  )

  const instanceRows = useMemo<InstanceHealthRow[]>(() => {
    const nowIso = new Date().toISOString()
    return [
      {
        id: 'gateway-api',
        label: 'Gateway API',
        status: 'ok',
        details: `${sessions.length} session entries indexed`,
        updatedAt: nowIso,
      },
      {
        id: 'chat-runtime',
        label: 'Chat Runtime',
        status: activeDirectSessions.length > 0 ? 'ok' : 'warn',
        details: `${activeDirectSessions.length} direct sessions active`,
        updatedAt: newestSessionUpdate ? new Date(newestSessionUpdate).toISOString() : nowIso,
      },
      {
        id: 'approval-worker',
        label: 'Approval Worker',
        status: pendingApprovals > 10 ? 'warn' : 'ok',
        details:
          pendingApprovals > 0
            ? `${pendingApprovals} approvals pending action`
            : 'No approvals are waiting',
        updatedAt: nowIso,
      },
    ]
  }, [sessions.length, activeDirectSessions, pendingApprovals, newestSessionUpdate])

  const recentSessions = useMemo(
    () =>
      [...activeDirectSessions]
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 8),
    [activeDirectSessions],
  )

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Instances</h1>
          <p className="mt-1 text-sm text-slate-500">Runtime health and recent session instance activity.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Conversations</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{conversationCount}</p>
          <p className="mt-1 text-xs text-slate-500">Known user conversation threads</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active Sessions</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{activeDirectSessions.length}</p>
          <p className="mt-1 text-xs text-slate-500">Direct sessions with recent updates</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pending Approvals</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{pendingApprovals}</p>
          <p className="mt-1 text-xs text-slate-500">Tool actions requiring user confirmation</p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Service Status</h2>
          <p className="mt-1 text-sm text-slate-500">Core dashboard services and inferred health.</p>
          <div className="mt-4 space-y-3">
            {instanceRows.map((row) => (
              <div key={row.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{row.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.details}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      row.status === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {row.status === 'ok' ? 'healthy' : 'attention'}
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">Updated {timeAgo(new Date(row.updatedAt).getTime())}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Recent Session Instances</h2>
          <p className="mt-1 text-sm text-slate-500">Most recently updated direct sessions.</p>
          <div className="mt-4 space-y-2">
            {recentSessions.length === 0 && (
              <p className="text-sm text-slate-500">{isLoading ? 'Loading instances...' : 'No active sessions yet.'}</p>
            )}
            {recentSessions.map((session) => (
              <div key={session.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-semibold text-red-600">{session.key}</p>
                    <p className="mt-1 text-xs text-slate-500">{session.model ?? 'unknown model'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs text-slate-700">{session.totalTokens ?? 0} tk</p>
                    <p className="text-[11px] text-slate-400">{timeAgo(session.updatedAt)}</p>
                  </div>
                </div>
              </div>
            ))}
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
