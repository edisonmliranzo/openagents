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
    <div className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100">
        <ShieldAlert size={13} className="text-amber-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-amber-800">Action requires approval</p>
        <p className="mt-0.5 font-mono text-[11px] text-amber-700">{approval.toolName}</p>
        {preview && (
          <p className="mt-0.5 truncate text-[10px] text-amber-600/80">{preview}…</p>
        )}
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          onClick={() => void approveAction(approval.id)}
          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-95"
        >
          <Check size={11} />
          Approve
        </button>
        <button
          onClick={() => void denyAction(approval.id)}
          className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-red-600 shadow-sm transition hover:bg-red-50 active:scale-95"
        >
          <X size={11} />
          Deny
        </button>
      </div>
    </div>
  )
}
