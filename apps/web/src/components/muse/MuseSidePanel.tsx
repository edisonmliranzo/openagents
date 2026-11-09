'use client'

import { useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  Activity,
  FileText,
  FlaskConical,
  History,
  LifeBuoy,
  ListChecks,
  Mic,
  PenSquare,
  Search,
  Settings,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useChatStore } from '@/stores/chat'
import { LABS_LINKS, useLabsEnabled } from '@/components/dashboard/labs'
import { ConversationSearchPanel } from './ConversationSearchPanel'

interface MuseSidePanelProps {
  onNavigate?: (href: string) => void
  onCloseMobile?: () => void
}

function formatTitle(title: string | null | undefined, fallback: string) {
  const t = (title ?? '').trim()
  return t.length > 0 ? t : fallback
}

const QUICK_MODULES = [
  { label: 'Voice Calls & Avatars', href: '/phone', icon: Mic, badge: 'Live', color: 'text-rose-500' },
  { label: 'Avatar Studio (Video)', href: '/avatars', icon: PenSquare, badge: 'Studio', color: 'text-fuchsia-500' },
  { label: 'Channels & Accounts', href: '/control/channels', icon: Activity, badge: 'Connect', color: 'text-sky-500' },
  { label: 'Autonomous Tasks', href: '/tasks', icon: ListChecks, badge: 'Tasks', color: 'text-amber-500' },
  { label: 'Sessions Manager', href: '/sessions', icon: History, badge: 'History', color: 'text-emerald-500' },
  { label: 'Settings & Models', href: '/settings/config', icon: Settings, badge: 'APIsRouter', color: 'text-indigo-500' },
  { label: 'Approvals', href: '/approvals', icon: ShieldAlert, badge: 'Review', color: 'text-orange-500' },
  { label: 'Voice Settings', href: '/settings/voice', icon: Mic, badge: 'Voice', color: 'text-pink-500' },
  { label: 'Support', href: '/support', icon: LifeBuoy, badge: 'Help', color: 'text-teal-500' },
  { label: 'Terms', href: '/terms', icon: FileText, badge: 'Legal', color: 'text-slate-500' },
]

export function MuseSidePanel({ onNavigate, onCloseMobile }: MuseSidePanelProps) {
  const router = useRouter()
  const conversations = useChatStore((s) => s.conversations)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const createConversation = useChatStore((s) => s.createConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const clearAllConversations = useChatStore((s) => s.clearAllConversations)
  const [searchOpen, setSearchOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [clearingAll, setClearingAll] = useState(false)
  const [labsEnabled, setLabsEnabled] = useLabsEnabled()

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
    return list
  }, [conversations])

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

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (deletingId) return
    setDeletingId(id)
    try {
      await deleteConversation(id)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleClearAll() {
    if (clearingAll || rows.length === 0) return
    if (typeof window !== 'undefined' && !window.confirm('Delete all session history? This cannot be undone.')) {
      return
    }
    setClearingAll(true)
    try {
      await clearAllConversations()
    } finally {
      setClearingAll(false)
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
            <p className="text-[10px] text-slate-400 dark:text-slate-500">Personal AI Agent</p>
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

      {/* Quick Navigation */}
      <div className="px-3 pt-3 pb-2">
        <p className="px-2 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          Workspace
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
        <button
          type="button"
          role="switch"
          aria-checked={labsEnabled}
          onClick={() => setLabsEnabled(!labsEnabled)}
          className="mt-1.5 flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-[11px] font-medium text-slate-500 transition hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800/70"
        >
          <span className="flex items-center gap-2">
            <FlaskConical size={13} className="text-violet-500" /> Labs (experimental)
          </span>
          <span className={clsx('relative inline-flex h-4 w-7 items-center rounded-full transition', labsEnabled ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-700')}>
            <span className={clsx('inline-block h-3 w-3 rounded-full bg-white shadow transition-transform', labsEnabled ? 'translate-x-3.5' : 'translate-x-0.5')} />
          </span>
        </button>
        {labsEnabled && (
          <div className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
            {LABS_LINKS.map((link) => (
              <button
                key={link.href}
                type="button"
                onClick={() => navigate(link.href)}
                className="flex w-full items-center gap-2 truncate rounded-xl px-2.5 py-1 text-left text-[11px] text-slate-500 transition hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-white"
              >
                <FlaskConical size={11} className="shrink-0 text-violet-400" />
                <span className="truncate">{link.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search (expandable) */}
      {searchOpen ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <ConversationSearchPanel
            onClose={() => setSearchOpen(false)}
            onOpenConversation={() => setSearchOpen(false)}
          />
        </div>
      ) : (
        <>
          {/* Primary Session */}
          <div className="mt-1 px-3">
            <p className="px-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              Active Session
            </p>
            {mainChat ? (
              <div
                className={clsx(
                  'group flex w-full items-center justify-between gap-1 rounded-xl px-3 py-2 text-[13px] transition',
                  mainChat.id === activeConversationId
                    ? 'bg-gradient-to-r from-rose-500/15 to-orange-500/10 font-semibold text-rose-600 ring-1 ring-rose-500/25 dark:text-rose-300'
                    : 'text-slate-600 hover:bg-slate-200/40 dark:text-slate-300 dark:hover:bg-slate-800/60',
                )}
              >
                <button
                  type="button"
                  onClick={() => void handleSelect(mainChat.id)}
                  className="min-w-0 flex-1 truncate text-left"
                >
                  {formatTitle(mainChat.title, 'New Session')}
                </button>
                <button
                  type="button"
                  onClick={(e) => void handleDelete(e, mainChat.id)}
                  disabled={deletingId === mainChat.id}
                  title="Delete this session"
                  aria-label="Delete session"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-slate-400 opacity-70 transition hover:bg-rose-500/15 hover:text-rose-600 group-hover:opacity-100 disabled:opacity-40 dark:hover:text-rose-300"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ) : (
              <p className="px-3 py-2 text-[12px] text-slate-400">No sessions yet</p>
            )}
          </div>

          {/* History / Side Chats */}
          <div className="mt-3 flex items-center justify-between px-5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              Session History ({sideChats.length})
            </p>
            {sideChats.length > 0 && (
              <button
                type="button"
                onClick={() => void handleClearAll()}
                disabled={clearingAll}
                title="Delete all session history"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-40 dark:hover:text-rose-400"
              >
                <Trash2 size={11} />
                <span>{clearingAll ? 'Clearing...' : 'Clear all'}</span>
              </button>
            )}
          </div>
          <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-3 pb-2">
            <div className="space-y-0.5">
              {sideChats.map((c) => {
                const title = formatTitle(c.title, 'Untitled session')
                const isSpecialist = title.startsWith('@')
                return (
                  <div
                    key={c.id}
                    className={clsx(
                      'group flex w-full items-center justify-between gap-1 rounded-xl px-3 py-1.5 text-[12px] transition',
                      c.id === activeConversationId
                        ? 'bg-gradient-to-r from-rose-500/15 to-orange-500/10 font-semibold text-rose-600 ring-1 ring-rose-500/25 dark:text-rose-300'
                        : 'text-slate-600 hover:bg-slate-200/40 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void handleSelect(c.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 truncate text-left"
                    >
                      {isSpecialist && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                      )}
                      <span className="truncate">{title}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => void handleDelete(e, c.id)}
                      disabled={deletingId === c.id}
                      title={`Delete "${title}"`}
                      aria-label={`Delete ${title}`}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-slate-400 opacity-60 transition hover:bg-rose-500/15 hover:text-rose-600 group-hover:opacity-100 disabled:opacity-40 dark:hover:text-rose-300"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              })}
              {sideChats.length === 0 && rows.length > 0 && (
                <p className="px-3 py-1 text-[11px] text-slate-400 dark:text-slate-500">
                  No older sessions in history.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Bottom bar: settings · search · new chat */}
      <div className="px-3 pb-3 pt-2 border-t border-slate-200/50 dark:border-slate-800/70">
        <div className="flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/80 px-2 py-1 shadow-sm backdrop-blur-xl dark:border-[#2d3347] dark:bg-[#141927]/90">
          <button
            type="button"
            onClick={() => navigate('/settings/config')}
            title="AI Models & APIsRouter Settings"
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
            title="New Session"
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
