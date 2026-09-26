'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PanelLeft, PanelRight } from 'lucide-react'
import { MuseActivityPanel } from './MuseActivityPanel'
import { MuseIconRail, MuseSidePanel } from './MuseSidePanel'

export function MuseChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-gradient-to-br from-[#f8fafc] via-white to-[#fff5f2]">
      {/* Far-left icon rail (desktop) */}
      <div className="hidden md:block">
        <MuseIconRail onNavigate={(href) => router.push(href)} />
      </div>

      {/* Chats column (desktop) */}
      <aside className="hidden w-[240px] shrink-0 flex-col border-r border-slate-200/70 bg-white/70 backdrop-blur-xl md:flex">
        <MuseSidePanel onNavigate={(href) => router.push(href)} />
      </aside>

      {/* Center */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 py-1.5 lg:hidden">
          <button
            type="button"
            aria-label="Toggle chats"
            onClick={() => setLeftOpen((v) => !v)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <PanelLeft size={16} />
          </button>
          <p className="flex-1 text-center text-[13px] font-medium text-slate-600">OpenAgents</p>
          <button
            type="button"
            aria-label="Toggle activity"
            onClick={() => setRightOpen((v) => !v)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <PanelRight size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>

        {leftOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button type="button" aria-label="Close chats" onClick={() => setLeftOpen(false)} className="absolute inset-0 bg-black/20" />
            <div className="absolute inset-y-0 left-0 flex w-[min(320px,85vw)] bg-white shadow-xl">
              <MuseIconRail onNavigate={(href) => { setLeftOpen(false); router.push(href) }} />
              <div className="min-w-0 flex-1">
                <MuseSidePanel onNavigate={(href) => { setLeftOpen(false); router.push(href) }} onCloseMobile={() => setLeftOpen(false)} />
              </div>
            </div>
          </div>
        )}

        {rightOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button type="button" aria-label="Close activity" onClick={() => setRightOpen(false)} className="absolute inset-0 bg-black/20" />
            <div className="absolute inset-y-0 right-0 w-[min(300px,85vw)] bg-white shadow-xl">
              <MuseActivityPanel />
            </div>
          </div>
        )}
      </div>

      {/* Right activity column (desktop) */}
      <aside className="hidden w-[300px] shrink-0 flex-col border-l border-slate-200/70 bg-white/70 backdrop-blur-xl lg:flex">
        <MuseActivityPanel />
      </aside>
    </div>
  )
}
