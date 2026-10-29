'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { ChaosFinding, ChaosRunReport } from '@openagents/sdk'
import {
  Activity,
  AlertOctagon,
  Bug,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Flame,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react'

const CHAOS_SCOPE_PRESETS = [
  {
    label: 'Auth & JWT Session Refresh Pipeline',
    targetScope: '/api/v1/auth/* & JWT Concurrent Refresh Boundary',
  },
  {
    label: 'Agentic Suite Tool Forge & Sandbox VM',
    targetScope: '/api/v1/agentic/tool-forge/* & Dynamic Payload Parser',
  },
  {
    label: 'Swarm Market Bidding & Webhook Ingestion',
    targetScope: '/api/v1/agentic/swarm-market & Outbound Webhook Dispatcher',
  },
  {
    label: 'Full OpenAgents REST & SSE Streaming Mesh',
    targetScope: '/api/v1/* (Global Controller & SSE Stream Mesh)',
  },
]

function severityStyle(severity: ChaosFinding['severity']) {
  switch (severity) {
    case 'critical':
      return 'border-rose-500/40 bg-rose-500/15 text-rose-300'
    case 'medium':
      return 'border-amber-500/40 bg-amber-500/15 text-amber-300'
    case 'low':
      return 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
  }
}

export default function ChaosMonkeyPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [reports, setReports] = useState<ChaosRunReport[]>([])
  const [selectedReportId, setSelectedReportId] = useState<string>('')
  const [targetScope, setTargetScope] = useState(CHAOS_SCOPE_PRESETS[0].targetScope)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const activeReport = reports.find((r) => r.id === selectedReportId) ?? reports[0] ?? null

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sdk.agenticSuite.getChaosState()
      setReports(res.reports)
      if (res.reports.length > 0) {
        setSelectedReportId((prev) =>
          prev && res.reports.some((r) => r.id === prev) ? prev : res.reports[0].id,
        )
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load OpenAgents Chaos Monkey reports')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  const handleRunChaos = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetScope.trim()) return
    setRunning(true)
    try {
      const report = await sdk.agenticSuite.runChaosMonkey({
        targetScope: targetScope.trim(),
      })
      setReports((prev) => [report, ...prev])
      setSelectedReportId(report.id)
      addToast(
        'success',
        `Executed ${report.probesExecuted} chaos probes · Resilience ${report.resilienceScore}%`,
      )
    } catch (err: any) {
      addToast('error', err?.message ?? 'Chaos Monkey campaign failed')
    } finally {
      setRunning(false)
    }
  }

  const handleCopy = async (id: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      addToast('success', `${label} copied to clipboard`)
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000)
    } catch {
      addToast('error', 'Failed to copy')
    }
  }

  return (
    <div className="oa-canvas min-h-full overflow-y-auto bg-slate-950 p-4 text-slate-100 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6 pb-24">
        {/* Header */}
        <header className="relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-slate-900 via-slate-900/95 to-indigo-950/80 p-6 shadow-2xl">
          <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                <Bug size={13} />
                OpenAgents Adversarial Fuzzing &amp; Self-Healing Engine
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Autonomous Bug Hunter &amp; Chaos Monkey Engine
              </h1>
              <p className="max-w-2xl text-xs leading-relaxed text-slate-300 sm:text-sm">
                Continuously bombard OpenAgents API endpoints and state machines with null boundaries, Unicode
                overflows, JWT expiry race conditions, rate-limit bursts, and malformed JSON—automatically synthesizing
                Vitest reproduction tests and zero-downtime patches.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadReports()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh Telemetry
            </button>
          </div>

          {/* Metrics Banner */}
          {activeReport && (
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>System Resilience Score</span>
                  <ShieldCheck size={15} className="text-emerald-400" />
                </div>
                <div className="mt-1.5 text-2xl font-black text-emerald-300">
                  {activeReport.resilienceScore}%
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  Post auto-patch hardening index
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Adversarial Probes Executed</span>
                  <Activity size={15} className="text-cyan-400" />
                </div>
                <div className="mt-1.5 text-2xl font-black text-cyan-300">
                  {activeReport.probesExecuted}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  Boundary, race &amp; payload fuzzing vectors
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Active Target Scope</span>
                  <Flame size={15} className="text-indigo-400" />
                </div>
                <div className="mt-1.5 truncate font-mono text-xs font-bold text-indigo-300">
                  {activeReport.targetScope}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {activeReport.findings.length} vectors cataloged &amp; remediated
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Target Scope Launcher + Quick Presets */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300">
                <ShieldAlert size={16} />
              </span>
              <div>
                <h2 className="text-sm font-bold text-white">
                  Launch Chaos Monkey Fuzzing Campaign
                </h2>
                <p className="text-xs text-slate-400">
                  Select a quick target preset or enter any OpenAgents route, service, or state boundary
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CHAOS_SCOPE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setTargetScope(preset.targetScope)}
                  className="rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-200"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleRunChaos} className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={targetScope}
              onChange={(e) => setTargetScope(e.target.value)}
              placeholder="e.g. /api/v1/agentic/* or Auth Session Refresh Pipeline"
              className="h-11 flex-1 rounded-xl border border-slate-700/80 bg-slate-950/90 px-4 font-mono text-xs text-slate-100 outline-none transition focus:border-cyan-500 sm:text-sm"
            />
            <button
              type="submit"
              disabled={running || !targetScope.trim()}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-cyan-600 to-emerald-600 px-6 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
            >
              {running ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Injecting Chaos Probes…
                </>
              ) : (
                <>
                  <Zap size={15} />
                  Unleash Chaos Monkey
                </>
              )}
            </button>
          </form>

          {reports.length > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
              <span>Recent Runs:</span>
              {reports.slice(0, 5).map((rep) => (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => setSelectedReportId(rep.id)}
                  className={`rounded-lg px-2.5 py-1 font-mono text-[11px] transition ${
                    activeReport?.id === rep.id
                      ? 'border border-cyan-500/50 bg-cyan-500/20 text-cyan-200'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {rep.targetScope.slice(0, 26)} ({rep.resilienceScore}%)
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Chaos Findings Cards */}
        {activeReport && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                Chaos Vector Findings &amp; Auto-Synthesized Patches ({activeReport.findings.length})
              </h2>
            </div>

            <div className="space-y-4">
              {activeReport.findings.map((finding) => (
                <article
                  key={finding.id}
                  className="rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-lg transition hover:border-indigo-500/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-1 font-mono text-xs font-bold text-indigo-300">
                        {finding.vector}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase ${severityStyle(
                          finding.severity,
                        )}`}
                      >
                        {finding.severity} severity
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase ${
                          finding.status === 'auto_patched'
                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                            : 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                        }`}
                      >
                        <CheckCircle2 size={12} />
                        {finding.status === 'auto_patched' ? 'AUTO-PATCHED' : 'RESILIENT'}
                      </span>
                    </div>

                    <div className="font-mono text-xs font-semibold text-cyan-300">
                      Target: {finding.targetEndpoint}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {/* Reproduction Test */}
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-3.5">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                          <Terminal size={13} />
                          Reproduction Test (reproductionTest)
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopy(
                              `test-${finding.id}`,
                              finding.reproductionTest,
                              'Reproduction test',
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200"
                        >
                          {copiedId === `test-${finding.id}` ? <Check size={11} /> : <Copy size={11} />}
                          Copy Test
                        </button>
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-300">
                        {finding.reproductionTest}
                      </pre>
                    </div>

                    {/* Generated Patch */}
                    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/15 p-3.5">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                          <Code2 size={13} />
                          Auto-Synthesized Patch (generatedPatch)
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopy(
                              `patch-${finding.id}`,
                              finding.generatedPatch,
                              'Generated patch',
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/20"
                        >
                          {copiedId === `patch-${finding.id}` ? <Check size={11} /> : <Copy size={11} />}
                          Copy Patch
                        </button>
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-emerald-200/90">
                        {finding.generatedPatch}
                      </pre>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
