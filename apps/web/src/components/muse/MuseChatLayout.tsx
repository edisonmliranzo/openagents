'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  CheckSquare,
  Lightbulb,
  ListChecks,
  MessageCircle,
  PanelRight,
  Sparkles,
  Users,
} from 'lucide-react'
import { MuseActivityPanel } from './MuseActivityPanel'
import { MuseSidePanel } from './MuseSidePanel'
import clsx from 'clsx'

const TAB_ITEMS = [
  { icon: MessageCircle, label: 'Chat', href: '/chat' },
  { icon: BookOpen, label: 'Library', href: '/library' },
  { icon: Lightbulb, label: 'Ideas', action: 'ideas' },
  { icon: CheckSquare, label: 'Approvals', href: '/approvals' },
  { icon: ListChecks, label: 'Tasks', href: '/tasks' },
  { icon: Users, label: 'Team', href: '/team' },
  { icon: Sparkles, label: 'Frontier', href: '/frontier' },
]

export function MuseChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)

  function handleTab(item: (typeof TAB_ITEMS)[number]) {
    if (item.action === 'ideas') {
      window.dispatchEvent(new CustomEvent('openagents:show-ideas'))
      setRightOpen(true)
      return
    }
    if (item.href) router.push(item.href)
  }

  return (
    <div className="oa-canvas flex h-full min-h-0 w-full gap-3 overflow-hidden p-3 sm:p-4">
      {/* Left floating chat card (desktop) */}
      <aside className="oa-float-card hidden w-[250px] shrink-0 flex-col overflow-hidden md:flex">
        <MuseSidePanel onNavigate={(href) => router.push(href)} />
      </aside>

      {/* Center column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar for drawer access below xl (left chats only below md) */}
        <div className="mb-2 flex items-center justify-between px-1 xl:hidden">
          <button
            type="button"
            aria-label="Open chats"
            onClick={() => setLeftOpen(true)}
            className="oa-pill-btn h-9 w-9 bg-white/70 text-slate-500 shadow-sm md:hidden"
          >
            <MessageCircle size={16} />
          </button>
          <span className="hidden flex-1 md:block" />
          <button
            type="button"
            aria-label="Open activity"
            onClick={() => setRightOpen(true)}
            className="oa-pill-btn ml-auto h-9 w-9 bg-white/70 text-slate-500 shadow-sm"
          >
            <PanelRight size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden pb-20 md:pb-16">{children}</div>

        {/* Floating bottom pill nav */}
        <nav
          aria-label="Primary"
          className="oa-pill-nav fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto px-2 py-1.5"
        >
          {TAB_ITEMS.map((item) => {
            const Icon = item.icon
            const isCurrent = item.href === '/chat'
            return (
              <button
                key={item.label}
                type="button"
                title={item.label}
                aria-label={item.label}
                onClick={() => handleTab(item)}
                className={clsx(
                  'oa-pill-btn h-10 w-11',
                  isCurrent ? 'bg-slate-900 text-white hover:bg-slate-700' : 'text-slate-500',
                )}
              >
                <Icon size={17} />
              </button>
            )
          })}
        </nav>

        {/* Mobile left drawer */}
        {leftOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button type="button" aria-label="Close chats" onClick={() => setLeftOpen(false)} className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" />
            <div className="oa-float-card absolute inset-y-4 left-4 flex w-[min(300px,85vw)] flex-col overflow-hidden">
              <MuseSidePanel
                onNavigate={(href) => {
                  setLeftOpen(false)
                  router.push(href)
                }}
                onCloseMobile={() => setLeftOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Mobile/tablet right drawer (below xl where the card is inline) */}
        {rightOpen && (
          <div className="fixed inset-0 z-50 xl:hidden">
            <button type="button" aria-label="Close activity" onClick={() => setRightOpen(false)} className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" />
            <div className="oa-float-card absolute inset-y-4 right-4 flex w-[min(320px,88vw)] flex-col overflow-hidden">
              <MuseActivityPanel />
            </div>
          </div>
        )}
      </div>

      {/* Right floating activity card (desktop) */}
      <aside className="oa-float-card hidden w-[300px] shrink-0 flex-col overflow-hidden xl:flex">
        <MuseActivityPanel />
      </aside>
    </div>
  )
}
