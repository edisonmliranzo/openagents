'use client'

import { useUIStore } from '@/stores/ui'
import type { ToastType } from '@/stores/ui'

const COLORS: Record<ToastType, string> = {
  info: 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]',
  success:
    'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)] dark:text-[var(--status-success-text)]',
  warning:
    'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] dark:text-[var(--status-warning-text)]',
  error:
    'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] dark:text-[var(--status-danger-text)]',
}

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts)
  const removeToast = useUIStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`oa-toast flex w-full max-w-sm items-center justify-between gap-3 rounded-2xl border px-4 py-3 sm:w-auto ${COLORS[t.type]}`}
        >
          <span className="text-sm">{t.message}</span>
          <button
            type="button"
            onClick={() => removeToast(t.id)}
            className="shrink-0 text-current/70 transition hover:text-current"
            aria-label="Dismiss"
          >
            x
          </button>
        </div>
      ))}
    </div>
  )
}
