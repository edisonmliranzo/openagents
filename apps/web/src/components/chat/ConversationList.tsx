'use client'

import { useChatStore } from '@/stores/chat'
import { sdk } from '@/stores/auth'
import clsx from 'clsx'
import { PenSquare, Search } from 'lucide-react'
import { useState, useMemo, useEffect, useRef } from 'react'

type SearchResult = {
  conversationId: string
  conversationTitle: string | null
  messageId: string
  role: string
  snippet: string
  createdAt: string
}

export function ConversationList({ onSelect }: { onSelect?: () => void } = {}) {
  const { conversations, activeConversationId, selectConversation, createConversation } =
    useChatStore()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const conversationRows = useMemo(
    () => (Array.isArray(conversations) ? conversations : []),
    [conversations],
  )

  // Client-side filter for short queries; server FTS for longer ones
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || searchResults !== null) return conversationRows
    return conversationRows.filter((c) =>
      (c.title ?? '').toLowerCase().includes(q),
    )
  }, [conversationRows, query, searchResults])

  useEffect(() => {
    const q = query.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (q.length < 3) {
      setSearchResults(null)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await sdk.conversations.search(q)
        setSearchResults(Array.isArray(results) ? results : [])
      } catch {
        setSearchResults(null)
      } finally {
        setSearching(false)
      }
    }, 350)
  }, [query])

  async function handleNew() {
    if (creating) return
    setCreating(true)
    try {
      await createConversation()
      onSelect?.()
    } finally {
      setCreating(false)
    }
  }

  function handleResultClick(conversationId: string) {
    void selectConversation(conversationId)
    setQuery('')
    setSearchResults(null)
    onSelect?.()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* New chat */}
      <button
        type="button"
        onClick={() => void handleNew()}
        disabled={creating}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-[13px] font-medium text-[#101828] transition hover:bg-[#f8fafc] disabled:opacity-50 dark:text-white dark:hover:bg-[#1e2433]"
      >
        <PenSquare size={14} className="shrink-0 text-[#667085] dark:text-[#8892a4]" />
        {creating ? 'Creating…' : 'New chat'}
      </button>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-lg bg-[#f2f4f7] px-3 py-2 dark:bg-[#1e2433]">
          <Search size={12} className={clsx('shrink-0', searching ? 'text-[#ef4444] animate-pulse' : 'text-[#98a2b3]')} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="w-full bg-transparent text-[12px] text-[#344054] placeholder:text-[#98a2b3] outline-none dark:text-[#c9d1e0]"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(''); setSearchResults(null) }} className="text-[#98a2b3] hover:text-[#344054] text-[11px]">×</button>
          )}
        </div>
      </div>

      {/* Scrollable list */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* FTS search results */}
        {searchResults !== null && (
          <>
            {searchResults.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-[#98a2b3]">No results for "{query}"</p>
            ) : (
              <>
                <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#98a2b3]">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                </p>
                {searchResults.map((r) => (
                  <button
                    key={r.messageId}
                    type="button"
                    onClick={() => handleResultClick(r.conversationId)}
                    className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition hover:bg-[#f8fafc] dark:hover:bg-[#1e2433]"
                  >
                    <span className="truncate text-[12px] font-medium text-[#101828] dark:text-white">
                      {r.conversationTitle ?? 'Untitled'}
                    </span>
                    <span className="line-clamp-2 text-[11px] text-[#667085] dark:text-[#8892a4]">
                      {r.snippet}
                    </span>
                  </button>
                ))}
              </>
            )}
          </>
        )}

        {/* Normal conversation list (hidden when showing search results) */}
        {searchResults === null && (
          <>
            {filtered.length === 0 && (
              <p className="px-4 py-6 text-center text-[12px] text-[#98a2b3]">
                {query ? 'No matching chats' : 'No chats yet'}
              </p>
            )}

            {filtered.map((c) => {
              const active = c.id === activeConversationId
              const title = c.title?.trim() || 'New chat'

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { void selectConversation(c.id); onSelect?.() }}
                  title={title}
                  className={clsx(
                    'flex w-full items-center px-4 py-[7px] text-left text-[13px] transition-colors',
                    active
                      ? 'text-[#ef4444] font-medium'
                      : 'text-[#344054] hover:bg-[#f8fafc] dark:text-[#c9d1e0] dark:hover:bg-[#1e2433]',
                  )}
                >
                  <span className="truncate">{title}</span>
                </button>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
