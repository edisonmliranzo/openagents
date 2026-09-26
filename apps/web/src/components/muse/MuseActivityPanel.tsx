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
} from 'lucide-react'
import { sdk, useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import type { MuseGoal, SkillSuggestionRow } from '@openagents/sdk'

type RightTab = 'activity' | 'goals' | 'ideas' | 'memory'

export interface MuseIdea {
  id: string
  title: string
  detail: string
  icon: 'goal' | 'chat' | 'approval' | 'memory' | 'start'
  conversationId?: string
}

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
      title: `${pendingApprovals} approval${pendingApprovals === 1 ? '' : 's'} waiting`,
      detail: 'Review pending actions so your agent can continue.',
      icon: 'approval',
    })
  }

  for (const goal of goals.filter((g) => g.status === 'active').slice(0, 3)) {
    const next = goal.milestones.find((m) => !m.completed)
    ideas.push({
      id: `idea-goal-${goal.id}`,
      title: `Advance "${goal.title}"`,
      detail: next ? `Next milestone: ${next.title} (${goal.progress}% done)` : `Progress is ${goal.progress}% — ask your agent for the next step.`,
      icon: 'goal',
    })
  }

  const stale = conversations.find((c) => {
    const ts = new Date(c.lastMessageAt ?? c.createdAt).getTime()
    return Number.isFinite(ts) && now - ts > 3 * DAY
  })
  if (stale) {
    ideas.push({
      id: `idea-stale-${stale.id}`,
      title: `Resume "${stale.title ?? 'Untitled chat'}"`,
      detail: 'Idle for a few days — pick it back up.',
      icon: 'chat',
      conversationId: stale.id,
    })
  }

  if (goals.filter((g) => g.status === 'active').length === 0) {
    ideas.push({
      id: 'idea-new-goal',
      title: 'Set a long-term goal',
      detail: 'Give your agent a goal and it will track milestones for you.',
      icon: 'start',
    })
  }

  if (factCount === 0) {
    ideas.push({
      id: 'idea-memory',
      title: 'Teach your agent about you',
      detail: 'Mention preferences or people and OpenAgents saves them to memory.',
      icon: 'memory',
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
  const [tab, setTab] = useState<RightTab>('activity')
  const [goals, setGoals] = useState<MuseGoal[]>([])
  const [goalsLoading, setGoalsLoading] = useState(false)
  const [facts, setFacts] = useState<Array<{ id: string; entity: string; key: string; value: string }>>([])
  const [factsLoading, setFactsLoading] = useState(false)
  const [creatingGoal, setCreatingGoal] = useState(false)
  const [suggestions, setSuggestions] = useState<SkillSuggestionRow[]>([])
  const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null)
  const [reflecting, setReflecting] = useState(false)
  const [reflectMsg, setReflectMsg] = useState('')

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

  // The left rail's Ideas button opens this tab.
  useEffect(() => {
    const handler = () => setTab('ideas')
    window.addEventListener('openagents:show-ideas', handler)
    return () => window.removeEventListener('openagents:show-ideas', handler)
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
      // refresh facts list so new memories show immediately
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

  async function handleCreateGoal() {
    if (creatingGoal) return
    setCreatingGoal(true)
    try {
      const title = `Goal ${new Date().toLocaleString()}`
      const created = await sdk.goals.create({ title, description: 'Created from Muse panel' })
      setGoals((prev) => [created, ...prev])
    } catch {
      // Ignore; user can retry.
    } finally {
      setCreatingGoal(false)
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
          <p className="mt-2.5 text-[15px] font-semibold text-slate-900">{displayName}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500">
            <span className={clsx('oa-status-dot', !connected && 'bg-slate-300')} style={connected ? undefined : { background: '#cbd5e1' }} />
            {connected ? 'Connected' : 'Offline'}
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
        <button type="button" title="Security" aria-label="Security" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-white">
          <Fingerprint size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {tab === 'activity' && (
          <div className="space-y-4">
            {activityGroups.length === 0 && (
              <p className="py-6 text-center text-[13px] text-slate-400">No activity yet.</p>
            )}
            {activityGroups.map(([day, items]) => (
              <div key={day}>
                <p className="text-[13px] font-semibold text-slate-900">{day}</p>
                <div className="mt-2 space-y-2">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => item.conversationId && void selectConversation(item.conversationId)}
                      className="oa-hover-card flex w-full gap-2.5 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-left"
                    >
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
                        {item.done ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-slate-800">{item.title}</span>
                        <span className="block truncate text-[12px] text-slate-500">{item.summary}</span>
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
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
                <Target size={14} className="text-slate-400" /> Goals
              </p>
              <button
                type="button"
                onClick={() => void handleCreateGoal()}
                disabled={creatingGoal}
                className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                <Plus size={12} /> {creatingGoal ? 'Adding…' : 'New'}
              </button>
            </div>
            {goalsLoading ? (
              <p className="flex items-center gap-2 py-6 text-[13px] text-slate-400">
                <Loader2 size={14} className="animate-spin" /> Loading goals…
              </p>
            ) : goals.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-slate-400">No goals yet. Create one to track progress.</p>
            ) : (
              <div className="space-y-2">
                {goals.map((g) => (
                  <div key={g.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <p className="truncate text-[13px] font-medium text-slate-800">{g.title}</p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.max(0, Math.min(100, g.progress ?? 0))}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {g.status} · {g.progress}%{g.dueDate ? ` · due ${g.dueDate}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'ideas' && (
          <div>
            <p className="mb-2 text-[13px] font-semibold text-slate-900">Ideas for you</p>
            {goalsLoading && ideas.length === 0 ? (
              <p className="flex items-center gap-2 py-6 text-[13px] text-slate-400">
                <Loader2 size={14} className="animate-spin" /> Thinking…
              </p>
            ) : ideas.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-slate-400">
                You&apos;re all caught up. Set a goal or start a chat and ideas will appear here.
              </p>
            ) : (
              <div className="space-y-2">
                {ideas.map((idea) => (
                  <button
                    key={idea.id}
                    type="button"
                    onClick={() => handleIdeaClick(idea)}
                    className="flex w-full items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2 text-left transition hover:border-amber-200 hover:bg-amber-50"
                  >
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-amber-500 shadow-sm">
                      <Lightbulb size={13} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-slate-800">{idea.title}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-slate-500">{idea.detail}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[13px] font-semibold text-slate-900">Skill suggestions</p>
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
          </div>
        )}

        {tab === 'memory' && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-slate-900">Memory</p>
              <button
                type="button"
                onClick={() => void handleReflectNow()}
                disabled={reflecting}
                title="Run memory reflection over the last 24h of conversations"
                className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-slate-700 disabled:opacity-50"
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
              <p className="py-6 text-center text-[13px] text-slate-400">Nothing saved to memory yet.</p>
            ) : (
              <div className="space-y-2">
                {facts.map((f) => (
                  <div key={f.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <p className="truncate text-[12px] font-medium text-slate-700">
                      {f.entity} · {f.key}
                    </p>
                    <p className="mt-0.5 line-clamp-3 text-[12px] text-slate-500">{f.value}</p>
                  </div>
                ))}
              </div>
            )}
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
