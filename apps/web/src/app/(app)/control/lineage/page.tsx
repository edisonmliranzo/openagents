'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { Conversation, DataLineageRecord } from '@openagents/shared'

export default function LineagePage() {
  const addToast = useUIStore((state) => state.addToast)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string>('all')
  const [records, setRecords] = useState<DataLineageRecord[]>([])
  const [limit, setLimit] = useState(60)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  )

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [conversations, lineage] = await Promise.all([
        sdk.conversations.list(),
        selectedConversationId !== 'all'
          ? sdk.lineage.byConversation(selectedConversationId, limit)
          : sdk.lineage.recent(limit),
      ])
      setConversations(conversations)
      setRecords(lineage)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load lineage'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast, limit, selectedConversationId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Data Lineage Map</h1>
          <p className="mt-1 text-sm text-slate-500">
            Inspect memory files, tools, approvals, and external sources behind each response.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="text-xs font-medium text-slate-500">
            Conversation
            <select
              value={selectedConversationId}
              onChange={(event) => setSelectedConversationId(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
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
            Limit
            <input
              type="number"
              min={10}
              max={200}
              value={limit}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value || '60', 10)
                setLimit(Number.isFinite(parsed) ? Math.max(10, Math.min(parsed, 200)) : 60)
              }}
              className="mt-1 h-10 w-28 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Lineage Records</h2>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {records.length} records {selectedConversation ? `for ${selectedConversation.title ?? selectedConversation.id}` : ''}
          </div>
        </div>

        <div className="mt-3 space-y-3">
          {records.length === 0 && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No lineage records found.
            </p>
          )}

          {records.map((record) => (
            <article key={record.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs text-slate-700">{record.messageId}</p>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                  {record.source}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(record.createdAt).toLocaleString()} - conversation: {record.conversationId}
              </p>

              <div className="mt-3 grid gap-2 md:grid-cols-4">
                <div className="rounded border border-slate-200 bg-white p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Memory</p>
                  <p className="mt-1 text-xs text-slate-700">
                    {record.memoryFiles.length > 0 ? record.memoryFiles.join(', ') : 'none'}
                  </p>
                </div>
                <div className="rounded border border-slate-200 bg-white p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tools</p>
                  <p className="mt-1 text-xs text-slate-700">
                    {record.tools.length > 0
                      ? record.tools.map((tool) => `${tool.toolName} (${tool.status})`).join(', ')
                      : 'none'}
                  </p>
                </div>
                <div className="rounded border border-slate-200 bg-white p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Approvals</p>
                  <p className="mt-1 text-xs text-slate-700">
                    {record.approvals.length > 0 ? record.approvals.join(', ') : 'none'}
                  </p>
                </div>
                <div className="rounded border border-slate-200 bg-white p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">External Sources</p>
                  <p className="mt-1 text-xs text-slate-700">
                    {record.externalSources.length > 0 ? record.externalSources.join(', ') : 'none'}
                  </p>
                </div>
              </div>
            </article>
          ))}
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
