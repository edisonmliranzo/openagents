'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, PanelRight } from 'lucide-react'
import { MuseActivityPanel } from './MuseActivityPanel'
import { MuseSidePanel } from './MuseSidePanel'

export function MuseChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)

  return (
    <div className="oa-canvas flex h-full min-h-0 w-full gap-3 overflow-hidden p-3 sm:p-4">
      {/* Left floating chat & session history card (desktop) */}
      <aside className="oa-float-card hidden w-[260px] shrink-0 flex-col overflow-hidden md:flex">
        <MuseSidePanel onNavigate={(href) => router.push(href)} />
      </aside>

      {/* Center column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar for drawer access on mobile/tablet */}
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

        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>

        {/* Mobile left drawer */}
        {leftOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              aria-label="Close chats"
              onClick={() => setLeftOpen(false)}
              className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
            />
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

        {/* Mobile/tablet right drawer */}
        {rightOpen && (
          <div className="fixed inset-0 z-50 xl:hidden">
            <button
              type="button"
              aria-label="Close activity"
              onClick={() => setRightOpen(false)}
              className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
            />
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
