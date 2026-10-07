'use client'

import { useChatStore } from '@/stores/chat'
import type { Approval } from '@openagents/shared'
import { ShieldAlert, Check, X, ShoppingCart } from 'lucide-react'
import clsx from 'clsx'

type ApprovalRiskLevel = 'low' | 'medium' | 'high'

function riskClass(level?: ApprovalRiskLevel) {
  if (level === 'high') return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
  if (level === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
}

const ACTION_LABELS: Record<string, string> = {
  shell_execute: 'run a command on your machine',
  shell_session_run: 'run a command in your shell session',
  code_execute: 'execute a code snippet',
  computer_navigate: 'navigate your browser',
  computer_click_link: 'click something in the browser',
  computer_session_start: 'open a browser session',
  gmail_send_draft: 'send an email draft',
  gmail_draft_reply: 'draft an email reply',
  calendar_create_event: 'create a calendar event',
  calendar_cancel_event: 'cancel a calendar event',
  telegram_send: 'send a Telegram message',
  whatsapp_send: 'send a WhatsApp message',
  slack_send: 'send a Slack message',
  bybit_place_demo_order: 'place a demo trade order',
  notion_create_page: 'create a Notion page',
  jira_create_issue: 'create a Jira issue',
  linear_create_issue: 'create a Linear issue',
  github_create_pr: 'open a GitHub pull request',
  github_create_issue: 'open a GitHub issue',
}

function humanizeTool(toolName: string): string {
  return toolName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function actionLabel(toolName: string): string {
  return ACTION_LABELS[toolName] ?? `use the ${humanizeTool(toolName)} tool`
}

function isPurchaseTool(toolName: string): boolean {
  return /bybit|order|checkout|purchase|pay|buy/i.test(toolName)
}

function renderValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 120)}…` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    const serialized = JSON.stringify(value)
    return serialized.length > 120 ? `${serialized.slice(0, 120)}…` : serialized
  } catch {
    return String(value).slice(0, 120)
  }
}

const HIDDEN_KEYS = new Set(['apiKey', 'token', 'password', 'secret'])

export function ApprovalBanner({ approval }: { approval: Approval }) {
  const { approveAction, denyAction } = useChatStore()
  const purchase = isPurchaseTool(approval.toolName)
  const detailEntries = Object.entries(approval.toolInput ?? {}).filter(
    ([key]) => !HIDDEN_KEYS.has(key.toLowerCase()),
  )

  return (
    <div className="oa-float-card w-full overflow-hidden !rounded-2xl">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className={clsx(
          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          purchase ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
        )}>
          {purchase ? <ShoppingCart size={16} /> : <ShieldAlert size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
            OpenAgents wants to {actionLabel(approval.toolName)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {approval.toolInputPreview?.trim() || 'Verify the details below before approving.'}
          </p>
        </div>
        {approval.risk && (
          <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize', riskClass(approval.risk.level))}>
            {approval.risk.level} risk
          </span>
        )}
      </div>

      {/* Details */}
      {detailEntries.length > 0 && (
        <div className="mx-4 mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white/70 dark:divide-[#232837] dark:border-[#232837] dark:bg-[#141824]/60">
          {detailEntries.slice(0, 5).map(([key, value]) => (
            <div key={key} className="flex items-baseline justify-between gap-3 px-3 py-2">
              <span className="shrink-0 text-[11px] font-medium text-slate-400">{humanizeTool(key)}</span>
              <span className="min-w-0 truncate text-right text-[12px] text-slate-700 dark:text-slate-200">{renderValue(value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 p-4">
        <button
          type="button"
          onClick={() => void denyAction(approval.id)}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-slate-100 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-200 active:scale-[0.98] dark:bg-[#232837] dark:text-slate-300 dark:hover:bg-[#2d3347]"
        >
          <X size={14} />
          Deny
        </button>
        <button
          type="button"
          onClick={() => void approveAction(approval.id)}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-[13px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(37,99,235,0.6)] transition hover:brightness-110 active:scale-[0.98]"
        >
          <Check size={14} />
          Allow
        </button>
      </div>
    </div>
  )
}
