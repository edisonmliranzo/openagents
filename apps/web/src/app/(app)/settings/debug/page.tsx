'use client'

import { sdk } from '@/stores/auth'
import { useCallback, useEffect, useState } from 'react'
import type { AuditLog, Notification, User, UserSettings } from '@openagents/shared'

interface DebugState {
  profile: User | null
  settings: UserSettings | null
  notifications: Notification[]
  audit: AuditLog[]
}

export default function DebugPage() {
  const [state, setState] = useState<DebugState>({
    profile: null,
    settings: null,
    notifications: [],
    audit: [],
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const loadDebugData = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [profile, settings, notifications, audit] = await Promise.all([
        sdk.users.getProfile(),
        sdk.users.getSettings(),
        sdk.notifications.list(),
        sdk.audit.list(),
      ])
      setState({ profile, settings, notifications, audit })
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load debug payload')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDebugData()
  }, [loadDebugData])

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Debug</h1>
          <p className="mt-1 text-sm text-slate-500">Raw user-scoped state for troubleshooting.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadDebugData()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notifications</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{state.notifications.length}</p>
          <p className="mt-1 text-xs text-slate-500">Unread {state.notifications.filter((n) => !n.read).length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Audit Entries</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{state.audit.length}</p>
          <p className="mt-1 text-xs text-slate-500">Latest action {state.audit[0]?.action ?? 'n/a'}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Profile</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{state.profile?.email ?? 'n/a'}</p>
          <p className="mt-1 text-xs text-slate-500">{state.profile?.role ?? 'unknown role'}</p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">User Snapshot</h2>
          <pre className="mt-3 max-h-[360px] overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
            {JSON.stringify({ profile: state.profile, settings: state.settings }, null, 2)}
          </pre>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
          <pre className="mt-3 max-h-[360px] overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
            {JSON.stringify(state.notifications, null, 2)}
          </pre>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Audit Log</h2>
        <pre className="mt-3 max-h-[360px] overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
          {JSON.stringify(state.audit, null, 2)}
        </pre>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
