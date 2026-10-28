'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  Coins,
  Cpu,
  Gauge,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingDown,
  Zap,
} from 'lucide-react'
import type {
  FinOpsArbitrageState,
  ProviderArbitrageRow,
} from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

export default function FinOpsArbitragePage() {
  const addToast = useUIStore((s) => s.addToast)
  const [state, setState] = useState<FinOpsArbitrageState | null>(null)
  const [loading, setLoading] = useState(false)
  const [simulating, setSimulating] = useState(false)

  const [prompt, setPrompt] = useState(
    'Summarize 10 US market & AI frontier headlines, extract structured entities, and score sentiment',
  )
  const [maxLatencyMs, setMaxLatencyMs] = useState(350)
  const [routingLog, setRoutingLog] = useState<
    Array<{
      id: string
      prompt: string
      chosenProvider: string
      chosenModel: string
      baselineCostUsd: number
      arbitrageCostUsd: number
      savingsPct: number
      rationale: string
      timestamp: string
    }>
  >([])

  const loadState = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sdk.agenticSuite.getFinOpsState()
      setState(res)
      if (res.latestSimulation) {
        setRoutingLog((prev) =>
          prev.length === 0
            ? [
                {
                  id: 'seed-sim',
                  ...res.latestSimulation!,
                  timestamp: new Date().toISOString(),
                },
              ]
            : prev,
        )
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load FinOps Arbitrage state')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadState()
  }, [loadState])

  async function handleSimulate(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim()) {
      addToast('warning', 'Enter a prompt workload to simulate')
      return
    }
    setSimulating(true)
    try {
      const res = await sdk.agenticSuite.simulateArbitrageRoute({
        prompt: prompt.trim(),
        maxLatencyMs,
      })
      setState(res)
      if (res.latestSimulation) {
        setRoutingLog((prev) => [
          {
            id: `route-${Date.now()}`,
            ...res.latestSimulation!,
            timestamp: new Date().toISOString(),
          },
          ...prev.slice(0, 14),
        ])
      }
      addToast(
        'success',
        `Routed to ${res.latestSimulation?.chosenModel} — saved ${res.latestSimulation?.savingsPct}%`,
      )
    } catch (err: any) {
      addToast('error', err?.message ?? 'FinOps arbitrage simulation failed')
    } finally {
      setSimulating(false)
    }
  }

  const providers: ProviderArbitrageRow[] = state?.providers ?? []

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              OpenAgents Autonomous FinOps &amp; API Arbitrage Engine
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time latency/cost/quality spot router across Ollama Local, DeepSeek, Gemini Flash, Claude, and OpenAI with semantic cache deduplication
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadState()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Spot Matrix
        </button>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-emerald-400">
            <span>Total Arbitrage Saved (Monthly)</span>
            <TrendingDown className="h-4 w-4" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
            ${state ? state.monthlySavedUsd.toFixed(2) : '412.80'}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Compared to unrouted frontier flagship baseline ($3.00 / 1M tokens)
          </p>
        </div>

        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-5">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-cyan-400">
            <span>Semantic Cache Hit Rate</span>
            <Zap className="h-4 w-4" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
            {state ? state.semanticCacheHitRatePct.toFixed(1) : '38.4'}%
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Zero-token instant vector cache hits across recurring agent sub-queries
          </p>
        </div>

        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-5">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-indigo-400">
            <span>Total Arbitrage Routes Executed</span>
            <Activity className="h-4 w-4" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
            {state ? state.totalArbitrageRoutes.toLocaleString() : '1,290'}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Sub-second SLA routing with automatic provider failover
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Live Provider Spot Matrix */}
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Live Provider Spot Matrix ({providers.length} Endpoints)
                </h2>
              </div>
              <span className="font-mono text-[11px] text-slate-400">Ranked by Composite Efficiency</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase text-slate-400 dark:border-slate-800">
                    <th className="pb-2.5 pr-3">Rank</th>
                    <th className="pb-2.5 pr-3">Provider / Model</th>
                    <th className="pb-2.5 pr-3">Spot / 1M</th>
                    <th className="pb-2.5 pr-3">Avg TTFT</th>
                    <th className="pb-2.5 pr-3">Quality</th>
                    <th className="pb-2.5 pr-3">Uptime</th>
                    <th className="pb-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
                  {providers.map((row) => (
                    <tr key={`${row.provider}-${row.model}`} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="py-3 pr-3 font-mono font-bold text-indigo-400">
                        #{row.arbitrageRank}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {row.model}
                        </div>
                        <div className="font-mono text-[10px] uppercase text-slate-400">
                          {row.provider}
                        </div>
                      </td>
                      <td className="py-3 pr-3 font-mono font-semibold text-emerald-400">
                        ${row.costPer1MTokensUsd.toFixed(2)}
                      </td>
                      <td className="py-3 pr-3 font-mono text-cyan-400">
                        {row.latencyMs}ms
                      </td>
                      <td className="py-3 pr-3 font-mono text-slate-700 dark:text-slate-200">
                        {row.qualityScore}/100
                      </td>
                      <td className="py-3 pr-3 font-mono text-slate-500 dark:text-slate-400">
                        {row.uptimePct}%
                      </td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            row.status === 'optimal'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : row.status === 'standby'
                                ? 'bg-indigo-500/20 text-indigo-400'
                                : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Right: Interactive Prompt Arbitrage Simulator */}
        <div className="space-y-6 lg:col-span-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <div className="mb-3 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Interactive Prompt Arbitrage Simulator
              </h2>
            </div>

            <form onSubmit={handleSimulate} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Task Prompt / Agent Workload
                </label>
                <textarea
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-500 dark:text-slate-400">
                    Max Allowed TTFT Latency Budget
                  </span>
                  <span className="font-mono font-bold text-cyan-400">{maxLatencyMs}ms</span>
                </div>
                <input
                  type="range"
                  min={150}
                  max={650}
                  step={25}
                  value={maxLatencyMs}
                  onChange={(e) => setMaxLatencyMs(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={simulating || !prompt.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 py-2.5 text-xs font-semibold text-white hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50"
              >
                {simulating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Simulate Optimal Arbitrage Route
              </button>
            </form>

            {state?.latestSimulation && (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs">
                <div className="flex items-center justify-between font-bold text-emerald-400">
                  <span>Winner: {state.latestSimulation.chosenModel}</span>
                  <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px]">
                    <ArrowDownRight className="h-3.5 w-3.5" />
                    Saved {state.latestSimulation.savingsPct}%
                  </span>
                </div>
                <p className="mt-1.5 text-slate-700 dark:text-slate-200">
                  {state.latestSimulation.rationale}
                </p>
                <div className="mt-2 flex items-center gap-4 font-mono text-[11px] text-slate-400">
                  <span>Baseline: ${state.latestSimulation.baselineCostUsd}</span>
                  <span className="text-emerald-400">
                    Arbitrage: ${state.latestSimulation.arbitrageCostUsd}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* Recent Arbitrage Routing Log */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recent Arbitrage Routing Log ({routingLog.length})
            </h2>
            {routingLog.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Run a simulation above to inspect real-time arbitrage routing decisions.
              </p>
            ) : (
              <div className="space-y-2.5">
                {routingLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/60"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-400">
                        {entry.chosenProvider} / {entry.chosenModel}
                      </span>
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
                        -{entry.savingsPct}% cost
                      </span>
                    </div>
                    <p className="mt-1 truncate text-slate-600 dark:text-slate-300">
                      {entry.prompt}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
