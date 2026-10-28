'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  Crown,
  GitBranch,
  Loader2,
  Play,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { ActionBranch, TreeOfActionsRollout } from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

const PRESET_GOALS: string[] = [
  'Zero-downtime PostgreSQL multi-tenant schema migration from single-table user_id to isolated tenant partitions with instant rollback safety.',
  'Design and execute an incident containment & key-rotation plan after detecting anomalous bearer token replay on the public gateway.',
  'Refactor high-throughput SSE streaming pipeline to eliminate backpressure memory spikes while preserving strict token ordering.',
]

export default function TreeOfActionsPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [rollouts, setRollouts] = useState<TreeOfActionsRollout[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [goal, setGoal] = useState<string>(PRESET_GOALS[0])
  const [branchCount, setBranchCount] = useState<3 | 4>(3)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)

  const activeRollout = rollouts.find((r) => r.id === selectedId) ?? rollouts[0] ?? null

  const loadRollouts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await sdk.agenticSuite.listRollouts()
      setRollouts(data)
      if (data.length > 0) {
        setSelectedId((prev) => (prev && data.some((r) => r.id === prev) ? prev : data[0].id))
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load Tree-of-Actions rollouts')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadRollouts()
  }, [loadRollouts])

  async function handleRunRollout(e: React.FormEvent) {
    e.preventDefault()
    if (!goal.trim()) {
      addToast('warning', 'Enter a high-stakes goal to simulate')
      return
    }
    setRunning(true)
    try {
      const result = await sdk.agenticSuite.runRollout({
        goal: goal.trim(),
        branchCount,
      })
      setRollouts((prev) => [result, ...prev.filter((r) => r.id !== result.id)])
      setSelectedId(result.id)
      addToast('success', `Simulated ${result.branches.length} parallel branches and selected winner`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to execute speculative rollout')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Tree-of-Actions & Speculative Parallel Rollouts
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Forks 3–4 competing strategy branches in parallel, scores them with a Verifier/Judge model, and commits the highest-scoring trajectory
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {rollouts.length > 0 && (
            <select
              value={activeRollout?.id ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:text-slate-200"
            >
              {rollouts.map((r) => (
                <option key={r.id} value={r.id} className="bg-slate-900 text-slate-100">
                  {r.goal.slice(0, 62)}... ({r.branches.length} branches)
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => void loadRollouts()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* Launch Speculative Rollout Form */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            Launch Speculative Multi-Branch Rollout
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_GOALS.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setGoal(preset)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                Preset #{idx + 1}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleRunRollout} className="space-y-3">
          <textarea
            rows={2}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Describe a complex engineering, security, or architectural goal..."
            className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:text-slate-100"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Speculative Branch Factor:
              </span>
              {([3, 4] as const).map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setBranchCount(count)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    branchCount === count
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {count} Parallel Branches
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={running}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Simulating & Scoring {branchCount} Branches...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Speculative Rollout
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {activeRollout ? (
        <>
          {/* Side-by-side Branch Comparison Grid */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Competing Action Branches ({activeRollout.branches.length})
              </h2>
              <span className="text-xs text-slate-400">
                Executed {new Date(activeRollout.createdAt).toLocaleString()}
              </span>
            </div>

            <div
              className={`grid gap-4 ${
                activeRollout.branches.length >= 4
                  ? 'md:grid-cols-2 xl:grid-cols-4'
                  : 'md:grid-cols-3'
              }`}
            >
              {activeRollout.branches.map((branch) => (
                <BranchCard key={branch.id} branch={branch} />
              ))}
            </div>
          </section>

          {/* Verifier Judge Summary & Committed Deliverable */}
          <div className="grid gap-6 lg:grid-cols-12">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 lg:col-span-5">
              <div className="mb-2 flex items-center gap-2">
                <Scale className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Verifier / Judge Arbitration Summary
                </h3>
              </div>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {activeRollout.judgeSummary}
              </p>
            </section>

            <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm lg:col-span-7">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Committed Winning Deliverable
                  </h3>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Committed Trajectory
                </span>
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-100 dark:border-slate-800">
                {activeRollout.finalDeliverable}
              </pre>
            </section>
          </div>
        </>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400 dark:border-slate-800">
          Launch a speculative rollout above to compare parallel action branches.
        </div>
      )}
    </div>
  )
}

function BranchCard({ branch }: { branch: ActionBranch }) {
  const metrics: Array<{ label: string; value: number; color: string }> = [
    { label: 'Correctness', value: branch.scores.correctness, color: 'bg-sky-500' },
    { label: 'Completeness', value: branch.scores.completeness, color: 'bg-indigo-500' },
    { label: 'Safety', value: branch.scores.safety, color: 'bg-emerald-500' },
    { label: 'Efficiency', value: branch.scores.efficiency, color: 'bg-amber-500' },
  ]

  return (
    <div
      className={`flex flex-col justify-between rounded-xl border p-4 transition ${
        branch.isWinner
          ? 'border-emerald-500 bg-emerald-500/5 shadow-md dark:bg-emerald-500/10'
          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70'
      }`}
    >
      <div className="space-y-3">
        {/* Top badge + total score */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              {branch.isWinner && <Crown className="h-4 w-4 shrink-0 text-amber-400" />}
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {branch.strategyName}
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{branch.persona}</p>
          </div>
          <div className="text-right">
            <div
              className={`font-mono text-lg font-bold ${
                branch.isWinner ? 'text-emerald-400' : 'text-slate-700 dark:text-slate-200'
              }`}
            >
              {branch.scores.total}
              <span className="text-xs font-normal text-slate-400">/100</span>
            </div>
            <div className="font-mono text-[10px] text-slate-400">{branch.durationMs}ms</div>
          </div>
        </div>

        {branch.isWinner && (
          <div className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
            <Crown className="h-3 w-3" />
            Winning Trajectory
          </div>
        )}

        {/* 4-Metric Score Bars */}
        <div className="space-y-1.5 rounded-lg border border-slate-200/70 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950/60">
          {metrics.map((m) => (
            <div key={m.label} className="space-y-0.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">{m.label}</span>
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                  {m.value}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full ${m.color}`}
                  style={{ width: `${Math.min(100, Math.max(0, m.value))}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Plan Steps */}
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Rollout Plan Steps
          </div>
          <ol className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
            {branch.planSteps.map((step, idx) => (
              <li key={idx} className="flex gap-1.5">
                <span className="font-mono text-slate-400">{idx + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Verifier Critique Notes */}
      <div className="mt-4 border-t border-slate-200 pt-2.5 dark:border-slate-800">
        <div className="text-[11px] font-semibold text-slate-400">Verifier Notes</div>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{branch.verifierNotes}</p>
      </div>
    </div>
  )
}
