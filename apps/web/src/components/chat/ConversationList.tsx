'use client'

import { useChatStore } from '@/stores/chat'
import clsx from 'clsx'
import { MessageSquarePlus, MessageSquare, Search } from 'lucide-react'
import { useState, useMemo } from 'react'

function timeAgo(iso: string | null | undefined) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  return `${Math.floor(hr / 24)}d`
}

export function ConversationList() {
  const { conversations, activeConversationId, selectConversation, createConversation } =
    useChatStore()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) =>
      (c.title ?? 'Untitled task').toLowerCase().includes(q),
    )
  }, [conversations, query])

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] dark:text-[var(--muted)]">
            Tasks
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--muted)] dark:text-[var(--muted)]">
            {filtered.length} tasks
          </p>
        </div>
        <button
          onClick={() => void createConversation()}
          title="New task"
          className="oa-soft-button inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition dark:text-[var(--tone-inverse)]"
        >
          <MessageSquarePlus size={14} />
          New task
        </button>
      </div>

      <div className="shrink-0 px-3 pb-1 pt-2.5">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-2 shadow-sm">
          <Search
            size={12}
            className="shrink-0 text-[var(--tone-soft)] dark:text-[var(--tone-soft)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks..."
            className="w-full bg-transparent text-[12px] text-[var(--tone-default)] placeholder:text-[var(--tone-soft)] outline-none dark:text-[var(--tone-inverse)] dark:placeholder:text-[var(--tone-soft)]"
          />
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3 pt-1.5">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <MessageSquare
              size={20}
              className="text-[var(--tone-soft)] dark:text-[var(--tone-soft)]"
            />
            <p className="text-[11px] text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
              {query ? 'No matching tasks' : 'No tasks yet'}
            </p>
          </div>
        )}

        {filtered.map((c) => {
          const active = c.id === activeConversationId
          return (
            <button
              key={c.id}
              onClick={() => void selectConversation(c.id)}
              className={clsx(
                'group flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-100',
                active
                  ? 'border-[var(--border-strong)] bg-[var(--surface-muted)] text-[var(--tone-strong)] shadow-sm dark:text-[var(--tone-inverse)]'
                  : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-muted)] hover:shadow-sm',
              )}
            >
              <div
                className={clsx(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md',
                  active
                    ? 'oa-brand-badge text-white'
                    : 'bg-[var(--surface-muted)] text-[var(--tone-soft)] group-hover:bg-[var(--surface-subtle)]',
                )}
              >
                <MessageSquare size={10} />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={clsx(
                    'truncate text-[12px] font-medium leading-snug',
                    active
                      ? 'text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]'
                      : 'text-[var(--tone-default)] group-hover:text-[var(--tone-strong)] dark:text-[var(--tone-inverse)] dark:group-hover:text-[var(--tone-inverse)]',
                  )}
                >
                  {c.title ?? 'Untitled task'}
                </p>
                {/* @ts-ignore updatedAt may exist */}
                {c.updatedAt && (
                  <p className="mt-0.5 text-[10px] text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
                    {/* @ts-ignore */}
                    {timeAgo(c.updatedAt)}
                  </p>
                )}
              </div>
              {active && (
                <span className="mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
