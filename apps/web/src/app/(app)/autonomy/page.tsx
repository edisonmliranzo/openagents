'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type {
  ApprovalRuleRow,
  AnticipationRow,
  AgentTokenRow,
  ClipRow,
  CrmPersonRow,
  GraphData,
  InboxDigestRow,
  JournalRow,
  MissionDetail,
  MissionRow,
  QuestionRow,
  ReplayDay,
} from '@openagents/sdk'
import {
  Bot,
  Copy,
  HelpCircle,
  Inbox,
  Loader2,
  Mic,
  Mail,
  Network,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Undo2,
  Users,
  Wand2,
  X,
} from 'lucide-react'

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
  const [tab, setTab] = useState<'missions' | 'questions' | 'journal' | 'graph' | 'crm' | 'clips' | 'inbox' | 'rules' | 'tokens' | 'replay'>('missions')
  const [busy, setBusy] = useState(false)

  // Missions
  const [missions, setMissions] = useState<MissionRow[]>([])
  const [missionDetail, setMissionDetail] = useState<MissionDetail | null>(null)
  const [mGoal, setMGoal] = useState('')
  const [mHours, setMHours] = useState('24')
  const [anticipations, setAnticipations] = useState<AnticipationRow[]>([])

  // Questions
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})

  // Journal
  const [journal, setJournal] = useState<JournalRow[]>([])

  // Graph
  const [graph, setGraph] = useState<GraphData | null>(null)

  // CRM
  const [roster, setRoster] = useState<CrmPersonRow[]>([])
  const [nudge, setNudge] = useState<{ name: string; draft: string } | null>(null)

  // Clips
  const [clips, setClips] = useState<ClipRow[]>([])
  const [clipText, setClipText] = useState('')
  const [clipQuery, setClipQuery] = useState('')

  // Inbox
  const [digest, setDigest] = useState<InboxDigestRow | null>(null)

  // Rules
  const [rules, setRules] = useState<ApprovalRuleRow[]>([])
  const [policy, setPolicy] = useState('')

  // Tokens
  const [tokens, setTokens] = useState<AgentTokenRow[]>([])
  const [newToken, setNewToken] = useState<string | null>(null)

  // Replay
  const [replayDate, setReplayDate] = useState(new Date().toISOString().slice(0, 10))
  const [replay, setReplay] = useState<ReplayDay | null>(null)

  // Shadow mode
  const [shadowMode, setShadowMode] = useState(false)

  const load = useCallback(async () => {
    const [ms, qs, jr, g, sh] = await Promise.allSettled([
      sdk.autonomy.listMissions(),
      sdk.autonomy.listQuestions(),
      sdk.autonomy.listJournal(),
      sdk.autonomy.getGraph(),
      sdk.life.getShadow(),
    ])
    if (ms.status === 'fulfilled') setMissions(ms.value)
    if (qs.status === 'fulfilled') setQuestions(qs.value)
    if (jr.status === 'fulfilled') setJournal(jr.value)
    if (g.status === 'fulfilled') setGraph(g.value)
    if (sh.status === 'fulfilled') setShadowMode(sh.value.shadowMode)
  }, [])

  const loadTab = useCallback(async (which: string) => {
    try {
      if (which === 'crm') setRoster(await sdk.life.crmRoster())
      if (which === 'clips') setClips(await sdk.life.listClips())
      if (which === 'inbox') setDigest(await sdk.life.inboxList().then((l) => l[0] ?? null))
      if (which === 'rules') setRules(await sdk.life.listRules())
      if (which === 'tokens') setTokens(await sdk.life.listTokens())
      if (which === 'replay') setReplay(await sdk.life.replayDay(replayDate))
      if (which === 'missions') setAnticipations(await sdk.life.listAnticipations())
    } catch {
      // tab-specific loads are best-effort
    }
  }, [replayDate])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadTab(tab)
  }, [tab, loadTab])

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

  async function speakBriefing() {
    setBusy(true)
    try {
      const { script } = await sdk.life.podcast('today')
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utter = new SpeechSynthesisUtterance(script)
        window.speechSynthesis.speak(utter)
        addToast('success', 'Playing your briefing')
      } else {
        addToast('error', 'Speech synthesis not available in this browser')
      }
    } catch (err: any) {
      addToast('error', String(err?.message ?? 'Briefing failed').slice(0, 200))
    } finally {
      setBusy(false)
    }
  }

  const tabs = [
    { id: 'missions' as const, label: 'Missions', icon: Bot },
    { id: 'questions' as const, label: `Questions${questions.length ? ` (${questions.length})` : ''}`, icon: HelpCircle },
    { id: 'journal' as const, label: 'Undo journal', icon: Undo2 },
    { id: 'graph' as const, label: 'Memory graph', icon: Network },
    { id: 'crm' as const, label: 'CRM', icon: Users },
    { id: 'clips' as const, label: 'Clips', icon: Copy },
    { id: 'inbox' as const, label: 'Inbox', icon: Inbox },
    { id: 'rules' as const, label: 'Rules', icon: Wand2 },
    { id: 'tokens' as const, label: 'API tokens', icon: Sparkles },
    { id: 'replay' as const, label: 'Replay', icon: Mic },
  ]

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 pb-24 md:p-6">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Sparkles size={15} />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--tone-strong)]">Autonomy</h1>
          <p className="text-xs text-[var(--muted)]">Missions, agent questions, undo, and everything your agent does for you.</p>
        </div>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" className={ghostBtn} disabled={busy} onClick={() => void speakBriefing()}>
            <span className="inline-flex items-center gap-1.5"><Mic size={12} /> Briefing</span>
          </button>
          <button
            type="button"
            className={ghostBtn}
            disabled={busy}
            onClick={() => run(async () => { const r = await sdk.life.setShadow(!shadowMode); setShadowMode(r.shadowMode) }, shadowMode ? 'Dry-run off' : 'Dry-run on — side effects will be simulated')}
          >
            {shadowMode ? 'Dry-run: ON' : 'Dry-run: off'}
          </button>
        </span>
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

          {anticipations.length > 0 && (
            <Card title="Ran ahead of you" subtitle="Recurring requests the agent noticed and will pre-run.">
              <ul className="space-y-2">
                {anticipations.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px]">every ~{a.cadenceDays}d</span>
                    <span className="text-[var(--tone-strong)]">{a.patternText.slice(0, 100)}</span>
                    <span className="ml-auto text-[var(--muted)]">{a.exampleCount}× seen</span>
                    <button
                      type="button"
                      className={ghostBtn}
                      disabled={busy}
                      onClick={() => run(() => sdk.life.updateAnticipation(a.id, { status: a.status === 'active' ? 'paused' : 'active' }))}
                    >
                      {a.status === 'active' ? 'Pause' : 'Resume'}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

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

      {tab === 'crm' && (
        <div className="space-y-3">
          <Card title="Personal CRM" subtitle="People from your conversations, bucketed by how long since you last talked.">
            {roster.length === 0 && <p className="text-xs text-[var(--muted)]">No people in your graph yet.</p>}
          </Card>
          {roster.map((p) => (
            <div key={p.id} className="oa-float-card flex flex-wrap items-center gap-2 p-3">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                p.bucket === 'fresh' ? 'bg-emerald-100 text-emerald-700' : p.bucket === 'warm' ? 'bg-amber-100 text-amber-700' : p.bucket === 'stale' ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-600'
              }`}>{p.bucket}</span>
              <span className="text-sm font-medium text-[var(--tone-strong)]">{p.name}</span>
              <span className="text-xs text-[var(--muted)]">{p.summary}</span>
              <span className="ml-auto text-xs text-[var(--muted)]">
                {p.daysSince === null ? 'never in chats' : `${p.daysSince}d ago`} · {p.mentions}×
              </span>
              <button
                type="button"
                className={ghostBtn}
                disabled={busy}
                onClick={() => run(async () => { const r = await sdk.life.crmNudge(p.id); setNudge({ name: p.name, draft: r.draft }) }, undefined)}
              >
                Draft nudge
              </button>
            </div>
          ))}
          {nudge && (
            <div className="oa-float-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--tone-strong)]">Nudge for {nudge.name}</h3>
                <button type="button" onClick={() => setNudge(null)} className="text-[var(--muted)]"><X size={14} /></button>
              </div>
              <p className="rounded-lg bg-[var(--surface-muted)] p-3 text-sm text-[var(--tone-strong)]">{nudge.draft}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'clips' && (
        <div className="space-y-4">
          <Card title="Save a clip" subtitle="Paste a link or note; screenshots can be added from chat. Clips are searchable memory.">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className={inputCls} placeholder="Paste a URL or note to remember…" value={clipText} onChange={(e) => setClipText(e.target.value)} />
              <button
                type="button"
                className={btnCls}
                disabled={busy || !clipText.trim()}
                onClick={() => run(async () => {
                  const isUrl = /^https?:\/\//.test(clipText.trim())
                  await sdk.life.createClip(isUrl ? { kind: 'link', sourceUrl: clipText.trim() } : { kind: 'text', text: clipText.trim() })
                  setClipText('')
                }, 'Clip saved')}
              >
                <span className="inline-flex items-center gap-1.5"><Plus size={14} /> Clip</span>
              </button>
            </div>
            <input className={`${inputCls} mt-2`} placeholder="Search clips…" value={clipQuery} onChange={(e) => setClipQuery(e.target.value)} onBlur={() => void loadTab('clips')} />
          </Card>
          {clips.map((c) => (
            <div key={c.id} className="oa-float-card flex flex-wrap items-center gap-2 p-3">
              <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">{c.kind}</span>
              <span className="text-xs text-[var(--tone-strong)]">{c.caption || c.text || c.sourceUrl || '(image)'}</span>
              <span className="ml-auto text-[10px] text-[var(--muted)]">{new Date(c.createdAt).toLocaleString()}</span>
              <button type="button" className={ghostBtn} disabled={busy} onClick={() => run(() => sdk.life.deleteClip(c.id), 'Deleted')}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'inbox' && (
        <div className="space-y-4">
          <Card title="Inbox autopilot" subtitle="Triage your Gmail into action / waiting / read / archive. Nothing is ever sent without approval.">
            <button type="button" className={btnCls} disabled={busy} onClick={() => run(async () => { await sdk.life.inboxTriage(); setDigest(await sdk.life.inboxList().then((l) => l[0] ?? null)) }, 'Inbox triaged')}>
              <span className="inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Triage now</span>
            </button>
          </Card>
          {digest && (
            <div className="oa-float-card p-4">
              <p className="text-sm text-[var(--tone-strong)]">{digest.summary}</p>
              <ul className="mt-3 space-y-2">
                {(JSON.parse(digest.items || '[]') as Array<{ from: string; subject: string; bucket: string; action: string }>).map((it, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      it.bucket === 'action' ? 'bg-red-100 text-red-700' : it.bucket === 'waiting' ? 'bg-amber-100 text-amber-700' : it.bucket === 'read' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                    }`}>{it.bucket}</span>
                    <span className="font-medium text-[var(--tone-strong)]">{it.subject}</span>
                    <span className="text-[var(--muted)]">— {it.from}</span>
                    {it.action && <span className="text-[var(--muted)]">→ {it.action}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'rules' && (
        <div className="space-y-4">
          <Card title="Approval delegation rules" subtitle="Describe a policy in plain English, e.g. “always allow calendar, never send email, allow notes_*”.">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className={inputCls} placeholder="always allow calendar_*, never gmail_send" value={policy} onChange={(e) => setPolicy(e.target.value)} />
              <button type="button" className={btnCls} disabled={busy || policy.trim().length < 5} onClick={() => run(async () => { await sdk.life.compileRules(policy); setPolicy('') }, 'Rules created')}>
                Compile
              </button>
            </div>
          </Card>
          {rules.map((r) => (
            <div key={r.id} className="oa-float-card flex flex-wrap items-center gap-2 p-3">
              <span className={`rounded px-2 py-0.5 font-mono text-[11px] ${r.decision === 'allow' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{r.toolPattern}</span>
              <span className="text-xs text-[var(--muted)]">{r.note}</span>
              <span className="ml-auto flex gap-1.5">
                <button type="button" className={ghostBtn} disabled={busy} onClick={() => run(() => sdk.life.updateRule(r.id, { enabled: !r.enabled }))}>
                  {r.enabled ? 'Disable' : 'Enable'}
                </button>
                <button type="button" className={ghostBtn} disabled={busy} onClick={() => run(() => sdk.life.deleteRule(r.id), 'Deleted')}>Delete</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'tokens' && (
        <div className="space-y-4">
          <Card title="Agent API tokens" subtitle="Let external apps create and follow tasks with a scoped, budgeted token.">
            <button type="button" className={btnCls} disabled={busy} onClick={() => run(async () => { const r = await sdk.life.createToken({ name: `token-${Date.now().toString(36)}` }); setNewToken(r.token) }, undefined)}>
              <span className="inline-flex items-center gap-1.5"><Plus size={14} /> Create token</span>
            </button>
            {newToken && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800">Copy it now — shown only once:</p>
                <code className="mt-1 block break-all text-xs text-amber-900">{newToken}</code>
              </div>
            )}
          </Card>
          {tokens.map((t) => (
            <div key={t.id} className="oa-float-card flex flex-wrap items-center gap-2 p-3">
              <span className="font-mono text-xs text-[var(--tone-strong)]">{t.tokenPrefix}…</span>
              <span className="text-xs text-[var(--muted)]">{t.name} · spent ${t.spentUsd.toFixed(2)} / ${t.budgetUsd} · {t.callCount} calls</span>
              <span className="ml-auto">
                {t.revokedAt ? (
                  <span className="text-xs text-red-500">revoked</span>
                ) : (
                  <button type="button" className={ghostBtn} disabled={busy} onClick={() => run(() => sdk.life.revokeToken(t.id), 'Revoked')}>Revoke</button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'replay' && (
        <div className="space-y-4">
          <Card title="Audit replay" subtitle="Scrub through any day and see every thought, tool call and side effect.">
            <div className="flex gap-2">
              <input type="date" className={inputCls} value={replayDate} onChange={(e) => setReplayDate(e.target.value)} />
              <button type="button" className={btnCls} disabled={busy} onClick={() => run(async () => { setReplay(await sdk.life.replayDay(replayDate)) }, undefined)}>Load</button>
            </div>
          </Card>
          {replay && (
            <div className="oa-float-card p-4">
              <p className="mb-2 text-xs text-[var(--muted)]">
                {replay.stats.tasks} tasks · {replay.stats.steps} steps · {replay.stats.sideEffects} side effects ({replay.stats.undone} undone)
              </p>
              <ul className="max-h-[420px] space-y-1 overflow-y-auto">
                {replay.events.map((e, i) => (
                  <li key={i} className="text-xs">
                    <span className="text-[var(--muted)]">{new Date(e.at).toLocaleTimeString()}</span>{' '}
                    <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px]">{e.kind}</span>{' '}
                    <span className="text-[var(--tone-strong)]">{e.message}</span>
                  </li>
                ))}
                {replay.events.length === 0 && <li className="text-xs text-[var(--muted)]">Nothing happened that day.</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
