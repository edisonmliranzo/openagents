'use client'

import { useChatStore } from '@/stores/chat'
import type { Approval } from '@openagents/shared'
import { ShieldAlert, Check, X } from 'lucide-react'

type ApprovalRiskLevel = 'low' | 'medium' | 'high'

function riskClass(level?: ApprovalRiskLevel) {
  if (level === 'high') return 'bg-red-100 text-red-700'
  if (level === 'medium') return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

function renderValue(value: unknown) {
  if (value == null) return 'null'
  if (typeof value === 'string') return value.length > 72 ? `${value.slice(0, 72)}...` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    const serialized = JSON.stringify(value)
    return serialized.length > 72 ? `${serialized.slice(0, 72)}...` : serialized
  } catch {
    return String(value).slice(0, 72)
  }
}

export function ApprovalBanner({ approval }: { approval: Approval }) {
  const { approveAction, denyAction } = useChatStore()
  const previewEntries = Object.entries(approval.toolInput).slice(0, 3)
  const preview = approval.toolInputPreview?.trim()

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface)]">
        <ShieldAlert size={13} className="text-slate-700 dark:text-slate-200" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-100">Action requires approval</p>
          {approval.risk && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskClass(approval.risk.level)}`}>
              {approval.risk.level} risk {approval.risk.score}
            </span>
          )}
        </div>
        <p className="mt-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">{approval.toolName}</p>
        {(approval.inputKeys?.length ?? 0) > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {approval.inputKeys?.slice(0, 4).map((key) => (
              <span
                key={key}
                className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] text-slate-500 dark:text-slate-400"
              >
                {key}
              </span>
            ))}
          </div>
        )}
        {preview && (
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{preview}</p>
        )}
        {previewEntries.length > 0 && (
          <div className="mt-1 grid gap-1 text-[10px] text-slate-500 dark:text-slate-400 sm:grid-cols-2">
            {previewEntries.map(([key, value]) => (
              <p key={key} className="truncate">
                <span className="font-semibold text-slate-600 dark:text-slate-300">{key}:</span>{' '}
                {renderValue(value)}
              </p>
            ))}
          </div>
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
