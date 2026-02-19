'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { SystemCostBreakdown, SystemUsageSnapshot } from '@openagents/shared'

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value)
}

function formatUsd(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value)
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIdx = 0
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024
    unitIdx += 1
  }
  return `${value.toFixed(value >= 100 || unitIdx === 0 ? 0 : 1)} ${units[unitIdx]}`
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%'
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`
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

function toStartIso(value: string) {
  const date = new Date(`${value}T00:00:00.000`)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

function toEndIso(value: string) {
  const date = new Date(`${value}T23:59:59.999`)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

export default function UsagePage() {
  const [costs, setCosts] = useState<SystemCostBreakdown | null>(null)
  const [systemUsage, setSystemUsage] = useState<SystemUsageSnapshot | null>(null)
  const [startDate, setStartDate] = useState(toInputDate(29))
  const [endDate, setEndDate] = useState(toInputDate(0))
  const [isLoading, setIsLoading] = useState(false)
  const [isSystemRefreshing, setIsSystemRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadSystemUsage = useCallback(async (silent = false) => {
    if (!silent) setIsSystemRefreshing(true)
    try {
      const snapshot = await sdk.system.usage()
      setSystemUsage(snapshot)
    } catch (err: any) {
      if (!silent) setError(err?.message ?? 'Failed to load system usage')
    } finally {
      if (!silent) setIsSystemRefreshing(false)
    }
  }, [])

  const loadCosts = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const rangeStart = toStartIso(startDate)
      const rangeEnd = toEndIso(endDate)
      const result = await sdk.system.costs({ start: rangeStart, end: rangeEnd })
      setCosts(result)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load usage costs')
    } finally {
      setIsLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    void loadCosts()
  }, [loadCosts])

  useEffect(() => {
    void loadSystemUsage(true)
    const timer = window.setInterval(() => {
      void loadSystemUsage(true)
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [loadSystemUsage])

  const systemMemoryRatio = useMemo(() => {
    if (!systemUsage?.memory.systemTotalBytes) return 0
    return systemUsage.memory.systemUsedBytes / systemUsage.memory.systemTotalBytes
  }, [systemUsage])

  const processMemoryRatio = useMemo(() => {
    if (!systemUsage?.memory.systemTotalBytes) return 0
    return systemUsage.memory.processRssBytes / systemUsage.memory.systemTotalBytes
  }, [systemUsage])

  const diskUsedRatio = useMemo(() => {
    if (!systemUsage?.disk?.totalBytes) return 0
    return systemUsage.disk.usedBytes / systemUsage.disk.totalBytes
  }, [systemUsage])

  const maxDailyCost = useMemo(() => {
    return (costs?.daily ?? []).reduce((max, row) => Math.max(max, row.totalCostUsd), 0)
  }, [costs])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Usage & Cost</h1>
          <p className="mt-1 text-sm text-slate-500">Estimated spend by provider, model, tool, and day.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadCosts()}
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Estimated Total</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{formatUsd(costs?.totals.estimatedTotalCostUsd ?? 0)}</p>
          <p className="mt-1 text-xs text-slate-500">LLM + tools in selected range</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">LLM Cost</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{formatUsd(costs?.totals.estimatedLlmCostUsd ?? 0)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatNumber(costs?.totals.llmCalls ?? 0)} calls</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tool Cost</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{formatUsd(costs?.totals.estimatedToolCostUsd ?? 0)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatNumber(costs?.totals.toolCalls ?? 0)} tool calls</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tokens</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{formatNumber((costs?.totals.inputTokens ?? 0) + (costs?.totals.outputTokens ?? 0))}</p>
          <p className="mt-1 text-xs text-slate-500">
            In {formatNumber(costs?.totals.inputTokens ?? 0)} / Out {formatNumber(costs?.totals.outputTokens ?? 0)}
          </p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">By Provider</h2>
          <p className="mt-1 text-sm text-slate-500">Run volume and estimated LLM cost.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2">Provider</th>
                  <th className="pb-2">Runs</th>
                  <th className="pb-2">Calls</th>
                  <th className="pb-2">Tokens</th>
                  <th className="pb-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(costs?.providers ?? []).map((row) => (
                  <tr key={row.provider} className="border-t border-slate-100 text-slate-700">
                    <td className="py-2 font-medium">{row.provider}</td>
                    <td className="py-2">{formatNumber(row.runs)}</td>
                    <td className="py-2">{formatNumber(row.llmCalls)}</td>
                    <td className="py-2">{formatNumber(row.inputTokens + row.outputTokens)}</td>
                    <td className="py-2 text-right font-semibold">{formatUsd(row.estimatedCostUsd)}</td>
                  </tr>
                ))}
                {(costs?.providers.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-sm text-slate-500">No provider usage in this range.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">By Tool</h2>
          <p className="mt-1 text-sm text-slate-500">Call counts, reliability, and estimated tool cost.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2">Tool</th>
                  <th className="pb-2">Calls</th>
                  <th className="pb-2">Success</th>
                  <th className="pb-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(costs?.tools ?? []).map((row) => (
                  <tr key={row.toolName} className="border-t border-slate-100 text-slate-700">
                    <td className="py-2 font-medium">{row.toolName}</td>
                    <td className="py-2">{formatNumber(row.calls)}</td>
                    <td className="py-2">{formatPercent(row.calls > 0 ? row.successes / row.calls : 0)}</td>
                    <td className="py-2 text-right font-semibold">{formatUsd(row.estimatedCostUsd)}</td>
                  </tr>
                ))}
                {(costs?.tools.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-sm text-slate-500">No tool calls in this range.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">By Model</h2>
        <p className="mt-1 text-sm text-slate-500">Per-model costs and token usage across providers.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-2">Provider</th>
                <th className="pb-2">Model</th>
                <th className="pb-2">Runs</th>
                <th className="pb-2">Calls</th>
                <th className="pb-2">Tokens</th>
                <th className="pb-2 text-right">Cost</th>
                <th className="pb-2 text-right">Avg/Run</th>
              </tr>
            </thead>
            <tbody>
              {(costs?.models ?? []).map((row) => (
                <tr key={`${row.provider}::${row.model}`} className="border-t border-slate-100 text-slate-700">
                  <td className="py-2">{row.provider}</td>
                  <td className="py-2 font-medium">{row.model}</td>
                  <td className="py-2">{formatNumber(row.runs)}</td>
                  <td className="py-2">{formatNumber(row.llmCalls)}</td>
                  <td className="py-2">{formatNumber(row.inputTokens + row.outputTokens)}</td>
                  <td className="py-2 text-right font-semibold">{formatUsd(row.estimatedCostUsd)}</td>
                  <td className="py-2 text-right">{formatUsd(row.avgCostPerRunUsd)}</td>
                </tr>
              ))}
              {(costs?.models.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-sm text-slate-500">No model usage in this range.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Daily Spend</h2>
          <p className="mt-1 text-sm text-slate-500">Estimated cost trend for the selected range.</p>

          <div className="mt-4 space-y-2">
            {(costs?.daily ?? []).length === 0 && (
              <p className="text-sm text-slate-500">{isLoading ? 'Loading usage...' : 'No daily activity in range.'}</p>
            )}
            {(costs?.daily ?? []).map((row) => {
              const width = maxDailyCost > 0 ? Math.max(8, Math.round((row.totalCostUsd / maxDailyCost) * 100)) : 8
              return (
                <div key={row.date} className="grid grid-cols-[88px_1fr_180px] items-center gap-3">
                  <span className="font-mono text-xs text-slate-500">{row.date}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-red-400" style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-right font-mono text-xs text-slate-600">
                    {formatUsd(row.totalCostUsd)} / {formatNumber(row.inputTokens + row.outputTokens)} tk
                  </span>
                </div>
              )
            })}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">System Usage</h2>
              <p className="mt-1 text-sm text-slate-500">Live machine metrics from the API host process.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadSystemUsage()}
              disabled={isSystemRefreshing}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {isSystemRefreshing ? 'Refreshing...' : 'Refresh system'}
            </button>
          </div>

          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">CPU</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{systemUsage?.cpu.logicalCores ?? 0} cores</p>
              <p className="mt-1 truncate text-xs text-slate-500" title={systemUsage?.cpu.model ?? ''}>
                {systemUsage?.cpu.model ?? 'unknown'}
              </p>
              <p className="mt-1 font-mono text-[11px] text-slate-500">
                load {systemUsage?.cpu.loadAvg1?.toFixed(2) ?? '0.00'} / {systemUsage?.cpu.loadAvg5?.toFixed(2) ?? '0.00'}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Memory</p>
              <p className="mt-1 text-base font-semibold text-slate-900">
                {formatBytes(systemUsage?.memory.systemUsedBytes ?? 0)} / {formatBytes(systemUsage?.memory.systemTotalBytes ?? 0)}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.min(100, Math.round(systemMemoryRatio * 100))}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">System {formatPercent(systemMemoryRatio)} / API {formatPercent(processMemoryRatio)}</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Disk ({systemUsage?.disk?.path ?? '-'})</p>
              <p className="mt-1 text-base font-semibold text-slate-900">
                {systemUsage?.disk
                  ? `${formatBytes(systemUsage.disk.usedBytes)} / ${formatBytes(systemUsage.disk.totalBytes)}`
                  : 'Unavailable'}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.min(100, Math.round(diskUsedRatio * 100))}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{systemUsage?.disk ? formatPercent(diskUsedRatio) : 'statfs not supported'}</p>
            </div>
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
