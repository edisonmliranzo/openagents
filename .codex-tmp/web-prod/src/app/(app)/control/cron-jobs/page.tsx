'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import type {
  CronDeliveryMode,
  CronJob,
  CronPayloadKind,
  CronRun,
  CronScheduleKind,
  CronSessionTarget,
  CreateCronJobInput,
} from '@openagents/shared'
import { useUIStore } from '@/stores/ui'

interface CronJobWithRun extends CronJob {
  runs?: CronRun[]
}

interface CronFormState {
  name: string
  description: string
  scheduleKind: CronScheduleKind
  scheduleValue: string
  sessionTarget: CronSessionTarget
  payloadKind: CronPayloadKind
  payloadText: string
  deliveryMode: CronDeliveryMode
  deliveryTarget: string
  enabled: boolean
}

const INITIAL_FORM: CronFormState = {
  name: '',
  description: '',
  scheduleKind: 'every',
  scheduleValue: '30 minutes',
  sessionTarget: 'main',
  payloadKind: 'systemEvent',
  payloadText: 'Heartbeat check',
  deliveryMode: 'none',
  deliveryTarget: '',
  enabled: true,
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

function buildCreateInput(form: CronFormState): CreateCronJobInput {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    enabled: form.enabled,
    scheduleKind: form.scheduleKind,
    scheduleValue: form.scheduleValue.trim(),
    sessionTarget: form.sessionTarget,
    payloadKind: form.payloadKind,
    payloadText: form.payloadText.trim(),
    deliveryMode: form.deliveryMode,
    deliveryTarget: form.deliveryTarget.trim() || null,
  }
}

export default function CronJobsPage() {
  const [jobs, setJobs] = useState<CronJobWithRun[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [runs, setRuns] = useState<CronRun[]>([])
  const [form, setForm] = useState<CronFormState>(INITIAL_FORM)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const addToast = useUIStore((s) => s.addToast)

  const loadJobs = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const list = await sdk.cron.listJobs()
      setJobs(list)
      if (!selectedJobId && list[0]?.id) {
        setSelectedJobId(list[0].id)
      }
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load cron jobs'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [selectedJobId, addToast])

  const loadRuns = useCallback(async (jobId: string) => {
    try {
      const nextRuns = await sdk.cron.listRuns(jobId, 30)
      setRuns(nextRuns)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load run history'
      setError(message)
      addToast('error', message)
    }
  }, [addToast])

  useEffect(() => {
    void loadJobs()
  }, [loadJobs])

  useEffect(() => {
    if (!selectedJobId) {
      setRuns([])
      return
    }
    void loadRuns(selectedJobId)
  }, [selectedJobId, loadRuns])

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  )

  async function handleCreateJob() {
    const input = buildCreateInput(form)
    if (!input.name || !input.scheduleValue || !input.payloadText) {
      setError('Name, schedule value, and payload text are required.')
      addToast('warning', 'Name, schedule, and payload are required')
      return
    }

    setIsSaving(true)
    setError('')
    try {
      const created = await sdk.cron.createJob(input)
      setForm(INITIAL_FORM)
      await loadJobs()
      setSelectedJobId(created.id)
      addToast('success', 'Cron job created')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to create cron job'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleJob(job: CronJobWithRun) {
    setIsSaving(true)
    setError('')
    try {
      await sdk.cron.patchJob(job.id, { enabled: !job.enabled })
      await loadJobs()
      addToast('info', job.enabled ? 'Cron job disabled' : 'Cron job enabled')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to update cron job'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRunNow(job: CronJobWithRun) {
    setIsSaving(true)
    setError('')
    try {
      await sdk.cron.runJob(job.id)
      await loadJobs()
      await loadRuns(job.id)
      addToast('success', 'Cron job run queued')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to run job'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteJob(job: CronJobWithRun) {
    const confirmed = window.confirm(`Delete cron job "${job.name}"?`)
    if (!confirmed) return

    setIsSaving(true)
    setError('')
    try {
      await sdk.cron.deleteJob(job.id)
      const wasSelected = selectedJobId === job.id
      await loadJobs()
      if (wasSelected) {
        setSelectedJobId(null)
        setRuns([])
      }
      addToast('success', 'Cron job deleted')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to delete job'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Cron Jobs</h1>
          <p className="mt-1 text-sm text-slate-500">Create and run scheduled jobs from the gateway dashboard.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadJobs()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">New Job</h2>
          <p className="mt-1 text-sm text-slate-500">Define schedule, payload, and delivery behavior.</p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-600">
              <span className="mb-1 block text-xs font-medium text-slate-500">Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
              />
            </label>

            <label className="text-sm text-slate-600">
              <span className="mb-1 block text-xs font-medium text-slate-500">Schedule</span>
              <input
                value={form.scheduleValue}
                onChange={(e) => setForm((prev) => ({ ...prev, scheduleValue: e.target.value }))}
                placeholder="30 minutes or 0 4 * * *"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
              />
            </label>

            <label className="text-sm text-slate-600">
              <span className="mb-1 block text-xs font-medium text-slate-500">Schedule Type</span>
              <select
                value={form.scheduleKind}
                onChange={(e) => setForm((prev) => ({ ...prev, scheduleKind: e.target.value as CronScheduleKind }))}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
              >
                <option value="every">Every</option>
                <option value="at">At</option>
                <option value="cron">Cron</option>
              </select>
            </label>

            <label className="text-sm text-slate-600">
              <span className="mb-1 block text-xs font-medium text-slate-500">Session Target</span>
              <select
                value={form.sessionTarget}
                onChange={(e) => setForm((prev) => ({ ...prev, sessionTarget: e.target.value as CronSessionTarget }))}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
              >
                <option value="main">Main</option>
                <option value="isolated">Isolated</option>
              </select>
            </label>

            <label className="text-sm text-slate-600">
              <span className="mb-1 block text-xs font-medium text-slate-500">Payload Type</span>
              <select
                value={form.payloadKind}
                onChange={(e) => setForm((prev) => ({ ...prev, payloadKind: e.target.value as CronPayloadKind }))}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
              >
                <option value="systemEvent">System Event</option>
                <option value="agentTurn">Agent Turn</option>
              </select>
            </label>

            <label className="text-sm text-slate-600">
              <span className="mb-1 block text-xs font-medium text-slate-500">Delivery</span>
              <select
                value={form.deliveryMode}
                onChange={(e) => setForm((prev) => ({ ...prev, deliveryMode: e.target.value as CronDeliveryMode }))}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
              >
                <option value="none">None</option>
                <option value="announce">Announce</option>
                <option value="webhook">Webhook</option>
              </select>
            </label>
          </div>

          <label className="mt-3 block text-sm text-slate-600">
            <span className="mb-1 block text-xs font-medium text-slate-500">Description</span>
            <input
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
            />
          </label>

          <label className="mt-3 block text-sm text-slate-600">
            <span className="mb-1 block text-xs font-medium text-slate-500">Payload Text</span>
            <textarea
              value={form.payloadText}
              onChange={(e) => setForm((prev) => ({ ...prev, payloadText: e.target.value }))}
              rows={4}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
            />
          </label>

          {form.deliveryMode !== 'none' && (
            <label className="mt-3 block text-sm text-slate-600">
              <span className="mb-1 block text-xs font-medium text-slate-500">Delivery Target</span>
              <input
                value={form.deliveryTarget}
                onChange={(e) => setForm((prev) => ({ ...prev, deliveryTarget: e.target.value }))}
                placeholder={form.deliveryMode === 'webhook' ? 'https://example.com/hook' : '+1555... or chat id'}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
              />
            </label>
          )}

          <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-200"
            />
            Enabled on create
          </label>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => void handleCreateJob()}
              disabled={isSaving}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Add Job'}
            </button>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Run History</h2>
          <p className="mt-1 text-sm text-slate-500">
            {selectedJob ? `Latest runs for "${selectedJob.name}"` : 'Select a job to inspect run history.'}
          </p>
          <div className="mt-4 space-y-2">
            {selectedJob && runs.length === 0 && <p className="text-sm text-slate-500">No runs yet.</p>}
            {!selectedJob && <p className="text-sm text-slate-500">No job selected.</p>}
            {runs.map((run) => (
              <div key={run.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">{run.status}</p>
                  <p className="text-xs text-slate-400">{timeAgo(run.createdAt)}</p>
                </div>
                {run.summary && <p className="mt-1 text-xs text-slate-500">{run.summary}</p>}
                {run.error && <p className="mt-1 text-xs text-red-600">{run.error}</p>}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Jobs</h2>
        <p className="mt-1 text-sm text-slate-500">Gateway-stored scheduled jobs.</p>

        <div className="mt-4 space-y-2">
          {jobs.length === 0 && <p className="text-sm text-slate-500">{isLoading ? 'Loading jobs...' : 'No jobs yet.'}</p>}

          {jobs.map((job) => {
            const active = selectedJobId === job.id
            const latestRun = job.runs?.[0]
            return (
              <div
                key={job.id}
                className={`rounded-lg border p-3 transition ${
                  active ? 'border-red-200 bg-red-50/60' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedJobId(job.id)}
                    className="text-left"
                  >
                    <p className="text-sm font-semibold text-slate-800">{job.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {job.scheduleKind}:{' '}
                      <span className="font-mono text-slate-600">{job.scheduleValue}</span> / {job.sessionTarget}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {job.payloadKind}: {job.payloadText}
                    </p>
                    {latestRun && (
                      <p className="mt-1 text-[11px] text-slate-400">Last run {timeAgo(latestRun.createdAt)}</p>
                    )}
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        job.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {job.enabled ? 'enabled' : 'disabled'}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleToggleJob(job)}
                      disabled={isSaving}
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {job.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRunNow(job)}
                      disabled={isSaving}
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Run now
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteJob(job)}
                      disabled={isSaving}
                      className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
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
