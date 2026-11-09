'use client'

import { sdk } from '@/stores/auth'

/** Tiny client error reporter: forwards window errors to POST /api/v1/client-errors (server rate-limits). */
let installed = false
let sending = false
let sentThisPage = 0
const MAX_PER_PAGE = 10

function report(message: string, stack?: string) {
  if (sending || sentThisPage >= MAX_PER_PAGE || !message) return
  sentThisPage += 1
  sending = true
  sdk.client
    .post('/api/v1/client-errors', {
      message: message.slice(0, 1000),
      stack: stack?.slice(0, 4000),
      url: typeof window !== 'undefined' ? window.location.pathname : undefined,
    })
    .catch(() => {})
    .finally(() => {
      sending = false
    })
}

export function installErrorReporting() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (e) => {
    report(String(e.message || e.error?.message || 'Unknown error'), e.error?.stack)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    report(r instanceof Error ? r.message : String(r ?? 'Unhandled rejection'), r instanceof Error ? r.stack : undefined)
  })
}
