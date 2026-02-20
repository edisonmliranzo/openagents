'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type {
  AgentBriefing,
  AgentDecisionJournalEntry,
  AgentFeatureState,
  AgentGoal,
  AgentGoalPriority,
  AgentGoalStatus,
  AgentLabsSnapshot,
  AgentSafetyTier,
} from '@openagents/shared'

const PRIORITIES: AgentGoalPriority[] = ['low', 'medium', 'high', 'critical']
const STATUSES: AgentGoalStatus[] = ['todo', 'doing', 'blocked', 'done']
const SAFETY_TIERS: AgentSafetyTier[] = ['strict', 'balanced', 'fast']

function maturityColor(value: AgentFeatureState['maturity']) {
  if (value === 'active') return 'bg-emerald-100 text-emerald-700'
  if (value === 'foundation') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-200 text-slate-700'
}

function riskColor(value: AgentDecisionJournalEntry['risk']) {
  if (value === 'high') return 'bg-red-100 text-red-700'
  if (value === 'medium') return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

function timeAgo(iso: string) {
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return 'n/a'
  const deltaMin = Math.max(0, Math.floor((Date.now() - ts) / 60000))
  if (deltaMin < 1) return 'just now'
  if (deltaMin < 60) return `${deltaMin}m ago`
  const deltaHours = Math.floor(deltaMin / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`
  return `${Math.floor(deltaHours / 24)}d ago`
}

export default function LabsPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [snapshot, setSnapshot] = useState<AgentLabsSnapshot | null>(null)
  const [briefing, setBriefing] = useState<AgentBriefing | null>(null)
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [newGoalDetails, setNewGoalDetails] = useState('')
  const [newGoalPriority, setNewGoalPriority] = useState<AgentGoalPriority>('medium')
  const [decisionSummary, setDecisionSummary] = useState('')
  const [decisionOptions, setDecisionOptions] = useState('')
  const [decisionSelected, setDecisionSelected] = useState('')
  const [decisionRisk, setDecisionRisk] = useState<'low' | 'medium' | 'high'>('medium')
  const [decisionConfidence, setDecisionConfidence] = useState(0.7)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const featuresByMaturity = useMemo(() => {
    const items = snapshot?.features ?? []
    return {
      active: items.filter((item) => item.maturity === 'active'),
      foundation: items.filter((item) => item.maturity === 'foundation'),
      planned: items.filter((item) => item.maturity === 'planned'),
    }
  }, [snapshot])

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const next = await sdk.labs.snapshot()
      setSnapshot(next)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load labs snapshot')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleToggleFeature(featureId: AgentFeatureState['id'], enabled: boolean) {
    setIsSaving(true)
    try {
      const next = await sdk.labs.toggleFeature(featureId, { enabled })
      setSnapshot(next)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update feature')
      addToast('error', err?.message ?? 'Failed to update feature')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSafetyTier(safetyTier: AgentSafetyTier) {
    setIsSaving(true)
    try {
      const next = await sdk.labs.setSafetyTier({ safetyTier })
      setSnapshot(next)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to set safety tier')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleCreateGoal() {
    const title = newGoalTitle.trim()
    if (!title) return
    setIsSaving(true)
    try {
      const goal = await sdk.labs.createGoal({
        title,
        details: newGoalDetails.trim() || undefined,
        priority: newGoalPriority,
      })
      setSnapshot((prev) =>
        prev
          ? { ...prev, goals: [goal, ...prev.goals], updatedAt: new Date().toISOString() }
          : prev,
      )
      setNewGoalTitle('')
      setNewGoalDetails('')
      setNewGoalPriority('medium')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create goal')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleGoalUpdate(goal: AgentGoal, patch: Partial<Pick<AgentGoal, 'status' | 'priority'>>) {
    setIsSaving(true)
    try {
      const next = await sdk.labs.updateGoal(goal.id, patch)
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              goals: prev.goals.map((item) => (item.id === next.id ? next : item)),
              updatedAt: new Date().toISOString(),
            }
          : prev,
      )
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update goal')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleGoalDelete(goalId: string) {
    setIsSaving(true)
    try {
      await sdk.labs.deleteGoal(goalId)
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              goals: prev.goals.filter((goal) => goal.id !== goalId),
              updatedAt: new Date().toISOString(),
            }
          : prev,
      )
    } catch (err: any) {
      setError(err?.message ?? 'Failed to delete goal')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleLogDecision() {
    const summary = decisionSummary.trim()
    const selected = decisionSelected.trim()
    const options = decisionOptions
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)

    if (!summary || !selected || options.length === 0) {
      setError('Decision summary, selected option, and at least one option are required.')
      return
    }

    setIsSaving(true)
    try {
      const next = await sdk.labs.logDecision({
        summary,
        options,
        selected,
        risk: decisionRisk,
        confidence: decisionConfidence,
      })
      setSnapshot(next)
      setDecisionSummary('')
      setDecisionOptions('')
      setDecisionSelected('')
      setDecisionRisk('medium')
      setDecisionConfidence(0.7)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to log decision')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleBriefing() {
    setIsSaving(true)
    try {
      const next = await sdk.labs.briefing()
      setBriefing(next)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to generate briefing')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Agent Labs</h1>
          <p className="mt-1 text-sm text-slate-500">
            All advanced agent capabilities in one control center.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Safety Tier</h2>
        <p className="mt-1 text-sm text-slate-500">Controls approval strictness and execution aggressiveness.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SAFETY_TIERS.map((tier) => {
            const active = snapshot?.safetyTier === tier
            return (
              <button
                key={tier}
                type="button"
                onClick={() => void handleSafetyTier(tier)}
                disabled={isSaving}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tier}
              </button>
            )
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {(['active', 'foundation', 'planned'] as const).map((group) => (
          <article key={group} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 capitalize">{group}</h2>
            <div className="mt-3 space-y-2">
              {featuresByMaturity[group].map((feature) => (
                <div key={feature.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{feature.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{feature.description}</p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${maturityColor(feature.maturity)}`}>
                        {feature.maturity}
                      </span>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={feature.enabled}
                        disabled={isSaving}
                        onChange={(e) => void handleToggleFeature(feature.id, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-200"
                      />
                      enabled
                    </label>
                  </div>
                </div>
              ))}
              {featuresByMaturity[group].length === 0 && (
                <p className="text-sm text-slate-500">No features in this group.</p>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Goal Board</h2>
          <p className="mt-1 text-sm text-slate-500">Track priority goals and execution status.</p>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={newGoalTitle}
              onChange={(e) => setNewGoalTitle(e.target.value)}
              placeholder="Goal title"
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
            />
            <select
              value={newGoalPriority}
              onChange={(e) => setNewGoalPriority(e.target.value as AgentGoalPriority)}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
          </div>
          <textarea
            value={newGoalDetails}
            onChange={(e) => setNewGoalDetails(e.target.value)}
            placeholder="Optional details"
            className="mt-2 min-h-[80px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
          />
          <button
            type="button"
            onClick={() => void handleCreateGoal()}
            disabled={isSaving || !newGoalTitle.trim()}
            className="mt-2 rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
          >
            Add goal
          </button>

          <div className="mt-4 space-y-2">
            {(snapshot?.goals ?? []).map((goal) => (
              <div key={goal.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{goal.title}</p>
                    {goal.details && <p className="mt-1 text-xs text-slate-500">{goal.details}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleGoalDelete(goal.id)}
                    disabled={isSaving}
                    className="text-xs font-semibold text-red-600 hover:text-red-700"
                  >
                    delete
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={goal.status}
                    onChange={(e) => void handleGoalUpdate(goal, { status: e.target.value as AgentGoalStatus })}
                    className="h-8 rounded border border-slate-200 px-2 text-xs text-slate-700"
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                  <select
                    value={goal.priority}
                    onChange={(e) => void handleGoalUpdate(goal, { priority: e.target.value as AgentGoalPriority })}
                    className="h-8 rounded border border-slate-200 px-2 text-xs text-slate-700"
                  >
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>
                  <span className="text-[11px] text-slate-400">updated {timeAgo(goal.updatedAt)}</span>
                </div>
              </div>
            ))}
            {(snapshot?.goals.length ?? 0) === 0 && (
              <p className="text-sm text-slate-500">No goals yet.</p>
            )}
          </div>
        </article>

        <article className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Decision Journal</h2>
            <p className="mt-1 text-sm text-slate-500">Record important choices and rationale.</p>

            <input
              value={decisionSummary}
              onChange={(e) => setDecisionSummary(e.target.value)}
              placeholder="Decision summary"
              className="mt-3 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
            />
            <textarea
              value={decisionOptions}
              onChange={(e) => setDecisionOptions(e.target.value)}
              placeholder="Options (one per line)"
              className="mt-2 min-h-[80px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
            />
            <input
              value={decisionSelected}
              onChange={(e) => setDecisionSelected(e.target.value)}
              placeholder="Selected option"
              className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
            />

            <div className="mt-2 flex gap-2">
              <select
                value={decisionRisk}
                onChange={(e) => setDecisionRisk(e.target.value as 'low' | 'medium' | 'high')}
                className="h-9 rounded border border-slate-200 px-2 text-xs text-slate-700"
              >
                <option value="low">low risk</option>
                <option value="medium">medium risk</option>
                <option value="high">high risk</option>
              </select>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={decisionConfidence}
                onChange={(e) => setDecisionConfidence(Math.max(0, Math.min(1, Number(e.target.value || 0))))}
                className="h-9 w-[120px] rounded border border-slate-200 px-2 text-xs text-slate-700"
              />
              <button
                type="button"
                onClick={() => void handleLogDecision()}
                disabled={isSaving}
                className="rounded bg-indigo-500 px-3 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
              >
                Log
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {(snapshot?.decisionJournal ?? []).slice(0, 5).map((entry) => (
                <div key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-700">{entry.summary}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskColor(entry.risk)}`}>
                      {entry.risk}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">selected: {entry.selected}</p>
                  <p className="text-[11px] text-slate-400">{timeAgo(entry.createdAt)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Daily Briefing</h2>
            <p className="mt-1 text-sm text-slate-500">Generate a concise operational briefing.</p>
            <button
              type="button"
              onClick={() => void handleBriefing()}
              disabled={isSaving}
              className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Generate briefing
            </button>
            {briefing && (
              <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">{briefing.summary}</p>
                {briefing.recommendations.map((item, idx) => (
                  <p key={`${item}-${idx}`} className="text-xs text-slate-600">{idx + 1}. {item}</p>
                ))}
              </div>
            )}
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

