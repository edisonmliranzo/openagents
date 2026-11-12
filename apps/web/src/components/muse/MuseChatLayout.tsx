'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { MuseActivityPanel } from './MuseActivityPanel'
import { MuseSidePanel } from './MuseSidePanel'

export function MuseChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)

  useEffect(() => {
    const onOpenLeft = () => setLeftOpen(true)
    const onOpenRight = () => setRightOpen(true)
    window.addEventListener('openagents:open-sidebar', onOpenLeft)
    window.addEventListener('openagents:show-activity', onOpenRight)
    return () => {
      window.removeEventListener('openagents:open-sidebar', onOpenLeft)
      window.removeEventListener('openagents:show-activity', onOpenRight)
    }
  }, [])

  return (
    <div className="oa-canvas flex h-full min-h-0 w-full gap-3 overflow-hidden p-1.5 pt-[max(6px,env(safe-area-inset-top))] sm:p-4">
      {/* Left floating chat & session history card (desktop) */}
      <aside className="oa-float-card hidden w-[260px] shrink-0 flex-col overflow-hidden md:flex">
        <MuseSidePanel onNavigate={(href) => router.push(href)} />
      </aside>

      {/* Center column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>

        {/* Mobile left drawer */}
        {leftOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              aria-label="Close chats"
              onClick={() => setLeftOpen(false)}
              className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            />
            <div className="oa-float-card absolute inset-y-2 left-2 flex w-[min(300px,88vw)] flex-col overflow-hidden">
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
              className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            />
            <div className="oa-float-card absolute inset-y-2 right-2 flex w-[min(320px,90vw)] flex-col overflow-hidden">
              <button
                type="button"
                aria-label="Close activity panel"
                onClick={() => setRightOpen(false)}
                className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#232837] dark:text-slate-300"
              >
                <X size={14} />
              </button>
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
