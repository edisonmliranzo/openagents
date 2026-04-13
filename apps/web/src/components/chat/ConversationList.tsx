'use client'

import { useChatStore } from '@/stores/chat'
import clsx from 'clsx'
import { PenSquare, Search } from 'lucide-react'
import { useState, useMemo } from 'react'

export function ConversationList({ onSelect }: { onSelect?: () => void } = {}) {
  const { conversations, activeConversationId, selectConversation, createConversation } =
    useChatStore()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const conversationRows = useMemo(
    () => (Array.isArray(conversations) ? conversations : []),
    [conversations],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversationRows
    return conversationRows.filter((c) =>
      (c.title ?? '').toLowerCase().includes(q),
    )
  }, [conversationRows, query])

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
          <Search size={12} className="shrink-0 text-[#98a2b3]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="w-full bg-transparent text-[12px] text-[#344054] placeholder:text-[#98a2b3] outline-none dark:text-[#c9d1e0]"
          />
        </div>
      </div>

      {/* Scrollable list */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
      </div>
    </div>
  )
}
