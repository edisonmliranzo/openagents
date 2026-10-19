'use client'

import { useCallback, useEffect, useState } from 'react'
import { History, RefreshCw, RotateCcw, Search, X } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

type AuditLogRecord = Awaited<ReturnType<typeof sdk.audit.list>>[number]

export default function AuditPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [logs, setLogs] = useState<AuditLogRecord[]>([])
  const [action, setAction] = useState('')
  const [tool, setTool] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selected, setSelected] = useState<AuditLogRecord | null>(null)
  const [undoingId, setUndoingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await sdk.audit.list({
        action: action.trim() || undefined,
        tool: tool.trim() || undefined,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        limit: 200,
      })
      setLogs(rows)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load audit log')
    } finally {
      setIsLoading(false)
    }
  }, [action, tool, from, to, addToast])

  useEffect(() => {
    void load()
    // Load once on mount; filters apply on submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleUndo(log: AuditLogRecord) {
    setUndoingId(log.id)
    try {
      const result = await sdk.audit.undo(log.id)
      if (result.ok) {
        addToast('success', 'Action undone')
        await load()
        setSelected(null)
      } else {
        addToast('error', result.reversible ? `Cannot undo: ${result.message}` : 'This action is not reversible')
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Undo failed')
    } finally {
      setUndoingId(null)
    }
  }

  const ts = (log: AuditLogRecord) => new Date(log.createdAt ?? log.timestamp ?? Date.now())

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <header className="flex items-center gap-3">
        <History className="h-5 w-5 text-slate-600" />
        <div className="mr-auto">
          <h1 className="text-lg font-semibold text-slate-900">Audit Log</h1>
          <p className="text-xs text-slate-500">Everything OpenAgents did on your behalf. Reversible actions can be undone.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void load()
        }}
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
      >
        <Field label="Action">
          <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. memory_delete" className={inputCls} />
        </Field>
        <Field label="Tool / resource">
          <input value={tool} onChange={(e) => setTool(e.target.value)} placeholder="e.g. web_search" className={inputCls} />
        </Field>
        <Field label="From">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </Field>
        <Field label="To">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </Field>
        <button type="submit" className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
          <Search className="h-3.5 w-3.5" /> Apply
        </button>
        {(action || tool || from || to) && (
          <button
            type="button"
            onClick={() => {
              setAction('')
              setTool('')
              setFrom('')
              setTo('')
            }}
            className="text-xs text-slate-500 hover:underline"
          >
            Clear
          </button>
        )}
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {logs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">{isLoading ? 'Loading...' : 'No audit entries found.'}</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Resource</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} onClick={() => setSelected(log)} className="cursor-pointer hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{ts(log).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-800">{log.action}</td>
                  <td className="max-w-[260px] truncate px-4 py-2 text-xs text-slate-600">
                    {log.resourceType}{log.resourceId ? `:${log.resourceId}` : ''}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {log.undoneAt ? (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">undone</span>
                    ) : log.reversible ? (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">reversible</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {log.reversible && (
                      <button
                        type="button"
                        disabled={undoingId === log.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleUndo(log)
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                      >
                        <RotateCcw className="h-3 w-3" /> Undo
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={() => setSelected(null)}>
          <aside
            className="flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="mr-auto font-mono text-sm font-semibold text-slate-900">{selected.action}</h2>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="rounded p-1 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-auto p-4 text-sm">
              <Detail label="Time" value={ts(selected).toLocaleString()} />
              <Detail label="Resource" value={`${selected.resourceType}${selected.resourceId ? `:${selected.resourceId}` : ''}`} />
              {selected.category && <Detail label="Category" value={selected.category} />}
              {selected.severity && <Detail label="Severity" value={selected.severity} />}
              {selected.description && <Detail label="Description" value={selected.description} />}
              {selected.undoneAt && <Detail label="Undone at" value={new Date(selected.undoneAt).toLocaleString()} />}
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Metadata</p>
                <pre className="max-h-[50vh] overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                  {JSON.stringify(selected.metadata ?? {}, null, 2)}
                </pre>
              </div>
            </div>
            <div className="border-t border-slate-100 p-4">
              {selected.reversible ? (
                <button
                  type="button"
                  disabled={undoingId === selected.id}
                  onClick={() => void handleUndo(selected)}
                  className="flex w-full items-center justify-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
                >
                  <RotateCcw className="h-4 w-4" /> Undo this action
                </button>
              ) : (
                <p className="text-center text-xs text-slate-500">{selected.undoneAt ? 'Already undone.' : 'This action is not reversible.'}</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

const inputCls = 'rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500">
      {label}
      {children}
    </label>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="break-words text-slate-800">{value}</p>
    </div>
  )
}
