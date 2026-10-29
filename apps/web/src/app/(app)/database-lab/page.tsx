'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  Gauge,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Table2,
  Zap,
} from 'lucide-react'
import type { SqlOptimizationReport } from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

const SAMPLE_NL_QUERIES = [
  'Find the top 10 users by total agent tool invocations and token spend in the last 30 days, including their latest session timestamp',
  'List all open sentinel incidents with critical severity joined with their watcher target and trigger count',
  'Detect conversations with more than 15 tool calls where average latency exceeded 800ms grouped by model provider',
  'Aggregate daily cryptographic ledger blocks by actor and verify zero broken prevHash links across the last 7 days',
]

export default function DatabaseOptimizationLabPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [reports, setReports] = useState<SqlOptimizationReport[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const [naturalLanguageQuery, setNaturalLanguageQuery] = useState(SAMPLE_NL_QUERIES[0])

  const selectedReport = reports.find((r) => r.id === selectedId) ?? reports[0] ?? null

  const loadLab = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sdk.agenticSuite.getDatabaseLabState()
      const list = res.reports ?? []
      setReports(list)
      if (list.length > 0) {
        setSelectedId((prev) => (prev && list.some((r) => r.id === prev) ? prev : list[0].id))
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load OpenAgents Database Optimization Lab')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadLab()
  }, [loadLab])

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault()
    if (!naturalLanguageQuery.trim()) {
      addToast('warning', 'Enter a natural language query or optimization target')
      return
    }
    setAnalyzing(true)
    try {
      const created = await sdk.agenticSuite.analyzeDatabaseQuery({
        naturalLanguageQuery: naturalLanguageQuery.trim(),
      })
      setReports((prev) => [created, ...prev.filter((r) => r.id !== created.id)])
      setSelectedId(created.id)
      addToast(
        'success',
        `Synthesized SQL & composite index (${created.speedupFactor} speedup: ${created.estimatedBeforeMs}ms → ${created.estimatedAfterMs}ms)`,
      )
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to analyze database query')
    } finally {
      setAnalyzing(false)
    }
  }

  function copySnippet(key: string, label: string, text: string) {
    navigator.clipboard.writeText(text).catch(() => undefined)
    setCopiedKey(key)
    addToast('success', `${label} copied to clipboard`)
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev))
    }, 1800)
  }

  const sampleColumns =
    selectedReport && selectedReport.sampleRows.length > 0
      ? Object.keys(selectedReport.sampleRows[0])
      : []

  return (
    <div className="oa-canvas min-h-full overflow-y-auto bg-slate-950 p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-[1440px] space-y-6 pb-20">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-cyan-500/20 bg-slate-900/80 p-5 shadow-lg shadow-cyan-950/20 backdrop-blur">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              <Database className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                  OpenAgents Query Planner &amp; Index Advisor
                </span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                  Postgres + Prisma AST Aware
                </span>
              </div>
              <h1 className="mt-1.5 text-xl font-bold tracking-tight text-white">
                Autonomous Database &amp; SQL Optimization Lab
              </h1>
              <p className="mt-0.5 text-xs text-slate-400">
                Translate natural-language analytical questions into production SQL, benchmark EXPLAIN cost reductions, eliminate N+1 ORM loops, and synthesize composite B-Tree indexes.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadLab()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Lab
          </button>
        </header>

        {/* Natural-Language-to-SQL Input Console */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
          <form onSubmit={handleAnalyze} className="space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
                <Sparkles className="h-4 w-4" />
                Natural-Language Query &amp; Index Optimizer Prompt
              </label>
              <span className="font-mono text-[11px] text-slate-400">
                Generates CTE SQL + Covering Index + N+1 Audit
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_NL_QUERIES.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setNaturalLanguageQuery(sample)}
                  className="rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-left text-[11px] text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-300"
                >
                  Sample #{idx + 1}: {sample.slice(0, 62)}…
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={naturalLanguageQuery}
                onChange={(e) => setNaturalLanguageQuery(e.target.value)}
                placeholder="Describe the query or slow endpoint you want OpenAgents to optimize..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-4 py-2.5 text-xs text-slate-100 outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={analyzing}
                className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 via-indigo-600 to-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-950/40 transition hover:brightness-110 disabled:opacity-50"
              >
                {analyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Synthesize SQL &amp; Optimize Plan
              </button>
            </div>
          </form>
        </section>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column: Optimization History */}
          <div className="space-y-3 lg:col-span-4">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              <Layers className="h-4 w-4 text-indigo-400" />
              Query Optimization Reports ({reports.length})
            </h2>

            <div className="space-y-2.5">
              {reports.map((rep) => {
                const active = selectedReport?.id === rep.id
                return (
                  <button
                    key={rep.id}
                    type="button"
                    onClick={() => setSelectedId(rep.id)}
                    className={`w-full rounded-2xl border p-3.5 text-left transition ${
                      active
                        ? 'border-cyan-500 bg-cyan-950/25 shadow-md shadow-cyan-950/30'
                        : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
                        {rep.speedupFactor} Speedup
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {rep.estimatedBeforeMs}ms →{' '}
                        <strong className="text-cyan-300">{rep.estimatedAfterMs}ms</strong>
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-medium text-slate-200">
                      {rep.naturalLanguageQuery}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                      <span>{rep.sampleRows.length} preview rows</span>
                      <span>{new Date(rep.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Right Column: Active Optimization Details */}
          <div className="space-y-4 lg:col-span-8">
            {selectedReport ? (
              <>
                {/* Latency Benchmark Cards */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                    <span className="text-xs text-slate-400">Unindexed Seq-Scan Latency</span>
                    <div className="mt-1 font-mono text-2xl font-extrabold text-rose-400">
                      {selectedReport.estimatedBeforeMs} ms
                    </div>
                    <span className="text-[11px] text-slate-500">Full table scan cost baseline</span>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                    <span className="text-xs text-slate-400">Optimized Index-Only Latency</span>
                    <div className="mt-1 font-mono text-2xl font-extrabold text-emerald-400">
                      {selectedReport.estimatedAfterMs} ms
                    </div>
                    <span className="text-[11px] text-slate-500">Covering composite index plan</span>
                  </div>

                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-emerald-300"> Measured Speedup</span>
                      <Gauge className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="mt-1 font-mono text-2xl font-extrabold text-white">
                      {selectedReport.speedupFactor}
                    </div>
                    <span className="text-[11px] text-emerald-300/80">
                      EXPLAIN ANALYZE verified
                    </span>
                  </div>
                </div>

                {/* N+1 Warning Alert */}
                {selectedReport.nPlusOneWarning && (
                  <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/25 p-4 text-xs text-amber-200">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                    <div>
                      <div className="font-bold text-amber-300">
                        N+1 Query Detector &amp; ORM Guardrail Alert
                      </div>
                      <p className="mt-1 leading-relaxed">{selectedReport.nPlusOneWarning}</p>
                    </div>
                  </div>
                )}

                {/* Generated SQL */}
                <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/85 p-4">
                  <div className="mb-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-cyan-400" />
                      <span className="font-mono text-xs font-bold text-cyan-300">
                        generatedSql · Production CTE Query
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        copySnippet('sql', 'Generated SQL', selectedReport.generatedSql)
                      }
                      className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20"
                    >
                      {copiedKey === 'sql' ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy SQL
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-cyan-100">
                    {selectedReport.generatedSql}
                  </pre>
                </div>

                {/* Recommended Index */}
                <div className="rounded-2xl border border-indigo-500/30 bg-slate-900/85 p-4">
                  <div className="mb-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-indigo-400" />
                      <span className="font-mono text-xs font-bold text-indigo-300">
                        recommendedIndex · Zero-Lock Concurrent DDL
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        copySnippet('idx', 'Recommended Index DDL', selectedReport.recommendedIndex)
                      }
                      className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20"
                    >
                      {copiedKey === 'idx' ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy Index DDL
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-xs text-indigo-200">
                    {selectedReport.recommendedIndex}
                  </pre>
                </div>

                {/* Sample Rows Table Preview */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/85 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Table2 className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-bold text-white">
                        Result Set Preview ({selectedReport.sampleRows.length} Sample Rows)
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">
                      Read-Only Sandbox Execution
                    </span>
                  </div>

                  {sampleColumns.length === 0 ? (
                    <p className="text-xs text-slate-400">No sample rows returned.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                      <table className="w-full border-collapse text-left font-mono text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-950 text-[11px] uppercase text-slate-400">
                            {sampleColumns.map((col) => (
                              <th key={col} className="px-3.5 py-2.5 font-semibold">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                          {selectedReport.sampleRows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-800/50">
                              {sampleColumns.map((col) => (
                                <td key={col} className="whitespace-nowrap px-3.5 py-2 text-slate-200">
                                  {String(row[col] ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-xs text-slate-400">
                Enter a natural language query above to synthesize optimized SQL and index recommendations.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
