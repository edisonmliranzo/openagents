'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, Play, RefreshCw, RadioTower, Webhook } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { CreateWorkflowInput, WorkflowDefinition, WorkflowRun, WorkflowTrigger } from '@openagents/shared'

interface WatcherPreset {
  id: string
  title: string
  description: string
  draft: CreateWorkflowInput
  sampleInput: Record<string, unknown>
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2)
}

function parseJsonObject(raw: string, label: string) {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`)
  }
  return parsed as Record<string, unknown>
}

function formatDate(iso: string | null) {
  if (!iso) return 'n/a'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function triggerDetail(trigger: WorkflowTrigger) {
  if (trigger.kind === 'schedule') {
    return trigger.everyMinutes ? `Every ${trigger.everyMinutes} minutes` : 'Scheduled trigger'
  }
  if (trigger.kind === 'webhook') {
    return trigger.webhookSecret ? `Webhook secret ${maskSecret(trigger.webhookSecret)}` : 'Webhook trigger'
  }
  if (trigger.kind === 'inbox_event') {
    return trigger.eventName ?? 'Inbox event'
  }
  return 'Manual'
}

function maskSecret(secret: string) {
  if (secret.length <= 8) return secret
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`
}

function statusClass(enabled: boolean) {
  return enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
}

function triggerClass(kind: WorkflowTrigger['kind']) {
  if (kind === 'schedule') return 'bg-cyan-100 text-cyan-700'
  if (kind === 'webhook') return 'bg-violet-100 text-violet-700'
  if (kind === 'inbox_event') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-700'
}

function defaultSampleInput(trigger: WorkflowTrigger) {
  if (trigger.kind === 'schedule') {
    return {
      topic: 'overnight operations',
      window: 'last 60 minutes',
      destination: 'operator briefing',
    }
  }
  if (trigger.kind === 'webhook') {
    return {
      service: 'checkout-api',
      severity: 'high',
      summary: 'Timeout rate exceeded 5% for enterprise traffic.',
    }
  }
  return {
    channel: 'slack',
    sender: 'ops-lead',
    body: 'Customer reports webhook retries are stacking up in production.',
  }
}

const WATCHER_PRESETS: WatcherPreset[] = [
  {
    id: 'scheduled-briefing',
    title: 'Scheduled Briefing',
    description: 'Runs on a cadence and produces a compact operational update from shared workflow state.',
    draft: {
      name: 'Scheduled Briefing Watcher',
      description: 'Create a recurring operations briefing on a schedule.',
      enabled: true,
      trigger: { kind: 'schedule', everyMinutes: 60 },
      steps: [
        {
          id: 'seed-state',
          type: 'set_state',
          label: 'Seed briefing state',
          statePatch: {
            topic: '{{input.topic}}',
            window: '{{input.window}}',
            destination: '{{input.destination}}',
          },
        },
        {
          id: 'draft-briefing',
          type: 'agent_prompt',
          label: 'Draft briefing',
          prompt: [
            'You are a workflow watcher producing an operator briefing.',
            'Topic: {{state.topic}}',
            'Window: {{state.window}}',
            'Destination: {{state.destination}}',
            'Generate a concise briefing with actions and risk callouts.',
          ].join('\n\n'),
          outputKey: 'watcher.briefing',
        },
      ],
    },
    sampleInput: {
      topic: 'overnight operations',
      window: 'last 60 minutes',
      destination: 'operator briefing',
    },
  },
  {
    id: 'webhook-incident',
    title: 'Webhook Intake',
    description: 'Receives an incident payload from a webhook and drafts a triage recommendation.',
    draft: {
      name: 'Webhook Incident Watcher',
      description: 'Draft a first-pass response when an external system hits a webhook.',
      enabled: true,
      trigger: { kind: 'webhook', webhookSecret: 'watch-hook-template' },
      steps: [
        {
          id: 'capture-webhook',
          type: 'set_state',
          label: 'Capture webhook payload',
          statePatch: {
            service: '{{input.service}}',
            severity: '{{input.severity}}',
            summary: '{{input.summary}}',
          },
        },
        {
          id: 'triage-webhook',
          type: 'agent_prompt',
          label: 'Draft triage',
          prompt: [
            'You are handling an inbound webhook alert.',
            'Service: {{state.service}}',
            'Severity: {{state.severity}}',
            'Summary: {{state.summary}}',
            'Respond with a triage note, likely owner, and first mitigation step.',
          ].join('\n\n'),
          outputKey: 'watcher.triage',
        },
      ],
    },
    sampleInput: {
      service: 'checkout-api',
      severity: 'high',
      summary: 'Timeout rate exceeded 5% for enterprise traffic.',
    },
  },
  {
    id: 'inbox-triage',
    title: 'Inbox Triage',
    description: 'Listens for channel messages and turns them into a routed triage summary.',
    draft: {
      name: 'Inbox Triage Watcher',
      description: 'Classify inbound channel events and propose a next action.',
      enabled: true,
      trigger: { kind: 'inbox_event', eventName: 'channel.message.received' },
      steps: [
        {
          id: 'capture-message',
          type: 'set_state',
          label: 'Capture channel message',
          statePatch: {
            channel: '{{input.channel}}',
            sender: '{{input.sender}}',
            body: '{{input.body}}',
          },
        },
        {
          id: 'route-message',
          type: 'agent_prompt',
          label: 'Classify inbound message',
          prompt: [
            'You are a watcher that triages inbound channel messages.',
            'Channel: {{state.channel}}',
            'Sender: {{state.sender}}',
            'Body: {{state.body}}',
            'Return urgency, owner, and the next best operator action.',
          ].join('\n\n'),
          outputKey: 'watcher.route',
        },
      ],
    },
    sampleInput: {
      channel: 'slack',
      sender: 'ops-lead',
      body: 'Customer reports webhook retries are stacking up in production.',
    },
  },
]

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>
  )
}

export default function WatchersPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [watchers, setWatchers] = useState<WorkflowDefinition[]>([])
  const [selectedWatcherId, setSelectedWatcherId] = useState<string | null>(null)
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [runInputJson, setRunInputJson] = useState(safeJson(defaultSampleInput({ kind: 'schedule', everyMinutes: 60 })))
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isMutating, setIsMutating] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState('')

  const selectedWatcher = useMemo(
    () => watchers.find((watcher) => watcher.id === selectedWatcherId) ?? null,
    [selectedWatcherId, watchers],
  )

  const counts = useMemo(
    () => ({
      active: watchers.filter((watcher) => watcher.enabled).length,
      schedule: watchers.filter((watcher) => watcher.trigger.kind === 'schedule').length,
      webhook: watchers.filter((watcher) => watcher.trigger.kind === 'webhook').length,
      inbox: watchers.filter((watcher) => watcher.trigger.kind === 'inbox_event').length,
    }),
    [watchers],
  )

  const loadRuns = useCallback(async (workflowId: string) => {
    const nextRuns = await sdk.workflows.listRuns(workflowId, 20)
    setRuns(nextRuns)
  }, [])

  const loadWatchers = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const list = await sdk.workflows.list()
      const nextWatchers = list
        .filter((workflow) => workflow.trigger.kind !== 'manual')
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())

      setWatchers(nextWatchers)

      if (nextWatchers.length === 0) {
        setSelectedWatcherId(null)
        setRuns([])
        return
      }

      const nextSelectedId =
        selectedWatcherId && nextWatchers.some((watcher) => watcher.id === selectedWatcherId)
          ? selectedWatcherId
          : nextWatchers[0].id

      setSelectedWatcherId(nextSelectedId)
      const nextSelected = nextWatchers.find((watcher) => watcher.id === nextSelectedId) ?? nextWatchers[0]
      if (!selectedWatcherId || nextSelectedId !== selectedWatcherId) {
        setRunInputJson(safeJson(defaultSampleInput(nextSelected.trigger)))
      }
      await loadRuns(nextSelected.id)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load watcher workflows'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast, loadRuns, selectedWatcherId])

  useEffect(() => {
    void loadWatchers()
  }, [loadWatchers])

  async function handleSelectWatcher(watcher: WorkflowDefinition) {
    setSelectedWatcherId(watcher.id)
    setRunInputJson(safeJson(defaultSampleInput(watcher.trigger)))
    setError('')
    try {
      await loadRuns(watcher.id)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load watcher runs'
      setError(message)
      addToast('error', message)
    }
  }

  async function handleCreatePreset(preset: WatcherPreset) {
    setIsCreating(true)
    setError('')
    try {
      const draft = cloneJson(preset.draft)
      if (draft.trigger.kind === 'webhook') {
        draft.trigger.webhookSecret = `watch-${Date.now()}`
      }
      const created = await sdk.workflows.create(draft)
      setWatchers((current) => [created, ...current].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()))
      setSelectedWatcherId(created.id)
      setRunInputJson(safeJson(cloneJson(preset.sampleInput)))
      setRuns([])
      addToast('success', `Created ${created.name}`)
      await loadRuns(created.id)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to create watcher'
      setError(message)
      addToast('error', message)
    } finally {
      setIsCreating(false)
    }
  }

  async function handleToggleEnabled() {
    if (!selectedWatcher) return
    setIsMutating(true)
    setError('')
    try {
      const updated = await sdk.workflows.update(selectedWatcher.id, {
        enabled: !selectedWatcher.enabled,
      })
      setWatchers((current) =>
        current.map((watcher) => (watcher.id === updated.id ? updated : watcher)),
      )
      addToast('success', updated.enabled ? 'Watcher enabled' : 'Watcher paused')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to update watcher'
      setError(message)
      addToast('error', message)
    } finally {
      setIsMutating(false)
    }
  }

  async function handleTestRun() {
    if (!selectedWatcher) return
    setIsRunning(true)
    setError('')
    try {
      const input = parseJsonObject(runInputJson, 'Run input')
      const payload: {
        triggerKind: WorkflowTrigger['kind']
        input: Record<string, unknown>
        webhookSecret?: string
        sourceEvent?: string
      } = {
        triggerKind: selectedWatcher.trigger.kind,
        input,
      }

      if (selectedWatcher.trigger.kind === 'webhook') {
        const webhookSecret = selectedWatcher.trigger.webhookSecret?.trim()
        if (!webhookSecret) {
          throw new Error('Selected watcher has no webhook secret configured.')
        }
        payload.webhookSecret = webhookSecret
      }

      if (selectedWatcher.trigger.kind === 'schedule') {
        payload.sourceEvent = 'watcher.schedule.preview'
      }

      if (selectedWatcher.trigger.kind === 'inbox_event') {
        payload.sourceEvent = selectedWatcher.trigger.eventName ?? 'channel.message.received'
      }

      const run = await sdk.workflows.run(selectedWatcher.id, payload)
      setRuns((current) => [run, ...current].slice(0, 20))
      await loadWatchers()
      addToast('success', `Watcher run queued as ${run.status}`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to trigger watcher'
      setError(message)
      addToast('error', message)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1550px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Watcher Workflows</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Build visible schedule, webhook, and inbox-event automations without dropping into the raw workflow editor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/control/workflows"
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Full workflow builder
          </Link>
          <button
            type="button"
            onClick={() => void loadWatchers()}
            disabled={isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Active watchers" value={String(counts.active)} detail="Enabled automations currently live" />
        <SummaryCard label="Schedules" value={String(counts.schedule)} detail="Time-based background checks" />
        <SummaryCard label="Webhooks" value={String(counts.webhook)} detail="External event listeners with secrets" />
        <SummaryCard label="Inbox events" value={String(counts.inbox)} detail="Channel-native reactive automations" />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {WATCHER_PRESETS.map((preset) => (
          <article key={preset.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{preset.title}</h2>
                <p className="mt-1 text-sm text-slate-500">{preset.description}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleCreatePreset(preset)}
                disabled={isCreating}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Use template'}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${triggerClass(preset.draft.trigger.kind)}`}>
                {preset.draft.trigger.kind}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                {preset.draft.steps.length} steps
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Watchers</h2>
              <p className="mt-1 text-sm text-slate-500">
                Trigger-driven workflows already configured in the control plane.
              </p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {watchers.length} workflows
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {watchers.length === 0 && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No watcher workflows yet. Start from one of the templates above.
              </p>
            )}

            {watchers.map((watcher) => (
              <button
                key={watcher.id}
                type="button"
                onClick={() => void handleSelectWatcher(watcher)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  watcher.id === selectedWatcherId
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{watcher.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{watcher.description ?? 'No description provided.'}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(watcher.enabled)}`}>
                    {watcher.enabled ? 'enabled' : 'paused'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${triggerClass(watcher.trigger.kind)}`}>
                    {watcher.trigger.kind}
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {triggerDetail(watcher.trigger)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {selectedWatcher?.name ?? 'Watcher details'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedWatcher?.description ?? 'Select a watcher to inspect its trigger and run a test event.'}
              </p>
            </div>
            {selectedWatcher && (
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${triggerClass(selectedWatcher.trigger.kind)}`}>
                  {selectedWatcher.trigger.kind}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(selectedWatcher.enabled)}`}>
                  {selectedWatcher.enabled ? 'enabled' : 'paused'}
                </span>
              </div>
            )}
          </div>

          {!selectedWatcher && (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              Select or create a watcher to inspect it here.
            </div>
          )}

          {selectedWatcher && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Trigger</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{selectedWatcher.trigger.kind}</p>
                  <p className="mt-1 text-xs text-slate-500">{triggerDetail(selectedWatcher.trigger)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last run</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{formatDate(selectedWatcher.lastRunAt)}</p>
                  <p className="mt-1 text-xs text-slate-500">Version {selectedWatcher.version}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next run</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{formatDate(selectedWatcher.nextRunAt)}</p>
                  <p className="mt-1 text-xs text-slate-500">{selectedWatcher.steps.length} workflow steps</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleToggleEnabled()}
                  disabled={isMutating}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {selectedWatcher.enabled ? 'Pause watcher' : 'Enable watcher'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleTestRun()}
                  disabled={isRunning}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
                >
                  <Play size={14} />
                  {isRunning ? 'Triggering...' : 'Run test event'}
                </button>
                <Link
                  href="/control/workflows"
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Edit in builder
                </Link>
              </div>

              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2">
                    {selectedWatcher.trigger.kind === 'schedule' ? (
                      <RadioTower size={16} className="text-cyan-600" />
                    ) : selectedWatcher.trigger.kind === 'webhook' ? (
                      <Webhook size={16} className="text-violet-600" />
                    ) : (
                      <Bell size={16} className="text-amber-600" />
                    )}
                    <p className="text-sm font-semibold text-slate-900">Trigger details</p>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <p>
                      <span className="font-semibold">Kind:</span> {selectedWatcher.trigger.kind}
                    </p>
                    {selectedWatcher.trigger.everyMinutes && (
                      <p>
                        <span className="font-semibold">Every:</span> {selectedWatcher.trigger.everyMinutes} minutes
                      </p>
                    )}
                    {selectedWatcher.trigger.eventName && (
                      <p>
                        <span className="font-semibold">Event:</span> {selectedWatcher.trigger.eventName}
                      </p>
                    )}
                    {selectedWatcher.trigger.webhookSecret && (
                      <p>
                        <span className="font-semibold">Secret:</span> {maskSecret(selectedWatcher.trigger.webhookSecret)}
                      </p>
                    )}
                    <p>
                      <span className="font-semibold">Updated:</span> {formatDate(selectedWatcher.updatedAt)}
                    </p>
                  </div>

                  <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Step outline</p>
                    <div className="mt-2 space-y-2">
                      {selectedWatcher.steps.map((step) => (
                        <div key={step.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-xs font-semibold text-slate-800">{step.label}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{step.type}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Test payload</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Send a representative event into the watcher without opening the raw JSON builder.
                  </p>
                  <textarea
                    value={runInputJson}
                    onChange={(event) => setRunInputJson(event.target.value)}
                    rows={16}
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Recent watcher runs</h2>
            <p className="mt-1 text-sm text-slate-500">
              Latest executions for the selected watcher.
            </p>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {runs.length} runs
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {runs.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No runs yet for this watcher.
            </p>
          )}

          {runs.map((run) => (
            <article key={run.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-sm font-semibold text-slate-900">{run.id}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    run.status === 'done'
                      ? 'bg-emerald-100 text-emerald-700'
                      : run.status === 'error'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {run.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                trigger {run.triggerKind} • started {formatDate(run.startedAt)} • finished {formatDate(run.finishedAt)}
              </p>
              {run.error && (
                <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {run.error}
                </p>
              )}
              {run.state && (
                <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-600">
                  {safeJson(run.state)}
                </pre>
              )}
            </article>
          ))}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
