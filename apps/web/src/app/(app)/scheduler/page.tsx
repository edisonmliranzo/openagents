'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Loader2, Pause, Play, Plus, RefreshCw, Trash2, Zap } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { ScheduledTask } from '@openagents/sdk'

const PRESETS = [
  { label: 'Every 15 min', schedule: '*/15 * * * *' },
  { label: 'Hourly', schedule: '0 * * * *' },
  { label: 'Daily 9am', schedule: '0 9 * * *' },
  { label: 'Weekdays 8am', schedule: '0 8 * * 1-5' },
  { label: 'Mondays 9am', schedule: '0 9 * * 1' },
  { label: 'Monthly 1st', schedule: '0 9 1 * *' },
  { label: 'Every 30m', schedule: '30m' },
]

const DELIVERY_MODES = [
  { value: 'none', label: 'Do not deliver' },
  { value: 'announce', label: 'Announce in-app' },
  { value: 'webhook', label: 'POST to webhook' },
] as const

export default function SchedulerPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    schedule: '0 9 * * *',
    message: '',
    deliveryMode: 'none' as (typeof DELIVERY_MODES)[number]['value'],
    deliveryTarget: '',
    sessionTarget: 'main' as 'main' | 'isolated',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTasks(await sdk.scheduler.list())
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to load scheduled tasks')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { void load() }, [load])

  async function create() {
    if (!form.name.trim() || !form.schedule.trim() || !form.message.trim()) return
    setSaving(true)
    try {
      await sdk.scheduler.create({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        schedule: form.schedule.trim(),
        message: form.message.trim(),
        sessionTarget: form.sessionTarget,
        deliveryMode: form.deliveryMode,
        deliveryTarget: form.deliveryMode === 'webhook' ? form.deliveryTarget.trim() : undefined,
      })
      addToast('success', 'Scheduled task created')
      setForm((f) => ({ ...f, name: '', description: '', message: '', deliveryTarget: '' }))
      void load()
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  async function toggle(task: ScheduledTask) {
    try {
      if (task.enabled) await sdk.scheduler.disable(task.id)
      else await sdk.scheduler.enable(task.id)
      void load()
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Update failed')
    }
  }

  async function runNow(task: ScheduledTask) {
    try {
      await sdk.scheduler.runNow(task.id)
      addToast('success', `Queued "${task.name}"`)
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Run failed')
    }
  }

  async function remove(task: ScheduledTask) {
    if (!confirm(`Delete "${task.name}"?`)) return
    try {
      await sdk.scheduler.delete(task.id)
      void load()
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Delete failed')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-7 w-7 text-indigo-400" />
          <div>
            <h1 className="text-2xl font-semibold">Scheduler</h1>
            <p className="text-sm text-muted-foreground">
              Run an agent instruction on a cron or interval schedule and deliver the result.
            </p>
          </div>
        </div>
        <button onClick={load} className="rounded-lg border border-white/10 p-2 hover:bg-white/5" title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      <section className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name"
            className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm"
          />
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description (optional)"
            className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.schedule}
                onClick={() => setForm({ ...form, schedule: p.schedule })}
                className={`rounded-full border px-3 py-1 text-xs ${
                  form.schedule === p.schedule
                    ? 'border-indigo-400 bg-indigo-500/20'
                    : 'border-white/10 hover:bg-white/5'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            value={form.schedule}
            onChange={(e) => setForm({ ...form, schedule: e.target.value })}
            placeholder="Cron expression (min hour dom mon dow) or an interval like 30m / 2h / 1d"
            className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Cron expressions run in UTC.
          </p>
        </div>

        <textarea
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="What should the agent do on every run? e.g. Summarise overnight mentions of my product and email the digest."
          rows={3}
          className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 text-sm"
        />

        <div className="grid gap-3 md:grid-cols-3">
          <select
            value={form.deliveryMode}
            onChange={(e) => setForm({ ...form, deliveryMode: e.target.value as typeof form.deliveryMode })}
            className="rounded border border-white/10 bg-black/20 px-2 py-2 text-sm"
          >
            {DELIVERY_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </select>

          {form.deliveryMode === 'webhook' ? (
            <input
              value={form.deliveryTarget}
              onChange={(e) => setForm({ ...form, deliveryTarget: e.target.value })}
              placeholder="https://example.com/hook"
              className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm"
            />
          ) : (
            <select
              value={form.sessionTarget}
              onChange={(e) => setForm({ ...form, sessionTarget: e.target.value as 'main' | 'isolated' })}
              className="rounded border border-white/10 bg-black/20 px-2 py-2 text-sm"
            >
              <option value="main">Use my main chat</option>
              <option value="isolated">Use a dedicated thread</option>
            </select>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={create}
            disabled={saving || !form.name.trim() || !form.message.trim()}
            className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Schedule
          </button>
        </div>
      </section>

      <section className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && tasks.length === 0 && <p className="text-sm text-muted-foreground">No scheduled tasks yet.</p>}
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.name}</span>
                <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">{t.scheduleLabel ?? t.scheduleValue}</code>
                <span className={`rounded-full px-2 py-0.5 text-xs ${t.enabled ? 'bg-emerald-500/15 text-ememerald-300' : 'bg-slate-500/15 text-slate-300'}`}>
                  {t.enabled ? 'enabled' : 'paused'}
                </span>
              </div>
              {t.description && <p className="mt-1 truncate text-sm text-muted-foreground">{t.description}</p>}
              <p className="mt-1 truncate text-xs text-muted-foreground">{t.payloadText}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.deliveryMode !== 'none' ? `deliver: ${t.deliveryMode} · ` : ''}
                {t.nextRunAt ? `next ${new Date(t.nextRunAt).toLocaleString()}` : 'no further runs'}
                {t.lastRunAt && ` · last ${new Date(t.lastRunAt).toLocaleString()} (${t.lastRunStatus ?? '—'})`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => runNow(t)} className="rounded-lg border border-white/10 p-2 hover:bg-white/5" title="Run now">
                <Zap className="h-4 w-4" />
              </button>
              <button onClick={() => toggle(t)} className="rounded-lg border border-white/10 p-2 hover:bg-white/5" title={t.enabled ? 'Pause' : 'Enable'}>
                {t.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button onClick={() => remove(t)} className="rounded-lg border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10" title="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
