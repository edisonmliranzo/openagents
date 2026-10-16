'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  Cpu,
  Loader2,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
  XCircle,
  Zap,
} from 'lucide-react'
import clsx from 'clsx'

interface TaskRow {
  id: string
  title: string
  goal: string
  status: string
  cursor: number
  replans: number
  createdAt: string
  finishedAt: string | null
  error: string | null
}

interface PlanStepItem {
  kind: 'tool' | 'llm'
  tool?: string
  input?: Record<string, unknown>
  instruction: string
  status?: 'pending' | 'running' | 'done' | 'failed'
  output?: string
  error?: string
  approved?: boolean
}

interface TaskVerdict {
  met?: boolean
  gaps?: string[]
  answer?: string
}

interface TaskDetail extends TaskRow {
  plan: string
  result: string | null
  verdict: string | null
  successCriteria?: string | null
  maxSteps?: number
  events: Array<{
    id: string
    kind: string
    message: string
    data: string | null
    createdAt: string
  }>
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  planning: {
    label: 'Planning',
    cls: 'border-indigo-500/30 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  },
  running: {
    label: 'Executing',
    cls: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  },
  awaiting_approval: {
    label: 'Awaiting Approval',
    cls: 'border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300',
  },
  done: {
    label: 'Verified Done',
    cls: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  failed: {
    label: 'Failed',
    cls: 'border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300',
  },
  cancelled: {
    label: 'Cancelled',
    cls: 'border-slate-400/30 bg-slate-500/15 text-slate-600 dark:text-slate-400',
  },
}

const MISSION_TEMPLATES = [
  {
    id: 'repo-audit',
    badge: 'Engineering • @Forge',
    icon: Code2,
    color: 'from-rose-500 to-orange-500',
    title: 'Monorepo Architecture & Package Audit',
    goal: 'Inspect the current workspace directory using shell_execute, list the apps and packages, and summarize each module’s core responsibility.',
    criteria: 'Must list all directories under apps/ and packages/ with concrete descriptions based on real command output.',
    maxSteps: 12,
  },
  {
    id: 'system-health',
    badge: 'DevOps • @Sentinel',
    icon: Terminal,
    color: 'from-emerald-500 to-teal-600',
    title: 'Windows Environment & Runtime Diagnostics',
    goal: 'Run non-destructive shell commands to check Node.js version, git branch status, and verify local environment readiness.',
    criteria: 'Must include exact Node version, current git status summary, and confirmation of workspace directory.',
    maxSteps: 10,
  },
  {
    id: 'deep-intel',
    badge: 'Research • @Scout',
    icon: Search,
    color: 'from-cyan-500 to-blue-600',
    title: 'Autonomous AI Agent Architecture Brief',
    goal: 'Search the web for the latest autonomous agent design patterns (Plan-Execute-Verify and MCP tool protocols) and save a structured summary note.',
    criteria: 'Provide 4 concrete architectural takeaways and save a note using notes_create.',
    maxSteps: 12,
  },
  {
    id: 'launch-roadmap',
    badge: 'Strategy • @Atlas',
    icon: Workflow,
    color: 'from-amber-500 to-rose-500',
    title: '7-Day Product Launch & Growth Playbook',
    goal: 'Create a 7-day execution plan for launching OpenAgents v2.0 on X and GitHub, and save the milestone checklist as a persistent note.',
    criteria: 'Must include day-by-day milestones from Day 1 to Day 7 and save the result via notes_create.',
    maxSteps: 10,
  },
]

function parsePlanSteps(raw: string | undefined | null): PlanStepItem[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseVerdictObj(raw: string | undefined | null): TaskVerdict | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export default function AutonomousTasksStudioPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [goal, setGoal] = useState('')
  const [criteria, setCriteria] = useState('')
  const [maxSteps, setMaxSteps] = useState<number>(12)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [active, setActive] = useState<TaskDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [expandedStepIdx, setExpandedStepIdx] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await sdk.tasks.list()
      setTasks(Array.isArray(list) ? list : [])
    } catch {
      // ignore transient errors
    }
  }, [])

  const openTask = useCallback(async (id: string) => {
    try {
      const detail = await sdk.tasks.get(id)
      setActive(detail as TaskDetail)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    void load().then(() => {
      // Auto-select latest task if none selected
    })
  }, [load])

  useEffect(() => {
    if (!active && tasks.length > 0) {
      void openTask(tasks[0].id)
    }
  }, [active, tasks, openTask])

  // Poll while any task is active
  useEffect(() => {
    const anyActive =
      tasks.some((t) => ['planning', 'running', 'awaiting_approval'].includes(t.status)) ||
      (active && ['planning', 'running', 'awaiting_approval'].includes(active.status))
    if (!anyActive) return
    pollRef.current = setInterval(async () => {
      await load()
      if (active) await openTask(active.id)
    }, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [tasks, active, load, openTask])

  const stats = useMemo(() => {
    const running = tasks.filter((t) => ['planning', 'running'].includes(t.status)).length
    const awaiting = tasks.filter((t) => t.status === 'awaiting_approval').length
    const done = tasks.filter((t) => t.status === 'done').length
    const totalReplans = tasks.reduce((acc, t) => acc + (t.replans || 0), 0)
    return { running, awaiting, done, totalReplans }
  }, [tasks])

  const activeSteps = useMemo(() => parsePlanSteps(active?.plan), [active?.plan])
  const activeVerdict = useMemo(() => parseVerdictObj(active?.verdict), [active?.verdict])

  async function createTask(customGoal?: string, customCriteria?: string, customMaxSteps?: number) {
    const g = (customGoal ?? goal).trim()
    const c = (customCriteria ?? criteria).trim()
    const stepsLimit = customMaxSteps ?? maxSteps

    if (g.length < 8) {
      addToast('warning', 'Describe the mission goal in at least a sentence.')
      return
    }
    setBusy(true)
    try {
      const task = await sdk.tasks.create({
        goal: g,
        successCriteria: c || undefined,
        maxSteps: stepsLimit,
      })
      if (!customGoal) {
        setGoal('')
        setCriteria('')
      }
      addToast('success', 'Autonomous mission launched into Plan → Execute → Verify pipeline.')
      await load()
      await openTask(task.id)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Could not launch task')
    } finally {
      setBusy(false)
    }
  }

  async function handleApprove(taskId: string) {
    try {
      await sdk.tasks.approve(taskId)
      addToast('success', 'Step approved — resuming autonomous execution.')
      await openTask(taskId)
      await load()
    } catch (err: any) {
      addToast('error', err?.message ?? 'Approval failed')
    }
  }

  async function handleCancel(taskId: string) {
    try {
      await sdk.tasks.cancel(taskId)
      addToast('info', 'Mission cancelled.')
      await openTask(taskId)
      await load()
    } catch (err: any) {
      addToast('error', err?.message ?? 'Cancel failed')
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-20">
      {/* Studio Header + Live Telemetry KPIs */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-300">
            <Workflow size={13} />
            <span>Durable Plan → Execute → Verify Engine</span>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--tone-strong)] sm:text-3xl">
            Autonomous Task Studio
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--muted)] max-w-2xl">
            Assign high-level outcomes. OpenAgents generates a multi-step tool plan, executes commands, verifies every success criterion, and self-heals on errors.
          </p>
        </div>

        {/* KPI Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { label: 'Active Runs', value: stats.running, color: 'text-cyan-500' },
            { label: 'Verified Done', value: stats.done, color: 'text-emerald-500' },
            { label: 'Need Approval', value: stats.awaiting, color: 'text-amber-500' },
            { label: 'Self-Heal Replans', value: stats.totalReplans, color: 'text-rose-500' },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="manus-panel flex flex-col justify-between px-4 py-3 min-w-[120px]"
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
                {kpi.label}
              </span>
              <span className={clsx('mt-1 text-xl font-black', kpi.color)}>{kpi.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 1-Click Mission Templates */}
      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            1-Click Autonomous Mission Templates
          </p>
          <span className="text-[11px] text-[var(--muted)]">
            Click a template to populate or launch immediately
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MISSION_TEMPLATES.map((tpl) => {
            const Icon = tpl.icon
            return (
              <div
                key={tpl.id}
                className="manus-panel group flex flex-col justify-between p-4 transition hover:-translate-y-0.5 hover:border-rose-500/35"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r ${tpl.color} px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm`}
                    >
                      <Icon size={11} />
                      {tpl.badge}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--muted)]">
                      {tpl.maxSteps} steps
                    </span>
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-[var(--tone-strong)]">{tpl.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{tpl.goal}</p>
                </div>

                <div className="mt-4 flex items-center gap-2 pt-3 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => {
                      setGoal(tpl.goal)
                      setCriteria(tpl.criteria)
                      setMaxSteps(tpl.maxSteps)
                    }}
                    className="oa-soft-button flex-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition"
                  >
                    Customize
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void createTask(tpl.goal, tpl.criteria, tpl.maxSteps)}
                    className="oa-accent-button inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-bold text-white transition disabled:opacity-50"
                  >
                    <PlayCircle size={12} />
                    <span>Launch</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Mission Composer Card */}
      <div className="manus-panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="oa-brand-badge flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white">
              <Zap size={14} />
            </div>
            <h2 className="text-sm font-bold text-[var(--tone-strong)]">
              Dispatch Custom Autonomous Mission
            </h2>
          </div>

          {/* Step Budget Selector */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-[var(--muted)]">Step Budget:</span>
            <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] p-0.5">
              {[8, 12, 20, 25].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxSteps(n)}
                  className={clsx(
                    'rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold transition',
                    maxSteps === n
                      ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-xs'
                      : 'text-[var(--muted)] hover:text-[var(--tone-strong)]',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Mission Goal (What should the agent accomplish end-to-end?)
            </label>
            <textarea
              rows={2}
              className="oa-input-surface w-full rounded-2xl px-4 py-2.5 text-sm outline-none"
              placeholder="e.g. Inspect apps/api/src, list all registered tool connectors, and save a capability matrix note..."
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
          <div className="lg:col-span-5 flex flex-col justify-between">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
                Strict Verifier Criteria (Optional)
              </label>
              <input
                className="oa-input-surface w-full rounded-2xl px-4 py-2.5 text-sm outline-none"
                placeholder="e.g. Must include exact file counts and save a note"
                value={criteria}
                onChange={(e) => setCriteria(e.target.value)}
              />
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void load()}
                className="oa-soft-button inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold"
                title="Refresh tasks"
              >
                <RefreshCw size={13} />
                <span>Sync</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void createTask()}
                className="oa-accent-button inline-flex h-10 items-center gap-2 rounded-xl px-5 text-xs font-bold text-white transition disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Planning Mission...</span>
                  </>
                ) : (
                  <>
                    <PlayCircle size={15} />
                    <span>Launch Autonomous Task</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Split View: Left Mission Queue (4 cols) + Right Live Pipeline Inspector (8 cols) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left Column: Mission Queue */}
        <div className="lg:col-span-4 space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Mission Queue ({tasks.length})
            </h3>
          </div>

          {tasks.length === 0 ? (
            <div className="manus-panel p-8 text-center">
              <Bot className="mx-auto h-8 w-8 text-[var(--muted)] opacity-60" />
              <p className="mt-2 text-sm font-semibold text-[var(--tone-strong)]">
                No autonomous tasks yet
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Pick one of the 1-click templates above or enter a custom goal to launch your first mission.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
              {tasks.map((t) => {
                const badge = STATUS_BADGE[t.status] ?? {
                  label: t.status,
                  cls: 'border-slate-400/30 bg-slate-500/10 text-slate-500',
                }
                const isSelected = active?.id === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void openTask(t.id)}
                    className={clsx(
                      'manus-panel w-full p-4 text-left transition',
                      isSelected
                        ? 'ring-2 ring-rose-500/60 border-rose-500/40'
                        : 'hover:border-rose-500/25',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold',
                          badge.cls,
                        )}
                      >
                        {['planning', 'running'].includes(t.status) && (
                          <Loader2 size={10} className="animate-spin" />
                        )}
                        {badge.label}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--muted)]">
                        Step {t.cursor}
                        {t.replans > 0 ? ` • ${t.replans} replan` : ''}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs sm:text-sm font-bold text-[var(--tone-strong)]">
                      {t.title}
                    </p>
                    {t.error && (
                      <p className="mt-1 truncate text-[11px] text-rose-500">{t.error}</p>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Right Column: Live Execution Pipeline Inspector */}
        <div className="lg:col-span-8">
          {!active ? (
            <div className="manus-panel flex h-80 flex-col items-center justify-center p-8 text-center">
              <Workflow className="h-10 w-10 text-rose-500/60" />
              <p className="mt-3 text-base font-bold text-[var(--tone-strong)]">
                Select or Launch a Mission to Inspect Live Telemetry
              </p>
              <p className="mt-1 max-w-md text-xs text-[var(--muted)]">
                Every tool invocation, shell output, replan decision, and strict verification verdict streams here in real time.
              </p>
            </div>
          ) : (
            <div className="manus-panel p-5 sm:p-6 space-y-5">
              {/* Top Mission Banner */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
                <div className="space-y-1 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-bold',
                        (STATUS_BADGE[active.status] ?? STATUS_BADGE.planning).cls,
                      )}
                    >
                      {['planning', 'running'].includes(active.status) && (
                        <Loader2 size={12} className="animate-spin" />
                      )}
                      {(STATUS_BADGE[active.status] ?? { label: active.status }).label}
                    </span>
                    <span className="font-mono text-xs text-[var(--muted)]">
                      Progress: {active.cursor} / {activeSteps.length || '?'} steps
                    </span>
                    {active.replans > 0 && (
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-amber-600 dark:text-amber-300">
                        Self-Healed ({active.replans}x)
                      </span>
                    )}
                  </div>
                  <h2 className="text-base sm:text-lg font-extrabold text-[var(--tone-strong)] pt-1">
                    {active.goal}
                  </h2>
                  {active.successCriteria && (
                    <p className="text-xs text-[var(--muted)]">
                      <strong className="text-[var(--tone-default)]">Success Criteria:</strong>{' '}
                      {active.successCriteria}
                    </p>
                  )}
                </div>

                {/* Approval / Cancel Controls */}
                <div className="flex items-center gap-2">
                  {active.status === 'awaiting_approval' && (
                    <button
                      type="button"
                      onClick={() => void handleApprove(active.id)}
                      className="oa-accent-button inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white"
                    >
                      <ShieldCheck size={14} />
                      <span>Approve Step</span>
                    </button>
                  )}
                  {['planning', 'running', 'awaiting_approval'].includes(active.status) && (
                    <button
                      type="button"
                      onClick={() => void handleCancel(active.id)}
                      className="oa-soft-button inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400"
                    >
                      <XCircle size={14} />
                      <span>Cancel</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              {activeSteps.length > 0 && (
                <div className="w-full overflow-hidden rounded-full bg-[var(--surface-muted)] h-2 border border-[var(--border)]">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 via-orange-500 to-emerald-500 transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((active.cursor / Math.max(activeSteps.length, 1)) * 100),
                      )}%`,
                    }}
                  />
                </div>
              )}

              {/* Execution Plan Steps */}
              <div className="space-y-2.5">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Execution Pipeline ({activeSteps.length} Steps)
                </p>

                {activeSteps.length === 0 ? (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs text-[var(--muted)] flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-rose-500" />
                    <span>Planner is decomposing the goal into executable tool steps...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeSteps.map((step, idx) => {
                      const isExpanded = expandedStepIdx === idx
                      const st =
                        step.status ??
                        (idx < active.cursor
                          ? 'done'
                          : idx === active.cursor && active.status === 'running'
                            ? 'running'
                            : 'pending')

                      return (
                        <div
                          key={idx}
                          className={clsx(
                            'rounded-2xl border p-3.5 transition',
                            st === 'done'
                              ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
                              : st === 'running'
                                ? 'border-cyan-500/40 bg-cyan-500/[0.06]'
                                : st === 'failed'
                                  ? 'border-rose-500/40 bg-rose-500/[0.06]'
                                  : 'border-[var(--border)] bg-[var(--surface-muted)]/60',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-mono font-bold text-white dark:bg-slate-200 dark:text-slate-900">
                                {idx + 1}
                              </span>
                              <span
                                className={clsx(
                                  'rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase',
                                  step.kind === 'tool'
                                    ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300'
                                    : 'bg-purple-500/20 text-purple-700 dark:text-purple-300',
                                )}
                              >
                                {step.kind}
                              </span>
                              {step.tool && (
                                <span className="rounded-md border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-600 dark:text-rose-300">
                                  {step.tool}()
                                </span>
                              )}
                              <span className="truncate text-xs sm:text-sm font-semibold text-[var(--tone-strong)]">
                                {step.instruction}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-[10px] uppercase text-[var(--muted)]">
                                {st}
                              </span>
                              {(step.output || step.input || step.error) && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedStepIdx(isExpanded ? null : idx)
                                  }
                                  className="rounded-lg border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)] hover:text-[var(--tone-strong)]"
                                >
                                  {isExpanded ? 'Hide IO' : 'Inspect IO'}
                                </button>
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3 font-mono text-[11px]">
                              {step.input && Object.keys(step.input).length > 0 && (
                                <div>
                                  <span className="text-[10px] uppercase text-[var(--muted)]">
                                    Tool Input:
                                  </span>
                                  <pre className="mt-1 max-h-32 overflow-auto rounded-xl bg-slate-950 p-2.5 text-slate-200">
                                    {JSON.stringify(step.input, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {step.output && (
                                <div>
                                  <span className="text-[10px] uppercase text-emerald-500">
                                    Step Output:
                                  </span>
                                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-2.5 text-emerald-200">
                                    {step.output}
                                  </pre>
                                </div>
                              )}
                              {step.error && (
                                <div className="rounded-xl bg-rose-950/80 p-2.5 text-rose-200">
                                  Error: {step.error}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Verifier Verdict & Final Result */}
              {(active.result || activeVerdict) && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 size={15} />
                      Strict Verifier Verdict:{' '}
                      {activeVerdict?.met ? 'ALL CRITERIA MET' : 'COMPLETED WITH NOTES'}
                    </span>
                  </div>
                  {active.result && (
                    <div className="whitespace-pre-wrap rounded-xl bg-white/80 p-3.5 text-xs sm:text-sm leading-relaxed text-slate-800 dark:bg-slate-950/80 dark:text-slate-100">
                      {active.result}
                    </div>
                  )}
                </div>
              )}

              {/* Live Event Stream */}
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Live Telemetry Event Log ({active.events.length})
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-slate-300">
                  {active.events.map((ev) => (
                    <div key={ev.id} className="flex items-start gap-2">
                      <span className="shrink-0 text-rose-400">[{ev.kind}]</span>
                      <span className="text-slate-200">{ev.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
