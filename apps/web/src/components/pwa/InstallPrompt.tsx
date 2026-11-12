'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'openagents.pwa.install-dismissed'

/** Shows a small "Install app" card when the browser fires beforeinstallprompt. */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === '1') return
    } catch {
      /* ignore */
    }
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setDeferred(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!deferred) return null

  const dismiss = () => {
    setDeferred(null)
    try {
      window.localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  const install = async () => {
    try {
      await deferred.prompt()
      await deferred.userChoice
    } catch {
      /* ignore */
    }
    setDeferred(null)
  }

  return (
    <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[60] flex w-[min(92vw,380px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl sm:bottom-4 sm:left-auto sm:right-4 sm:translate-x-0">
      <div className="oa-brand-badge flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white">
        <Download size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">Install OpenAgents</p>
        <p className="text-[11px] text-[var(--muted)]">Add to your home screen for full-screen voice calls.</p>
      </div>
      <button
        type="button"
        onClick={() => void install()}
        className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
      >
        Install
      </button>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-[var(--muted)]">
        <X size={14} />
      </button>
    </div>
  )
}
