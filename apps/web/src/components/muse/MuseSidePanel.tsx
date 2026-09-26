'use client'

import { useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  CheckSquare,
  Files,
  Lightbulb,
  LayoutGrid,
  MessageCircle,
  Plus,
  Search,
} from 'lucide-react'
import { useChatStore } from '@/stores/chat'

interface MuseSidePanelProps {
  onNavigate?: (href: string) => void
  onCloseMobile?: () => void
}

function formatTitle(title: string | null | undefined, fallback: string) {
  const t = (title ?? '').trim()
  return t.length > 0 ? t : fallback
}

export function MuseSidePanel({ onNavigate, onCloseMobile }: MuseSidePanelProps) {
  const conversations = useChatStore((s) => s.conversations)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const createConversation = useChatStore((s) => s.createConversation)
  const [query, setQuery] = useState('')
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
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
          <Search size={13} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="mt-4 px-3">
        <p className="px-1 text-[12px] font-medium text-slate-500">Main chat</p>
        <div className="mt-1">
          {mainChat ? (
            <button
              type="button"
              onClick={() => void handleSelect(mainChat.id)}
              className={clsx(
                'w-full truncate rounded-lg px-2 py-1.5 text-left text-[13px] transition',
                mainChat.id === activeConversationId
                  ? 'bg-slate-100 font-medium text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              {formatTitle(mainChat.title, 'Main chat')}
            </button>
          ) : (
            <p className="px-2 py-1.5 text-[13px] text-slate-400">No chats yet</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between px-3">
        <p className="px-1 text-[12px] font-medium text-slate-500">
          Side chats {sideChats.length > 0 && <span className="text-slate-400">· {sideChats.length}</span>}
        </p>
        <button
          type="button"
          onClick={() => void handleNew()}
          disabled={creating}
          aria-label="New side chat"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {sideChats.length === 0 ? (
          <p className="px-2 py-2 text-[12px] leading-relaxed text-slate-400">
            {rows.length === 0 ? 'Start a conversation.' : 'Side chats appear here.'}
          </p>
        ) : (
          <div className="space-y-0.5">
            {sideChats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void handleSelect(c.id)}
                className={clsx(
                  'w-full truncate rounded-lg px-2 py-1.5 text-left text-[13px] transition',
                  c.id === activeConversationId
                    ? 'bg-slate-100 font-medium text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                {formatTitle(c.title, 'Untitled chat')}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const RAIL_ITEMS = [
  { icon: MessageCircle, label: 'Chat', href: '/chat' },
  { icon: Search, label: 'Search', href: '/control/repair' },
  { icon: Files, label: 'Artifacts', href: '/artifacts' },
  { icon: Lightbulb, label: 'Ideas', href: '/memory' },
  { icon: CheckSquare, label: 'Approvals', href: '/approvals' },
  { icon: LayoutGrid, label: 'Control', href: '/control/overview' },
]

export function MuseIconRail({ onNavigate }: { onNavigate?: (href: string) => void }) {
  return (
    <div className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-white py-3">
      {RAIL_ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.label}
            type="button"
            title={item.label}
            aria-label={item.label}
            onClick={() => onNavigate?.(item.href)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <Icon size={17} />
          </button>
        )
      })}
      <div className="mt-auto flex flex-col items-center gap-2">
        <button
          type="button"
          title="New chat"
          aria-label="New chat"
          onClick={async () => {
            await useChatStore.getState().createConversation()
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-700"
        >
          <Plus size={17} />
        </button>
      </div>
    </div>
  )
}
