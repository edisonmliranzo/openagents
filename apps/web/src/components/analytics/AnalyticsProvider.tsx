'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export interface AnalyticsEvent {
  type: 'pageview' | 'cta_click' | 'web_vital' | 'custom'
  path: string
  label?: string
  value?: number
  timestamp: string
  referrer?: string
}

declare global {
  interface Window {
    __OPENAGENTS_ANALYTICS__?: {
      events: AnalyticsEvent[]
      track: (event: Omit<AnalyticsEvent, 'timestamp' | 'path'> & { path?: string }) => void
    }
    gtag?: (...args: unknown[]) => void
    plausible?: (event: string, options?: { props?: Record<string, unknown> }) => void
  }
}

const STORAGE_KEY = 'openagents_analytics_events_v1'

function recordEvent(event: AnalyticsEvent) {
  if (typeof window === 'undefined') return

  try {
    if (!window.__OPENAGENTS_ANALYTICS__) {
      window.__OPENAGENTS_ANALYTICS__ = {
        events: [],
        track: (custom) => {
          recordEvent({
            ...custom,
            path: custom.path || window.location.pathname,
            timestamp: new Date().toISOString(),
          })
        },
      }
    }

    window.__OPENAGENTS_ANALYTICS__.events.push(event)

    // Persist last 100 events locally for inspection in /analytics
    const existingRaw = window.localStorage.getItem(STORAGE_KEY)
    const existing: AnalyticsEvent[] = existingRaw ? JSON.parse(existingRaw) : []
    const next = [...existing.slice(-99), event]
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))

    // Forward to Google Analytics / Plausible if configured
    if (typeof window.gtag === 'function') {
      window.gtag('event', event.type, {
        page_path: event.path,
        event_label: event.label,
        value: event.value,
      })
    }
    if (typeof window.plausible === 'function') {
      window.plausible(event.type, {
        props: { path: event.path, label: event.label, value: event.value },
      })
    }
  } catch {
    // Never block UI on telemetry storage errors
  }
}

export function AnalyticsProvider() {
  const pathname = usePathname() || '/'

  // Track route pageviews
  useEffect(() => {
    recordEvent({
      type: 'pageview',
      path: pathname,
      referrer: typeof document !== 'undefined' ? document.referrer || 'direct' : 'direct',
      timestamp: new Date().toISOString(),
    })
  }, [pathname])

  // Track CTA clicks & Core Web Vitals once mounted
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest('[data-analytics-cta], a, button') as HTMLElement | null
      if (!target) return
      const ctaName =
        target.getAttribute('data-analytics-cta') ||
        target.getAttribute('aria-label') ||
        target.textContent?.trim().slice(0, 60)
      if (!ctaName) return

      recordEvent({
        type: 'cta_click',
        path: window.location.pathname,
        label: ctaName,
        timestamp: new Date().toISOString(),
      })
    }

    window.addEventListener('click', handleClick, { passive: true })

    if (typeof window !== 'undefined' && 'performance' in window) {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
      if (navEntries[0] && navEntries[0].domContentLoadedEventEnd > 0) {
        recordEvent({
          type: 'web_vital',
          path: window.location.pathname,
          label: 'DOMContentLoaded_ms',
          value: Math.round(navEntries[0].domContentLoadedEventEnd),
          timestamp: new Date().toISOString(),
        })
      }
    }

    return () => {
      window.removeEventListener('click', handleClick)
    }
  }, [])

  return (
    <script
      id="openagents-telemetry-init"
      data-domain="openagents.edison0220.workers.dev"
      data-analytics-provider="openagents-telemetry"
      dangerouslySetInnerHTML={{
        __html: `window.__OPENAGENTS_ANALYTICS_READY__ = true;`,
      }}
    />
  )
}
