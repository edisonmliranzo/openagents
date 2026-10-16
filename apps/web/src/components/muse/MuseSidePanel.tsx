'use client'

import { useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  Activity,
  Bot,
  Brain,
  FolderKanban,
  LayoutGrid,
  ListChecks,
  PenSquare,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react'
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

const QUICK_MODULES = [
  { label: 'Autonomous Tasks', href: '/tasks', icon: ListChecks, badge: 'Engine', color: 'text-emerald-500' },
  { label: 'Specialist Swarm', href: '/team', icon: Users, badge: '4 Active', color: 'text-rose-500' },
  { label: 'Mission Control', href: '/control/mission-control', icon: Zap, badge: 'Live', color: 'text-amber-500' },
  { label: 'Memory Graph', href: '/memory', icon: Brain, badge: 'Recall', color: 'text-cyan-500' },
  { label: 'Full OS Console', href: '/control/overview', icon: LayoutGrid, badge: 'All', color: 'text-indigo-500' },
]

export function MuseSidePanel({ onNavigate, onCloseMobile }: MuseSidePanelProps) {
  const router = useRouter()
  const conversations = useChatStore((s) => s.conversations)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const createConversation = useChatStore((s) => s.createConversation)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const navigate = (href: string) => {
    if (onNavigate) {
      onNavigate(href)
    } else {
      router.push(href)
    }
    onCloseMobile?.()
  }

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
      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 pb-3 pt-4 border-b border-slate-200/60 dark:border-slate-800/80">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 text-left group"
        >
          <div className="oa-brand-badge flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black text-white shadow-sm">
            OA
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-bold tracking-tight text-slate-900 dark:text-white">
                OpenAgents
              </span>
              <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                v2.0
              </span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">Autonomous Agent OS</p>
          </div>
        </button>
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

      {/* OS Modules Quick Switcher */}
      <div className="px-3 pt-3 pb-2">
        <p className="px-2 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          OS Modules
        </p>
        <div className="space-y-0.5">
          {QUICK_MODULES.map((mod) => {
            const Icon = mod.icon
            return (
              <button
                key={mod.href}
                type="button"
                onClick={() => navigate(mod.href)}
                className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-[12px] font-medium text-slate-600 transition hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white"
              >
                <span className="flex items-center gap-2 truncate">
                  <Icon size={14} className={mod.color} />
                  <span className="truncate">{mod.label}</span>
                </span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {mod.badge}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Search (expandable) */}
      {searchOpen && (
        <div className="px-3 py-1.5">
          <div className="oa-search flex items-center gap-2 px-3 py-1.5">
            <Search size={13} className="shrink-0 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions..."
              className="w-full bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
            />
          </div>
        </div>
      )}

      {/* Primary Session */}
      <div className="mt-1 px-3">
        <p className="px-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          Active Stream
        </p>
        {mainChat ? (
          <button
            type="button"
            onClick={() => void handleSelect(mainChat.id)}
            className={clsx(
              'w-full truncate rounded-xl px-3 py-2 text-left text-[13px] transition',
              mainChat.id === activeConversationId
                ? 'bg-gradient-to-r from-rose-500/15 to-orange-500/10 font-semibold text-rose-600 ring-1 ring-rose-500/25 dark:text-rose-300'
                : 'text-slate-600 hover:bg-slate-200/40 dark:text-slate-300 dark:hover:bg-slate-800/60',
            )}
          >
            {formatTitle(mainChat.title, 'Main Command Session')}
          </button>
        ) : (
          <p className="px-3 py-2 text-[12px] text-slate-400">No sessions yet</p>
        )}
      </div>

      {/* History / Side Chats */}
      <div className="mt-3 flex items-center justify-between px-5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          Session History ({sideChats.length})
        </p>
      </div>
      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        <div className="space-y-0.5">
          {sideChats.map((c) => {
            const title = formatTitle(c.title, 'Untitled session')
            const isSpecialist = title.startsWith('@')
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => void handleSelect(c.id)}
                className={clsx(
                  'flex w-full items-center gap-2 truncate rounded-xl px-3 py-1.5 text-left text-[12px] transition',
                  c.id === activeConversationId
                    ? 'bg-gradient-to-r from-rose-500/15 to-orange-500/10 font-semibold text-rose-600 ring-1 ring-rose-500/25 dark:text-rose-300'
                    : 'text-slate-600 hover:bg-slate-200/40 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200',
                )}
              >
                {isSpecialist && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                )}
                <span className="truncate">{title}</span>
              </button>
            )
          })}
          {sideChats.length === 0 && rows.length > 0 && (
            <p className="px-3 py-1 text-[11px] text-slate-400 dark:text-slate-500">
              Delegate to a specialist or start a new thread.
            </p>
          )}
        </div>
      </div>

      {/* Bottom floating pill: settings · search · compose */}
      <div className="px-3 pb-3 pt-2 border-t border-slate-200/50 dark:border-slate-800/70">
        <div className="flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/80 px-2 py-1 shadow-sm backdrop-blur-xl dark:border-[#2d3347] dark:bg-[#141927]/90">
          <button
            type="button"
            onClick={() => navigate('/settings/config')}
            title="Brain & Provider Settings"
            aria-label="Settings"
            className="oa-pill-btn h-8 w-8 text-slate-500 dark:text-slate-400"
          >
            <Settings size={14} />
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[11px] font-medium text-slate-500 transition hover:bg-slate-100/70 dark:text-slate-400 dark:hover:bg-slate-800/60"
          >
            <Search size={12} /> Search
          </button>
          <button
            type="button"
            onClick={() => void handleNew()}
            disabled={creating}
            title="New Command Session"
            aria-label="New chat"
            className="oa-pill-btn h-8 w-8 bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-sm hover:brightness-110 disabled:opacity-50"
          >
            <PenSquare size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
