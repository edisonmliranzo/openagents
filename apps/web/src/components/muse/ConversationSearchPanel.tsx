'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MessageSquare, Pin, Search, X } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import type { ConversationSearchHit } from '@openagents/shared'

interface Props {
  onClose?: () => void
  onOpenConversation?: (conversationId: string) => void
}

type Tab = 'search' | 'pins'

/**
 * Full-text conversation search plus the pinned-message list.
 *
 * Search runs against the Postgres full-text index on the server, so it covers
 * the entire history rather than the most recent page of messages.
 */
export function ConversationSearchPanel({ onClose, onOpenConversation }: Props) {
  const [tab, setTab] = useState<Tab>('search')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ConversationSearchHit[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [pins, setPins] = useState<Array<{ id: string; messageId: string; conversationId: string; content?: string | null; conversationTitle?: string | null }>>([])
  const [pinsLoading, setPinsLoading] = useState(false)

  const selectConversation = useChatStore((s) => s.selectConversation)

  const runSearch = useCallback(async (term: string) => {
    const q = term.trim()
    if (q.length < 2) {
      setHits([])
      setTotal(0)
      return
    }
    setLoading(true)
    try {
      const result = await sdk.conversations.search(q, { limit: 20 })
      setHits(result.results ?? [])
      setTotal(result.total ?? 0)
    } catch {
      setHits([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void runSearch(query), 250)
    return () => window.clearTimeout(timer)
  }, [query, runSearch])

  const loadPins = useCallback(async () => {
    setPinsLoading(true)
    try {
      const list = await sdk.pins.list(50)
      setPins(list ?? [])
    } catch {
      setPins([])
    } finally {
      setPinsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab !== 'pins') return
    void loadPins()
  }, [tab, loadPins])

  async function openConversation(conversationId: string) {
    try {
      await selectConversation(conversationId)
    } catch {
      // fall through to navigation
    }
    onOpenConversation?.(conversationId)
    onClose?.()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200/60 px-3 py-2.5 dark:border-slate-800/80">
        <div className="oa-search flex flex-1 items-center gap-2 px-3 py-1.5">
          <Search size={13} className="shrink-0 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every message..."
            className="w-full bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
          />
          {loading && <Loader2 size={12} className="shrink-0 animate-spin text-slate-400" />}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="oa-pill-btn h-7 w-7 text-slate-400"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex gap-1 px-3 pt-2">
        {(['search', 'pins'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
              tab === value
                ? 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {value === 'search' ? `Search${total ? ` (${total})` : ''}` : `Pins (${pins.length})`}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {tab === 'search' ? (
          <>
            {query.trim().length < 2 && (
              <p className="px-1 py-3 text-[11px] text-slate-400">
                Type at least two characters to search the full conversation history.
              </p>
            )}
            {query.trim().length >= 2 && !loading && hits.length === 0 && (
              <p className="px-1 py-3 text-[11px] text-slate-400">No matches for “{query}”.</p>
            )}
            <div className="space-y-1">
              {hits.map((hit) => (
                <button
                  key={hit.messageId}
                  type="button"
                  onClick={() => void openConversation(hit.conversationId)}
                  className="w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-200/50 dark:hover:bg-slate-800/60"
                >
                  <div className="flex items-center gap-1.5">
                    <MessageSquare size={11} className="shrink-0 text-slate-400" />
                    <span className="truncate text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      {hit.conversationTitle || 'Untitled session'}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-slate-400">{hit.role}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                    {hit.snippetParts?.length
                      ? hit.snippetParts.map((part, index) =>
                          part.match ? (
                            <mark key={index} className="rounded bg-amber-300/40 px-0.5 text-slate-800 dark:bg-amber-400/30 dark:text-amber-100">
                              {part.text}
                            </mark>
                          ) : (
                            <span key={index}>{part.text}</span>
                          ),
                        )
                      : hit.snippet}
                  </p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {pinsLoading && <p className="px-1 py-3 text-[11px] text-slate-400">Loading pins…</p>}
            {!pinsLoading && pins.length === 0 && (
              <p className="px-1 py-3 text-[11px] text-slate-400">
                No pinned messages yet. Use the pin icon on an agent reply.
              </p>
            )}
            <div className="space-y-1">
              {pins.map((pin) => (
                <button
                  key={pin.id}
                  type="button"
                  onClick={() => void openConversation(pin.conversationId)}
                  className="w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-200/50 dark:hover:bg-slate-800/60"
                >
                  <div className="flex items-center gap-1.5">
                    <Pin size={11} className="shrink-0 text-indigo-400" />
                    <span className="truncate text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      {pin.conversationTitle || 'Untitled session'}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                    {pin.content || 'Pinned message'}
                  </p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
