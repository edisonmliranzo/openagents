'use client'

import { useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { BrowserSessionRow } from '@openagents/sdk'
import { BrowserPreview } from './BrowserPreview'

/**
 * Shows a live "Browser" card in the chat while the agent has an active
 * browser session — screenshot, status, and an Open-browser link.
 */
export function BrowserActivityCard() {
  const [session, setSession] = useState<BrowserSessionRow | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const sessions = await sdk.browser.listSessions()
        if (cancelled) return
        const active = sessions.find((s) => s.status === 'active' || s.status === 'initializing') ?? null
        setSession(active)
      } catch {
        if (!cancelled) setSession(null)
      }
    }
    void tick()
    const interval = setInterval(() => void tick(), 4000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (!session) return null

  return (
    <div className="mx-auto w-full max-w-[980px] px-1">
      <BrowserPreview
        sessionId={session.id}
        url={session.url}
        status={session.status}
        lastScreenshot={session.lastScreenshot}
      />
    </div>
  )
}
