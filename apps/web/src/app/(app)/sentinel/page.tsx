'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Loader2,
  Plus,
  Power,
  Radar,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from 'lucide-react'
import type { SentinelIncident, SentinelWatcher } from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

const SIGNAL_TYPES: Array<{
  value: SentinelWatcher['signalType']
  label: string
}> = [
  { value: 'git_diff', label: 'git_diff (Working Tree / Uncommitted Diff)' },
  { value: 'file_change', label: 'file_change (Filesystem Watcher)' },
  { value: 'port_health', label: 'port_health (Local Port / Daemon Probe)' },
  { value: 'log_error', label: 'log_error (Runtime Error Log Spike)' },
  { value: 'api_latency', label: 'api_latency (Endpoint SLA Latency)' },
  { value: 'webhook_event', label: 'webhook_event (Inbound Webhook Signal)' },
]

export default function AmbientSentinelPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [watchers, setWatchers] = useState<SentinelWatcher[]>([])
  const [incidents, setIncidents] = useState<SentinelIncident[]>([])
  const [loading, setLoading] = useState(false)
  const [pulsingId, setPulsingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // New watcher form state
  const [name, setName] = useState('Prisma Schema Drift Reflex')
  const [signalType, setSignalType] = useState<SentinelWatcher['signalType']>('git_diff')
  const [target, setTarget] = useState('apps/api/prisma/schema.prisma')
  const [condition, setCondition] = useState('Uncommitted model field modifications detected')
  const [reflexAction, setReflexAction] = useState(
    'Generate migration diff summary and verify backwards-compatible nullable columns',
  )

  const loadState = useCallback(async () => {
    setLoading(true)
    try {
      const state = await sdk.agenticSuite.getSentinelState()
      setWatchers(state.watchers)
      setIncidents(state.incidents)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load Ambient Sentinel state')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadState()
  }, [loadState])

  async function handlePulse(watcherId?: string) {
    setPulsingId(watcherId ?? 'ALL')
    try {
      const res = await sdk.agenticSuite.pulseSentinel(watcherId)
      await loadState()
      addToast(
        'success',
        `Probed ${res.checkedCount} watcher(s) — ${res.incidents.length} new reflex incident(s) synthesized`,
      )
    } catch (err: any) {
      addToast('error', err?.message ?? 'Sentinel environment pulse failed')
    } finally {
      setPulsingId(null)
    }
  }

  async function handleToggle(watcherId: string) {
    setTogglingId(watcherId)
    try {
      const updated = await sdk.agenticSuite.toggleSentinelWatcher(watcherId)
      setWatchers((prev) => prev.map((w) => (w.id === updated.id ? updated : w)))
      addToast('success', `Watcher "${updated.name}" ${updated.enabled ? 'enabled' : 'paused'}`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to toggle watcher')
    } finally {
      setTogglingId(null)
    }
  }

  async function handleCreateWatcher(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !target.trim()) {
      addToast('warning', 'Watcher name and target are required')
      return
    }
    setCreating(true)
    try {
      const created = await sdk.agenticSuite.createSentinelWatcher({
        name: name.trim(),
        signalType,
        target: target.trim(),
        condition: condition.trim(),
        reflexAction: reflexAction.trim(),
      })
      setWatchers((prev) => [created, ...prev])
      addToast('success', `Created sentinel watcher "${created.name}"`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to create watcher')
    } finally {
      setCreating(false)
    }
  }

  async function handleResolveIncident(incidentId: string) {
    setResolvingId(incidentId)
    try {
      const updated = await sdk.agenticSuite.resolveSentinelIncident(incidentId)
      setIncidents((prev) => prev.map((inc) => (inc.id === updated.id ? updated : inc)))
      addToast('success', 'Incident marked resolved and reflex patch applied')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to resolve incident')
    } finally {
      setResolvingId(null)
    }
  }

  const openIncidentsCount = incidents.filter((i) => i.status === 'open').length

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
            <Radar className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Ambient Sentinel (Autonomous Event-Driven Reflexes)
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Always-on daemon watchers that probe live git diffs, ports, logs, and latency to prepare autonomous diagnosis & patches before you ask
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-400">
            {openIncidentsCount} Open Incident{openIncidentsCount === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => void handlePulse(undefined)}
            disabled={pulsingId !== null}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {pulsingId === 'ALL' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Activity className="h-3.5 w-3.5" />
            )}
            Pulse Environment Now
          </button>
          <button
            type="button"
            onClick={() => void loadState()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left column: Active Watchers + Create Watcher Form */}
        <div className="space-y-6 lg:col-span-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <BellRing className="h-4 w-4 text-rose-400" />
              Active Environment Watchers ({watchers.length})
            </h2>

            <div className="space-y-3">
              {watchers.map((w) => (
                <div
                  key={w.id}
                  className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {w.name}
                        </span>
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {w.signalType}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-rose-400">
                        Target: {w.target}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handlePulse(w.id)}
                        disabled={pulsingId === w.id}
                        className="rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        {pulsingId === w.id ? 'Probing...' : 'Probe'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggle(w.id)}
                        disabled={togglingId === w.id}
                        className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold ${
                          w.enabled
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-slate-500/15 text-slate-400'
                        }`}
                      >
                        <Power className="h-3 w-3" />
                        {w.enabled ? 'Enabled' : 'Paused'}
                      </button>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    <strong className="text-slate-600 dark:text-slate-300">Condition:</strong>{' '}
                    {w.condition}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    <strong className="text-slate-600 dark:text-slate-300">Reflex:</strong>{' '}
                    {w.reflexAction}
                  </p>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Triggers: {w.triggerCount}</span>
                    {w.lastTriggeredAt && (
                      <span>Last: {new Date(w.lastTriggeredAt).toLocaleTimeString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Create Watcher Form */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Plus className="h-4 w-4 text-rose-400" />
              Register New Reflex Watcher
            </h2>

            <form onSubmit={handleCreateWatcher} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Watcher Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:text-slate-100"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Signal Type
                  </label>
                  <select
                    value={signalType}
                    onChange={(e) =>
                      setSignalType(e.target.value as SentinelWatcher['signalType'])
                    }
                    className="w-full rounded-lg border border-slate-300 bg-transparent px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:text-slate-100"
                  >
                    {SIGNAL_TYPES.map((st) => (
                      <option
                        key={st.value}
                        value={st.value}
                        className="bg-slate-900 text-slate-100"
                      >
                        {st.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Target Path / Port / Endpoint
                  </label>
                  <input
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Trigger Condition
                </label>
                <input
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Autonomous Reflex Action
                </label>
                <textarea
                  rows={2}
                  value={reflexAction}
                  onChange={(e) => setReflexAction(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:text-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Register Sentinel Watcher
              </button>
            </form>
          </section>
        </div>

        {/* Right column: Autonomous Incident & Prepared Patch Feed */}
        <div className="lg:col-span-7">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <ShieldAlert className="h-4 w-4 text-rose-400" />
                Autonomous Incident & Prepared Patch Feed ({incidents.length})
              </h2>
              <span className="text-xs text-slate-400">
                Live environment telemetry + pre-staged fixes
              </span>
            </div>

            <div className="space-y-4">
              {incidents.length === 0 && (
                <p className="py-12 text-center text-xs text-slate-400">
                  No sentinel incidents recorded yet. Click &quot;Pulse Environment Now&quot; to probe live signals.
                </p>
              )}

              {incidents.map((inc) => (
                <div
                  key={inc.id}
                  className={`rounded-xl border p-4 transition ${
                    inc.status === 'resolved'
                      ? 'border-slate-200 bg-slate-50/50 opacity-75 dark:border-slate-800 dark:bg-slate-950/30'
                      : inc.severity === 'critical'
                        ? 'border-rose-500/50 bg-rose-500/5'
                        : 'border-amber-500/40 bg-amber-500/5'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle
                        className={`h-4 w-4 ${
                          inc.severity === 'critical'
                            ? 'text-rose-500'
                            : inc.severity === 'warning'
                              ? 'text-amber-500'
                              : 'text-sky-400'
                        }`}
                      />
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {inc.watcherName}
                      </span>
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {inc.signalType}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          inc.severity === 'critical'
                            ? 'bg-rose-500/20 text-rose-400'
                            : inc.severity === 'warning'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-sky-500/20 text-sky-400'
                        }`}
                      >
                        {inc.severity}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">
                        {new Date(inc.createdAt).toLocaleTimeString()}
                      </span>
                      {inc.status === 'open' ? (
                        <button
                          type="button"
                          onClick={() => void handleResolveIncident(inc.id)}
                          disabled={resolvingId === inc.id}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {resolvingId === inc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          Apply & Resolve
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Resolved
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 text-xs">
                    <div className="rounded-lg border border-slate-200 bg-slate-950 p-2.5 font-mono text-[11px] text-amber-300 dark:border-slate-800">
                      Observed Signal: {inc.observedSignal}
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">
                      <strong className="text-slate-800 dark:text-slate-100">
                        Autonomous Diagnosis:
                      </strong>{' '}
                      {inc.diagnosis}
                    </p>
                    <div>
                      <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                        <Wrench className="h-3 w-3" />
                        Prepared Reflex Patch / Remediation
                      </div>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-emerald-300 dark:border-slate-800">
                        {inc.preparedPatch}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
