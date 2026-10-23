'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Brain, Code2, Loader2, MessageSquare, PenLine, Play, RefreshCw, Search, Send, Swords, Users, X, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

// Local typed wrappers (mirror packages/sdk/src/api/orchestration.ts + war-rooms.ts)
type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'
interface PlanTask {
  id: string
  agentId: string
  objective: string
  dependencies: string[]
  status: TaskStatus
  result?: unknown
  error?: string
  priority: number
  startedAt?: string
  completedAt?: string
}
interface Plan {
  id: string
  objective: string
  tasks: PlanTask[]
  executionOrder: string[]
  status: 'planning' | 'executing' | 'completed' | 'failed'
  createdAt: string
}
interface WarRoom {
  id: string
  name: string
  topic: string | null
  status: 'active' | 'concluded' | 'failed'
  agents: string[]
  consensus: {
    score: number
    label: 'consensus' | 'partial' | 'disagreement'
    pairs: Array<{ a: string; b: string; similarity: number }>
    skipped: number
  } | null
  verdict: { winner: string; confidence: number; synthesis: string; rationale: string } | null
  transcript: Array<{ id: string; role: string; agentName: string | null; content: string; meta: Record<string, unknown> | null; createdAt: string }>
}

const api = {
  createPlan: (objective: string, context: Record<string, unknown>) =>
    sdk.client.post<Plan>('/api/v1/orchestration/plans', { objective, context }),
  listPlans: () => sdk.client.get<Plan[]>('/api/v1/orchestration/plans'),
  getPlan: (id: string) => sdk.client.get<Plan | null>(`/api/v1/orchestration/plans/${id}`),
  execute: (id: string) => sdk.client.post<void>(`/api/v1/orchestration/plans/${id}/execute`),
  cancel: (id: string) => sdk.client.put<boolean>(`/api/v1/orchestration/plans/${id}/cancel`),
  listRooms: () => sdk.warRooms.list(),
  getRoom: (id: string) => sdk.warRooms.get(id),
  createRoom: (name: string, agents: string[], topic?: string) =>
    sdk.warRooms.create({ name, agents, topic }),
  runDebate: (id: string, question: string) => sdk.warRooms.run(id, { question }),
  postMessage: (id: string, agentName: string, content: string) =>
    sdk.warRooms.postMessage(id, { agentName, content }),
  conclude: (id: string) => sdk.warRooms.conclude(id),
  removeRoom: (id: string) => sdk.warRooms.remove(id),
}

const ROLES = [
  { id: 'planner', label: 'Planner', icon: Brain, match: ['planner', 'general-assistant'] },
  { id: 'researcher', label: 'Researcher', icon: Search, match: ['researcher', 'data-collector'] },
  { id: 'writer', label: 'Writer', icon: PenLine, match: ['writer'] },
  { id: 'coder', label: 'Coder', icon: Code2, match: ['coder', 'analyst', 'data-analyst'] },
] as const

function roleFor(agentId: string) {
  const base = agentId.replace(/-backup$/, '')
  return ROLES.find((r) => (r.match as readonly string[]).includes(base)) ?? null
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-slate-500/15 text-slate-300',
  running: 'bg-blue-500/15 text-blue-300',
  completed: 'bg-emerald-500/15 text-emerald-300',
  failed: 'bg-red-500/15 text-red-300',
  planning: 'bg-slate-500/15 text-slate-300',
  executing: 'bg-blue-500/15 text-blue-300',
  active: 'bg-blue-500/15 text-blue-300',
  concluded: 'bg-emerald-500/15 text-emerald-300',
  consensus_reached: 'bg-emerald-500/15 text-emerald-300',
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'running' || status === 'executing') return <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
  if (status === 'completed' || status === 'concluded') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />
  if (status === 'failed') return <XCircle className="h-4 w-4 text-red-400" />
  return <Clock className="h-4 w-4 text-slate-400" />
}

function Badge({ status }: { status: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? STATUS_STYLE.pending}`}>{status.replace('_', ' ')}</span>
}

export default function TeamsPage() {
  const [tab, setTab] = useState<'team' | 'war-room'>('team')
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex items-center gap-3">
        <Users className="h-7 w-7 text-indigo-400" />
        <div>
          <h1 className="text-2xl font-semibold">Agent Teams</h1>
          <p className="text-sm text-muted-foreground">Give OpenAgents a goal and a team of role agents plans, researches, writes and codes it.</p>
        </div>
      </header>
      <div className="flex gap-2 border-b border-white/10">
        {(['team', 'war-room'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === t ? 'border-indigo-400 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t === 'team' ? 'Team run' : 'War room'}
          </button>
        ))}
      </div>
      {tab === 'team' ? <TeamRun /> : <WarRoomTab />}
    </div>
  )
}

function TeamRun() {
  const addToast = useUIStore((s) => s.addToast)
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)
  const [plans, setPlans] = useState<Plan[]>([])
  const [active, setActive] = useState<Plan | null>(null)

  const loadPlans = useCallback(async () => {
    try { setPlans(await api.listPlans()) } catch { /* ignore */ }
  }, [])

  useEffect(() => { void loadPlans() }, [loadPlans])

  // Live refresh while the active plan is in flight.
  useEffect(() => {
    if (!active || active.status === 'completed' || active.status === 'failed') return
    const timer = setInterval(async () => {
      try {
        const next = await api.getPlan(active.id)
        if (next) setActive(next)
      } catch { /* ignore */ }
    }, 2000)
    return () => clearInterval(timer)
  }, [active])

  async function start() {
    if (!goal.trim()) return
    setBusy(true)
    try {
      const plan = await api.createPlan(goal.trim(), { roles: ROLES.map((r) => r.id) })
      setActive(plan)
      await api.execute(plan.id).catch(() => undefined)
      setActive((await api.getPlan(plan.id)) ?? plan)
      setGoal('')
      void loadPlans()
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to start team')
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (!active) return
    try {
      await api.cancel(active.id)
      addToast('success', 'Team run cancelled')
      setActive((await api.getPlan(active.id)) ?? active)
    } catch {
      addToast('error', 'Cancel failed')
    }
  }

  const ordered = useMemo(() => {
    if (!active) return []
    const byId = new Map(active.tasks.map((t) => [t.id, t]))
    const inOrder = active.executionOrder.map((id) => byId.get(id)).filter(Boolean) as PlanTask[]
    return inOrder.length === active.tasks.length ? inOrder : active.tasks
  }, [active])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <div className="space-y-6">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <label className="mb-2 block text-sm font-medium">Goal</label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            placeholder="e.g. Research the top 3 vector databases and write a comparison with a code sample"
            className="w-full resize-none rounded-lg border border-white/10 bg-black/20 p-3 text-sm outline-none focus:border-indigo-400"
          />
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-2">
              {ROLES.map((r) => (
                <span key={r.id} className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-xs text-muted-foreground">
                  <r.icon className="h-3 w-3" /> {r.label}
                </span>
              ))}
            </div>
            <button
              onClick={start}
              disabled={busy || !goal.trim()}
              className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run team
            </button>
          </div>
        </div>

        {active && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><StatusIcon status={active.status} /><Badge status={active.status} /></div>
                <p className="mt-1 truncate text-sm text-muted-foreground">{active.objective}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={async () => setActive((await api.getPlan(active.id)) ?? active)} className="rounded-lg border border-white/10 p-2 hover:bg-white/5" title="Refresh">
                  <RefreshCw className="h-4 w-4" />
                </button>
                {(active.status === 'executing' || active.status === 'planning') && (
                  <button onClick={cancel} className="flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10">
                    <X className="h-4 w-4" /> Cancel
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {ordered.map((task, i) => {
                const role = roleFor(task.agentId)
                const Icon = role?.icon ?? Brain
                return (
                  <div key={task.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-indigo-300" />
                        <span className="text-sm font-medium">{role?.label ?? task.agentId}</span>
                        <span className="text-xs text-muted-foreground">#{i + 1}</span>
                      </div>
                      <div className="flex items-center gap-2"><StatusIcon status={task.status} /><Badge status={task.status} /></div>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{task.objective}</p>
                    {task.error && <p className="mt-2 text-xs text-red-300">{task.error}</p>}
                    {task.result != null && (
                      <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/30 p-2 text-xs">
                        {typeof task.result === 'string' ? task.result : JSON.stringify(task.result, null, 2)}
                      </pre>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Recent runs</h2>
        {plans.length === 0 && <p className="text-xs text-muted-foreground">No runs yet.</p>}
        {plans.map((p) => (
          <button key={p.id} onClick={() => setActive(p)} className={`w-full rounded-lg border p-3 text-left text-sm hover:bg-white/5 ${active?.id === p.id ? 'border-indigo-400/50' : 'border-white/10'}`}>
            <div className="truncate">{p.objective}</div>
            <div className="mt-1"><Badge status={p.status} /></div>
          </button>
        ))}
      </aside>
    </div>
  )
}

function WarRoomTab() {
  const addToast = useUIStore((s) => s.addToast)
  const [rooms, setRooms] = useState<WarRoom[]>([])
  const [selected, setSelected] = useState<WarRoom | null>(null)
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [agents, setAgents] = useState('planner, researcher, writer, coder')
  const [speaker, setSpeaker] = useState('planner')
  const [message, setMessage] = useState('')
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    try { setRooms(await api.listRooms()) } catch { /* ignore */ }
  }, [])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!selected || selected.status !== 'active') return
    const timer = setInterval(async () => {
      try { setSelected(await api.getRoom(selected.id)) } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(timer)
  }, [selected])

  async function create() {
    const list = agents.split(',').map((a) => a.trim()).filter(Boolean)
    if (!name.trim() || list.length === 0) return
    try {
      const room = await api.createRoom(name.trim(), list, topic.trim() || undefined)
      setSelected(room)
      setSpeaker(list[0])
      setName('')
      setTopic('')
      void load()
    } catch {
      addToast('error', 'Failed to create war room')
    }
  }

  /** Runs a real multi-model debate in the room. */
  async function runDebate() {
    if (!selected || running) return
    const question = topic.trim() || selected.topic || selected.name
    setRunning(true)
    try {
      const room = await api.runDebate(selected.id, question)
      setSelected(room)
      addToast('success', `Debate finished · consensus ${room.consensus?.score ?? 0}%`)
      void load()
    } catch (error: any) {
      addToast('error', error?.message ?? 'The debate failed')
    } finally {
      setRunning(false)
    }
  }

  async function send() {
    if (!selected || !message.trim()) return
    try {
      setSelected(await api.postMessage(selected.id, speaker, message.trim()))
      setMessage('')
    } catch {
      addToast('error', 'Failed to send')
    }
  }

  async function conclude() {
    if (!selected) return
    try {
      setSelected(await api.conclude(selected.id))
      void load()
    } catch {
      addToast('error', 'Failed to conclude')
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-3">
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Room name" className="w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-sm" />
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Question to debate (optional)" className="w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-sm" />
          <input value={agents} onChange={(e) => setAgents(e.target.value)} placeholder="Agents (comma separated)" className="w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-sm" />
          <button onClick={create} className="w-full rounded bg-indigo-500 py-1.5 text-sm text-white hover:bg-indigo-400">Create war room</button>
        </div>
        {rooms.map((r) => (
          <button key={r.id} onClick={() => { setSelected(r); setSpeaker(r.agents[0] ?? 'planner'); setTopic(r.topic ?? '') }} className={`w-full rounded-lg border p-3 text-left text-sm hover:bg-white/5 ${selected?.id === r.id ? 'border-indigo-400/50' : 'border-white/10'}`}>
            <div className="truncate">{r.name}</div>
            <div className="mt-1 flex items-center gap-2">
              <Badge status={r.status} />
              {r.consensus && (
                <span className="text-[11px] text-muted-foreground">consensus {r.consensus.score}%</span>
              )}
            </div>
          </button>
        ))}
      </aside>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        {!selected ? (
          <div className="flex h-64 flex-col items-center justify-center text-sm text-muted-foreground">
            <MessageSquare className="mb-2 h-6 w-6" /> Select or create a war room
          </div>
        ) : (
          <div className="flex h-[520px] flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-medium">{selected.name}</h3>
                <p className="text-xs text-muted-foreground">{selected.agents.join(' · ')}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge status={selected.status} />
                {selected.consensus && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      selected.consensus.label === 'consensus'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : selected.consensus.label === 'partial'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-red-500/15 text-red-300'
                    }`}
                    title={selected.consensus.pairs.map((p) => `${p.a} ↔ ${p.b}: ${Math.round(p.similarity * 100)}%`).join('\n')}
                  >
                    consensus {selected.consensus.score}% · {selected.consensus.label}
                  </span>
                )}
                <button
                  onClick={runDebate}
                  disabled={running}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-400/40 px-3 py-1.5 text-sm text-indigo-200 hover:bg-indigo-500/10 disabled:opacity-50"
                >
                  {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Swords className="h-3.5 w-3.5" />}
                  {running ? 'Debating…' : 'Run debate'}
                </button>
                {selected.status === 'active' && (
                  <button onClick={conclude} className="rounded-lg border border-emerald-500/30 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/10">Conclude</button>
                )}
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-auto py-3">
              {selected.transcript.length === 0 && <p className="text-sm text-muted-foreground">No messages yet — run a debate to get the agents talking.</p>}
              {selected.transcript.map((m, i) => (
                <div key={m.id ?? i} className={`rounded-lg p-3 ${m.role === 'system' ? 'border border-indigo-400/30 bg-indigo-500/10' : 'bg-black/20'}`}>
                  <div className="text-xs font-medium text-indigo-300">{m.agentName ?? (m.role === 'system' ? 'Judge' : m.role)}</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm">{m.content}</div>
                </div>
              ))}
            </div>
            {selected.status === 'active' && (
              <div className="flex gap-2 border-t border-white/10 pt-3">
                <select value={speaker} onChange={(e) => setSpeaker(e.target.value)} className="rounded border border-white/10 bg-black/20 px-2 text-sm">
                  {selected.agents.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void send() }}
                  placeholder="Message as agent…"
                  className="flex-1 rounded border border-white/10 bg-black/20 px-3 py-2 text-sm"
                />
                <button onClick={send} className="rounded bg-indigo-500 px-3 text-white hover:bg-indigo-400"><Send className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
