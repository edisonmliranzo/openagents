'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { PlatformBillingSnapshot, SystemUsageSnapshot } from '@openagents/shared'

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
  const [billing, setBilling] = useState<PlatformBillingSnapshot | null>(null)
  const [systemUsage, setSystemUsage] = useState<SystemUsageSnapshot | null>(null)
  const [startDate, setStartDate] = useState(toInputDate(29))
  const [endDate, setEndDate] = useState(toInputDate(0))
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const loadSystemUsage = useCallback(async () => {
    try {
      const snapshot = await sdk.system.usage()
      setSystemUsage(snapshot)
    } catch {
      // Keep billing visible even if usage telemetry fails.
    }
  }, [])

  const loadBilling = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const rangeStart = toStartIso(startDate)
      const rangeEnd = toEndIso(endDate)
      const result = await sdk.platform.billing({ start: rangeStart, end: rangeEnd })
      setBilling(result)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load billing usage')
    } finally {
      setIsLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    void Promise.all([loadBilling(), loadSystemUsage()])
  }, [loadBilling, loadSystemUsage])

  const maxDailyCost = useMemo(() => {
    return (billing?.llmAndTool.daily ?? []).reduce((max, row) => Math.max(max, row.totalCostUsd), 0)
  }, [billing])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Billing Engine</h1>
          <p className="mt-1 text-sm text-slate-500">Spend by provider/model/tool/channel plus subscription estimate.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadBilling()}
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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invoice Estimate</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{formatUsd(billing?.totals.estimatedInvoiceUsd ?? 0)}</p>
          <p className="mt-1 text-xs text-slate-500">includes plan + channel transport</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">LLM + Tool</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{formatUsd(billing?.totals.llmAndToolUsd ?? 0)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatNumber(billing?.llmAndTool.totals.llmCalls ?? 0)} llm calls</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Channel Transport</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{formatUsd(billing?.totals.channelTransportUsd ?? 0)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatNumber((billing?.channels ?? []).reduce((sum, row) => sum + row.messages, 0))} channel messages</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Plan</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{billing?.subscription.planLabel ?? 'Free'}</p>
          <p className="mt-1 text-xs text-slate-500">{formatUsd(billing?.subscription.priceUsdMonthly ?? 0)} monthly</p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">By Provider</h2>
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
                {(billing?.llmAndTool.providers ?? []).map((row) => (
                  <tr key={row.provider} className="border-t border-slate-100 text-slate-700">
                    <td className="py-2 font-medium">{row.provider}</td>
                    <td className="py-2">{formatNumber(row.runs)}</td>
                    <td className="py-2">{formatNumber(row.llmCalls)}</td>
                    <td className="py-2">{formatNumber(row.inputTokens + row.outputTokens)}</td>
                    <td className="py-2 text-right font-semibold">{formatUsd(row.estimatedCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">By Channel</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2">Channel</th>
                  <th className="pb-2">Conversations</th>
                  <th className="pb-2">Messages</th>
                  <th className="pb-2 text-right">Transport</th>
                </tr>
              </thead>
              <tbody>
                {(billing?.channels ?? []).map((row) => (
                  <tr key={row.channelId} className="border-t border-slate-100 text-slate-700">
                    <td className="py-2 font-medium">{row.channelLabel}</td>
                    <td className="py-2">{formatNumber(row.conversations)}</td>
                    <td className="py-2">{formatNumber(row.messages)}</td>
                    <td className="py-2 text-right font-semibold">{formatUsd(row.estimatedCostUsd)}</td>
                  </tr>
                ))}
                {(billing?.channels.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-sm text-slate-500">No channel transport activity in this range.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Daily LLM + Tool Spend</h2>
        <div className="mt-4 space-y-2">
          {(billing?.llmAndTool.daily ?? []).map((row) => {
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
          {(billing?.llmAndTool.daily.length ?? 0) === 0 && (
            <p className="text-sm text-slate-500">{isLoading ? 'Loading usage...' : 'No daily activity in range.'}</p>
          )}
        </div>
      </section>

      {systemUsage && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Host Snapshot</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <p className="text-xs text-slate-600">cpu load: {systemUsage.cpu.loadAvg1.toFixed(2)} / {systemUsage.cpu.logicalCores} cores</p>
            <p className="text-xs text-slate-600">memory: {formatBytes(systemUsage.memory.systemUsedBytes)} / {formatBytes(systemUsage.memory.systemTotalBytes)}</p>
            <p className="text-xs text-slate-600">disk: {systemUsage.disk ? `${formatBytes(systemUsage.disk.usedBytes)} / ${formatBytes(systemUsage.disk.totalBytes)}` : 'unavailable'}</p>
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}

