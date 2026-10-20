'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FastForward,
  Loader2,
  Plus,
  Sparkles,
  Target,
  ToggleLeft,
  ToggleRight,
  Trash2,
  XCircle,
} from 'lucide-react'

interface GoalMilestone {
  id: string
  title: string
  completed: boolean
  completedAt?: string
}

interface Goal {
  id: string
  title: string
  description: string
  status: 'active' | 'paused' | 'completed' | 'abandoned'
  priority: 'low' | 'medium' | 'high' | 'critical'
  milestones: GoalMilestone[]
  progress: number
  dueDate?: string
  createdAt: string
}

interface PlanStep {
  id: string
  title: string
  detail: string
  risky: boolean
  status: 'pending' | 'awaiting_approval' | 'done' | 'skipped'
  output?: string
  updatedAt?: string
}

interface GoalPlan {
  goalId: string
  createdAt: string
  steps: PlanStep[]
  autoAdvance: boolean
  lastAdvancedDay?: string
}

interface ProgressLogEntry {
  id: string
  goalId: string
  at: string
  kind: string
  message: string
}

export default function GoalsPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [goals, setGoals] = useState<Goal[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [plan, setPlan] = useState<GoalPlan | null>(null)
  const [log, setLog] = useState<ProgressLogEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Goal['priority']>('medium')
  const [dueDate, setDueDate] = useState('')

  const loadGoals = useCallback(async () => {
    try {
      const list = await sdk.client.get<Goal[]>('/api/v1/goals')
      setGoals(list)
      if (!selectedId && list.length > 0) setSelectedId(list[0].id)
    } catch (e: any) {
      addToast('error', e?.message ?? 'Failed to load goals')
    }
  }, [addToast, selectedId])

  const loadPlan = useCallback(
    async (id: string) => {
      try {
        const res = await sdk.client.get<{ plan: GoalPlan | null; log: ProgressLogEntry[] }>(
          `/api/v1/goals/${encodeURIComponent(id)}/plan`,
        )
        setPlan(res.plan)
        setLog(res.log ?? [])
      } catch {
        setPlan(null)
        setLog([])
      }
    },
    [],
  )

  useEffect(() => {
    void loadGoals()
  }, [loadGoals])

  useEffect(() => {
    if (selectedId) void loadPlan(selectedId)
  }, [selectedId, loadPlan])

  const createGoal = async () => {
    if (!title.trim()) return
    setBusy('create')
    try {
      const created = await sdk.client.post<Goal>('/api/v1/goals', {
        title: title.trim(),
        description: description.trim(),
        priority,
        dueDate: dueDate || undefined,
      })
      setTitle('')
      setDescription('')
      setDueDate('')
      await loadGoals()
      setSelectedId(created.id)
      addToast('success', 'Goal created')
    } catch (e: any) {
      addToast('error', e?.message ?? 'Failed to create goal')
    } finally {
      setBusy(null)
    }
  }

  const generatePlan = async (id: string) => {
    setBusy('plan')
    try {
      const res = await sdk.client.post<{ plan: GoalPlan | null; log: ProgressLogEntry[] }>(
        `/api/v1/goals/${encodeURIComponent(id)}/plan`,
      )
      setPlan(res.plan)
      setLog(res.log ?? [])
      await loadGoals()
      addToast('success', 'Milestone plan generated')
    } catch (e: any) {
      addToast('error', e?.message ?? 'Plan generation failed')
    } finally {
      setBusy(null)
    }
  }

  const toggleAutoAdvance = async (id: string, nextVal: boolean) => {
    setBusy('auto')
    try {
      const updated = await sdk.client.put<GoalPlan>(`/api/v1/goals/${encodeURIComponent(id)}/plan/auto-advance`, {
        autoAdvance: nextVal,
      })
      setPlan(updated)
    } catch (e: any) {
      addToast('error', e?.message ?? 'Failed to update auto-advance')
    } finally {
      setBusy(null)
    }
  }

  const advanceNext = async (id: string) => {
    setBusy('advance')
    try {
      const res = await sdk.client.post<{ plan: GoalPlan; message: string }>(
        `/api/v1/goals/${encodeURIComponent(id)}/plan/step`,
      )
      setPlan(res.plan)
      addToast('info', res.message)
      await Promise.all([loadGoals(), loadPlan(id)])
    } catch (e: any) {
      addToast('error', e?.message ?? 'Advance step failed')
    } finally {
      setBusy(null)
    }
  }

  const decideRiskyStep = async (id: string, stepId: string, approve: boolean) => {
    setBusy(stepId)
    try {
      await sdk.client.post(`/api/v1/goals/${encodeURIComponent(id)}/plan/steps/${encodeURIComponent(stepId)}/decide`, {
        approve,
      })
      await Promise.all([loadGoals(), loadPlan(id)])
      addToast('success', approve ? 'Step approved & executed' : 'Step skipped')
    } catch (e: any) {
      addToast('error', e?.message ?? 'Decision failed')
    } finally {
      setBusy(null)
    }
  }

  const deleteGoal = async (id: string) => {
    setBusy(`del-${id}`)
    try {
      await sdk.client.delete(`/api/v1/goals/${encodeURIComponent(id)}`)
      const remaining = goals.filter((g) => g.id !== id)
      setGoals(remaining)
      if (selectedId === id) setSelectedId(remaining[0]?.id ?? null)
      addToast('success', 'Goal deleted')
    } catch (e: any) {
      addToast('error', e?.message ?? 'Delete failed')
    } finally {
      setBusy(null)
    }
  }

  const activeGoal = goals.find((g) => g.id === selectedId) ?? null

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5 pb-24">
        <header className="oa-float-card p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Target size={18} />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Long-Horizon Goals & Autonomous Planner</h1>
              <p className="text-xs text-[var(--muted)]">
                Break multi-day goals into LLM milestones. A daily worker advances non-risky steps automatically and pauses for approval on external actions.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-12">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Goal title (e.g. Launch OpenAgents v2 docs site)"
              className="oa-input-surface h-10 rounded-xl px-3 text-sm outline-none sm:col-span-4"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Success criteria & context..."
              className="oa-input-surface h-10 rounded-xl px-3 text-sm outline-none sm:col-span-4"
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Goal['priority'])}
              className="oa-input-surface h-10 rounded-xl px-2.5 text-xs outline-none sm:col-span-2"
            >
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
              <option value="critical">Critical</option>
            </select>
            <button
              onClick={createGoal}
              disabled={busy === 'create' || !title.trim()}
              className="oa-accent-button flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-white disabled:opacity-50 sm:col-span-2"
            >
              {busy === 'create' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add Goal
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <aside className="space-y-2.5 lg:col-span-4">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Your Goals ({goals.length})
            </h2>
            {goals.length === 0 ? (
              <div className="oa-float-card p-6 text-center text-xs text-[var(--muted)]">
                No goals created yet. Add your first long-horizon goal above.
              </div>
            ) : (
              goals.map((g) => (
                <div
                  key={g.id}
                  onClick={() => setSelectedId(g.id)}
                  className={`oa-float-card cursor-pointer p-4 transition ${
                    selectedId === g.id ? 'ring-2 ring-slate-900' : 'hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
                        {g.priority}
                      </span>
                      <h3 className="mt-1 truncate text-sm font-semibold text-[var(--tone-strong)]">{g.title}</h3>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void deleteGoal(g.id)
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {g.description && <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{g.description}</p>}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full bg-emerald-600 transition-all" style={{ width: `${g.progress}%` }} />
                    </div>
                    <span className="text-[11px] font-semibold text-[var(--tone-strong)]">{g.progress}%</span>
                  </div>
                </div>
              ))
            )}
          </aside>

          <main className="space-y-4 lg:col-span-8">
            {!activeGoal ? (
              <div className="oa-float-card p-8 text-center text-sm text-[var(--muted)]">
                Select a goal on the left to inspect or generate its autonomous milestone plan.
              </div>
            ) : (
              <>
                <section className="oa-float-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-[var(--tone-strong)]">{activeGoal.title}</h2>
                      <p className="text-xs text-[var(--muted)]">{activeGoal.description || 'No description provided'}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {plan && (
                        <button
                          onClick={() => toggleAutoAdvance(activeGoal.id, !plan.autoAdvance)}
                          disabled={busy === 'auto'}
                          className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 text-xs font-medium text-[var(--tone-strong)]"
                        >
                          {plan.autoAdvance ? (
                            <ToggleRight size={18} className="text-emerald-600" />
                          ) : (
                            <ToggleLeft size={18} className="text-slate-400" />
                          )}
                          Daily Auto-Advance
                        </button>
                      )}
                      <button
                        onClick={() => generatePlan(activeGoal.id)}
                        disabled={busy === 'plan'}
                        className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--tone-strong)] hover:bg-slate-50 disabled:opacity-50"
                      >
                        {busy === 'plan' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        {plan ? 'Regenerate Plan' : 'Generate LLM Plan'}
                      </button>
                      {plan && (
                        <button
                          onClick={() => advanceNext(activeGoal.id)}
                          disabled={busy === 'advance'}
                          className="oa-accent-button flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {busy === 'advance' ? <Loader2 size={14} className="animate-spin" /> : <FastForward size={14} />}
                          Advance Next Step
                        </button>
                      )}
                    </div>
                  </div>

                  {!plan ? (
                    <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--muted)]">
                      No milestone plan yet. Click <b>Generate LLM Plan</b> to break this goal into 4–8 daily steps.
                    </div>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {plan.steps.map((s, idx) => (
                        <li key={s.id} className="rounded-xl border border-[var(--border)] bg-white/80 p-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                                {idx + 1}
                              </span>
                              <span className="text-sm font-semibold text-[var(--tone-strong)]">{s.title}</span>
                              {s.risky && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                  <AlertTriangle size={11} />
                                  External / Risky
                                </span>
                              )}
                            </div>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                                s.status === 'done'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : s.status === 'awaiting_approval'
                                    ? 'bg-amber-100 text-amber-800'
                                    : s.status === 'skipped'
                                      ? 'bg-slate-200 text-slate-600'
                                      : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {s.status === 'done' && <CheckCircle2 size={12} />}
                              {s.status === 'pending' && <Clock size={12} />}
                              {s.status}
                            </span>
                          </div>
                          {s.detail && <p className="mt-1.5 text-xs text-[var(--muted)]">{s.detail}</p>}

                          {s.status === 'awaiting_approval' && (
                            <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs">
                              <span className="font-medium text-amber-900">
                                Approval required before executing this external-impact step.
                              </span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => decideRiskyStep(activeGoal.id, s.id, true)}
                                  disabled={busy === s.id}
                                  className="rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700"
                                >
                                  Approve & Draft
                                </button>
                                <button
                                  onClick={() => decideRiskyStep(activeGoal.id, s.id, false)}
                                  disabled={busy === s.id}
                                  className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"
                                >
                                  <XCircle size={12} /> Skip
                                </button>
                              </div>
                            </div>
                          )}

                          {s.output && (
                            <pre className="mt-2.5 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-3 font-mono text-xs text-slate-100">
                              {s.output}
                            </pre>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="oa-float-card p-5">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Progress Log
                  </h3>
                  {log.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">No worker activity logged for this goal yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {log.map((entry) => (
                        <li
                          key={entry.id}
                          className="rounded-xl border border-[var(--border)] bg-white/70 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                            <span className="font-semibold uppercase">{entry.kind}</span>
                            <span>{new Date(entry.at).toLocaleString()}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-[var(--tone-strong)]">{entry.message}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
