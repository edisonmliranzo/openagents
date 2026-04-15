'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { SessionRow } from '@openagents/shared'

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value)
}

function toDateKey(timestampMs: number) {
  const d = new Date(timestampMs)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toInputDate(daysAgo: number) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return toDateKey(d.getTime())
}

interface DailyUsage {
  date: string
  sessions: number
  totalTokens: number
}

interface ModelUsage {
  model: string
  sessions: number
  tokens: number
}

export default function UsagePage() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [startDate, setStartDate] = useState(toInputDate(6))
  const [endDate, setEndDate] = useState(toInputDate(0))
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const loadUsage = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const result = await sdk.sessions.list({
        limit: 500,
        includeGlobal: false,
        includeUnknown: false,
      })
      setSessions(result.sessions.filter((session) => session.kind === 'direct'))
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load usage')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsage()
  }, [loadUsage])

  const filteredSessions = useMemo(() => {
    const startMs = new Date(`${startDate}T00:00:00`).getTime()
    const endMs = new Date(`${endDate}T23:59:59.999`).getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return sessions
    return sessions.filter((session) => {
      if (!session.updatedAt) return false
      return session.updatedAt >= startMs && session.updatedAt <= endMs
    })
  }, [sessions, startDate, endDate])

  const dailyUsage = useMemo<DailyUsage[]>(() => {
    const byDay = new Map<string, DailyUsage>()
    for (const session of filteredSessions) {
      if (!session.updatedAt) continue
      const key = toDateKey(session.updatedAt)
      const current = byDay.get(key) ?? { date: key, sessions: 0, totalTokens: 0 }
      current.sessions += 1
      current.totalTokens += session.totalTokens ?? 0
      byDay.set(key, current)
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [filteredSessions])

  const modelUsage = useMemo<ModelUsage[]>(() => {
    const byModel = new Map<string, ModelUsage>()
    for (const session of filteredSessions) {
      const model = session.model ?? 'unknown'
      const current = byModel.get(model) ?? { model, sessions: 0, tokens: 0 }
      current.sessions += 1
      current.tokens += session.totalTokens ?? 0
      byModel.set(model, current)
    }
    return [...byModel.values()].sort((a, b) => b.tokens - a.tokens).slice(0, 8)
  }, [filteredSessions])

  const totals = useMemo(() => {
    return filteredSessions.reduce(
      (acc, session) => {
        acc.input += session.inputTokens ?? 0
        acc.output += session.outputTokens ?? 0
        acc.total += session.totalTokens ?? 0
        return acc
      },
      { input: 0, output: 0, total: 0 },
    )
  }, [filteredSessions])

  const peakDayTokens = useMemo(() => {
    return dailyUsage.reduce((max, day) => Math.max(max, day.totalTokens), 0)
  }, [dailyUsage])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Usage</h1>
          <p className="mt-1 text-sm text-slate-500">Token volume by date, model, and active sessions.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadUsage()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-600">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Start</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
            />
          </label>
          <label className="text-sm text-slate-600">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">End</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
            />
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setStartDate(toInputDate(6))
                setEndDate(toInputDate(0))
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Last 7d
            </button>
            <button
              type="button"
              onClick={() => {
                setStartDate(toInputDate(29))
                setEndDate(toInputDate(0))
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Last 30d
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Tokens</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{formatNumber(totals.total)}</p>
          <p className="mt-1 text-xs text-slate-500">Input {formatNumber(totals.input)} / Output {formatNumber(totals.output)}</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sessions In Range</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{formatNumber(filteredSessions.length)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatNumber(sessions.length)} total tracked sessions</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Daily Peak</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{formatNumber(peakDayTokens)}</p>
          <p className="mt-1 text-xs text-slate-500">Highest token day in the selected range</p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Daily Activity</h2>
          <p className="mt-1 text-sm text-slate-500">Session and token trend by day.</p>

          <div className="mt-4 space-y-2">
            {dailyUsage.length === 0 && (
              <p className="text-sm text-slate-500">{isLoading ? 'Loading usage...' : 'No usage in selected range.'}</p>
            )}
            {dailyUsage.map((day) => {
              const width = peakDayTokens > 0 ? Math.max(8, Math.round((day.totalTokens / peakDayTokens) * 100)) : 8
              return (
                <div key={day.date} className="grid grid-cols-[88px_1fr_140px] items-center gap-3">
                  <span className="font-mono text-xs text-slate-500">{day.date}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-red-400" style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-right font-mono text-xs text-slate-600">
                    {formatNumber(day.totalTokens)} tk / {day.sessions} sess
                  </span>
                </div>
              )
            })}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Top Models</h2>
          <p className="mt-1 text-sm text-slate-500">Sorted by token consumption.</p>
          <div className="mt-4 space-y-2">
            {modelUsage.length === 0 && <p className="text-sm text-slate-500">No model usage yet.</p>}
            {modelUsage.map((entry) => (
              <div key={entry.model} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="truncate text-sm font-semibold text-slate-800">{entry.model}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatNumber(entry.tokens)} tokens across {entry.sessions} sessions
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
