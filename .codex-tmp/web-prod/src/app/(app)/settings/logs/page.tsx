'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { AuditLog } from '@openagents/shared'

function matchesFilter(entry: AuditLog, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    entry.action.toLowerCase().includes(q) ||
    entry.resourceType.toLowerCase().includes(q) ||
    entry.resourceId.toLowerCase().includes(q) ||
    JSON.stringify(entry.metadata ?? {}).toLowerCase().includes(q)
  )
}

export default function LogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const loadLogs = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const next = await sdk.audit.list()
      setLogs(next)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load logs')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  const filtered = useMemo(() => logs.filter((entry) => matchesFilter(entry, query)), [logs, query])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Logs</h1>
          <p className="mt-1 text-sm text-slate-500">Audit trail of user actions and resource updates.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadLogs()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by action, resource, or metadata..."
            className="h-10 w-full max-w-[420px] rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
          />
          <span className="text-xs text-slate-500">
            Showing {filtered.length} of {logs.length} entries
          </span>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Resource</th>
                <th className="px-4 py-3">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    {isLoading ? 'Loading logs...' : 'No log entries found.'}
                  </td>
                </tr>
              )}
              {filtered.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{entry.action}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {entry.resourceType}:{entry.resourceId}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <pre className="max-h-20 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">
                      {JSON.stringify(entry.metadata ?? {}, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
