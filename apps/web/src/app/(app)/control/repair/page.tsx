'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type {
  Conversation,
  ConversationRepairIssue,
  ConversationRepairReport,
} from '@openagents/shared'

const SCAN_LIMIT = 24

interface RepairRow {
  conversation: Conversation
  report: ConversationRepairReport | null
  error: string | null
}

function formatDate(value: string | null) {
  if (!value) return 'n/a'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function conversationLabel(conversation: Conversation) {
  return conversation.title?.trim() || conversation.id
}

function activityAt(conversation: Conversation) {
  return conversation.lastMessageAt ?? conversation.createdAt
}

function issueSeverity(issue: ConversationRepairIssue) {
  if (issue.severity === 'critical') return 3
  if (issue.severity === 'warning') return 2
  if (issue.severity === 'info') return 1
  return 0
}

function reportTone(row: RepairRow): 'healthy' | 'info' | 'warning' | 'critical' | 'error' {
  if (row.error) return 'error'
  if (!row.report || row.report.issues.length === 0) return 'healthy'
  const highest = row.report.issues.reduce((max, issue) => Math.max(max, issueSeverity(issue)), 0)
  if (highest >= 3) return 'critical'
  if (highest === 2) return 'warning'
  return 'info'
}

function toneClass(tone: ReturnType<typeof reportTone>) {
  switch (tone) {
    case 'critical':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'info':
      return 'border-sky-200 bg-sky-50 text-sky-700'
    case 'error':
      return 'border-red-200 bg-red-50 text-red-700'
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
}

function toneLabel(tone: ReturnType<typeof reportTone>) {
  switch (tone) {
    case 'critical':
      return 'critical'
    case 'warning':
      return 'warning'
    case 'info':
      return 'info'
    case 'error':
      return 'inspect failed'
    default:
      return 'healthy'
  }
}

function SummaryCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: 'slate' | 'amber' | 'rose' | 'emerald'
}) {
  const toneClass = {
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone]

  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>
  )
}

export default function RepairCenterPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [rows, setRows] = useState<RepairRow[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [repairingConversationId, setRepairingConversationId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const selectedRow = useMemo(
    () => rows.find((row) => row.conversation.id === selectedConversationId) ?? null,
    [rows, selectedConversationId],
  )

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const conversations = await sdk.conversations.list()
      const recent = [...conversations]
        .sort((left, right) => {
          return new Date(activityAt(right)).getTime() - new Date(activityAt(left)).getTime()
        })
        .slice(0, SCAN_LIMIT)

      const reports = await Promise.allSettled(
        recent.map((conversation) => sdk.conversations.inspectRepair(conversation.id)),
      )

      const nextRows = recent.map((conversation, index) => {
        const report = reports[index]
        if (report?.status === 'fulfilled') {
          return {
            conversation,
            report: report.value,
            error: null,
          }
        }

        return {
          conversation,
          report: null,
          error:
            report?.status === 'rejected'
              ? (report.reason as { message?: string })?.message ?? 'Failed to inspect conversation.'
              : 'Failed to inspect conversation.',
        }
      })

      nextRows.sort((left, right) => {
        const toneDelta = ['healthy', 'info', 'warning', 'critical', 'error'].indexOf(reportTone(right))
          - ['healthy', 'info', 'warning', 'critical', 'error'].indexOf(reportTone(left))
        if (toneDelta !== 0) return toneDelta
        return new Date(activityAt(right.conversation)).getTime()
          - new Date(activityAt(left.conversation)).getTime()
      })

      setRows(nextRows)
      setSelectedConversationId((current) => {
        if (current && nextRows.some((row) => row.conversation.id === current)) {
          return current
        }
        return nextRows.find((row) => (row.report?.issues.length ?? 0) > 0)?.conversation.id
          ?? nextRows[0]?.conversation.id
          ?? null
      })
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load repair center'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  async function handleRepair(conversationId: string) {
    setRepairingConversationId(conversationId)
    setError('')
    try {
      const report = await sdk.conversations.repair(conversationId)
      setRows((current) =>
        current.map((row) => (
          row.conversation.id === conversationId
            ? { ...row, report, error: null }
            : row
        )),
      )
      addToast(
        report.actions.length > 0 ? 'success' : 'info',
        report.actions.length > 0
          ? `Repair applied ${report.actions.length} action(s).`
          : 'Repair completed. No actions were needed.',
      )
    } catch (err: any) {
      const message = err?.message ?? 'Failed to repair conversation'
      setError(message)
      addToast('error', message)
    } finally {
      setRepairingConversationId(null)
    }
  }

  const flaggedRows = useMemo(
    () => rows.filter((row) => (row.report?.issues.length ?? 0) > 0),
    [rows],
  )
  const criticalIssues = useMemo(
    () =>
      rows.reduce((sum, row) => {
        return sum + (row.report?.issues.filter((issue) => issue.severity === 'critical').length ?? 0)
      }, 0),
    [rows],
  )
  const unresolvedApproved = useMemo(
    () => rows.reduce((sum, row) => sum + (row.report?.unresolvedApprovedApprovals ?? 0), 0),
    [rows],
  )
  const stuckMessages = useMemo(
    () => rows.reduce((sum, row) => sum + (row.report?.stuckMessages ?? 0), 0),
    [rows],
  )

  return (
    <div className="mx-auto max-w-[1550px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Repair Center</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Scan recent conversations for stale messages, orphan approvals, and state drift, then
            apply one-click repairs without dropping into the database.
          </p>
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Scanning the {SCAN_LIMIT} most recent conversations
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          Refresh scan
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Flagged conversations"
          value={String(flaggedRows.length)}
          detail="Recent threads with at least one repair issue"
          tone={flaggedRows.length > 0 ? 'amber' : 'emerald'}
        />
        <SummaryCard
          label="Critical issues"
          value={String(criticalIssues)}
          detail="Approved actions that did not continue"
          tone={criticalIssues > 0 ? 'rose' : 'emerald'}
        />
        <SummaryCard
          label="Unresolved approvals"
          value={String(unresolvedApproved)}
          detail="Approved actions still missing tool results"
          tone={unresolvedApproved > 0 ? 'rose' : 'slate'}
        />
        <SummaryCard
          label="Stuck messages"
          value={String(stuckMessages)}
          detail="Pending/streaming messages past the stuck window"
          tone={stuckMessages > 0 ? 'amber' : 'slate'}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Recent Conversations</h2>
              <p className="mt-1 text-sm text-slate-500">
                Highest-severity issues are sorted to the top.
              </p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {rows.length} scanned
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {rows.length === 0 && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                {isLoading ? 'Scanning conversations...' : 'No conversations found yet.'}
              </p>
            )}

            {rows.map((row) => {
              const tone = reportTone(row)
              const selected = row.conversation.id === selectedConversationId
              return (
                <button
                  key={row.conversation.id}
                  type="button"
                  onClick={() => setSelectedConversationId(row.conversation.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selected
                      ? 'border-slate-400 bg-slate-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {conversationLabel(row.conversation)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        last activity {formatDate(activityAt(row.conversation))}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass(tone)}`}>
                      {toneLabel(tone)}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Issues
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {row.report?.issues.length ?? 0}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Waiting runs
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {row.report?.waitingRuns ?? 0}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Stuck messages
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {row.report?.stuckMessages ?? 0}
                      </p>
                    </div>
                  </div>

                  {row.error && (
                    <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {row.error}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {!selectedRow ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              Select a conversation to inspect repair diagnostics.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {conversationLabel(selectedRow.conversation)}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    inspected {formatDate(selectedRow.report?.inspectedAt ?? null)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/chat?conversation=${selectedRow.conversation.id}`}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    <MessageSquare size={14} />
                    Open chat
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleRepair(selectedRow.conversation.id)}
                    disabled={repairingConversationId === selectedRow.conversation.id}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Wrench size={14} />
                    {repairingConversationId === selectedRow.conversation.id ? 'Repairing...' : 'Run repair'}
                  </button>
                </div>
              </div>

              {selectedRow.error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {selectedRow.error}
                </div>
              )}

              {selectedRow.report && (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Pending approvals
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-slate-900">
                        {selectedRow.report.pendingApprovals}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Approved not continued
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-slate-900">
                        {selectedRow.report.unresolvedApprovedApprovals}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Waiting runs
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-slate-900">
                        {selectedRow.report.waitingRuns}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Stuck messages
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-slate-900">
                        {selectedRow.report.stuckMessages}
                      </p>
                    </div>
                  </div>

                  <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Repair issues</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Current divergence signals found in this conversation.
                        </p>
                      </div>
                      <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                        {selectedRow.report.issues.length} issue(s)
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {selectedRow.report.issues.length === 0 && (
                        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                          <div>
                            <p className="font-semibold">No repair issues detected.</p>
                            <p className="mt-1 text-xs">
                              This conversation looks internally consistent right now.
                            </p>
                          </div>
                        </div>
                      )}

                      {selectedRow.report.issues.map((issue) => (
                        <article
                          key={`${issue.code}-${issue.relatedIds?.join(',') ?? 'none'}`}
                          className={`rounded-xl border px-4 py-3 ${toneClass(
                            issue.severity === 'critical'
                              ? 'critical'
                              : issue.severity === 'warning'
                                ? 'warning'
                                : 'info',
                          )}`}
                        >
                          <div className="flex items-start gap-3">
                            {issue.severity === 'critical' ? (
                              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                            ) : (
                              <AlertCircle size={16} className="mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">{issue.message}</p>
                              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em]">
                                {issue.code}
                              </p>
                              {(issue.relatedIds?.length ?? 0) > 0 && (
                                <p className="mt-2 text-xs">
                                  related ids: {issue.relatedIds?.slice(0, 4).join(', ')}
                                  {(issue.relatedIds?.length ?? 0) > 4
                                    ? ` +${(issue.relatedIds?.length ?? 0) - 4} more`
                                    : ''}
                                </p>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Latest repair actions</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Actions taken the last time repair ran for this conversation.
                        </p>
                      </div>
                      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {selectedRow.report.actions.length} action(s)
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {selectedRow.report.actions.length === 0 ? (
                        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                          No repair actions have been applied yet.
                        </p>
                      ) : (
                        selectedRow.report.actions.map((action) => (
                          <div
                            key={action}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                          >
                            {action}
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </>
              )}
            </>
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
