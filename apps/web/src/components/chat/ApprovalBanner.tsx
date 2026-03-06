'use client'

import { useChatStore } from '@/stores/chat'
import type { Approval } from '@openagents/shared'
import { ShieldAlert, Check, X } from 'lucide-react'

export function ApprovalBanner({ approval }: { approval: Approval }) {
  const { approveAction, denyAction } = useChatStore()

  const preview = (() => {
    try {
      return JSON.stringify(approval.toolInput).slice(0, 90)
    } catch {
      return String(approval.toolInput).slice(0, 90)
    }
  })()

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface)]">
        <ShieldAlert size={13} className="text-slate-700 dark:text-slate-200" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-100">Action requires approval</p>
        <p className="mt-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">{approval.toolName}</p>
        {preview && (
          <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">{preview}...</p>
        )}
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          onClick={() => void approveAction(approval.id)}
          className="flex items-center gap-1 rounded-lg bg-black px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-95 dark:bg-white dark:text-black"
        >
          <Check size={11} />
          Approve
        </button>
        <button
          onClick={() => void denyAction(approval.id)}
          className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-[var(--surface-subtle)] active:scale-95 dark:text-slate-200"
        >
          <X size={11} />
          Deny
        </button>
      </div>
    </div>
  )
}
