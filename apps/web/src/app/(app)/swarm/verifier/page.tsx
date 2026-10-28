'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { AdversarialVerificationRun, BreakerFinding } from '@openagents/sdk'
import {
  AlertTriangle,
  ArrowRight,
  Bug,
  CheckCircle2,
  Code2,
  Database,
  FileSearch,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react'

const ARTIFACT_TYPES: Array<{
  value: AdversarialVerificationRun['artifactType']
  label: string
  icon: typeof Code2
}> = [
  { value: 'code', label: 'Code / Implementation', icon: Code2 },
  { value: 'sql', label: 'SQL / Database Query', icon: Database },
  { value: 'architecture', label: 'System Architecture', icon: Layers },
  { value: 'security_policy', label: 'Security Policy / IAM', icon: ShieldCheck },
  { value: 'research', label: 'Research / Specification', icon: FileSearch },
]

const QUICK_PROMPTS: Array<{
  title: string
  artifactType: AdversarialVerificationRun['artifactType']
  task: string
}> = [
  {
    title: 'JWT Auth + Webhook Handler',
    artifactType: 'code',
    task: 'Write an Express/Fastify webhook endpoint that verifies HMAC signatures, parses JSON payloads, updates user subscription status, and prevents replay attacks.',
  },
  {
    title: 'Multi-Tenant Ledger SQL',
    artifactType: 'sql',
    task: 'Write a PostgreSQL transaction and schema query for transferring credits between two tenant accounts with idempotency keys and row-level locking.',
  },
  {
    title: 'Zero-Trust Agent Sandbox Policy',
    artifactType: 'security_policy',
    task: 'Define an execution sandbox security policy for autonomous code-running agents with filesystem, network egress, and secret rotation boundaries.',
  },
  {
    title: 'High-Throughput Event Ingestion Architecture',
    artifactType: 'architecture',
    task: 'Design a resilient event ingestion pipeline handling 50k events/sec with backpressure, dead-letter queues, and zero data loss during node failovers.',
  },
]

function severityBadgeClass(severity: BreakerFinding['severity']) {
  switch (severity) {
    case 'critical':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    case 'high':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/30'
    case 'medium':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    case 'low':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30'
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-500/30'
  }
}

function scoreColorClass(score: number) {
  if (score >= 90) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  if (score >= 75) return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  return 'bg-rose-500/15 text-rose-300 border-rose-500/30'
}

export default function AdversarialVerifierPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [runs, setRuns] = useState<AdversarialVerificationRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [task, setTask] = useState(QUICK_PROMPTS[0].task)
  const [artifactType, setArtifactType] =
    useState<AdversarialVerificationRun['artifactType']>('code')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const loadRuns = useCallback(async () => {
    setLoading(true)
    try {
      const list = await sdk.agenticSuite.listVerifierRuns()
      setRuns(list)
      if (list.length > 0 && !selectedRunId) {
        setSelectedRunId(list[0].id)
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load verification runs')
    } finally {
      setLoading(false)
    }
  }, [addToast, selectedRunId])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  const handleRunLoop = async () => {
    if (!task.trim()) {
      addToast('warning', 'Enter a task or specification to run through the adversarial loop')
      return
    }
    setRunning(true)
    try {
      const created = await sdk.agenticSuite.runVerifierLoop({
        task: task.trim(),
        artifactType,
      })
      setRuns((prev) => [created, ...prev.filter((r) => r.id !== created.id)])
      setSelectedRunId(created.id)
      addToast(
        'success',
        `Adversarial loop finished • Score ${created.verificationScore}/100 (${created.breakerFindings.length} findings patched)`,
      )
    } catch (err: any) {
      addToast('error', err?.message ?? 'Adversarial verifier run failed')
    } finally {
      setRunning(false)
    }
  }

  const activeRun = runs.find((r) => r.id === selectedRunId) ?? runs[0] ?? null

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6 pb-24">
        {/* Header Card */}
        <header className="oa-float-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
                <ShieldAlert size={20} />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold text-[var(--tone-strong)]">
                    Adversarial Critic &amp; Breaker Loop
                  </h1>
                  <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-300">
                    Generator → Red-Team → Fixer
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Three-stage adversarial verification pipeline: drafts an initial artifact, launches a dedicated
                  Red-Team Breaker to discover edge-case exploits, and synthesizes a hardened final output.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void loadRuns()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 self-start rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-[var(--tone-strong)] transition hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh Runs
            </button>
          </div>

          {/* Quick-Fill Prompts */}
          <div className="mt-5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
              Quick-Fill Adversarial Test Prompts
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  onClick={() => {
                    setArtifactType(preset.artifactType)
                    setTask(preset.task)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[var(--tone-strong)] transition hover:border-rose-500/40 hover:bg-rose-500/10"
                >
                  <Sparkles size={12} className="text-rose-400" />
                  <span>{preset.title}</span>
                  <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                    {preset.artifactType}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Input & Artifact Type Selector */}
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
                Artifact Type
              </label>
              <div className="space-y-1.5">
                {ARTIFACT_TYPES.map((item) => {
                  const Icon = item.icon
                  const selected = artifactType === item.value
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setArtifactType(item.value)}
                      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-xs font-medium transition ${
                        selected
                          ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                          : 'border-white/10 bg-black/20 text-[var(--muted)] hover:bg-white/5 hover:text-[var(--tone-strong)]'
                      }`}
                    >
                      <Icon size={14} className={selected ? 'text-rose-400' : 'text-[var(--muted)]'} />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col justify-between lg:col-span-9">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
                  Target Task / Artifact Prompt
                </label>
                <textarea
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  rows={5}
                  placeholder="Describe the code, SQL query, security policy, or system architecture to generate and red-team..."
                  className="oa-input-surface w-full rounded-xl p-3 text-sm outline-none"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1">
                    1. Draft v1
                  </span>
                  <ArrowRight size={12} />
                  <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-1 text-rose-300">
                    2. Red-Team Exploit Probe
                  </span>
                  <ArrowRight size={12} />
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-300">
                    3. Fixer Hardened Artifact
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => void handleRunLoop()}
                  disabled={running || !task.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-500 disabled:opacity-50"
                >
                  {running ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Running Generator → Breaker → Fixer...
                    </>
                  ) : (
                    <>
                      <Play size={15} />
                      Run Adversarial Verifier Loop
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Run History Selector Bar */}
        {runs.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {runs.map((run) => {
              const isSelected = activeRun?.id === run.id
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left text-xs transition ${
                    isSelected
                      ? 'border-rose-500/50 bg-rose-500/15 text-[var(--tone-strong)]'
                      : 'border-white/10 bg-black/20 text-[var(--muted)] hover:bg-white/5'
                  }`}
                >
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                    {run.artifactType}
                  </span>
                  <span className="max-w-[200px] truncate font-medium">{run.task}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${scoreColorClass(
                      run.verificationScore,
                    )}`}
                  >
                    {run.verificationScore}/100
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* 3-Stage Pipeline View */}
        {loading && !activeRun ? (
          <div className="oa-float-card flex items-center justify-center p-12 text-sm text-[var(--muted)]">
            <Loader2 size={18} className="mr-2 animate-spin" />
            Loading adversarial verification runs...
          </div>
        ) : !activeRun ? (
          <div className="oa-float-card p-10 text-center">
            <ShieldAlert size={32} className="mx-auto text-rose-400/70" />
            <h2 className="mt-3 text-sm font-semibold text-[var(--tone-strong)]">
              No Adversarial Verification Runs Yet
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Select a quick-fill prompt above and click &ldquo;Run Adversarial Verifier Loop&rdquo; to inspect all 3 stages.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Run Summary Banner */}
            <div className="oa-float-card flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-[var(--tone-strong)]">
                    {activeRun.artifactType}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                      activeRun.breakerVerdict === 'passed_clean'
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                        : 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {activeRun.breakerVerdict === 'passed_clean' ? (
                      <CheckCircle2 size={12} />
                    ) : (
                      <AlertTriangle size={12} />
                    )}
                    Verdict: {activeRun.breakerVerdict.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    Rounds completed: <strong className="text-[var(--tone-strong)]">{activeRun.roundsCompleted}</strong>
                  </span>
                </div>
                <p className="text-sm font-medium text-[var(--tone-strong)]">{activeRun.task}</p>
              </div>

              <div className="flex items-center gap-3">
                <div
                  className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 ${scoreColorClass(
                    activeRun.verificationScore,
                  )}`}
                >
                  <ShieldCheck size={18} />
                  <div>
                    <div className="text-[10px] uppercase tracking-wider opacity-80">
                      Verification Score
                    </div>
                    <div className="text-base font-bold">{activeRun.verificationScore} / 100</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3-Stage Columns */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {/* Stage 1: Generator Draft v1 */}
              <section className="oa-float-card flex flex-col p-5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 text-xs font-bold text-sky-400">
                      1
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--tone-strong)]">
                        Stage 1: Generator Draft v1
                      </h2>
                      <p className="text-[11px] text-[var(--muted)]">
                        Initial unhardened candidate output
                      </p>
                    </div>
                  </div>
                  <Code2 size={16} className="text-sky-400" />
                </div>

                <div className="mt-4 flex-1">
                  <pre className="max-h-[540px] overflow-auto rounded-xl border border-white/10 bg-black/40 p-3.5 font-mono text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
                    {activeRun.generatorDraft}
                  </pre>
                </div>
              </section>

              {/* Stage 2: Breaker (Red-Team) Findings */}
              <section className="oa-float-card flex flex-col p-5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/15 text-xs font-bold text-rose-400">
                      2
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--tone-strong)]">
                        Stage 2: Breaker (Red-Team) Findings
                      </h2>
                      <p className="text-[11px] text-[var(--muted)]">
                        {activeRun.breakerFindings.length} adversarial vulnerabilities &amp; edge cases
                      </p>
                    </div>
                  </div>
                  <Bug size={16} className="text-rose-400" />
                </div>

                <div className="mt-4 max-h-[540px] flex-1 space-y-3 overflow-y-auto pr-1">
                  {activeRun.breakerFindings.length === 0 ? (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs text-emerald-300">
                      No vulnerabilities found during Red-Team probe.
                    </div>
                  ) : (
                    activeRun.breakerFindings.map((finding) => (
                      <div
                        key={finding.id}
                        className="rounded-xl border border-white/10 bg-black/30 p-3.5 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${severityBadgeClass(
                              finding.severity,
                            )}`}
                          >
                            {finding.severity}
                          </span>
                          <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] font-medium text-[var(--tone-strong)]">
                            {finding.category}
                          </span>
                        </div>

                        <p className="text-xs font-medium text-[var(--tone-strong)]">
                          {finding.description}
                        </p>

                        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-[11px]">
                          <div className="font-semibold text-rose-300">Exploit / Edge Case:</div>
                          <div className="mt-0.5 font-mono text-rose-200/90">
                            {finding.exploitOrEdgeCase}
                          </div>
                        </div>

                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-[11px]">
                          <div className="flex items-center gap-1 font-semibold text-emerald-300">
                            <Wrench size={11} />
                            Fix Applied:
                          </div>
                          <div className="mt-0.5 text-emerald-200/90">{finding.fixApplied}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* Stage 3: Fixer Hardened Artifact */}
              <section className="oa-float-card flex flex-col p-5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-xs font-bold text-emerald-400">
                      3
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--tone-strong)]">
                        Stage 3: Fixer Hardened Artifact
                      </h2>
                      <p className="text-[11px] text-[var(--muted)]">
                        Patched deliverable verified against Red-Team findings
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${scoreColorClass(
                      activeRun.verificationScore,
                    )}`}
                  >
                    {activeRun.verificationScore}/100
                  </span>
                </div>

                <div className="mt-4 flex-1">
                  <pre className="max-h-[540px] overflow-auto rounded-xl border border-emerald-500/25 bg-black/40 p-3.5 font-mono text-xs leading-relaxed text-emerald-100 whitespace-pre-wrap">
                    {activeRun.hardenedOutput}
                  </pre>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
