'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { GraphData, JournalRow, MissionDetail, MissionRow, QuestionRow } from '@openagents/sdk'
import { Bot, HelpCircle, Loader2, Network, Play, Plus, RotateCcw, Sparkles, Undo2, X } from 'lucide-react'

const inputCls = 'oa-input-surface h-10 w-full rounded-xl px-3 text-sm outline-none'
const btnCls = 'oa-accent-button h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50'
const ghostBtn = 'h-8 rounded-lg border border-[var(--border)] px-3 text-xs font-medium text-[var(--tone-strong)] transition hover:bg-[var(--surface-muted)]'

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="oa-float-card p-5">
      <h2 className="text-sm font-semibold text-[var(--tone-strong)]">{title}</h2>
      {subtitle && <p className="mb-3 text-xs text-[var(--muted)]">{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  running: 'bg-blue-100 text-blue-700',
  done: 'bg-emerald-100 text-emerald-700',
  planning: 'bg-amber-100 text-amber-700',
  awaiting_approval: 'bg-amber-100 text-amber-700',
  awaiting_input: 'bg-purple-100 text-purple-700',
  paused: 'bg-slate-200 text-slate-600',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-600',
  open: 'bg-amber-100 text-amber-700',
  answered: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-slate-200 text-slate-600',
}

function Pill({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

export default function AutonomyPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [tab, setTab] = useState<'missions' | 'questions' | 'journal' | 'graph'>('missions')
  const [busy, setBusy] = useState(false)

  // Missions
  const [missions, setMissions] = useState<MissionRow[]>([])
  const [missionDetail, setMissionDetail] = useState<MissionDetail | null>(null)
  const [mGoal, setMGoal] = useState('')
  const [mHours, setMHours] = useState('24')

  // Questions
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})

  // Journal
  const [journal, setJournal] = useState<JournalRow[]>([])

  // Graph
  const [graph, setGraph] = useState<GraphData | null>(null)

  const load = useCallback(async () => {
    const [ms, qs, jr, g] = await Promise.allSettled([
      sdk.autonomy.listMissions(),
      sdk.autonomy.listQuestions(),
      sdk.autonomy.listJournal(),
      sdk.autonomy.getGraph(),
    ])
    if (ms.status === 'fulfilled') setMissions(ms.value)
    if (qs.status === 'fulfilled') setQuestions(qs.value)
    if (jr.status === 'fulfilled') setJournal(jr.value)
    if (g.status === 'fulfilled') setGraph(g.value)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function run(fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(true)
    try {
      await fn()
      if (okMsg) addToast('success', okMsg)
      await load()
    } catch (err: any) {
      addToast('error', String(err?.message ?? 'Something went wrong').slice(0, 200))
    } finally {
      setBusy(false)
    }
  }

  async function openMission(id: string) {
    setBusy(true)
    try {
      setMissionDetail(await sdk.autonomy.getMission(id))
    } catch (err: any) {
      addToast('error', String(err?.message ?? 'Failed to load mission'))
    } finally {
      setBusy(false)
    }
  }

  const tabs = [
    { id: 'missions' as const, label: 'Missions', icon: Bot },
    { id: 'questions' as const, label: `Questions${questions.length ? ` (${questions.length})` : ''}`, icon: HelpCircle },
    { id: 'journal' as const, label: 'Undo journal', icon: Undo2 },
    { id: 'graph' as const, label: 'Memory graph', icon: Network },
  ]

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 pb-24 md:p-6">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Sparkles size={15} />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--tone-strong)]">Autonomy</h1>
          <p className="text-xs text-[var(--muted)]">Long-running missions, agent questions, undo, and what your agent knows about your world.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              tab === t.id ? 'oa-brand-badge text-white shadow-sm' : 'border border-[var(--border)] text-[var(--muted)] hover:text-[var(--tone-strong)]'
            }`}
          >
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'missions' && (
        <div className="space-y-4">
          <Card title="New mission" subtitle="A goal the agent keeps working on, every N hours, with checkpoints and morning reports.">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className={inputCls} placeholder="e.g. Track competitor pricing changes and keep a dated log" value={mGoal} onChange={(e) => setMGoal(e.target.value)} />
              <input className={`${inputCls} sm:w-28`} placeholder="Hours" value={mHours} onChange={(e) => setMHours(e.target.value.replace(/\D/g, ''))} />
              <button
                type="button"
                className={btnCls}
                disabled={busy || mGoal.trim().length < 8}
                onClick={() => run(async () => { await sdk.autonomy.createMission({ goal: mGoal, intervalHours: Number(mHours) || 24 }); setMGoal('') }, 'Mission created')}
              >
                <span className="inline-flex items-center gap-1.5"><Plus size={14} /> Create</span>
              </button>
            </div>
          </Card>

          {missions.map((m) => (
            <div key={m.id} className="oa-float-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Pill status={m.status} />
                <span className="text-xs text-[var(--muted)]">
                  every {m.intervalHours}h · {m.runCount} run{m.runCount === 1 ? '' : 's'}
                  {m.nextRunAt ? ` · next ${new Date(m.nextRunAt).toLocaleString()}` : ''}
                </span>
                <span className="ml-auto flex gap-1.5">
                  <button type="button" className={ghostBtn} onClick={() => void openMission(m.id)}>Details</button>
                  <button type="button" className={ghostBtn} disabled={busy} onClick={() => run(() => sdk.autonomy.runMission(m.id), 'Run started')}>
                    <span className="inline-flex items-center gap-1"><Play size={11} /> Run now</span>
                  </button>
                  <button type="button" className={ghostBtn} disabled={busy} onClick={() => run(() => sdk.autonomy.missionReport(m.id), 'Report built')}>Report</button>
                  <button
                    type="button"
                    className={ghostBtn}
                    disabled={busy}
                    onClick={() => run(() => sdk.autonomy.updateMission(m.id, { status: m.status === 'active' ? 'paused' : 'active' }))}
                  >
                    {m.status === 'active' ? 'Pause' : 'Resume'}
                  </button>
                </span>
              </div>
              <p className="mt-2 text-sm text-[var(--tone-strong)]">{m.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{m.goal}</p>
              {m.lastReport && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--muted)]">Latest report</summary>
                  <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-[var(--surface-muted)] p-3 text-xs text-[var(--tone-strong)]">{m.lastReport}</pre>
                </details>
              )}
            </div>
          ))}

          {missionDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setMissionDetail(null)}>
              <div className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-[var(--surface)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--tone-strong)]">{missionDetail.mission.title}</h3>
                  <button type="button" onClick={() => setMissionDetail(null)} className="text-[var(--muted)]"><X size={16} /></button>
                </div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Events</h4>
                <ul className="mb-4 space-y-1">
                  {missionDetail.events.map((e) => (
                    <li key={e.id} className="text-xs text-[var(--tone-strong)]">
                      <span className="text-[var(--muted)]">{new Date(e.createdAt).toLocaleString()} · {e.kind}</span> — {e.message}
                    </li>
                  ))}
                </ul>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Runs</h4>
                <ul className="space-y-1">
                  {missionDetail.tasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-xs text-[var(--tone-strong)]">
                      <Pill status={t.status} /> {t.title}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'questions' && (
        <div className="space-y-4">
          {questions.length === 0 && (
            <Card title="No open questions">
              <p className="text-xs text-[var(--muted)]">When the agent needs a detail to continue a task, it will ask you here; the task pauses until you answer.</p>
            </Card>
          )}
          {questions.map((q) => (
            <div key={q.id} className="oa-float-card p-4">
              <div className="flex items-center gap-2">
                <Pill status={q.status} />
                <span className="text-xs text-[var(--muted)]">{new Date(q.createdAt).toLocaleString()} · task {q.taskId.slice(0, 8)}</span>
              </div>
              <p className="mt-2 text-sm text-[var(--tone-strong)]">{q.question}</p>
              {q.status === 'open' ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    className={inputCls}
                    placeholder="Your answer…"
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers((s) => ({ ...s, [q.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className={btnCls}
                    disabled={busy || !(answers[q.id] ?? '').trim()}
                    onClick={() => run(async () => { await sdk.autonomy.answerQuestion(q.id, answers[q.id]); setAnswers((s) => ({ ...s, [q.id]: '' })) }, 'Answered — task resumed')}
                  >
                    Answer
                  </button>
                  <button type="button" className={ghostBtn} disabled={busy} onClick={() => run(() => sdk.autonomy.dismissQuestion(q.id))}>Dismiss</button>
                </div>
              ) : (
                <p className="mt-2 rounded-lg bg-[var(--surface-muted)] p-2 text-xs text-[var(--tone-strong)]">{q.answer}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'journal' && (
        <div className="space-y-3">
          <Card title="Action journal" subtitle="Every side effect the agent made. Undo reverts it with the matching compensating action when one exists.">
            {journal.length === 0 && <p className="text-xs text-[var(--muted)]">Nothing logged yet.</p>}
          </Card>
          {journal.map((j) => (
            <div key={j.id} className="oa-float-card flex flex-wrap items-center gap-2 p-3">
              <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 font-mono text-[11px] text-[var(--tone-strong)]">{j.tool}</span>
              <span className="text-xs text-[var(--muted)]">{new Date(j.createdAt).toLocaleString()}</span>
              {j.taskId && <span className="text-[10px] text-[var(--muted)]">task {j.taskId.slice(0, 8)}</span>}
              <span className="ml-auto">
                {j.undoneAt ? (
                  <span className="text-xs font-medium text-emerald-600">undone</span>
                ) : j.compensation ? (
                  <button type="button" className={ghostBtn} disabled={busy} onClick={() => run(() => sdk.autonomy.undoEntry(j.id), 'Reverted')}>
                    <span className="inline-flex items-center gap-1"><RotateCcw size={11} /> Undo</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-[var(--muted)]">manual undo only</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'graph' && (
        <div className="space-y-4">
          <Card title="Entity memory graph" subtitle="People, companies, projects and topics from your conversations, and how they connect.">
            <button type="button" className={btnCls} disabled={busy} onClick={() => run(() => sdk.autonomy.rebuildGraph(), 'Graph rebuilt')}>
              <span className="inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Network size={14} />} Rebuild from recent chats</span>
            </button>
          </Card>
          {graph && graph.nodes.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card title={`Entities (${graph.nodes.length})`}>
                <ul className="space-y-1.5">
                  {graph.nodes.map((n) => (
                    <li key={n.id} className="flex items-center gap-2 text-xs">
                      <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">{n.type}</span>
                      <span className="font-medium text-[var(--tone-strong)]">{n.name}</span>
                      <span className="truncate text-[var(--muted)]">{n.summary}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-[var(--muted)]">×{n.mentions}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title={`Relationships (${graph.edges.length})`}>
                <ul className="space-y-1.5">
                  {graph.edges.map((e, i) => (
                    <li key={i} className="text-xs text-[var(--tone-strong)]">
                      <span className="font-medium">{e.from}</span> <span className="text-[var(--muted)]">—{e.relation}→</span> <span className="font-medium">{e.to}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}
          {graph && graph.nodes.length === 0 && <p className="text-xs text-[var(--muted)]">No entities yet — rebuild after a few conversations.</p>}
        </div>
      )}
    </div>
  )
}
