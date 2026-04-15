'use client'

import { sdk } from '@/stores/auth'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Notification } from '@openagents/shared'

interface ConnectorTool {
  name: string
  displayName: string
  description: string
  requiresApproval: boolean
}

interface ChannelGroup {
  id: string
  label: string
  description: string
}

const CHANNEL_GROUPS: ChannelGroup[] = [
  { id: 'gmail', label: 'Gmail', description: 'Inbox search and draft tools' },
  { id: 'calendar', label: 'Calendar', description: 'Availability and event creation' },
  { id: 'web', label: 'Web', description: 'Web content retrieval' },
  { id: 'notes', label: 'Notes', description: 'Internal notes and memory capture' },
  { id: 'other', label: 'Other', description: 'Additional connector capabilities' },
]

function inferGroupId(toolName: string) {
  if (toolName.startsWith('gmail_')) return 'gmail'
  if (toolName.startsWith('calendar_')) return 'calendar'
  if (toolName.startsWith('web_')) return 'web'
  if (toolName.startsWith('notes_')) return 'notes'
  return 'other'
}

function timeAgo(isoDate: string) {
  const ts = new Date(isoDate).getTime()
  if (!Number.isFinite(ts)) return 'n/a'
  const deltaMin = Math.max(0, Math.floor((Date.now() - ts) / 60000))
  if (deltaMin < 1) return 'just now'
  if (deltaMin < 60) return `${deltaMin}m ago`
  const deltaHours = Math.floor(deltaMin / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`
  return `${Math.floor(deltaHours / 24)}d ago`
}

export default function ChannelsPage() {
  const [tools, setTools] = useState<ConnectorTool[]>([])
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [latestNotification, setLatestNotification] = useState<Notification | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [toolList, approvals, notifications] = await Promise.all([
        sdk.tools.list(),
        sdk.approvals.list('pending'),
        sdk.notifications.list(),
      ])
      setTools(toolList)
      setPendingApprovals(approvals.length)
      setLatestNotification(notifications[0] ?? null)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load channels')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const toolsByGroup = useMemo(() => {
    const grouped = new Map<string, ConnectorTool[]>()
    for (const group of CHANNEL_GROUPS) {
      grouped.set(group.id, [])
    }

    for (const tool of tools) {
      const groupId = inferGroupId(tool.name)
      const list = grouped.get(groupId) ?? []
      list.push(tool)
      grouped.set(groupId, list)
    }

    return grouped
  }, [tools])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Channels</h1>
          <p className="mt-1 text-sm text-slate-500">Connector and channel capability status.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Registered Tools</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{tools.length}</p>
          <p className="mt-1 text-xs text-slate-500">Total callable connector actions</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pending Approvals</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{pendingApprovals}</p>
          <p className="mt-1 text-xs text-slate-500">Actions waiting on user confirmation</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Latest Notification</p>
          <p className="mt-2 truncate text-sm font-semibold text-slate-900">
            {latestNotification?.title ?? 'No alerts'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {latestNotification ? `${latestNotification.type} - ${timeAgo(latestNotification.createdAt)}` : 'n/a'}
          </p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {CHANNEL_GROUPS.map((group) => {
          const groupTools = toolsByGroup.get(group.id) ?? []
          return (
            <article key={group.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{group.label}</h2>
                  <p className="text-sm text-slate-500">{group.description}</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {groupTools.length} tools
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {groupTools.length === 0 && (
                  <p className="text-sm text-slate-500">No tools registered for this connector.</p>
                )}
                {groupTools.map((tool) => (
                  <div key={tool.name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{tool.displayName}</p>
                        <p className="mt-1 text-xs text-slate-500">{tool.description}</p>
                        <p className="mt-1 font-mono text-[11px] text-slate-400">{tool.name}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          tool.requiresApproval
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {tool.requiresApproval ? 'approval' : 'direct'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          )
        })}
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
