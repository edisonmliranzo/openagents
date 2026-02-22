'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { HandoffStatus, HumanHandoffTicket } from '@openagents/shared'

const STATUS_OPTIONS: Array<HandoffStatus | 'all'> = ['all', 'open', 'claimed', 'resolved', 'returned']

function statusClass(status: HandoffStatus) {
  if (status === 'resolved' || status === 'returned') return 'bg-emerald-100 text-emerald-700'
  if (status === 'claimed') return 'bg-cyan-100 text-cyan-700'
  return 'bg-amber-100 text-amber-700'
}

export default function HandoffsPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [statusFilter, setStatusFilter] = useState<HandoffStatus | 'all'>('all')
  const [tickets, setTickets] = useState<HumanHandoffTicket[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [resolutionNote, setResolutionNote] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isMutating, setIsMutating] = useState(false)
  const [error, setError] = useState('')

  const selected = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) ?? null,
    [selectedId, tickets],
  )

  const loadTickets = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const list = await sdk.handoffs.list(statusFilter === 'all' ? undefined : statusFilter)
      setTickets(list)
      if (list.length === 0) {
        setSelectedId(null)
      } else if (!selectedId || !list.some((ticket) => ticket.id === selectedId)) {
        setSelectedId(list[0].id)
      }
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load handoffs'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast, selectedId, statusFilter])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  async function refreshSelected(id: string) {
    const updated = await sdk.handoffs.get(id)
    setTickets((prev) => prev.map((ticket) => (ticket.id === updated.id ? updated : ticket)))
    setSelectedId(updated.id)
  }

  async function handleClaim() {
    if (!selected) return
    setIsMutating(true)
    setError('')
    try {
      await sdk.handoffs.claim(selected.id)
      await refreshSelected(selected.id)
      addToast('success', 'Handoff claimed')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to claim handoff'
      setError(message)
      addToast('error', message)
    } finally {
      setIsMutating(false)
    }
  }

  async function handleReply() {
    if (!selected) return
    const body = replyText.trim()
    if (!body) return
    setIsMutating(true)
    setError('')
    try {
      await sdk.handoffs.reply(selected.id, { message: body })
      setReplyText('')
      await refreshSelected(selected.id)
      addToast('success', 'Operator reply sent')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to send reply'
      setError(message)
      addToast('error', message)
    } finally {
      setIsMutating(false)
    }
  }

  async function handleResolve() {
    if (!selected) return
    setIsMutating(true)
    setError('')
    try {
      await sdk.handoffs.resolve(selected.id, { resolutionNote: resolutionNote.trim() || undefined })
      setResolutionNote('')
      await refreshSelected(selected.id)
      addToast('success', 'Handoff resolved')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to resolve handoff'
      setError(message)
      addToast('error', message)
    } finally {
      setIsMutating(false)
    }
  }

  async function handleReturn() {
    if (!selected) return
    setIsMutating(true)
    setError('')
    try {
      await sdk.handoffs.returnToAgent(selected.id)
      await refreshSelected(selected.id)
      addToast('success', 'Conversation returned to agent')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to return handoff'
      setError(message)
      addToast('error', message)
    } finally {
      setIsMutating(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Human Handoffs</h1>
          <p className="mt-1 text-sm text-slate-500">
            Operator queue for escalated conversations with full context transfer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as HandoffStatus | 'all')}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadTickets()}
            disabled={isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Queue</h2>
          <p className="mt-1 text-sm text-slate-500">{tickets.length} handoffs.</p>

          <div className="mt-3 space-y-2">
            {tickets.length === 0 && (
              <p className="text-sm text-slate-500">No handoffs found.</p>
            )}
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => setSelectedId(ticket.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  selectedId === ticket.id
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{ticket.conversationId}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(ticket.status)}`}>
                    {ticket.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">reason: {ticket.reason ?? 'n/a'}</p>
                <p className="mt-1 text-xs text-slate-500">updated: {new Date(ticket.updatedAt).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Details</h2>
          {!selected && (
            <p className="mt-2 text-sm text-slate-500">Select a handoff from the queue.</p>
          )}

          {selected && (
            <div className="mt-2 space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <p><span className="font-semibold">Conversation:</span> {selected.conversationId}</p>
                <p className="mt-1"><span className="font-semibold">Status:</span> {selected.status}</p>
                <p className="mt-1"><span className="font-semibold">Claimed by:</span> {selected.claimedByUserId ?? '-'}</p>
                <p className="mt-1"><span className="font-semibold">Reason:</span> {selected.reason ?? '-'}</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Context Snapshot</p>
                <p className="mt-2 text-xs text-slate-600">messages: {selected.context.latestMessages.length}</p>
                <p className="mt-1 text-xs text-slate-600">pending approvals: {selected.context.pendingApprovals.length}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">Memory context</summary>
                  <pre className="mt-2 max-h-40 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-600">
                    {selected.context.memoryContext || '(empty)'}
                  </pre>
                </details>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleClaim()}
                  disabled={isMutating || selected.status === 'resolved' || selected.status === 'returned'}
                  className="h-10 rounded-lg border border-cyan-200 bg-cyan-50 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100 disabled:opacity-50"
                >
                  Claim
                </button>
                <button
                  type="button"
                  onClick={() => void handleReturn()}
                  disabled={isMutating || selected.status === 'resolved' || selected.status === 'returned'}
                  className="h-10 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                >
                  Return to Agent
                </button>
              </div>

              <textarea
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                rows={4}
                placeholder="Operator reply to send into the conversation..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={() => void handleReply()}
                disabled={isMutating || !replyText.trim() || selected.status === 'resolved' || selected.status === 'returned'}
                className="h-10 rounded-lg bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
              >
                Send Operator Reply
              </button>

              <textarea
                value={resolutionNote}
                onChange={(event) => setResolutionNote(event.target.value)}
                rows={2}
                placeholder="Resolution note (optional)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={() => void handleResolve()}
                disabled={isMutating || selected.status === 'resolved' || selected.status === 'returned'}
                className="h-10 rounded-lg border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
              >
                Resolve Handoff
              </button>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Replies</p>
                <div className="mt-2 space-y-2">
                  {selected.replies.length === 0 && <p className="text-xs text-slate-500">No operator replies yet.</p>}
                  {selected.replies.map((reply) => (
                    <article key={reply.id} className="rounded border border-slate-200 bg-white p-2">
                      <p className="text-[11px] text-slate-500">{new Date(reply.createdAt).toLocaleString()}</p>
                      <p className="mt-1 text-xs text-slate-700">{reply.message}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          )}
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
