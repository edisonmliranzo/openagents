'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { CheckCircle2, Clock3, Loader2, PlayCircle, ShieldAlert, XCircle } from 'lucide-react'

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

interface TaskDetail extends TaskRow {
  plan: string
  result: string | null
  verdict: string | null
  events: Array<{ id: string; kind: string; message: string; data: string | null; createdAt: string }>
}

const STATUS_STYLES: Record<string, string> = {
  planning: 'bg-indigo-100 text-indigo-700',
  running: 'bg-blue-100 text-blue-700',
  awaiting_approval: 'bg-amber-100 text-amber-800',
  done: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-600',
}

const inputCls = 'oa-input-surface w-full rounded-xl px-3 py-2 text-sm outline-none'
const btnCls = 'oa-accent-button h-9 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50'

export default function TasksPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [goal, setGoal] = useState('')
  const [criteria, setCriteria] = useState('')
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [active, setActive] = useState<TaskDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    setTasks(await sdk.tasks.list())
  }, [])

  const openTask = useCallback(async (id: string) => {
    setActive(await sdk.tasks.get(id))
  }, [])

  useEffect(() => { void load() }, [load])

  // Poll while any task is active or the open detail is still running.
  useEffect(() => {
    const anyActive = tasks.some((t) => ['planning', 'running', 'awaiting_approval'].includes(t.status)) ||
      (active && ['planning', 'running', 'awaiting_approval'].includes(active.status))
    if (!anyActive) return
    pollRef.current = setInterval(async () => {
      await load()
      if (active) await openTask(active.id).catch(() => undefined)
    }, 4000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [tasks, active, load, openTask])

  async function create() {
    if (goal.trim().length < 8) { addToast('warning', 'Describe the goal in at least a sentence'); return }
    setBusy(true)
    try {
      const task = await sdk.tasks.create({ goal: goal.trim(), successCriteria: criteria.trim() || undefined })
      setGoal('')
      setCriteria('')
      await load()
      await openTask(task.id)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Could not create task')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4 pb-24">
        <header>
          <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Tasks</h1>
          <p className="text-xs text-[var(--muted)]">Long-running agent jobs: the agent plans, acts, verifies, and recovers from failures. Actions that change the outside world ask you first.</p>
        </header>

        <div className="oa-float-card space-y-2 p-4">
          <input className={inputCls} placeholder="Goal — what should the agent accomplish?" value={goal} onChange={(e) => setGoal(e.target.value)} />
          <input className={inputCls} placeholder="Success criteria (optional — e.g. exactly 3 bullets with sources)" value={criteria} onChange={(e) => setCriteria(e.target.value)} />
          <button className={btnCls} disabled={busy} onClick={() => void create()}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <><PlayCircle size={15} className="mr-1 inline" /> Run task</>}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="oa-float-card p-4">
            <h2 className="mb-2 text-sm font-semibold text-[var(--tone-strong)]">Recent</h2>
            <ul className="space-y-2">
              {tasks.length === 0 && <li className="text-sm text-[var(--muted)]">No tasks yet.</li>}
              {tasks.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => void openTask(t.id)} className="w-full rounded-xl border border-[var(--border)] bg-white/70 px-3 py-2 text-left transition hover:bg-white">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[t.status] ?? 'bg-slate-100'}`}>{t.status}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--tone-strong)]">{t.title}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--muted)]">{new Date(t.createdAt).toLocaleString()}{t.replans > 0 ? ` · ${t.replans} replan${t.replans > 1 ? 's' : ''}` : ''}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="oa-float-card p-4">
            <h2 className="mb-2 text-sm font-semibold text-[var(--tone-strong)]">Detail</h2>
            {!active && <p className="text-sm text-[var(--muted)]">Select a task to watch it work.</p>}
            {active && (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[active.status] ?? 'bg-slate-100'}`}>{active.status}</span>
                    <span className="text-xs text-[var(--muted)]">step {active.cursor}{active.replans > 0 ? ` · replan ${active.replans}` : ''}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-[var(--tone-strong)]">{active.goal}</p>
                </div>

                {active.status === 'awaiting_approval' && (
                  <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <ShieldAlert size={16} className="text-amber-600" />
                    <span className="flex-1 text-xs text-amber-800">An external action is waiting for your approval.</span>
                    <button className="h-7 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white" onClick={() => void sdk.tasks.approve(active.id).then(() => openTask(active.id))}>Approve</button>
                    <button className="h-7 rounded-lg bg-slate-200 px-3 text-xs font-semibold text-slate-700" onClick={() => void sdk.tasks.cancel(active.id).then(() => openTask(active.id))}>Cancel</button>
                  </div>
                )}

                {active.result && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-emerald-800"><CheckCircle2 size={13} /> Result</div>
                    <pre className="whitespace-pre-wrap text-sm text-emerald-950">{active.result}</pre>
                  </div>
                )}
                {active.error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><XCircle size={13} className="mr-1 inline" />{active.error}</div>
                )}

                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {active.events.map((e) => (
                    <li key={e.id} className="flex items-start gap-2 text-xs">
                      {e.kind === 'error' || e.kind === 'step_failed' ? <XCircle size={12} className="mt-0.5 text-red-500" /> : e.kind === 'verified' ? <CheckCircle2 size={12} className="mt-0.5 text-emerald-600" /> : <Clock3 size={12} className="mt-0.5 text-slate-400" />}
                      <span className="text-[var(--muted)]">{new Date(e.createdAt).toLocaleTimeString()}</span>
                      <span className="min-w-0 flex-1 text-[var(--tone-strong)]">{e.message}</span>
                    </li>
                  ))}
                </ul>

                {['planning', 'running'].includes(active.status) && (
                  <button className="h-7 rounded-lg bg-slate-200 px-3 text-xs font-semibold text-slate-700" onClick={() => void sdk.tasks.cancel(active.id).then(() => openTask(active.id))}>Cancel task</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
