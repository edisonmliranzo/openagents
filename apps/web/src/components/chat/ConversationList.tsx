'use client'

import { useChatStore } from '@/stores/chat'
import clsx from 'clsx'
import { MessageSquarePlus, MessageSquare, Search } from 'lucide-react'
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

function shortId(value: string) {
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

export function ConversationList() {
  const { conversations, activeConversationId, selectConversation, createConversation } =
    useChatStore()
  const [query, setQuery] = useState('')
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

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-3">
        <div>
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
            Sessions
          </h2>
          <p className="mt-0.5 text-[11px] font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
            {filtered.length} recent sessions
          </p>
        </div>
        <button
          onClick={() => void createConversation()}
          title="New session"
          className="oa-soft-button inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[10px] font-semibold transition dark:text-[var(--tone-inverse)]"
        >
          <MessageSquarePlus size={12} />
          New
        </button>
      </div>

      <div className="shrink-0 px-2.5 pb-1 pt-2.5">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5">
          <Search
            size={12}
            className="shrink-0 text-[var(--tone-soft)] dark:text-[var(--tone-soft)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions..."
            className="w-full bg-transparent text-[12px] text-[var(--tone-default)] placeholder:text-[var(--tone-soft)] outline-none dark:text-[var(--tone-inverse)] dark:placeholder:text-[var(--tone-soft)]"
          />
        </div>
      </div>

      <div className="oa-scroll-panel h-full min-h-0 space-y-1 overflow-y-scroll overscroll-contain px-2 pb-3 pl-2 pt-1.5 pr-1">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <MessageSquare
              size={20}
              className="text-[var(--tone-soft)] dark:text-[var(--tone-soft)]"
            />
            <p className="text-[11px] text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
              {query ? 'No matching sessions' : 'No sessions yet'}
            </p>
          </div>
        )}

        {filtered.map((c) => {
          const active = c.id === activeConversationId
          const sessionName = c.title?.trim() || 'main'
          return (
            <button
              key={c.id}
              onClick={() => void selectConversation(c.id)}
              className={clsx(
                'group flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-all duration-100',
                active
                  ? 'border-[var(--border-strong)] bg-[var(--surface-subtle)] text-[var(--tone-strong)] shadow-sm dark:text-[var(--tone-inverse)]'
                  : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-muted)]',
              )}
            >
              <div
                className={clsx(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md',
                  active
                    ? 'bg-rose-50 text-[var(--accent)] dark:bg-rose-500/10'
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
                      ? 'text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]'
                      : 'text-[var(--tone-default)] group-hover:text-[var(--tone-strong)] dark:text-[var(--tone-inverse)] dark:group-hover:text-[var(--tone-inverse)]',
                  )}
                >
                  {sessionName}
                </p>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
                  {shortId(c.id)} | {timeAgo(c.lastMessageAt ?? c.createdAt)}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
