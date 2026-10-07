'use client'

import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { PenSquare, Search, Settings, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useChatStore } from '@/stores/chat'

interface MuseSidePanelProps {
  onNavigate?: (href: string) => void
  onCloseMobile?: () => void
}

function formatTitle(title: string | null | undefined, fallback: string) {
  const t = (title ?? '').trim()
  return t.length > 0 ? t : fallback
}

export function MuseSidePanel({ onCloseMobile }: MuseSidePanelProps) {
  const router = useRouter()
  const conversations = useChatStore((s) => s.conversations)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const createConversation = useChatStore((s) => s.createConversation)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const rows = useMemo(() => {
    const list = Array.isArray(conversations) ? [...conversations] : []
    list.sort((a, b) => {
      const at = new Date(a.lastMessageAt ?? a.createdAt).getTime()
      const bt = new Date(b.lastMessageAt ?? b.createdAt).getTime()
      return bt - at
    })
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) => (c.title ?? '').toLowerCase().includes(q))
  }, [conversations, query])

  const mainChat = rows[0] ?? null
  const sideChats = rows.slice(1)

  async function handleSelect(id: string) {
    await selectConversation(id)
    onCloseMobile?.()
  }

  async function handleNew() {
    if (creating) return
    setCreating(true)
    try {
      await createConversation()
      onCloseMobile?.()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Brand */}
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <p className="text-[15px] font-semibold text-slate-800">OpenAgents</p>
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close chats"
            className="oa-pill-btn h-8 w-8 text-slate-400"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Search (expandable) */}
      {searchOpen && (
        <div className="px-4 pb-1">
          <div className="oa-search flex items-center gap-2 px-3.5 py-2">
            <Search size={13} className="shrink-0 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats"
              className="w-full bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        </div>
      )}

      {/* Main chat */}
      <div className="mt-2 px-3">
        {mainChat ? (
          <button
            type="button"
            onClick={() => void handleSelect(mainChat.id)}
            className={clsx(
              'w-full truncate rounded-2xl px-4 py-2.5 text-left text-[14px] transition',
              mainChat.id === activeConversationId
                ? 'bg-slate-200/70 font-medium text-slate-900'
                : 'text-slate-600 hover:bg-slate-200/40',
            )}
          >
            {formatTitle(mainChat.title, 'Main chat')}
          </button>
        ) : (
          <p className="px-4 py-2 text-[13px] text-slate-400">No chats yet</p>
        )}
      </div>

      {/* Side chats */}
      <div className="mt-4 flex items-center justify-between px-6">
        <p className="text-[13px] text-slate-400">Side chats</p>
      </div>
      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        <div className="space-y-0.5">
          {sideChats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void handleSelect(c.id)}
              className={clsx(
                'w-full truncate rounded-2xl px-4 py-2 text-left text-[14px] transition',
                c.id === activeConversationId
                  ? 'bg-slate-200/70 font-medium text-slate-900'
                  : 'text-slate-600 hover:bg-slate-200/40',
              )}
            >
              {formatTitle(c.title, 'Untitled chat')}
            </button>
          ))}
          {sideChats.length === 0 && rows.length > 0 && (
            <p className="px-4 py-1 text-[12px] text-slate-400">No side chats yet.</p>
          )}
        </div>
      </div>

      {/* Bottom floating pill: settings · search · compose */}
      <div className="px-3 pb-4 pt-2">
        <div className="flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/70 px-2 py-1.5 shadow-sm backdrop-blur-xl dark:border-[#2d3347] dark:bg-[#1a2032]/70">
          <button
            type="button"
            onClick={() => router.push('/settings/config')}
            title="Settings"
            aria-label="Settings"
            className="oa-pill-btn h-8 w-8 text-slate-500"
          >
            <Settings size={15} />
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[12px] text-slate-400 transition hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
          >
            <Search size={13} /> Search
          </button>
          <button
            type="button"
            onClick={() => void handleNew()}
            disabled={creating}
            title="New chat"
            aria-label="New chat"
            className="oa-pill-btn h-8 w-8 bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50"
          >
            <PenSquare size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
