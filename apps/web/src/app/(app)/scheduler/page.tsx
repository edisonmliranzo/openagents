'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Loader2, Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { sdk, useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

// Mirrors packages/sdk/src/api/scheduler.ts
interface ScheduledTask {
  id: string
  name: string
  description: string
  schedule: string
  nextRunAt: string
  lastRunAt?: string
  lastRunStatus?: 'success' | 'failed'
  action: { type: 'send_message' | 'run_tool' | 'run_workflow'; message?: string; toolName?: string; workflowId?: string; conversationId?: string }
  enabled: boolean
  runCount: number
  maxRuns?: number
}

const api = {
  list: () => sdk.client.get<ScheduledTask[]>('/api/v1/scheduler/tasks'),
  create: (input: Record<string, unknown>) => sdk.client.post<ScheduledTask>('/api/v1/scheduler/tasks', input),
  enable: (id: string) => sdk.client.post<ScheduledTask>(`/api/v1/scheduler/tasks/${id}/enable`),
  disable: (id: string) => sdk.client.post<ScheduledTask>(`/api/v1/scheduler/tasks/${id}/disable`),
  remove: (id: string) => sdk.client.delete<boolean>(`/api/v1/scheduler/tasks/${id}`),
}

const PRESETS = [
  { label: 'Every 15 min', cron: '*/15 * * * *' },
  { label: 'Hourly', cron: '0 * * * *' },
  { label: 'Daily 9am', cron: '0 9 * * *' },
  { label: 'Weekdays 8am', cron: '0 8 * * 1-5' },
  { label: 'Mondays 9am', cron: '0 9 * * 1' },
  { label: 'Monthly 1st', cron: '0 9 1 * *' },
  { label: 'Once', cron: 'once' },
]

type ActionType = ScheduledTask['action']['type']

export default function SchedulerPage() {
  const addToast = useUIStore((s) => s.addToast)
  const userId = useAuthStore((s) => s.user?.id)
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', schedule: '0 9 * * *', type: 'send_message' as ActionType, payload: '', maxRuns: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try { setTasks(await api.list()) } catch { addToast('error', 'Failed to load scheduled tasks') } finally { setLoading(false) }
  }, [addToast])

  useEffect(() => { void load() }, [load])

  async function create() {
    if (!form.name.trim() || !form.schedule.trim() || !userId) return
    setSaving(true)
    const action: ScheduledTask['action'] = { type: form.type }
    if (form.type === 'send_message') action.message = form.payload
    if (form.type === 'run_tool') action.toolName = form.payload
    if (form.type === 'run_workflow') action.workflowId = form.payload
    try {
      await api.create({
        userId,
        name: form.name.trim(),
        description: form.description.trim(),
        schedule: form.schedule.trim(),
        action,
        ...(form.maxRuns ? { maxRuns: Number(form.maxRuns) } : {}),
      })
      addToast('success', 'Scheduled task created')
      setForm((f) => ({ ...f, name: '', description: '', payload: '', maxRuns: '' }))
      void load()
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  async function toggle(task: ScheduledTask) {
    try {
      await (task.enabled ? api.disable(task.id) : api.enable(task.id))
      void load()
    } catch { addToast('error', 'Update failed') }
  }

  async function remove(task: ScheduledTask) {
    if (!confirm(`Delete "${task.name}"?`)) return
    try { await api.remove(task.id); void load() } catch { addToast('error', 'Delete failed') }
  }

  const payloadLabel = form.type === 'send_message' ? 'Message' : form.type === 'run_tool' ? 'Tool name' : 'Workflow ID'

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-7 w-7 text-indigo-400" />
          <div>
            <h1 className="text-2xl font-semibold">Scheduler</h1>
            <p className="text-sm text-muted-foreground">Run OpenAgents messages, tools and workflows on a schedule.</p>
          </div>
        </div>
        <button onClick={load} className="rounded-lg border border-white/10 p-2 hover:bg-white/5" title="Refresh"><RefreshCw className="h-4 w-4" /></button>
      </header>

      <section className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm" />
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm" />
        </div>
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.cron} onClick={() => setForm({ ...form, schedule: p.cron })} className={`rounded-full border px-3 py-1 text-xs ${form.schedule === p.cron ? 'border-indigo-400 bg-indigo-500/20' : 'border-white/10 hover:bg-white/5'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <input value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="Cron expression (min hour dom mon dow) or 'once'" className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm" />
        </div>
        <div className="grid gap-3 md:grid-cols-[180px_1fr_120px]">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ActionType })} className="rounded border border-white/10 bg-black/20 px-2 py-2 text-sm">
            <option value="send_message">Send message</option>
            <option value="run_tool">Run tool</option>
            <option value="run_workflow">Run workflow</option>
          </select>
          <input value={form.payload} onChange={(e) => setForm({ ...form, payload: e.target.value })} placeholder={payloadLabel} className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm" />
          <input value={form.maxRuns} onChange={(e) => setForm({ ...form, maxRuns: e.target.value.replace(/\D/g, '') })} placeholder="Max runs" className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end">
          <button onClick={create} disabled={saving || !form.name.trim() || !userId} className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50">
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
                <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">{t.schedule}</code>
                <span className={`rounded-full px-2 py-0.5 text-xs ${t.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-300'}`}>{t.enabled ? 'enabled' : 'paused'}</span>
              </div>
              {t.description && <p className="mt-1 truncate text-sm text-muted-foreground">{t.description}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {t.action.type.replace('_', ' ')} · runs {t.runCount}{t.maxRuns ? `/${t.maxRuns}` : ''} · next {new Date(t.nextRunAt).toLocaleString()}
                {t.lastRunAt && ` · last ${new Date(t.lastRunAt).toLocaleString()} (${t.lastRunStatus ?? '—'})`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toggle(t)} className="rounded-lg border border-white/10 p-2 hover:bg-white/5" title={t.enabled ? 'Pause' : 'Enable'}>
                {t.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button onClick={() => remove(t)} className="rounded-lg border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10" title="Delete"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
