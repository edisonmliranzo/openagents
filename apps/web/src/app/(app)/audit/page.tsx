'use client'

import { useCallback, useEffect, useState } from 'react'
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
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const data = await sdk.audit.list()
      setLogs(data)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load audit log')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Audit Log</h1>
          <p className="mt-1 text-sm text-slate-500">A record of all significant actions taken by you and your agents.</p>
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

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    {isLoading ? 'Loading...' : 'No audit log entries yet.'}
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(log.createdAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">{log.action}</td>
                    <td className="px-4 py-3 text-slate-700">{log.resourceType}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{log.resourceId.slice(0, 12)}…</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {log.metadata ? JSON.stringify(log.metadata).slice(0, 60) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
