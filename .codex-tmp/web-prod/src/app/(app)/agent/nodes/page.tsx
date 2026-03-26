'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'

interface NodeCard {
  id: string
  label: string
  status: 'ok' | 'warn'
  detail: string
}

export default function NodesPage() {
  const [conversationCount, setConversationCount] = useState(0)
  const [sessionCount, setSessionCount] = useState(0)
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [memoryCount, setMemoryCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const loadNodes = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [conversations, sessions, approvals, memory] = await Promise.all([
        sdk.conversations.list(),
        sdk.sessions.list({ limit: 250, includeGlobal: false, includeUnknown: false }),
        sdk.approvals.list('pending'),
        sdk.memory.list(),
      ])
      setConversationCount(conversations.length)
      setSessionCount(sessions.sessions.length)
      setPendingApprovals(approvals.length)
      setMemoryCount(memory.length)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load node status')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadNodes()
  }, [loadNodes])

  const cards = useMemo<NodeCard[]>(
    () => [
      {
        id: 'orchestrator',
        label: 'Orchestrator',
        status: sessionCount > 0 ? 'ok' : 'warn',
        detail: `${conversationCount} conversations / ${sessionCount} sessions`,
      },
      {
        id: 'approvals',
        label: 'Approvals Node',
        status: pendingApprovals > 10 ? 'warn' : 'ok',
        detail:
          pendingApprovals > 0
            ? `${pendingApprovals} pending approvals`
            : 'No pending approvals',
      },
      {
        id: 'memory',
        label: 'Memory Node',
        status: 'ok',
        detail: `${memoryCount} long-term memory entries`,
      },
    ],
    [conversationCount, sessionCount, pendingApprovals, memoryCount],
  )

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Nodes</h1>
          <p className="mt-1 text-sm text-slate-500">Runtime components participating in agent execution.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadNodes()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <article key={card.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">{card.label}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  card.status === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {card.status === 'ok' ? 'healthy' : 'attention'}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">{card.detail}</p>
          </article>
        ))}
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
