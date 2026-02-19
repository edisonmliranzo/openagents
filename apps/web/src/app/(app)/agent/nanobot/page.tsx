'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { NanobotBusEvent, NanobotHealth, UpdateNanobotConfigInput } from '@openagents/shared'
import {
  Activity,
  Clock3,
  Cpu,
  GitBranch,
  HeartPulse,
  RefreshCw,
  Rocket,
  Settings2,
} from 'lucide-react'

function timeAgo(iso: string) {
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return 'n/a'
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000))
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

function eventBadgeColor(name: NanobotBusEvent['name']) {
  if (name.endsWith('failed')) return 'bg-red-100 text-red-700'
  if (name.endsWith('completed')) return 'bg-emerald-100 text-emerald-700'
  if (name.includes('cron') || name.includes('heartbeat')) return 'bg-cyan-100 text-cyan-700'
  return 'bg-slate-100 text-slate-700'
}

export default function NanobotPage() {
  const addToast = useUIStore((s) => s.addToast)

  const [health, setHealth] = useState<NanobotHealth | null>(null)
  const [events, setEvents] = useState<NanobotBusEvent[]>([])
  const [configDraft, setConfigDraft] = useState<UpdateNanobotConfigInput>({
    enabled: false,
    maxLoopSteps: 8,
    shadowMode: false,
    runtimeLabel: 'nanobot',
  })
  const [cronJobName, setCronJobName] = useState('daily-health-check')
  const [isLoading, setIsLoading] = useState(false)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isRunningAction, setIsRunningAction] = useState(false)
  const [error, setError] = useState('')

  const loadDashboard = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [nextHealth, nextEvents] = await Promise.all([
        sdk.nanobot.health(),
        sdk.nanobot.listEvents(80),
      ])
      setHealth(nextHealth)
      setEvents(nextEvents)
      setConfigDraft({
        enabled: nextHealth.config.enabled,
        maxLoopSteps: nextHealth.config.maxLoopSteps,
        shadowMode: nextHealth.config.shadowMode,
        runtimeLabel: nextHealth.config.runtimeLabel,
      })
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load nanobot dashboard'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const enabledSkillCount = useMemo(
    () => health?.activeSkills.filter((skill) => skill.enabled).length ?? 0,
    [health],
  )

  async function handleSaveConfig() {
    setIsSavingConfig(true)
    setError('')
    try {
      const nextConfig = await sdk.nanobot.updateConfig({
        enabled: !!configDraft.enabled,
        maxLoopSteps: Math.max(1, Number(configDraft.maxLoopSteps ?? 1)),
        shadowMode: !!configDraft.shadowMode,
        runtimeLabel: (configDraft.runtimeLabel ?? 'nanobot').trim() || 'nanobot',
      })

      setHealth((prev) =>
        prev
          ? {
              ...prev,
              config: nextConfig,
            }
          : prev,
      )

      const nextEvents = await sdk.nanobot.listEvents(80)
      setEvents(nextEvents)
      addToast('success', 'Nanobot runtime config saved')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to save nanobot config'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSavingConfig(false)
    }
  }

  async function handleToggleSkill(skillId: string, enabled: boolean) {
    setIsRunningAction(true)
    setError('')
    try {
      const nextSkills = enabled
        ? await sdk.nanobot.enableSkill(skillId)
        : await sdk.nanobot.disableSkill(skillId)

      setHealth((prev) =>
        prev
          ? {
              ...prev,
              activeSkills: nextSkills,
            }
          : prev,
      )

      const nextEvents = await sdk.nanobot.listEvents(80)
      setEvents(nextEvents)
      addToast('success', `Skill ${enabled ? 'enabled' : 'disabled'}: ${skillId}`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to update skill state'
      setError(message)
      addToast('error', message)
    } finally {
      setIsRunningAction(false)
    }
  }

  async function handleHeartbeat() {
    setIsRunningAction(true)
    setError('')
    try {
      await sdk.nanobot.heartbeat()
      const nextEvents = await sdk.nanobot.listEvents(80)
      setEvents(nextEvents)
      addToast('info', 'Heartbeat tick sent')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to send heartbeat'
      setError(message)
      addToast('error', message)
    } finally {
      setIsRunningAction(false)
    }
  }

  async function handleTriggerCron() {
    const jobName = cronJobName.trim()
    if (!jobName) {
      setError('Cron job name is required.')
      addToast('warning', 'Cron job name is required')
      return
    }

    setIsRunningAction(true)
    setError('')
    try {
      await sdk.nanobot.triggerCron({ jobName })
      const nextEvents = await sdk.nanobot.listEvents(80)
      setEvents(nextEvents)
      addToast('success', `Cron trigger accepted: ${jobName}`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to trigger cron'
      setError(message)
      addToast('error', message)
    } finally {
      setIsRunningAction(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Nanobot</h1>
          <p className="mt-1 text-sm text-slate-500">
            Runtime controls, skills, sessions, and event telemetry for the experimental nanobot loop.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Runtime</p>
            <Cpu size={15} className="text-slate-400" />
          </div>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {health?.config.runtimeLabel ?? 'nanobot'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {health?.config.enabled ? 'Enabled' : 'Disabled'} - {health?.config.shadowMode ? 'Shadow mode' : 'Live mode'}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Loop Budget</p>
            <Settings2 size={15} className="text-slate-400" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{health?.config.maxLoopSteps ?? 0}</p>
          <p className="mt-1 text-xs text-slate-500">Max loop steps per run</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active Skills</p>
            <GitBranch size={15} className="text-slate-400" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{enabledSkillCount}</p>
          <p className="mt-1 text-xs text-slate-500">
            of {health?.activeSkills.length ?? 0} registered skills
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Live Sessions</p>
            <Activity size={15} className="text-slate-400" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{health?.activeSessions.length ?? 0}</p>
          <p className="mt-1 text-xs text-slate-500">Conversations touched by nanobot loop</p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Personality State</h2>
          <p className="mt-1 text-sm text-slate-500">Dynamic profile used for tone, speed, and decisiveness.</p>

          <div className="mt-3 space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Style</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{health?.personality.style ?? 'pragmatic-operator'}</p>
              <p className="mt-1 text-xs text-slate-500">Mood: {health?.personality.mood ?? 'focused'}</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Energy</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-cyan-500"
                  style={{ width: `${Math.round((health?.personality.energy ?? 0) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">{Math.round((health?.personality.energy ?? 0) * 100)}%</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Decisiveness</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.round((health?.personality.decisiveness ?? 0) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">{Math.round((health?.personality.decisiveness ?? 0) * 100)}%</p>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Alive Signals</h2>
          <p className="mt-1 text-sm text-slate-500">Current goal, thought mode, confidence, and queue.</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Thought Mode</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{health?.alive.thoughtMode ?? 'reflect'}</p>
              <p className="mt-1 text-xs text-slate-500">Confidence {(Math.round((health?.alive.confidence ?? 0) * 1000) / 10).toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Waiting Reason</p>
              <p className="mt-1 text-sm text-slate-700">{health?.alive.waitingReason ?? 'none'}</p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Goal</p>
            <p className="mt-1 text-sm text-slate-700">{health?.alive.activeGoal ?? 'No active goal'}</p>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Intention Queue</p>
            <ul className="mt-2 space-y-1">
              {(health?.alive.intentionQueue ?? []).map((intent, idx) => (
                <li key={`${intent}-${idx}`} className="text-xs text-slate-700">{idx + 1}. {intent}</li>
              ))}
              {(health?.alive.intentionQueue ?? []).length === 0 && (
                <li className="text-xs text-slate-500">No queued intentions.</li>
              )}
            </ul>
          </div>

          {health?.alive.lastRoleDecision && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role Decision</p>
              <p className="mt-1 text-xs text-slate-700">Planner: {health.alive.lastRoleDecision.plannerGoal}</p>
              <p className="mt-1 text-xs text-slate-700">Executor: {health.alive.lastRoleDecision.executorIntent}</p>
              <p className="mt-1 text-xs text-slate-700">
                Critic: {health.alive.lastRoleDecision.criticConcerns.length > 0
                  ? health.alive.lastRoleDecision.criticConcerns.join(' | ')
                  : 'No major concerns'}
              </p>
            </div>
          )}
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Runtime Config</h2>
          <p className="mt-1 text-sm text-slate-500">
            Apply live overrides without restarting the API process.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!configDraft.enabled}
                onChange={(e) => setConfigDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-200"
              />
              Enable nanobot runtime
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!configDraft.shadowMode}
                onChange={(e) => setConfigDraft((prev) => ({ ...prev, shadowMode: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-200"
              />
              Shadow mode
            </label>

            <label className="text-sm text-slate-600">
              <span className="mb-1 block text-xs font-medium text-slate-500">Runtime label</span>
              <input
                value={configDraft.runtimeLabel ?? ''}
                onChange={(e) => setConfigDraft((prev) => ({ ...prev, runtimeLabel: e.target.value }))}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
              />
            </label>

            <label className="text-sm text-slate-600">
              <span className="mb-1 block text-xs font-medium text-slate-500">Max loop steps</span>
              <input
                type="number"
                min={1}
                max={64}
                value={configDraft.maxLoopSteps ?? 8}
                onChange={(e) =>
                  setConfigDraft((prev) => ({
                    ...prev,
                    maxLoopSteps: Math.max(1, Number(e.target.value || 1)),
                  }))}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => void handleSaveConfig()}
            disabled={isSavingConfig}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-rose-500 px-4 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-50"
          >
            <Settings2 size={14} />
            {isSavingConfig ? 'Saving...' : 'Save Config'}
          </button>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Quick Actions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Trigger heartbeat and cron events for diagnostics.
          </p>

          <button
            type="button"
            onClick={() => void handleHeartbeat()}
            disabled={isRunningAction}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100 disabled:opacity-50"
          >
            <HeartPulse size={14} />
            Send Heartbeat Tick
          </button>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="block text-xs font-medium text-slate-500">Cron job name</label>
            <input
              value={cronJobName}
              onChange={(e) => setCronJobName(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
            />
            <button
              type="button"
              onClick={() => void handleTriggerCron()}
              disabled={isRunningAction}
              className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
            >
              <Rocket size={14} />
              Trigger Cron
            </button>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">CLI Hints</p>
            <ul className="mt-2 space-y-1">
              {(health?.cliHints ?? []).map((hint) => (
                <li key={hint} className="font-mono text-xs text-slate-700">
                  {hint}
                </li>
              ))}
            </ul>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Skill Registry</h2>
          <p className="mt-1 text-sm text-slate-500">Enable/disable skills and auto-learn new ones from chat commands.</p>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chat skill command</p>
            <p className="mt-1 font-mono text-[11px] text-slate-700">
              /skill Title | Description | Prompt guidance | tools=notes,web_search
            </p>
            <p className="mt-1 font-mono text-[11px] text-slate-700">
              /skill {`{"title":"Name","description":"What it does","tools":["notes"]}`}
            </p>
          </div>

          <div className="mt-3 space-y-2">
            {(health?.activeSkills ?? []).map((skill) => (
              <div key={skill.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{skill.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{skill.description}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-400">
                      {skill.id} - tools: {skill.tools.join(', ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isRunningAction}
                    onClick={() => void handleToggleSkill(skill.id, !skill.enabled)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      skill.enabled
                        ? 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    } disabled:opacity-50`}
                  >
                    {skill.enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            ))}
            {health && health.activeSkills.length === 0 && (
              <p className="text-sm text-slate-500">No skills available.</p>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Runtime Channels</h2>
          <p className="mt-1 text-sm text-slate-500">Current and planned message channels.</p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(health?.channels ?? []).map((channel) => (
              <div key={channel.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">{channel.label}</p>
                <p className="mt-1 text-xs text-slate-500">{channel.id}</p>
                <span
                  className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    channel.status === 'enabled'
                      ? 'bg-emerald-100 text-emerald-700'
                      : channel.status === 'planned'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {channel.status}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Session Monitor</h2>
          <p className="mt-1 text-sm text-slate-500">Conversation sessions currently tracked by nanobot.</p>

          <div className="mt-3 space-y-2">
            {(health?.activeSessions ?? []).length === 0 && (
              <p className="text-sm text-slate-500">No nanobot sessions recorded yet.</p>
            )}
            {(health?.activeSessions ?? []).map((session) => (
              <div key={session.conversationId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-mono text-xs text-slate-700">{session.conversationId}</p>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {session.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">Runs: {session.runCount}</p>
                <p className="mt-1 text-xs text-slate-500">Updated {timeAgo(session.updatedAt)}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Event Feed</h2>
              <p className="mt-1 text-sm text-slate-500">Recent runtime events from the nanobot bus.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
              last {events.length}
            </div>
          </div>

          <div className="mt-3 max-h-[460px] space-y-2 overflow-y-auto pr-1">
            {events.length === 0 && (
              <p className="text-sm text-slate-500">No events yet.</p>
            )}
            {events.map((event, index) => (
              <div key={`${event.createdAt}-${event.name}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${eventBadgeColor(event.name)}`}>
                    {event.name}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                    <Clock3 size={12} />
                    {timeAgo(event.createdAt)}
                  </span>
                </div>
                <pre className="mt-2 overflow-x-auto rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-600">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </div>
            ))}
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


