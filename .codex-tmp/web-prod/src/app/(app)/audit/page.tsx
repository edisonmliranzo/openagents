'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { AuditLog } from '@openagents/shared'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const data = await sdk.audit.list()
      setLogs(data)
      setSelectedLogId((current) => current ?? data[0]?.id ?? null)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load audit log')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredLogs = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return logs
    return logs.filter((log) => {
      const haystack = [
        log.action,
        log.resourceType,
        log.resourceId,
        log.metadata ? JSON.stringify(log.metadata) : '',
      ].join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  }, [logs, query])

  const selectedLog = filteredLogs.find((log) => log.id === selectedLogId) ?? filteredLogs[0] ?? null

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Audit Log</h1>
          <p className="mt-1 text-sm text-slate-500">
            A record of all significant actions taken by you and your agents.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search action, resource, or metadata"
            className="h-10 min-w-[260px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
          />
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
            Showing {filteredLogs.length} of {logs.length} entries.
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                      {isLoading
                        ? 'Loading...'
                        : query
                          ? 'No audit entries matched that search.'
                          : 'No audit log entries yet.'}
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLogId(log.id)}
                      className={`cursor-pointer hover:bg-slate-50 ${
                        selectedLog?.id === log.id ? 'bg-slate-50' : ''
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {formatDate(log.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">
                        {log.action}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{log.resourceType}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {log.resourceId.slice(0, 12)}...
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {log.metadata ? JSON.stringify(log.metadata).slice(0, 90) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Entry Drilldown</h2>
          {!selectedLog ? (
            <p className="mt-3 text-sm text-slate-500">
              Select an audit entry to inspect its metadata and lineage context.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Action
                  </p>
                  <p className="mt-1 font-mono text-sm text-slate-800">{selectedLog.action}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Time
                  </p>
                  <p className="mt-1 text-sm text-slate-800">{formatDate(selectedLog.createdAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Resource type
                  </p>
                  <p className="mt-1 text-sm text-slate-800">{selectedLog.resourceType}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Resource ID
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-700">
                    {selectedLog.resourceId}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-slate-100">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Metadata JSON
                </p>
                <pre className="mt-3 overflow-x-auto text-[11px] leading-5">
                  {JSON.stringify(selectedLog.metadata ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}
