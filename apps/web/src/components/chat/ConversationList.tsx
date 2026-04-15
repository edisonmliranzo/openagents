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
  const { conversations, activeConversationId, selectConversation, createConversation } = useChatStore()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) =>
      (c.title ?? 'Untitled conversation').toLowerCase().includes(q),
    )
  }, [conversations, query])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Conversations</h2>
        <button
          onClick={() => void createConversation()}
          title="New conversation"
          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
        >
          <MessageSquarePlus size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 pt-2 pb-1">
        <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5">
          <Search size={11} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full bg-transparent text-[12px] text-slate-700 placeholder-slate-400 outline-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3 pt-1">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <MessageSquare size={20} className="text-slate-300" />
            <p className="text-[11px] text-slate-400">
              {query ? 'No matching conversations' : 'No conversations yet'}
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
                'group flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all duration-100',
                active
                  ? 'bg-rose-50 ring-1 ring-rose-100'
                  : 'hover:bg-slate-50',
              )}
            >
              <div className={clsx(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md',
                active ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200',
              )}>
                <MessageSquare size={10} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={clsx(
                  'truncate text-[12px] font-medium leading-snug',
                  active ? 'text-rose-700' : 'text-slate-700 group-hover:text-slate-900',
                )}>
                  {c.title ?? 'Untitled conversation'}
                </p>
                {/* @ts-ignore updatedAt may exist */}
                {c.updatedAt && (
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {/* @ts-ignore */}
                    {timeAgo(c.updatedAt)}
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
