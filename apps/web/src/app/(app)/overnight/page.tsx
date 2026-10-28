'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { OvernightCheckpoint, OvernightMission } from '@openagents/sdk'
import {
  CheckCircle2,
  Clock,
  Coffee,
  Coins,
  Cpu,
  GitBranch,
  History,
  Loader2,
  Moon,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  ToggleLeft,
  ToggleRight,
  XCircle,
} from 'lucide-react'

const PRESET_MISSIONS = [
  {
    title: 'Full Monorepo Security & Dependency Audit + Patch PRs',
    objective:
      'Audit all workspace packages for CVEs, outdated TypeScript/Fastify dependencies, and auth middleware edge cases; generate verified regression tests and prepare migration notes.',
    maxBudgetUsd: 6.5,
  },
  {
    title: 'Overnight Autonomous Benchmark & Latency Optimization',
    objective:
      'Profile API route p95 latencies, index slow Prisma queries, synthesize caching layers, and verify zero regression across test suites.',
    maxBudgetUsd: 5.0,
  },
]

function checkpointStatusBadge(status: OvernightCheckpoint['status']) {
  switch (status) {
    case 'completed':
      return {
        cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        icon: CheckCircle2,
        label: 'completed',
      }
    case 'backtracked':
      return {
        cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        icon: RotateCcw,
        label: 'backtracked',
      }
    case 'failed':
      return {
        cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        icon: XCircle,
        label: 'failed',
      }
    default:
      return {
        cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
        icon: Clock,
        label: 'pending',
      }
  }
}

export default function OvernightMissionPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [missions, setMissions] = useState<OvernightMission[]>([])
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  // Mission creation form state
  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [maxBudgetUsd, setMaxBudgetUsd] = useState<number>(5.0)
  const [autoBacktrack, setAutoBacktrack] = useState<boolean>(true)

  const loadMissions = useCallback(async () => {
    setLoading(true)
    try {
      const list = await sdk.agenticSuite.listOvernightMissions()
      setMissions(list)
      if (list.length > 0 && !selectedMissionId) {
        setSelectedMissionId(list[0].id)
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load overnight missions')
    } finally {
      setLoading(false)
    }
  }, [addToast, selectedMissionId])

  useEffect(() => {
    void loadMissions()
  }, [loadMissions])

  const handleCreateMission = async () => {
    if (!title.trim() || !objective.trim()) {
      addToast('warning', 'Provide both a mission title and objective')
      return
    }
    setBusyAction('create')
    try {
      const created = await sdk.agenticSuite.createOvernightMission({
        title: title.trim(),
        objective: objective.trim(),
        maxBudgetUsd: Number(maxBudgetUsd) || 5.0,
        autoBacktrack,
      })
      setMissions((prev) => [created, ...prev.filter((m) => m.id !== created.id)])
      setSelectedMissionId(created.id)
      setTitle('')
      setObjective('')
      addToast('success', 'Overnight mission created with durable checkpoint DAG')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to create overnight mission')
    } finally {
      setBusyAction(null)
    }
  }

  const handleRunMission = async (missionId: string) => {
    setBusyAction(`run-${missionId}`)
    try {
      const updated = await sdk.agenticSuite.runOvernightMission(missionId)
      setMissions((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      setSelectedMissionId(updated.id)
      addToast('success', 'Mission milestones executed & Morning Wake-Up Briefing ready')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to run/advance mission')
    } finally {
      setBusyAction(null)
    }
  }

  const handleRewindCheckpoint = async (missionId: string, checkpointId: string) => {
    setBusyAction(`rewind-${checkpointId}`)
    try {
      const updated = await sdk.agenticSuite.rewindOvernightMission(missionId, checkpointId)
      setMissions((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      addToast('info', 'Rewound mission state to durable checkpoint')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to rewind checkpoint')
    } finally {
      setBusyAction(null)
    }
  }

  const activeMission =
    missions.find((m) => m.id === selectedMissionId) ?? missions[0] ?? null

  const budgetPercent = activeMission
    ? Math.min(100, Math.round((activeMission.spentUsd / Math.max(0.01, activeMission.maxBudgetUsd)) * 100))
    : 0

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6 pb-24">
        {/* Header + Creation Card */}
        <header className="oa-float-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/15 text-indigo-300">
                <Moon size={20} />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold text-[var(--tone-strong)]">
                    Long-Horizon Overnight Mission Runner
                  </h1>
                  <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300">
                    Durable Checkpoints • Auto-Backtrack • Morning Briefing
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Queue multi-hour autonomous missions with strict USD budget guardrails, serialized state
                  checkpoints, automatic branch backtracking, and a synthesized Morning Wake-Up Briefing.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void loadMissions()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 self-start rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-[var(--tone-strong)] transition hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {/* Preset Quick Fill */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
              Templates:
            </span>
            {PRESET_MISSIONS.map((preset) => (
              <button
                key={preset.title}
                type="button"
                onClick={() => {
                  setTitle(preset.title)
                  setObjective(preset.objective)
                  setMaxBudgetUsd(preset.maxBudgetUsd)
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-[var(--tone-strong)] transition hover:border-indigo-500/40 hover:bg-indigo-500/10"
              >
                <Sparkles size={12} className="text-indigo-400" />
                {preset.title}
              </button>
            ))}
          </div>

          {/* Mission Creation Form */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Mission title (e.g. Overnight Security & Dependency Audit)"
              className="oa-input-surface h-10 rounded-xl px-3 text-sm outline-none sm:col-span-5"
            />
            <input
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Detailed long-horizon objective and deliverables..."
              className="oa-input-surface h-10 rounded-xl px-3 text-sm outline-none sm:col-span-7"
            />

            <div className="flex items-center gap-2 sm:col-span-4">
              <label className="text-xs font-medium text-[var(--muted)] shrink-0">
                Budget Guardrail ($ USD):
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="100"
                value={maxBudgetUsd}
                onChange={(e) => setMaxBudgetUsd( parseFloat(e.target.value) || 1 )}
                className="oa-input-surface h-10 w-28 rounded-xl px-3 text-sm outline-none"
              />
            </div>

            <div className="flex items-center gap-2 sm:col-span-4">
              <button
                type="button"
                onClick={() => setAutoBacktrack((v) => !v)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-[var(--tone-strong)] transition hover:bg-white/10"
              >
                {autoBacktrack ? (
                  <ToggleRight size={18} className="text-indigo-400" />
                ) : (
                  <ToggleLeft size={18} className="text-[var(--muted)]" />
                )}
                <span>Auto-Backtrack on Dead-End: {autoBacktrack ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            <div className="flex justify-end sm:col-span-4">
              <button
                type="button"
                onClick={() => void handleCreateMission()}
                disabled={busyAction === 'create' || !title.trim() || !objective.trim()}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {busyAction === 'create' ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Plus size={15} />
                )}
                Create Overnight Mission
              </button>
            </div>
          </div>
        </header>

        {/* Mission Selector Pills */}
        {missions.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {missions.map((mission) => {
              const selected = activeMission?.id === mission.id
              return (
                <button
                  key={mission.id}
                  type="button"
                  onClick={() => setSelectedMissionId(mission.id)}
                  className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left text-xs transition ${
                    selected
                      ? 'border-indigo-500/50 bg-indigo-500/15 text-[var(--tone-strong)]'
                      : 'border-white/10 bg-black/20 text-[var(--muted)] hover:bg-white/5'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      mission.status === 'completed'
                        ? 'bg-emerald-400'
                        : mission.status === 'active'
                          ? 'bg-indigo-400'
                          : 'bg-amber-400'
                    }`}
                  />
                  <span className="max-w-[220px] truncate font-medium">{mission.title}</span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">
                    ${mission.spentUsd.toFixed(2)} / ${mission.maxBudgetUsd.toFixed(2)}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Active Mission Body */}
        {loading && !activeMission ? (
          <div className="oa-float-card flex items-center justify-center p-12 text-sm text-[var(--muted)]">
            <Loader2 size={18} className="mr-2 animate-spin" />
            Loading overnight missions...
          </div>
        ) : !activeMission ? (
          <div className="oa-float-card p-10 text-center">
            <Moon size={32} className="mx-auto text-indigo-400/70" />
            <h2 className="mt-3 text-sm font-semibold text-[var(--tone-strong)]">
              No Overnight Missions Queued
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Create an overnight mission above to initialize its milestone checkpoint DAG.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left 7 Cols: Milestone DAG & Durable Checkpoint Timeline */}
            <div className="space-y-5 lg:col-span-7">
              <div className="oa-float-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-indigo-300">
                        {activeMission.status}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
                        <RotateCcw size={12} />
                        Backtracks: <strong className="text-[var(--tone-strong)]">{activeMission.backtrackCount}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
                        <Cpu size={12} />
                        Tokens: <strong className="text-[var(--tone-strong)]">{activeMission.totalTokens.toLocaleString()}</strong>
                      </span>
                    </div>
                    <h2 className="mt-1.5 text-base font-semibold text-[var(--tone-strong)]">
                      {activeMission.title}
                    </h2>
                    <p className="mt-1 text-xs text-[var(--muted)]">{activeMission.objective}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleRunMission(activeMission.id)}
                    disabled={busyAction === `run-${activeMission.id}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busyAction === `run-${activeMission.id}` ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Advancing Checkpoints...
                      </>
                    ) : (
                      <>
                        <Play size={15} />
                        Run / Advance Mission
                      </>
                    )}
                  </button>
                </div>

                {/* Budget Progress Bar */}
                <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-medium text-[var(--tone-strong)]">
                      <Coins size={14} className="text-amber-400" />
                      Budget Guardrail Consumption
                    </span>
                    <span className="font-mono text-xs text-[var(--tone-strong)]">
                      ${activeMission.spentUsd.toFixed(2)} / ${activeMission.maxBudgetUsd.toFixed(2)} USD ({budgetPercent}%)
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all"
                      style={{ width: `${budgetPercent}%` }}
                    />
                  </div>
                </div>

                {/* Milestone DAG / Checkpoint Timeline */}
                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                      <GitBranch size={14} className="text-indigo-400" />
                      Milestone DAG &amp; Durable Checkpoint Timeline
                    </h3>
                    <span className="text-[11px] text-[var(--muted)]">
                      {activeMission.checkpoints.filter((c) => c.status === 'completed').length} /{' '}
                      {activeMission.checkpoints.length} completed
                    </span>
                  </div>

                  <div className="space-y-3">
                    {activeMission.checkpoints.map((cp) => {
                      const badge = checkpointStatusBadge(cp.status)
                      const BadgeIcon = badge.icon
                      return (
                        <div
                          key={cp.id}
                          className="rounded-xl border border-white/10 bg-black/30 p-4 transition hover:border-white/20"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10 font-mono text-xs font-bold text-[var(--tone-strong)]">
                                {cp.milestoneIndex}
                              </span>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-sm font-semibold text-[var(--tone-strong)]">
                                    {cp.milestoneTitle}
                                  </h4>
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${badge.cls}`}
                                  >
                                    <BadgeIcon size={11} />
                                    {badge.label}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[var(--muted)]">
                                  <span>Tokens: {cp.tokensUsed.toLocaleString()}</span>
                                  <span>Cost: ${cp.costUsd.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => void handleRewindCheckpoint(activeMission.id, cp.id)}
                              disabled={busyAction === `rewind-${cp.id}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-[var(--tone-strong)] transition hover:border-amber-500/40 hover:bg-amber-500/15 hover:text-amber-200 disabled:opacity-50"
                            >
                              {busyAction === `rewind-${cp.id}` ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <History size={12} />
                              )}
                              Rewind to Checkpoint
                            </button>
                          </div>

                          <p className="mt-2.5 text-xs leading-relaxed text-[var(--muted)]">
                            {cp.outputSummary}
                          </p>

                          {/* State Snapshot JSON Preview */}
                          <div className="mt-3 rounded-lg border border-white/10 bg-black/50 p-2.5">
                            <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                              <span>Serialized State Snapshot</span>
                              <span className="font-mono text-indigo-300">{cp.id}</span>
                            </div>
                            <pre className="overflow-x-auto font-mono text-[11px] text-slate-300">
                              {JSON.stringify(cp.stateSnapshot, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Right 5 Cols: Morning Wake-Up Briefing Card */}
            <div className="space-y-5 lg:col-span-5">
              <div className="oa-float-card p-5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-300">
                      <Sun size={18} />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--tone-strong)]">
                        Morning Wake-Up Briefing
                      </h2>
                      <p className="text-[11px] text-[var(--muted)]">
                        Executive summary of overnight autonomous progress &amp; decisions
                      </p>
                    </div>
                  </div>
                  <Coffee size={16} className="text-amber-300" />
                </div>

                {activeMission.wakeUpReport ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                      <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--tone-strong)]">
                        {activeMission.wakeUpReport}
                      </pre>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5 text-center">
                      <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                        <div className="text-[10px] uppercase text-[var(--muted)]">Total Spent</div>
                        <div className="mt-1 text-sm font-bold text-emerald-300">
                          ${activeMission.spentUsd.toFixed(2)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                        <div className="text-[10px] uppercase text-[var(--muted)]">Backtracks</div>
                        <div className="mt-1 text-sm font-bold text-amber-300">
                          {activeMission.backtrackCount}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                        <div className="text-[10px] uppercase text-[var(--muted)]">Tokens</div>
                        <div className="mt-1 text-sm font-bold text-indigo-300">
                          {activeMission.totalTokens.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-6 text-center">
                    <ShieldCheck size={28} className="mx-auto text-indigo-400/70" />
                    <h3 className="mt-2 text-xs font-semibold text-[var(--tone-strong)]">
                      Briefing Pending Execution
                    </h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Click &ldquo;Run / Advance Mission&rdquo; to execute remaining pending milestones and compile the
                      Morning Wake-Up Briefing.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
