'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { Approval, ApprovalStatus } from '@openagents/shared'
import { useUIStore } from '@/stores/ui'
import { ShieldAlert } from 'lucide-react'

const STATUS_COLORS: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  denied: 'bg-red-100 text-red-700',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

type ApprovalRiskLevel = 'low' | 'medium' | 'high'

function riskClass(level?: ApprovalRiskLevel) {
  if (level === 'high') return 'bg-red-100 text-red-700'
  if (level === 'medium') return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

function renderValue(value: unknown) {
  if (value == null) return 'null'
  if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 120)}...` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    const serialized = JSON.stringify(value)
    return serialized.length > 120 ? `${serialized.slice(0, 120)}...` : serialized
  } catch {
    return String(value).slice(0, 120)
  }
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [filter, setFilter] = useState<'all' | ApprovalStatus>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const addToast = useUIStore((s) => s.addToast)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const status = filter === 'all' ? undefined : filter
      const data = await sdk.approvals.list(status)
      setApprovals(data)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load approvals'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [filter, addToast])

  useEffect(() => {
    void load()
  }, [load])

  async function handleApprove(id: string) {
    setBusyId(id)
    try {
      const updated = await sdk.approvals.approve(id)
      setApprovals((prev) => prev.map((a) => (a.id === id ? updated : a)))
      addToast('success', 'Approval granted')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to approve'
      setError(message)
      addToast('error', message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDeny(id: string) {
    setBusyId(id)
    try {
      const updated = await sdk.approvals.deny(id)
      setApprovals((prev) => prev.map((a) => (a.id === id ? updated : a)))
      addToast('info', 'Approval denied')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to deny'
      setError(message)
      addToast('error', message)
    } finally {
      setBusyId(null)
    }
  }

  const pendingCount = approvals.filter((a) => a.status === 'pending').length

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Approvals
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-medium text-amber-700">
                {pendingCount} pending
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Review and manage tool execution requests from your agents.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-red-200"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="denied">Denied</option>
          </select>
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
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {approvals.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {isLoading ? 'Loading...' : 'No approvals found.'}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {approvals.map((a) => (
              <li key={a.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                      <ShieldAlert size={16} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[a.status]}`}>
                          {a.status}
                        </span>
                        {a.risk && (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${riskClass(a.risk.level)}`}>
                            {a.risk.level} risk {a.risk.score}
                          </span>
                        )}
                        {a.requiresApprovalByPolicy && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            policy gated
                          </span>
                        )}
                        {a.autonomyWithinWindow === false && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            outside autonomy window
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-mono text-sm font-semibold text-slate-800">{a.toolName}</p>
                        <p className="mt-1 text-xs text-slate-400">{formatDate(a.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                  {a.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleApprove(a.id)}
                        disabled={busyId === a.id}
                        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeny(a.id)}
                        disabled={busyId === a.id}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                      >
                        Deny
                      </button>
                    </div>
                  )}
                </div>

                {a.risk?.reason && (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {a.risk.reason}
                  </p>
                )}

                {(a.inputKeys?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {a.inputKeys?.map((key) => (
                      <span key={key} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500">
                        {key}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
                  {Object.entries(a.toolInput).slice(0, 8).map(([key, value]) => (
                    <div key={key} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
                      <p className="font-semibold text-slate-700">{key}</p>
                      <p className="mt-1 break-words">{renderValue(value)}</p>
                    </div>
                  ))}
                  {Object.keys(a.toolInput).length === 0 && (
                    <p className="text-xs text-slate-500">No structured tool input was captured.</p>
                  )}
                </div>

                {a.toolInputPreview && (
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                      Raw preview
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100">
                      {JSON.stringify(a.toolInput, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
