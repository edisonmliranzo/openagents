'use client'

import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  Fingerprint,
  History,
  ListOrdered,
  ShieldCheck,
  CheckCircle2,
  Circle,
  Lightbulb,
  Loader2,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Play,
  Lock,
  RotateCcw,
  Users,
} from 'lucide-react'
import { sdk, useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import type { CrmPersonRow, JournalRow, MuseGoal, SkillSuggestionRow } from '@openagents/sdk'

type RightTab = 'activity' | 'goals' | 'ideas' | 'memory' | 'safety'

export interface MuseIdea {
  id: string
  title: string
  detail: string
  icon: 'goal' | 'chat' | 'approval' | 'memory' | 'start'
  emoji: string
  prompt?: string
  conversationId?: string
}

const GOAL_TEMPLATES = [
  {
    title: 'Launch OpenAgents v2.0',
    description: 'Complete final QA, verify all 4 specialists, and publish release notes.',
    milestones: [
      'Run workspace TypeScript & build audit',
      'Verify @Forge, @Scout, @Sentinel, @Atlas handoffs',
      'Generate v2.0 release notes artifact',
    ],
  },
  {
    title: 'Inbox & Subscription Cleanse',
    description: 'Audit recurring software & personal subscriptions and organize priority threads.',
    milestones: [
      'Scan last 30 days of receipts & renewals',
      'Flag unused subscriptions to cancel',
      'Set up Friday afternoon inbox zero briefing',
    ],
  },
  {
    title: 'Weekly Health & Deep Work Rhythm',
    description: 'Protect 4 morning deep-work blocks and 3 workout sessions each week.',
    milestones: [
      'Block 8:00–10:30 AM focus windows on calendar',
      'Plan 3 morning workout sessions',
      'Run Sunday evening weekly review with OpenAgents',
    ],
  },
]

function buildIdeas(input: {
  goals: MuseGoal[]
  conversations: Array<{ id: string; title: string | null; lastMessageAt: string | null; createdAt: string }>
  pendingApprovals: number
  factCount: number
}): MuseIdea[] {
  const { goals, conversations, pendingApprovals, factCount } = input
  const ideas: MuseIdea[] = []
  const now = Date.now()
  const DAY = 86400000

  if (pendingApprovals > 0) {
    ideas.push({
      id: 'idea-approvals',
      title: `I can walk you through your ${pendingApprovals} pending approval${pendingApprovals === 1 ? '' : 's'}`,
      detail: 'Actions are waiting on you — approve or deny them so work can continue.',
      icon: 'approval',
      emoji: '✅',
    })
  }

  for (const goal of goals.filter((g) => g.status === 'active').slice(0, 3)) {
    const next = goal.milestones.find((m) => !m.completed)
    ideas.push({
      id: `idea-goal-${goal.id}`,
      title: `I can keep "${goal.title}" moving`,
      detail: next
        ? `Next milestone: ${next.title} — ${goal.progress}% done. Want me to work on it now?`
        : `Progress is ${goal.progress}% — tell me the next step you want done.`,
      icon: 'goal',
      emoji: '🎯',
      prompt: next
        ? `Work on my goal "${goal.title}": complete the next milestone — ${next.title}.`
        : `Work on my goal "${goal.title}" — propose and execute the next step.`,
    })
  }

  const stale = conversations.find((c) => {
    const ts = new Date(c.lastMessageAt ?? c.createdAt).getTime()
    return Number.isFinite(ts) && now - ts > 3 * DAY
  })
  if (stale) {
    ideas.push({
      id: `idea-stale-${stale.id}`,
      title: `I can pick up where "${stale.title ?? 'your last chat'}" left off`,
      detail: 'That conversation has been idle for a few days — want me to continue it?',
      icon: 'chat',
      emoji: '💬',
      conversationId: stale.id,
    })
  }

  if (goals.filter((g) => g.status === 'active').length === 0) {
    ideas.push({
      id: 'idea-new-goal',
      title: 'I can turn a goal into a plan',
      detail: 'Give me something you want to achieve and I will break it into milestones and track them.',
      icon: 'start',
      emoji: '🧭',
      prompt: 'Help me set a goal: ask me what I want to achieve, then break it into milestones.',
    })
  }

  if (factCount === 0) {
    ideas.push({
      id: 'idea-memory',
      title: 'I can start remembering what matters to you',
      detail: 'Mention a preference, person, or project and I will keep it — or tell me to remember something now.',
      icon: 'memory',
      emoji: '🧠',
      prompt: 'Remember this about me: ',
    })
  }

  // Always include rich Muse starter ideas if list is short
  if (ideas.length < 4) {
    ideas.push({
      id: 'idea-daily-brief',
      title: 'Prepare my daily priorities & schedule artifact',
      detail: 'Synthesize open tasks, workspace health, and top 3 high-leverage actions for today.',
      icon: 'start',
      emoji: '☀️',
      prompt: 'Create a structured Daily Priorities Artifact for me: inspect my workspace status, active goals, and propose the 3 highest-leverage tasks for today.',
    })
  }

  return ideas.slice(0, 6)
}

interface ActivityItem {
  id: string
  title: string
  summary: string
  time: string
  conversationId?: string
  done?: boolean
}

function timeLabel(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  let h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${m} ${ampm}`
}

function dayKey(iso: string | null): string {
  if (!iso) return 'Older'
  const d = new Date(iso)
  const now = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = startOf(now) - startOf(d)
  if (diff <= 0) return 'Today'
  if (diff <= 86400000) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function MuseActivityPanel() {
  const user = useAuthStore((s) => s.user)
  const gatewayStatus = useChatStore((s) => s.gatewayStatus)
  const conversations = useChatStore((s) => s.conversations)
  const pendingApprovals = useChatStore((s) => s.pendingApprovals)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const createConversation = useChatStore((s) => s.createConversation)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const [tab, setTab] = useState<RightTab>('activity')
  const [goals, setGoals] = useState<MuseGoal[]>([])
  const [goalsLoading, setGoalsLoading] = useState(false)
  const [facts, setFacts] = useState<Array<{ id: string; entity: string; key: string; value: string }>>([])
  const [factsLoading, setFactsLoading] = useState(false)
  const [creatingGoal, setCreatingGoal] = useState(false)
  const [showGoalComposer, setShowGoalComposer] = useState(false)
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [newGoalDesc, setNewGoalDesc] = useState('')
  const [newGoalMilestones, setNewGoalMilestones] = useState('')
  const [busyMilestoneId, setBusyMilestoneId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<SkillSuggestionRow[]>([])
  const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null)
  const [reflecting, setReflecting] = useState(false)
  const [reflectMsg, setReflectMsg] = useState('')
  const [startingIdeaId, setStartingIdeaId] = useState<string | null>(null)
  const [agentName, setAgentName] = useState('Veda')
  const [crmPeople, setCrmPeople] = useState<CrmPersonRow[]>([])
  const [crmBusyId, setCrmBusyId] = useState<string | null>(null)
  const [journalEntries, setJournalEntries] = useState<JournalRow[]>([])
  const [undoingId, setUndoingId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const loadPersona = () => {
      try {
        const raw = window.localStorage.getItem('oa-muse-persona')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed?.name) setAgentName(parsed.name)
        }
      } catch {
        // ignore
      }
    }
    loadPersona()
    window.addEventListener('openagents:persona-changed', loadPersona)
    return () => window.removeEventListener('openagents:persona-changed', loadPersona)
  }, [])

  const connected = gatewayStatus === 'connected'
  const displayName = (user?.name ?? '').trim() || (user?.email ? user.email.split('@')[0] : 'You')
  const initial = (displayName[0] ?? 'Y').toUpperCase()

  const activityGroups = useMemo(() => {
    const list = Array.isArray(conversations) ? [...conversations] : []
    list.sort((a, b) => {
      const at = new Date(a.lastMessageAt ?? a.createdAt).getTime()
      const bt = new Date(b.lastMessageAt ?? b.createdAt).getTime()
      return bt - at
    })
    const items: ActivityItem[] = list.slice(0, 30).map((c) => ({
      id: c.id,
      title: (c.title ?? '').trim() || 'Untitled chat',
      summary: 'Conversation updated',
      time: timeLabel(c.lastMessageAt ?? c.createdAt),
      conversationId: c.id,
    }))
    const groups = new Map<string, ActivityItem[]>()
    list.slice(0, 30).forEach((c, i) => {
      const key = dayKey(c.lastMessageAt ?? c.createdAt)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(items[i]!)
    })
    return [...groups.entries()]
  }, [conversations])

  useEffect(() => {
    if (tab !== 'goals' && tab !== 'ideas') return
    let cancelled = false
    setGoalsLoading(true)
    sdk.goals
      .list()
      .then((g) => {
        if (!cancelled) setGoals(Array.isArray(g) ? g : [])
      })
      .catch(() => {
        if (!cancelled) setGoals([])
      })
      .finally(() => {
        if (!cancelled) setGoalsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab])

  useEffect(() => {
    if (tab !== 'memory' && tab !== 'ideas') return
    let cancelled = false
    setFactsLoading(true)
    sdk.memory
      .listFacts(undefined, 20)
      .then((f) => {
        if (!cancelled) setFacts(Array.isArray(f) ? f : [])
      })
      .catch(() => {
        if (!cancelled) setFacts([])
      })
      .finally(() => {
        if (!cancelled) setFactsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab])

  const ideas = useMemo(
    () =>
      buildIdeas({
        goals,
        conversations,
        pendingApprovals: pendingApprovals.length,
        factCount: facts.length,
      }),
    [goals, conversations, pendingApprovals.length, facts.length],
  )

  // Listen for custom events from the left rail or empty state
  useEffect(() => {
    const showIdeas = () => setTab('ideas')
    const showGoals = () => setTab('goals')
    const showActivity = () => setTab('activity')
    window.addEventListener('openagents:show-ideas', showIdeas)
    window.addEventListener('openagents:show-goals', showGoals)
    window.addEventListener('openagents:show-activity', showActivity)
    return () => {
      window.removeEventListener('openagents:show-ideas', showIdeas)
      window.removeEventListener('openagents:show-goals', showGoals)
      window.removeEventListener('openagents:show-activity', showActivity)
    }
  }, [])

  // Skill suggestions ride along with the Ideas tab.
  useEffect(() => {
    if (tab !== 'ideas') return
    let cancelled = false
    sdk.learning
      .listSuggestions('pending')
      .then((rows) => {
        if (!cancelled) setSuggestions(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })
    return () => {
      cancelled = true
    }
  }, [tab])

  async function handleApproveSuggestion(id: string) {
    setBusySuggestionId(id)
    try {
      await sdk.learning.approveSuggestion(id)
      setSuggestions((prev) => prev.filter((s) => s.id !== id))
    } catch {
      // keep the card visible; user can retry
    } finally {
      setBusySuggestionId(null)
    }
  }

  async function handleDismissSuggestion(id: string) {
    setBusySuggestionId(id)
    try {
      await sdk.learning.dismissSuggestion(id)
      setSuggestions((prev) => prev.filter((s) => s.id !== id))
    } catch {
      // ignore
    } finally {
      setBusySuggestionId(null)
    }
  }

  async function handleReflectNow() {
    if (reflecting) return
    setReflecting(true)
    setReflectMsg('')
    try {
      const result = await sdk.reflection.run()
      setReflectMsg(
        result.skipped
          ? `Skipped: ${result.reason ?? 'not enough recent conversation'}.`
          : `Reflected: ${result.facts} facts, ${result.events} events saved.`,
      )
      const rows = await sdk.memory.listFacts(undefined, 20).catch(() => [])
      setFacts(Array.isArray(rows) ? rows : [])
    } catch (err: any) {
      setReflectMsg(err?.message ?? 'Reflection failed.')
    } finally {
      setReflecting(false)
    }
  }

  function handleIdeaClick(idea: MuseIdea) {
    if (idea.conversationId) {
      void selectConversation(idea.conversationId)
      return
    }
    if (idea.icon === 'goal' || idea.id === 'idea-new-goal') setTab('goals')
    if (idea.id === 'idea-approvals') window.location.assign('/approvals')
    if (idea.icon === 'memory') setTab('memory')
  }

  async function handleStartIdea(idea: MuseIdea) {
    if (!idea.prompt || startingIdeaId) return
    setStartingIdeaId(idea.id)
    try {
      const conversationId = await createConversation()
      if (conversationId) await selectConversation(conversationId)
      await sendMessage(idea.prompt)
    } catch {
      // The chat store surfaces its own errors; keep the panel usable.
    } finally {
      setStartingIdeaId(null)
    }
  }

  async function handleCreateGoalSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (creatingGoal || !newGoalTitle.trim()) return
    setCreatingGoal(true)
    try {
      const milestones = newGoalMilestones
        .split(/\r?\n|,/)
        .map((m) => m.trim())
        .filter(Boolean)
      const created = await sdk.goals.create({
        title: newGoalTitle.trim(),
        description: newGoalDesc.trim() || `Tracked with ${agentName}`,
        milestones: milestones.length > 0 ? milestones : undefined,
      })
      setGoals((prev) => [created, ...prev])
      setNewGoalTitle('')
      setNewGoalDesc('')
      setNewGoalMilestones('')
      setShowGoalComposer(false)
    } catch {
      // Ignore; user can retry.
    } finally {
      setCreatingGoal(false)
    }
  }

  async function handleCreateFromTemplate(tpl: (typeof GOAL_TEMPLATES)[number]) {
    if (creatingGoal) return
    setCreatingGoal(true)
    try {
      const created = await sdk.goals.create({
        title: tpl.title,
        description: tpl.description,
        milestones: tpl.milestones,
      })
      setGoals((prev) => [created, ...prev])
      setShowGoalComposer(false)
    } catch {
      // Ignore
    } finally {
      setCreatingGoal(false)
    }
  }

  async function handleCompleteMilestone(goalId: string, milestoneId: string) {
    if (busyMilestoneId) return
    setBusyMilestoneId(milestoneId)
    try {
      const updated = await sdk.goals.completeMilestone(goalId, milestoneId)
      setGoals((prev) => prev.map((g) => (g.id === goalId ? updated : g)))
    } catch {
      // Ignore
    } finally {
      setBusyMilestoneId(null)
    }
  }

  async function handleDeleteGoal(goalId: string) {
    try {
      await sdk.goals.remove(goalId)
      setGoals((prev) => prev.filter((g) => g.id !== goalId))
    } catch {
      // Ignore
    }
  }

  useEffect(() => {
    if (tab !== 'ideas' && tab !== 'memory') return
    let cancelled = false
    sdk.life
      .crmRoster()
      .then((rows) => {
        if (!cancelled) setCrmPeople(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setCrmPeople([])
      })
    return () => {
      cancelled = true
    }
  }, [tab])

  useEffect(() => {
    if (tab !== 'activity' && tab !== 'safety') return
    let cancelled = false
    sdk.autonomy
      .listJournal(15)
      .then((rows) => {
        if (!cancelled) setJournalEntries(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setJournalEntries([])
      })
    return () => {
      cancelled = true
    }
  }, [tab])

  async function handleCrmFollowUp(person: CrmPersonRow) {
    if (crmBusyId) return
    setCrmBusyId(person.id)
    try {
      const res = await sdk.life.crmNudge(person.id).catch(() => ({
        draft: `Hi ${person.name}, hope you're having a great week! Wanted to follow up on our last conversation and see how things are progressing.`,
      }))
      const conversationId = await createConversation()
      if (conversationId) await selectConversation(conversationId)
      await sendMessage(
        `Help me personalize and send this follow-up message to ${person.name}:\n\n"${res.draft}"`,
      )
    } finally {
      setCrmBusyId(null)
    }
  }

  async function handleUndoJournal(entry: JournalRow) {
    if (undoingId) return
    setUndoingId(entry.id)
    try {
      await sdk.autonomy.undoEntry(entry.id).catch(() => undefined)
      setJournalEntries((prev) =>
        prev.map((j) => (j.id === entry.id ? { ...j, undoneAt: new Date().toISOString() } : j)),
      )
    } finally {
      setUndoingId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="flex items-start justify-between px-4 pt-3">
        <div className="mx-auto flex flex-col items-center pt-2 text-center">
          <div className="oa-avatar-ring-gradient">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100 text-xl font-semibold text-amber-800">
              {initial}
            </div>
          </div>
          <p className="mt-2.5 text-[15px] font-semibold text-slate-900 dark:text-slate-100">{displayName}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">
            <span className={clsx('oa-status-dot', !connected && 'bg-slate-300')} style={connected ? undefined : { background: '#cbd5e1' }} />
            {connected ? `Synced with ${agentName}` : 'Offline'}
          </p>
        </div>
      </div>

      <div className="oa-segment mx-4 mt-4 flex items-center justify-between px-1.5 py-1">
        <TabButton active={tab === 'activity'} onClick={() => setTab('activity')} label="Activity">
          <ListOrdered size={14} />
        </TabButton>
        <TabButton active={tab === 'goals'} onClick={() => setTab('goals')} label="Goals">
          <ShieldCheck size={14} />
        </TabButton>
        <TabButton active={tab === 'ideas'} onClick={() => setTab('ideas')} label="Ideas">
          <Lightbulb size={14} />
        </TabButton>
        <TabButton active={tab === 'memory'} onClick={() => setTab('memory')} label="Memory">
          <History size={14} />
        </TabButton>
        <TabButton active={tab === 'safety'} onClick={() => setTab('safety')} label="Safety & Permissions">
          <Fingerprint size={14} />
        </TabButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {tab === 'activity' && (
          <div className="space-y-4">
            {/* Time-Travel Action Journal (1-Click Undo) */}
            {journalEntries.length > 0 && (
              <div className="rounded-2xl border border-rose-200/70 bg-rose-50/40 p-3 dark:border-rose-500/20 dark:bg-rose-500/5">
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-slate-900 dark:text-slate-100">
                  <RotateCcw size={13} className="text-rose-500" /> Time-Travel Undo
                </p>
                <div className="mt-2 space-y-1.5">
                  {journalEntries.slice(0, 4).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white px-2.5 py-1.5 text-[11px] dark:border-[#2d3347] dark:bg-[#1a1f2e]"
                    >
                      <span className="truncate font-mono text-slate-700 dark:text-slate-200">
                        {entry.tool}
                      </span>
                      {entry.undoneAt ? (
                        <span className="text-[10px] font-semibold text-amber-600">Rewound</span>
                      ) : (
                        <button
                          type="button"
                          disabled={undoingId === entry.id}
                          onClick={() => void handleUndoJournal(entry)}
                          className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600 hover:bg-rose-500/20 dark:text-rose-300"
                        >
                          {undoingId === entry.id ? '…' : '⏪ Undo'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activityGroups.length === 0 && (
              <p className="py-6 text-center text-[13px] text-slate-400">No activity yet.</p>
            )}
            {activityGroups.map(([day, items]) => (
              <div key={day}>
                <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{day}</p>
                <div className="mt-2 space-y-2">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => item.conversationId && void selectConversation(item.conversationId)}
                      className="oa-hover-card flex w-full gap-2.5 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-left dark:border-[#2d3347] dark:bg-[#1a1f2e]"
                    >
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm dark:bg-[#141824]">
                        {item.done ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">{item.title}</span>
                        <span className="block truncate text-[12px] text-slate-500 dark:text-slate-400">{item.summary}</span>
                        {item.time && <span className="mt-0.5 block text-[11px] text-slate-400">{item.time}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'goals' && (
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                <Target size={14} className="text-rose-500" /> Goals & Milestones
              </p>
              <button
                type="button"
                onClick={() => setShowGoalComposer((s) => !s)}
                className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
              >
                <Plus size={12} /> {showGoalComposer ? 'Close' : 'New Goal'}
              </button>
            </div>

            {showGoalComposer && (
              <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-[#2d3347] dark:bg-[#1a1f2e]">
                <form onSubmit={(e) => void handleCreateGoalSubmit(e)} className="space-y-2">
                  <input
                    type="text"
                    required
                    value={newGoalTitle}
                    onChange={(e) => setNewGoalTitle(e.target.value)}
                    placeholder="What goal should we track?"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-900 outline-none focus:border-rose-500 dark:border-[#2d3347] dark:bg-[#141824] dark:text-white"
                  />
                  <input
                    type="text"
                    value={newGoalDesc}
                    onChange={(e) => setNewGoalDesc(e.target.value)}
                    placeholder="Why it matters (optional)..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-rose-500 dark:border-[#2d3347] dark:bg-[#141824] dark:text-slate-200"
                  />
                  <textarea
                    rows={2}
                    value={newGoalMilestones}
                    onChange={(e) => setNewGoalMilestones(e.target.value)}
                    placeholder="Milestones (comma or newline separated)..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-rose-500 dark:border-[#2d3347] dark:bg-[#141824] dark:text-slate-200"
                  />
                  <button
                    type="submit"
                    disabled={creatingGoal || !newGoalTitle.trim()}
                    className="w-full rounded-full bg-gradient-to-r from-rose-500 to-orange-500 py-1.5 text-[11px] font-semibold text-white shadow-sm disabled:opacity-50"
                  >
                    {creatingGoal ? 'Saving Goal…' : 'Create Goal'}
                  </button>
                </form>

                <div className="mt-2.5 border-t border-slate-100 pt-2 dark:border-[#2d3347]">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Or 1-Click Goal Templates
                  </p>
                  <div className="space-y-1">
                    {GOAL_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.title}
                        type="button"
                        disabled={creatingGoal}
                        onClick={() => void handleCreateFromTemplate(tpl)}
                        className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-left text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:bg-[#141824] dark:text-slate-300"
                      >
                        <span className="truncate">{tpl.title}</span>
                        <span className="text-[10px] text-rose-500 font-semibold">+ Add</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {goalsLoading ? (
              <p className="flex items-center gap-2 py-6 text-[13px] text-slate-400">
                <Loader2 size={14} className="animate-spin" /> Loading goals…
              </p>
            ) : goals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center dark:border-[#2d3347]">
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  No active goals yet. Add a goal or tap a template below so {agentName} can proactively help you reach it:
                </p>
                <div className="mt-3 space-y-1.5">
                  {GOAL_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.title}
                      type="button"
                      disabled={creatingGoal}
                      onClick={() => void handleCreateFromTemplate(tpl)}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-left text-[11px] font-semibold text-slate-800 shadow-sm hover:border-rose-300 dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-slate-100"
                    >
                      <span className="truncate">{tpl.title}</span>
                      <span className="text-rose-500">+ Track</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {goals.map((g) => {
                  const nextMilestone = g.milestones?.find((m) => !m.completed)
                  return (
                    <div
                      key={g.id}
                      className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm dark:border-[#2d3347] dark:bg-[#1a1f2e]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                          {g.title}
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleDeleteGoal(g.id)}
                          title="Remove goal"
                          className="text-slate-300 hover:text-rose-500 transition"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      {g.description && (
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {g.description}
                        </p>
                      )}
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-[#141824]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all"
                          style={{ width: `${Math.max(0, Math.min(100, g.progress ?? 0))}%` }}
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                        <span>{g.status}</span>
                        <span className="font-semibold text-slate-600 dark:text-slate-300">
                          {g.progress}% complete
                        </span>
                      </div>

                      {Array.isArray(g.milestones) && g.milestones.length > 0 && (
                        <div className="mt-2.5 space-y-1 border-t border-slate-100 pt-2 dark:border-[#2d3347]">
                          {g.milestones.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              disabled={m.completed || busyMilestoneId === m.id}
                              onClick={() => void handleCompleteMilestone(g.id, m.id)}
                              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[11px] transition hover:bg-slate-50 dark:hover:bg-[#141824]"
                            >
                              {m.completed ? (
                                <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />
                              ) : (
                                <Circle size={13} className="shrink-0 text-slate-300" />
                              )}
                              <span
                                className={clsx(
                                  'truncate',
                                  m.completed
                                    ? 'line-through text-slate-400'
                                    : 'text-slate-700 dark:text-slate-200',
                                )}
                              >
                                {m.title}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {nextMilestone && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleStartIdea({
                              id: `goal-run-${g.id}`,
                              title: g.title,
                              detail: nextMilestone.title,
                              icon: 'goal',
                              emoji: '🎯',
                              prompt: `Help me advance my goal "${g.title}" by completing this milestone right now: ${nextMilestone.title}`,
                            })
                          }
                          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-slate-900 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                        >
                          <Play size={10} /> Work on next milestone with {agentName}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'ideas' && (
          <div>
            <p className="mb-2 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
              Ideas from {agentName}
            </p>
            {goalsLoading && ideas.length === 0 ? (
              <p className="flex items-center gap-2 py-6 text-[13px] text-slate-400">
                <Loader2 size={14} className="animate-spin" /> Thinking…
              </p>
            ) : (
              <div className="space-y-2">
                {ideas.map((idea) => (
                  <div
                    key={idea.id}
                    className="oa-hover-card flex w-full items-start gap-2.5 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-left dark:border-[#2d3347] dark:bg-[#1a1f2e]"
                  >
                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-50 text-[14px] dark:bg-[#141824]">
                      {idea.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-100">{idea.title}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-slate-500 dark:text-slate-400">{idea.detail}</span>
                      {idea.prompt ? (
                        <button
                          type="button"
                          onClick={() => void handleStartIdea(idea)}
                          disabled={startingIdeaId !== null}
                          className="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                        >
                          {startingIdeaId === idea.id ? 'Starting…' : 'Start'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleIdeaClick(idea)}
                          className="mt-2 text-[11px] font-semibold text-[var(--accent-strong)] hover:underline"
                        >
                          Open →
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[13px] font-semibold text-slate-900 dark:text-slate-100">Skill suggestions</p>
                <div className="space-y-2">
                  {suggestions.map((s) => (
                    <div key={s.id} className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2">
                      <p className="text-[13px] font-medium text-slate-800">{s.name}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{s.description}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleApproveSuggestion(s.id)}
                          disabled={busySuggestionId === s.id}
                          className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busySuggestionId === s.id ? 'Saving…' : 'Save as skill'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDismissSuggestion(s.id)}
                          disabled={busySuggestionId === s.id}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Feature #3: Personal Relationship & Follow-Up Radar (Mini-CRM) */}
            <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-3 dark:border-[#2d3347] dark:bg-[#1a1f2e]">
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-slate-900 dark:text-slate-100">
                <Users size={13} className="text-rose-500" /> People & Follow-Up Radar
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Contacts & collaborators remembered by {agentName} across your chats.
              </p>
              <div className="mt-2 space-y-1.5">
                {(crmPeople.length > 0
                  ? crmPeople.slice(0, 4)
                  : [
                      {
                        id: 'crm-demo-1',
                        name: 'Alex Rivera (Product Lead)',
                        summary: 'Discussed Q4 API roadmap & milestone review',
                        mentions: 4,
                        lastSeenAt: null,
                        daysSince: 6,
                        bucket: 'warm' as const,
                      },
                      {
                        id: 'crm-demo-2',
                        name: 'Sam Chen (Design Partner)',
                        summary: 'Shared feedback on 3-pane workspace layout',
                        mentions: 3,
                        lastSeenAt: null,
                        daysSince: 11,
                        bucket: 'stale' as const,
                      },
                    ]
                ).map((person) => (
                  <div
                    key={person.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-2 text-[11px] dark:border-[#2d3347] dark:bg-[#141824]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-800 dark:text-slate-100">
                        {person.name}
                      </p>
                      <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                        {person.daysSince != null ? `${person.daysSince}d ago · ` : ''}
                        {person.summary}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={crmBusyId === person.id}
                      onClick={() => void handleCrmFollowUp(person)}
                      className="shrink-0 rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                    >
                      {crmBusyId === person.id ? 'Drafting…' : 'Nudge'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'memory' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Memory & People</p>
              <button
                type="button"
                onClick={() => void handleReflectNow()}
                disabled={reflecting}
                title="Run memory reflection over the last 24h of conversations"
                className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {reflecting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {reflecting ? 'Reflecting…' : 'Reflect now'}
              </button>
            </div>
            {reflectMsg && <p className="mb-2 text-[11px] text-slate-500">{reflectMsg}</p>}
            {factsLoading ? (
              <p className="flex items-center gap-2 py-6 text-[13px] text-slate-400">
                <Loader2 size={14} className="animate-spin" /> Loading memory…
              </p>
            ) : facts.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-slate-400">Nothing saved to memory yet.</p>
            ) : (
              <div className="space-y-2">
                {facts.map((f) => (
                  <div key={f.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-[#2d3347] dark:bg-[#1a1f2e]">
                    <p className="truncate text-[12px] font-medium text-slate-700 dark:text-slate-200">
                      {f.entity} · {f.key}
                    </p>
                    <p className="mt-0.5 line-clamp-3 text-[12px] text-slate-500 dark:text-slate-400">{f.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'safety' && (
          <div className="space-y-3">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
              <Lock size={14} className="text-emerald-600" /> Safety & Deterministic Control
            </p>
            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-3 text-[12px] text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              <p className="font-semibold">✓ Human-in-the-Loop Approval Cards</p>
              <p className="mt-1 text-[11px] opacity-80">
                Sensitive actions pause deterministically with Allow once, Always allow, or Deny controls.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-3 text-[12px] dark:border-[#2d3347] dark:bg-[#1a1f2e]">
              <div className="flex items-center justify-between font-medium text-slate-800 dark:text-slate-100">
                <span>Pending Approvals</span>
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                  {pendingApprovals.length}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                100% local PostgreSQL memory & isolated Windows shell sandbox.
              </p>
              <a
                href="/approvals"
                className="mt-2.5 inline-block text-[11px] font-semibold text-rose-600 hover:underline dark:text-rose-400"
              >
                Open Approvals & Rules →
              </a>
            </div>

            {/* Feature #9: Time-Travel Undo in Safety Tab */}
            <div className="rounded-2xl border border-slate-100 bg-white p-3 text-[12px] dark:border-[#2d3347] dark:bg-[#1a1f2e]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
                  <RotateCcw size={13} className="text-rose-500" /> Time-Travel Undo Journal
                </span>
                <span className="text-[10px] text-slate-400">{journalEntries.length} logged</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Rewind any reversible file, memory, or tool action with 1 click.
              </p>
              {journalEntries.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {journalEntries.slice(0, 5).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[11px] dark:border-[#2d3347] dark:bg-[#141824]"
                    >
                      <span className="truncate font-mono text-slate-700 dark:text-slate-200">
                        {entry.tool}
                      </span>
                      {entry.undoneAt ? (
                        <span className="text-[10px] font-semibold text-amber-600">Rewound</span>
                      ) : (
                        <button
                          type="button"
                          disabled={undoingId === entry.id}
                          onClick={() => void handleUndoJournal(entry)}
                          className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600 hover:bg-rose-500/20 dark:text-rose-300"
                        >
                          {undoingId === entry.id ? 'Rewinding…' : '⏪ Undo'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={clsx(
        'oa-segment-item inline-flex h-9 w-9 items-center justify-center transition',
        active ? 'oa-segment-item--active' : 'text-slate-400 hover:text-slate-600',
      )}
    >
      {children}
    </button>
  )
}
