'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Brain, GitBranch, RefreshCw, ShieldAlert, Waypoints } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type {
  Conversation,
  ConversationLineageGraph,
  DataLineageRecord,
  LocalKnowledgeSource,
  MemoryConflict,
  MemoryReviewItem,
} from '@openagents/shared'

function formatDate(iso: string | null) {
  if (!iso) return 'n/a'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function severityClass(severity: MemoryConflict['severity']) {
  if (severity === 'high') return 'bg-rose-100 text-rose-700'
  if (severity === 'medium') return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

function sourceStatusClass(status: LocalKnowledgeSource['status']) {
  return status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
}

function reviewReasonLabel(reason: MemoryReviewItem['reason']) {
  return reason.replace('_', ' ')
}

function kindClass(kind: string) {
  if (kind.includes('memory')) return 'bg-indigo-100 text-indigo-700'
  if (kind.includes('tool')) return 'bg-cyan-100 text-cyan-700'
  if (kind.includes('approval')) return 'bg-amber-100 text-amber-700'
  if (kind.includes('external')) return 'bg-emerald-100 text-emerald-700'
  return 'bg-slate-100 text-slate-700'
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: string
  detail: string
  icon: React.ElementType
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Icon size={18} />
        </div>
      </div>
    </article>
  )
}

export default function ProvenancePage() {
  const addToast = useUIStore((state) => state.addToast)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState('all')
  const [records, setRecords] = useState<DataLineageRecord[]>([])
  const [graph, setGraph] = useState<ConversationLineageGraph | null>(null)
  const [conflicts, setConflicts] = useState<MemoryConflict[]>([])
  const [reviewQueue, setReviewQueue] = useState<MemoryReviewItem[]>([])
  const [sources, setSources] = useState<LocalKnowledgeSource[]>([])
  const [limit, setLimit] = useState(60)
  const [isLoading, setIsLoading] = useState(false)
  const [busyConflictId, setBusyConflictId] = useState<string | null>(null)
  const [busySourceId, setBusySourceId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  )

  const nodeKindCounts = useMemo(() => {
    if (!graph) return []
    const counts = new Map<string, number>()
    for (const node of graph.nodes) {
      counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1)
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1])
  }, [graph])

  const uniqueMemoryFiles = useMemo(
    () => new Set(records.flatMap((record) => record.memoryFiles)).size,
    [records],
  )

  const uniqueExternalSources = useMemo(
    () => new Set(records.flatMap((record) => record.externalSources)).size,
    [records],
  )

  const totalToolTouches = useMemo(
    () => records.reduce((sum, record) => sum + record.tools.length, 0),
    [records],
  )

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const lineagePromise =
        selectedConversationId === 'all'
          ? sdk.lineage.recent(limit)
          : sdk.lineage.byConversation(selectedConversationId, limit)

      const graphPromise =
        selectedConversationId === 'all'
          ? Promise.resolve<ConversationLineageGraph | null>(null)
          : sdk.lineage.graph(selectedConversationId, Math.max(limit, 80))

      const [nextConversations, nextRecords, nextGraph, nextConflicts, nextReviewQueue, nextSources] =
        await Promise.all([
          sdk.conversations.list(),
          lineagePromise,
          graphPromise,
          sdk.memory.listConflicts('open', 12),
          sdk.memory.reviewQueue(12),
          sdk.memory.listSources(),
        ])

      setConversations(nextConversations)
      setRecords(nextRecords)
      setGraph(nextGraph)
      setConflicts(nextConflicts)
      setReviewQueue(nextReviewQueue)
      setSources(nextSources)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load provenance data'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast, limit, selectedConversationId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleResolveConflict(id: string, status: 'resolved' | 'ignored') {
    setBusyConflictId(id)
    setError('')
    try {
      await sdk.memory.resolveConflict(id, status)
      setConflicts((current) => current.filter((conflict) => conflict.id !== id))
      addToast('success', status === 'resolved' ? 'Conflict resolved' : 'Conflict ignored')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to update conflict'
      setError(message)
      addToast('error', message)
    } finally {
      setBusyConflictId(null)
    }
  }

  async function handleSyncSource(id: string) {
    setBusySourceId(id)
    setError('')
    try {
      await sdk.memory.syncSource(id)
      await load()
      addToast('success', 'Knowledge source synced')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to sync knowledge source'
      setError(message)
      addToast('error', message)
    } finally {
      setBusySourceId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1550px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Memory Provenance
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Trace which memory files, tools, approvals, and local knowledge sources shaped a
            response, then clean up conflicts before stale context spreads.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/memory"
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Open memory
          </Link>
          <Link
            href="/control/lineage"
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Full lineage
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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="text-xs font-medium text-slate-500">
            Conversation focus
            <select
              value={selectedConversationId}
              onChange={(event) => setSelectedConversationId(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="all">All conversations</option>
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.title ?? conversation.id}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-500">
            Record limit
            <input
              type="number"
              min={20}
              max={200}
              value={limit}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value || '60', 10)
                setLimit(Number.isFinite(parsed) ? Math.max(20, Math.min(parsed, 200)) : 60)
              }}
              className="mt-1 h-10 w-28 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Lineage records"
          value={String(records.length)}
          detail={
            selectedConversation
              ? `Focused on ${selectedConversation.title ?? selectedConversation.id}`
              : 'Across recent conversations'
          }
          icon={Waypoints}
        />
        <SummaryCard
          label="Graph nodes"
          value={String(graph?.nodes.length ?? 0)}
          detail={graph ? `${graph.edges.length} edges in current graph` : 'Select a conversation for a graph'}
          icon={GitBranch}
        />
        <SummaryCard
          label="Open conflicts"
          value={String(conflicts.length)}
          detail={`${reviewQueue.length} review items waiting on curation`}
          icon={ShieldAlert}
        />
        <SummaryCard
          label="Knowledge sources"
          value={String(sources.length)}
          detail={`${uniqueMemoryFiles} memory files and ${uniqueExternalSources} external sources in view`}
          icon={Brain}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Conversation Graph</h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedConversation
                  ? `Node coverage for ${selectedConversation.title ?? selectedConversation.id}.`
                  : 'Select a conversation to generate a graph from its lineage records.'}
              </p>
            </div>
            {graph && (
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {graph.nodes.length} nodes
              </div>
            )}
          </div>

          {!graph && (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              Global view is active. Pick a conversation to inspect its provenance graph.
            </div>
          )}

          {graph && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Nodes
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{graph.nodes.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Edges
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{graph.edges.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Tool touches
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{totalToolTouches}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Node kinds</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {nodeKindCounts.map(([kind, count]) => (
                    <span
                      key={kind}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${kindClass(kind)}`}
                    >
                      {kind}: {count}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Sample edges</p>
                <div className="mt-3 space-y-2">
                  {graph.edges.slice(0, 10).map((edge) => (
                    <div
                      key={`${edge.from}-${edge.to}-${edge.label}`}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
                    >
                      <span className="font-mono text-slate-700">{edge.from}</span> {'->'}{' '}
                      <span className="font-mono text-slate-700">{edge.to}</span> ({edge.label})
                    </div>
                  ))}
                  {graph.edges.length === 0 && (
                    <p className="text-xs text-slate-500">No edges were generated for this conversation.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Recent Lineage Records</h2>
              <p className="mt-1 text-sm text-slate-500">
                Latest traces linking messages to tools, approvals, and memory files.
              </p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {records.length} records
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {records.length === 0 && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No lineage records found.
              </p>
            )}

            {records.slice(0, 10).map((record) => (
              <article key={record.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-slate-900">
                      {record.messageId}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(record.createdAt)} • source {record.source}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {record.memoryFiles.length > 0 && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                        {record.memoryFiles.length} memory files
                      </span>
                    )}
                    {record.tools.length > 0 && (
                      <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                        {record.tools.length} tools
                      </span>
                    )}
                    {record.approvals.length > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        {record.approvals.length} approvals
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Memory files
                    </p>
                    <p className="mt-2 text-xs text-slate-700">
                      {record.memoryFiles.length > 0 ? record.memoryFiles.join(', ') : 'none'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      External sources
                    </p>
                    <p className="mt-2 text-xs text-slate-700">
                      {record.externalSources.length > 0
                        ? record.externalSources.join(', ')
                        : 'none'}
                    </p>
                  </div>
                </div>

                {record.tools.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {record.tools.map((tool) => (
                      <span
                        key={`${record.id}-${tool.toolName}`}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${kindClass(`tool-${tool.status}`)}`}
                      >
                        {tool.toolName} ({tool.status})
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Conflict Queue</h2>
              <p className="mt-1 text-sm text-slate-500">
                Resolve contradictory facts before they degrade future retrieval quality.
              </p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {conflicts.length} open
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {conflicts.length === 0 && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No open memory conflicts.
              </p>
            )}

            {conflicts.map((conflict) => (
              <article key={conflict.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {conflict.entity}.{conflict.key}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${severityClass(conflict.severity)}`}
                      >
                        {conflict.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      confidence delta {conflict.confidenceDelta} • {formatDate(conflict.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleResolveConflict(conflict.id, 'resolved')}
                      disabled={busyConflictId === conflict.id}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                    >
                      Resolve
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResolveConflict(conflict.id, 'ignored')}
                      disabled={busyConflictId === conflict.id}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      Ignore
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Existing
                    </p>
                    <p className="mt-2 text-sm text-slate-700">{conflict.existingValue}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {conflict.existingSourceRef ?? 'No source ref'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Incoming
                    </p>
                    <p className="mt-2 text-sm text-slate-700">{conflict.incomingValue}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {conflict.incomingSourceRef ?? 'No source ref'}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <div className="space-y-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Review Queue</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Low-confidence or stale items that should be reviewed by an operator.
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {reviewQueue.length} items
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {reviewQueue.length === 0 && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Review queue is empty.
                </p>
              )}

              {reviewQueue.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {item.type}
                    </span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      {reviewReasonLabel(item.reason)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{item.summary}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    confidence {item.confidence} • updated {formatDate(item.updatedAt)}
                  </p>
                </article>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Local Knowledge Sources</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Track freshness and manually resync files, folders, or repos.
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {sources.length} sources
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {sources.length === 0 && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No local knowledge sources configured yet.
                </p>
              )}

              {sources.map((source) => (
                <article key={source.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{source.path}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${sourceStatusClass(source.status)}`}
                        >
                          {source.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        kind {source.kind} • max files {source.maxFiles}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        last sync {formatDate(source.lastSyncedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSyncSource(source.id)}
                      disabled={busySourceId === source.id}
                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {busySourceId === source.id ? 'Syncing...' : 'Sync now'}
                    </button>
                  </div>

                  {source.includeGlobs.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {source.includeGlobs.map((glob) => (
                        <span
                          key={`${source.id}-${glob}`}
                          className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600"
                        >
                          {glob}
                        </span>
                      ))}
                    </div>
                  )}

                  {source.lastError && (
                    <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {source.lastError}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </article>
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
