'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bell,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  TimerReset,
  UserCheck,
} from 'lucide-react'
import { sdk, useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { Approval, HumanHandoffTicket, Notification } from '@openagents/shared'

function formatDate(iso: string | null) {
  if (!iso) return 'n/a'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function approvalRiskClass(level?: 'low' | 'medium' | 'high') {
  if (level === 'high') return 'bg-rose-100 text-rose-700'
  if (level === 'medium') return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

function handoffStatusClass(status: HumanHandoffTicket['status']) {
  if (status === 'resolved' || status === 'returned') return 'bg-emerald-100 text-emerald-700'
  if (status === 'claimed') return 'bg-cyan-100 text-cyan-700'
  return 'bg-amber-100 text-amber-700'
}

function renderValue(value: unknown) {
  if (value == null) return 'null'
  if (typeof value === 'string') return value.length > 140 ? `${value.slice(0, 140)}...` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    const serialized = JSON.stringify(value)
    return serialized.length > 140 ? `${serialized.slice(0, 140)}...` : serialized
  } catch {
    return String(value).slice(0, 140)
  }
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  detail: string
  icon: React.ElementType
  tone: 'slate' | 'rose' | 'cyan' | 'amber'
}) {
  const toneClass = {
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
  }[tone]

  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-slate-700">
          <Icon size={18} />
        </div>
      </div>
    </article>
  )
}

export default function OperatorInboxPage() {
  const addToast = useUIStore((state) => state.addToast)
  const user = useAuthStore((state) => state.user)
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [handoffs, setHandoffs] = useState<HumanHandoffTicket[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [selectedHandoffId, setSelectedHandoffId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [resolutionNote, setResolutionNote] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [busyApprovalId, setBusyApprovalId] = useState<string | null>(null)
  const [isMutatingHandoff, setIsMutatingHandoff] = useState(false)
  const [error, setError] = useState('')

  const selectedHandoff = useMemo(
    () => handoffs.find((ticket) => ticket.id === selectedHandoffId) ?? null,
    [handoffs, selectedHandoffId],
  )

  const pendingApprovals = useMemo(
    () => approvals.filter((approval) => approval.status === 'pending'),
    [approvals],
  )

  const sortedHandoffs = useMemo(
    () =>
      [...handoffs].sort((left, right) => {
        const order = { open: 0, claimed: 1, returned: 2, resolved: 3 }
        const statusDelta = order[left.status] - order[right.status]
        if (statusDelta !== 0) return statusDelta
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      }),
    [handoffs],
  )

  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  )

  const openHandoffs = useMemo(
    () => handoffs.filter((ticket) => ticket.status === 'open').length,
    [handoffs],
  )

  const claimedByMe = useMemo(
    () =>
      handoffs.filter(
        (ticket) => ticket.status === 'claimed' && ticket.claimedByUserId === (user?.id ?? null),
      ).length,
    [handoffs, user?.id],
  )

  const activeIncidents = pendingApprovals.length + openHandoffs + claimedByMe

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [nextApprovals, nextHandoffs, nextNotifications] = await Promise.all([
        sdk.approvals.list('pending'),
        sdk.handoffs.list(),
        sdk.notifications.list(),
      ])

      setApprovals(nextApprovals)
      setHandoffs(nextHandoffs)
      setNotifications(nextNotifications)

      if (nextHandoffs.length === 0) {
        setSelectedHandoffId(null)
      } else if (
        !selectedHandoffId ||
        !nextHandoffs.some((ticket) => ticket.id === selectedHandoffId)
      ) {
        setSelectedHandoffId(nextHandoffs[0].id)
      }
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load operator inbox'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast, selectedHandoffId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleApprovalDecision(id: string, decision: 'approve' | 'deny') {
    setBusyApprovalId(id)
    setError('')
    try {
      const updated =
        decision === 'approve' ? await sdk.approvals.approve(id) : await sdk.approvals.deny(id)
      setApprovals((current) => current.map((approval) => (approval.id === id ? updated : approval)))
      addToast('success', decision === 'approve' ? 'Approval granted' : 'Approval denied')
    } catch (err: any) {
      const message = err?.message ?? `Failed to ${decision} approval`
      setError(message)
      addToast('error', message)
    } finally {
      setBusyApprovalId(null)
    }
  }

  async function refreshHandoff(id: string) {
    const updated = await sdk.handoffs.get(id)
    setHandoffs((current) =>
      current.map((ticket) => (ticket.id === updated.id ? updated : ticket)),
    )
    setSelectedHandoffId(updated.id)
  }

  async function handleHandoffAction(action: 'claim' | 'reply' | 'resolve' | 'return') {
    if (!selectedHandoff) return
    setIsMutatingHandoff(true)
    setError('')
    try {
      if (action === 'claim') {
        await sdk.handoffs.claim(selectedHandoff.id)
      } else if (action === 'reply') {
        const message = replyText.trim()
        if (!message) return
        await sdk.handoffs.reply(selectedHandoff.id, { message })
        setReplyText('')
      } else if (action === 'resolve') {
        await sdk.handoffs.resolve(selectedHandoff.id, {
          resolutionNote: resolutionNote.trim() || undefined,
        })
        setResolutionNote('')
      } else {
        await sdk.handoffs.returnToAgent(selectedHandoff.id)
      }

      await refreshHandoff(selectedHandoff.id)
      addToast(
        'success',
        action === 'reply'
          ? 'Operator reply sent'
          : action === 'claim'
            ? 'Handoff claimed'
            : action === 'resolve'
              ? 'Handoff resolved'
              : 'Conversation returned to agent',
      )
    } catch (err: any) {
      const message = err?.message ?? `Failed to ${action} handoff`
      setError(message)
      addToast('error', message)
    } finally {
      setIsMutatingHandoff(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1550px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Operator Inbox</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Triage approvals, escalations, and active intervention work without hopping between
            separate control pages.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/approvals"
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Full approvals
          </Link>
          <Link
            href="/control/handoffs"
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Full handoffs
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Pending approvals"
          value={String(pendingApprovals.length)}
          detail="Tool actions waiting on a human decision"
          icon={ShieldAlert}
          tone="amber"
        />
        <SummaryCard
          label="Open handoffs"
          value={String(openHandoffs)}
          detail="Escalations that still need an operator"
          icon={UserCheck}
          tone="cyan"
        />
        <SummaryCard
          label="Claimed by me"
          value={String(claimedByMe)}
          detail={user?.email ?? 'Current operator'}
          icon={CheckCircle2}
          tone="slate"
        />
        <SummaryCard
          label="Unread alerts"
          value={String(unreadNotifications)}
          detail={`${activeIncidents} active incidents across approvals and handoffs`}
          icon={Bell}
          tone="rose"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Approval Queue</h2>
              <p className="mt-1 text-sm text-slate-500">
                Fast decisions for tool runs that are blocked on policy or risk.
              </p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {pendingApprovals.length} pending
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {pendingApprovals.length === 0 && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No approvals are waiting right now.
              </p>
            )}

            {pendingApprovals.map((approval) => (
              <article
                key={approval.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-semibold text-slate-900">
                        {approval.toolName}
                      </p>
                      {approval.risk && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${approvalRiskClass(approval.risk.level)}`}
                        >
                          {approval.risk.level} risk {approval.risk.score}
                        </span>
                      )}
                      {approval.requiresApprovalByPolicy && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          policy gated
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Conversation {approval.conversationId} • {formatDate(approval.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleApprovalDecision(approval.id, 'approve')}
                      disabled={busyApprovalId === approval.id}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleApprovalDecision(approval.id, 'deny')}
                      disabled={busyApprovalId === approval.id}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                    >
                      Deny
                    </button>
                  </div>
                </div>

                {approval.risk?.reason && (
                  <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                    {approval.risk.reason}
                  </p>
                )}

                <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-white p-3">
                  {Object.entries(approval.toolInput).slice(0, 6).map(([key, value]) => (
                    <div key={key} className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-700">{key}: </span>
                      <span className="break-words">{renderValue(value)}</span>
                    </div>
                  ))}
                  {Object.keys(approval.toolInput).length === 0 && (
                    <p className="text-xs text-slate-500">No structured tool input captured.</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </article>

        <section className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Handoff Queue</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Claimed, open, and recently resolved escalations.
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {sortedHandoffs.length} tickets
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {sortedHandoffs.length === 0 && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No handoffs in the queue.
                </p>
              )}

              {sortedHandoffs.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedHandoffId(ticket.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    ticket.id === selectedHandoffId
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {ticket.context.conversationTitle ?? ticket.conversationId}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {ticket.reason ?? 'No explicit reason supplied'}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${handoffStatusClass(ticket.status)}`}
                    >
                      {ticket.status}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    updated {formatDate(ticket.updatedAt)}
                  </p>
                </button>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Selected Escalation</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Claim ownership, reply into the thread, or hand control back to the agent.
                </p>
              </div>
              <TimerReset size={18} className="text-slate-400" />
            </div>

            {!selectedHandoff && (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                Select a handoff to inspect its context and take action.
              </div>
            )}

            {selectedHandoff && (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${handoffStatusClass(selectedHandoff.status)}`}
                    >
                      {selectedHandoff.status}
                    </span>
                    {selectedHandoff.claimedByUserId === user?.id && (
                      <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                        owned by you
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <p>
                      <span className="font-semibold">Conversation:</span>{' '}
                      {selectedHandoff.context.conversationTitle ?? selectedHandoff.conversationId}
                    </p>
                    <p>
                      <span className="font-semibold">Claimed by:</span>{' '}
                      {selectedHandoff.claimedByUserId ?? 'unclaimed'}
                    </p>
                    <p>
                      <span className="font-semibold">Created:</span>{' '}
                      {formatDate(selectedHandoff.createdAt)}
                    </p>
                    <p>
                      <span className="font-semibold">Updated:</span>{' '}
                      {formatDate(selectedHandoff.updatedAt)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Messages
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {selectedHandoff.context.latestMessages.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Pending approvals
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {selectedHandoff.context.pendingApprovals.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Replies sent
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {selectedHandoff.replies.length}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">Latest conversation context</p>
                      <div className="mt-3 space-y-2">
                        {selectedHandoff.context.latestMessages.length === 0 && (
                          <p className="text-xs text-slate-500">No captured messages.</p>
                        )}
                        {selectedHandoff.context.latestMessages.map((message) => (
                          <article key={message.id} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                {message.role}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                {formatDate(message.createdAt)}
                              </p>
                            </div>
                            <p className="mt-2 text-sm text-slate-700">{message.content}</p>
                          </article>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">Memory snapshot</p>
                      <pre className="mt-3 max-h-[240px] overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-600">
                        {selectedHandoff.context.memoryContext || '(empty)'}
                      </pre>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => void handleHandoffAction('claim')}
                        disabled={
                          isMutatingHandoff ||
                          selectedHandoff.status === 'resolved' ||
                          selectedHandoff.status === 'returned'
                        }
                        className="h-10 rounded-lg border border-cyan-200 bg-cyan-50 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100 disabled:opacity-50"
                      >
                        Claim
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleHandoffAction('resolve')}
                        disabled={
                          isMutatingHandoff ||
                          selectedHandoff.status === 'resolved' ||
                          selectedHandoff.status === 'returned'
                        }
                        className="h-10 rounded-lg border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                      >
                        Resolve
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleHandoffAction('return')}
                        disabled={
                          isMutatingHandoff ||
                          selectedHandoff.status === 'resolved' ||
                          selectedHandoff.status === 'returned'
                        }
                        className="h-10 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Return
                      </button>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <label className="block text-xs font-medium text-slate-500">
                        Operator reply
                        <textarea
                          value={replyText}
                          onChange={(event) => setReplyText(event.target.value)}
                          rows={5}
                          placeholder="Summarize the next action, ask a clarifying question, or take over the conversation."
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleHandoffAction('reply')}
                        disabled={
                          isMutatingHandoff ||
                          !replyText.trim() ||
                          selectedHandoff.status === 'resolved' ||
                          selectedHandoff.status === 'returned'
                        }
                        className="mt-3 h-10 rounded-lg bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
                      >
                        Send reply
                      </button>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <label className="block text-xs font-medium text-slate-500">
                        Resolution note
                        <textarea
                          value={resolutionNote}
                          onChange={(event) => setResolutionNote(event.target.value)}
                          rows={3}
                          placeholder="Explain the outcome before resolving the escalation."
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
                        />
                      </label>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">Operator replies</p>
                      <div className="mt-3 space-y-2">
                        {selectedHandoff.replies.length === 0 && (
                          <p className="text-xs text-slate-500">No operator replies yet.</p>
                        )}
                        {selectedHandoff.replies.map((reply) => (
                          <article key={reply.id} className="rounded-lg border border-slate-200 bg-white p-3">
                            <p className="text-[11px] text-slate-400">{formatDate(reply.createdAt)}</p>
                            <p className="mt-1 text-sm text-slate-700">{reply.message}</p>
                          </article>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </article>
        </section>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
