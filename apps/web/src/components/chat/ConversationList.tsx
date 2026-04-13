'use client'

import { useChatStore } from '@/stores/chat'
import clsx from 'clsx'
import { MessageSquarePlus, MessageSquare, Search, Clock } from 'lucide-react'
import { useState, useMemo } from 'react'

function timeAgo(iso: string | null | undefined) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return 'unknown'
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  return `${Math.floor(hr / 24)}d`
}

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
      (c.title ?? 'Untitled task').toLowerCase().includes(q),
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
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-3">
        <div className="flex items-center gap-2">
          <Clock size={12} className="text-[var(--tone-soft)]" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--tone-soft)]">
            Recents
          </span>
        </div>
        <button
          type="button"
          onClick={() => void handleNew()}
          disabled={creating}
          title="New chat"
          className="oa-soft-button inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-semibold transition disabled:opacity-50 dark:text-[var(--tone-inverse)]"
        >
          <MessageSquarePlus size={11} />
          {creating ? 'Creating…' : 'New'}
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 px-2.5 pb-1 pt-2.5">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5">
          <Search size={11} className="shrink-0 text-[var(--tone-soft)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className="w-full bg-transparent text-[11px] text-[var(--tone-default)] placeholder:text-[var(--tone-soft)] outline-none dark:text-[var(--tone-inverse)]"
          />
        </div>
      </div>

      {/* List */}
      <div className="oa-scroll-panel h-full min-h-0 space-y-0.5 overflow-y-scroll overscroll-contain px-2 pb-3 pt-1">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <MessageSquare size={18} className="text-[var(--tone-soft)]" />
            <p className="text-[11px] text-[var(--tone-soft)]">
              {query ? 'No matching chats' : 'No chats yet'}
            </p>
            {!query && (
              <button
                type="button"
                onClick={() => void handleNew()}
                disabled={creating}
                className="mt-1 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--tone-strong)] transition hover:border-[#f3c8c5] hover:bg-[#fff8f7] hover:text-[#ef4444] disabled:opacity-50 dark:bg-transparent dark:text-[var(--tone-inverse)]"
              >
                Start a chat
              </button>
            )}
          </div>
        )}

        {filtered.map((c) => {
          const active = c.id === activeConversationId
          const title = c.title?.trim() || 'New chat'
          const ago = timeAgo(c.lastMessageAt ?? c.createdAt)

          return (
            <button
              key={c.id}
              type="button"
              onClick={() => { void selectConversation(c.id); onSelect?.() }}
              className={clsx(
                'group flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-all duration-100',
                active
                  ? 'border-[#f3c8c5] bg-[#fff8f7] shadow-sm dark:bg-[#2a1a1a]'
                  : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-muted)]',
              )}
            >
              <div
                className={clsx(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md',
                  active
                    ? 'bg-[#ffeae8] text-[#ef4444]'
                    : 'bg-[var(--surface-muted)] text-[var(--tone-soft)] group-hover:bg-[var(--surface-subtle)]',
                )}
              >
                <MessageSquare size={10} />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={clsx(
                    'truncate text-[11px] font-semibold leading-snug',
                    active
                      ? 'text-[#ef4444]'
                      : 'text-[var(--tone-default)] group-hover:text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]',
                  )}
                >
                  {title}
                </p>
                {ago && (
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--tone-soft)]">
                    {ago}
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
