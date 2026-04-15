'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { SessionRow } from '@openagents/shared'

interface ToolSummary {
  name: string
  requiresApproval: boolean
}

export default function AgentsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [toolSummaries, setToolSummaries] = useState<ToolSummary[]>([])
  const [preferredProvider, setPreferredProvider] = useState('n/a')
  const [preferredModel, setPreferredModel] = useState('n/a')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const loadAgents = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [sessionResult, tools, settings] = await Promise.all([
        sdk.sessions.list({ limit: 300, includeGlobal: false, includeUnknown: false }),
        sdk.tools.list(),
        sdk.users.getSettings(),
      ])
      setSessions(sessionResult.sessions.filter((session) => session.kind === 'direct'))
      setToolSummaries(tools.map((tool) => ({ name: tool.displayName, requiresApproval: tool.requiresApproval })))
      setPreferredProvider(settings.preferredProvider)
      setPreferredModel(settings.preferredModel)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load agent dashboard')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAgents()
  }, [loadAgents])

  const totalTokens = useMemo(
    () => sessions.reduce((sum, session) => sum + (session.totalTokens ?? 0), 0),
    [sessions],
  )

  const approvalTools = useMemo(
    () => toolSummaries.filter((tool) => tool.requiresApproval).length,
    [toolSummaries],
  )

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Agents</h1>
          <p className="mt-1 text-sm text-slate-500">Model and capability overview for active agents.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadAgents()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Default Model</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{preferredModel}</p>
          <p className="mt-1 text-xs text-slate-500">Provider {preferredProvider}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tracked Sessions</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{sessions.length}</p>
          <p className="mt-1 text-xs text-slate-500">Total tokens {totalTokens}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tool Skills</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{toolSummaries.length}</p>
          <p className="mt-1 text-xs text-slate-500">{approvalTools} require approval</p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Available Agent Profiles</h2>
        <p className="mt-1 text-sm text-slate-500">Current app ships a unified default agent with tool specializations.</p>

        <div className="mt-4 space-y-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">Default Agent</p>
            <p className="mt-1 text-xs text-slate-500">
              Handles chat, tool planning, approvals, and response synthesis.
            </p>
          </div>
          {toolSummaries.map((tool) => (
            <div key={tool.name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-800">{tool.name}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    tool.requiresApproval ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {tool.requiresApproval ? 'approval-gated' : 'direct'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
