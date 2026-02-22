'use client'

import { sdk } from '@/stores/auth'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { AuditLog, Notification, SessionRow, User, UserSettings } from '@openagents/shared'
import {
  Terminal, ShieldAlert, Zap, Bell, RefreshCw, Brain, Activity,
  TrendingUp, Clock, CheckCircle2, AlertCircle,
} from 'lucide-react'

interface OverviewState {
  profile: User | null
  settings: UserSettings | null
  sessions: SessionRow[]
  pendingApprovals: number
  notifications: Notification[]
  auditLogs: AuditLog[]
  memoryEntries: number
  memoryFiles: number
  personaProfile: string | null
  activeSkills: number
  autonomyWithinWindow: boolean | null
  autonomyReason: string | null
  trustScore: number | null
  lastHeartbeatAt: string | null
}
type FeatureTone = 'slate' | 'emerald' | 'amber' | 'rose' | 'indigo'
interface FeatureCardModel {
  title: string
  description: string
  href: string
  metric: string
  detail: string
  icon: React.ElementType
  tone: FeatureTone
}

function formatNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return new Intl.NumberFormat().format(value)
}

function timeAgo(epochMs: number | null) {
  if (!epochMs) return 'n/a'
  const deltaMs = Date.now() - epochMs
  const deltaMin = Math.max(0, Math.floor(deltaMs / 60000))
  if (deltaMin < 1) return 'just now'
  if (deltaMin < 60) return `${deltaMin}m ago`
  const deltaHours = Math.floor(deltaMin / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`
  return `${Math.floor(deltaHours / 24)}d ago`
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  agent_run: Zap,
  approve: CheckCircle2,
  deny: AlertCircle,
}

function StatCard({
  label, value, sub, gradient, icon: Icon,
}: {
  label: string
  value: string
  sub: string
  gradient: string
  icon: React.ElementType
}) {
  return (
    <article className={`relative overflow-hidden rounded-2xl p-5 ${gradient} shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">{label}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
          <p className="mt-1 text-[11px] text-white/60">{sub}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
          <Icon size={18} className="text-white" />
        </div>
      </div>
      {/* Decorative blob */}
      <div className="pointer-events-none absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-white/10" />
    </article>
  )
}

function FeatureCard({
  title,
  description,
  href,
  metric,
  detail,
  icon: Icon,
  tone = 'slate',
}: {
  title: string
  description: string
  href: string
  metric: string
  detail: string
  icon: React.ElementType
  tone?: FeatureTone
}) {
  const toneClass = {
    slate: 'border-slate-200 bg-slate-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    amber: 'border-amber-200 bg-amber-50',
    rose: 'border-rose-200 bg-rose-50',
    indigo: 'border-indigo-200 bg-indigo-50',
  }[tone]

  return (
    <Link href={href} className={`block rounded-xl border p-4 transition hover:shadow-sm ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-slate-800">{title}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 text-slate-700">
          <Icon size={15} />
        </div>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-900">{metric}</p>
      <p className="mt-0.5 text-[11px] text-slate-600">{detail}</p>
    </Link>
  )
}

export default function OverviewPage() {
  const [state, setState] = useState<OverviewState>({
    profile: null,
    settings: null,
    sessions: [],
    pendingApprovals: 0,
    notifications: [],
    auditLogs: [],
    memoryEntries: 0,
    memoryFiles: 0,
    personaProfile: null,
    activeSkills: 0,
    autonomyWithinWindow: null,
    autonomyReason: null,
    trustScore: null,
    lastHeartbeatAt: null,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadOverview() {
    setIsLoading(true)
    setError('')
    try {
      const [profile, settings, sessionsResult, pendingApprovals, notifications, auditLogs] = await Promise.all([
        sdk.users.getProfile(),
        sdk.users.getSettings(),
        sdk.sessions.list({ limit: 200, includeGlobal: false, includeUnknown: false }),
        sdk.approvals.list('pending'),
        sdk.notifications.list(),
        sdk.audit.list(),
      ])

      const extra = await Promise.allSettled([
        sdk.memory.list(),
        sdk.memory.listFiles(),
        sdk.nanobot.health(),
        sdk.nanobot.getAutonomyStatus(),
        sdk.nanobot.trust(),
        sdk.nanobot.listEvents(60),
      ])

      const memoryEntries = extra[0].status === 'fulfilled' ? extra[0].value.length : 0
      const memoryFiles = extra[1].status === 'fulfilled' ? extra[1].value.length : 0
      const nanobotHealth = extra[2].status === 'fulfilled' ? extra[2].value : null
      const autonomyStatus = extra[3].status === 'fulfilled' ? extra[3].value : null
      const trustSnapshot = extra[4].status === 'fulfilled' ? extra[4].value : null
      const nanobotEvents = extra[5].status === 'fulfilled' ? extra[5].value : []
      const lastHeartbeatAt = nanobotEvents.find((event) => event.name === 'heartbeat.tick')?.createdAt ?? null

      setState({
        profile, settings,
        sessions: sessionsResult.sessions.filter((s) => s.kind === 'direct'),
        pendingApprovals: pendingApprovals.length,
        notifications,
        auditLogs,
        memoryEntries,
        memoryFiles,
        personaProfile: nanobotHealth?.personality.profileId ?? null,
        activeSkills: nanobotHealth?.activeSkills.length ?? 0,
        autonomyWithinWindow: autonomyStatus?.withinWindow ?? null,
        autonomyReason: autonomyStatus?.reason ?? null,
        trustScore: trustSnapshot?.overallScore ?? null,
        lastHeartbeatAt,
      })
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load overview data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void loadOverview() }, [])

  const unreadNotifications = useMemo(
    () => state.notifications.filter((n) => !n.read).length,
    [state.notifications],
  )
  const totalTokens = useMemo(
    () => state.sessions.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0),
    [state.sessions],
  )
  const sessionsUpdatedToday = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    return state.sessions.filter((s) => (s.updatedAt ?? 0) >= start.getTime()).length
  }, [state.sessions])
  const recentSessions = useMemo(
    () => [...state.sessions].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, 6),
    [state.sessions],
  )
  const recentAudit = useMemo(() => state.auditLogs.slice(0, 8), [state.auditLogs])
  const thinkingSessions = useMemo(
    () => state.sessions.filter((session) => (session.thinkingLevel ?? '').trim().length > 0).length,
    [state.sessions],
  )
  const featureCards = useMemo<FeatureCardModel[]>(
    () => {
      const heartbeatTone: FeatureTone = state.autonomyWithinWindow ? 'emerald' : 'rose'
      return [
      {
        title: 'Memory / Brain',
        description: 'Persistent context and editable memory documents.',
        href: '/memory',
        metric: `${formatNumber(state.memoryEntries)} entries`,
        detail: `${formatNumber(state.memoryFiles)} memory files`,
        icon: Brain,
        tone: 'indigo' as const,
      },
      {
        title: 'Persona',
        description: 'Profile and boundary controls for runtime behavior.',
        href: '/agent/nanobot',
        metric: state.personaProfile ? `Profile: ${state.personaProfile}` : 'Profile: n/a',
        detail: `${formatNumber(state.activeSkills)} active skills`,
        icon: Activity,
        tone: 'emerald' as const,
      },
      {
        title: 'Thinking',
        description: 'Session-level thinking control and execution tuning.',
        href: '/sessions',
        metric: `${formatNumber(thinkingSessions)} sessions with thinking`,
        detail: `Model: ${state.settings?.preferredModel ?? 'default'}`,
        icon: Terminal,
        tone: 'amber' as const,
      },
      {
        title: 'Agentic Heartbeat',
        description: 'Liveness ticks, autonomy windows, and trust signals.',
        href: '/agent/nanobot',
        metric: state.lastHeartbeatAt ? `Last heartbeat ${timeAgo(new Date(state.lastHeartbeatAt).getTime())}` : 'No heartbeat yet',
        detail: state.autonomyWithinWindow == null
          ? 'Autonomy status unavailable'
          : state.autonomyWithinWindow
            ? 'Inside autonomy window'
            : `Outside autonomy window (${state.autonomyReason ?? 'manual approvals'})`,
        icon: Zap,
        tone: heartbeatTone,
      },
      {
        title: 'Trust Score',
        description: 'Cross-signal score for autonomy, memory, safety, and cost.',
        href: '/agent/trust',
        metric: state.trustScore == null ? 'Score unavailable' : `${state.trustScore}/100`,
        detail: 'Open trust dashboard',
        icon: ShieldAlert,
        tone: 'slate' as const,
      },
      {
        title: 'Workflows / Handoffs / Lineage',
        description: 'Operational automation, escalation, and traceability.',
        href: '/control/workflows',
        metric: 'Control-plane automation',
        detail: 'Open workflow control center',
        icon: CheckCircle2,
        tone: 'slate' as const,
      },
      ]
    },
    [
      state.memoryEntries,
      state.memoryFiles,
      state.personaProfile,
      state.activeSkills,
      state.settings?.preferredModel,
      state.lastHeartbeatAt,
      state.autonomyWithinWindow,
      state.autonomyReason,
      state.trustScore,
      thinkingSessions,
    ],
  )

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Overview</h1>
          <p className="mt-0.5 text-sm text-slate-500">System snapshot — sessions, approvals, and activity.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadOverview()}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {/* Stat cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active Sessions"
          value={formatNumber(state.sessions.length)}
          sub={`${sessionsUpdatedToday} updated today`}
          gradient="bg-gradient-to-br from-indigo-500 to-violet-600"
          icon={Terminal}
        />
        <StatCard
          label="Pending Approvals"
          value={formatNumber(state.pendingApprovals)}
          sub="Awaiting user action"
          gradient={state.pendingApprovals > 0
            ? 'bg-gradient-to-br from-amber-500 to-orange-500'
            : 'bg-gradient-to-br from-slate-500 to-slate-600'}
          icon={ShieldAlert}
        />
        <StatCard
          label="Token Volume"
          value={formatNumber(totalTokens)}
          sub="Across all conversations"
          gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
          icon={TrendingUp}
        />
        <StatCard
          label="Unread Alerts"
          value={formatNumber(unreadNotifications)}
          sub={state.profile?.email ?? 'Unknown user'}
          gradient={unreadNotifications > 0
            ? 'bg-gradient-to-br from-rose-500 to-pink-600'
            : 'bg-gradient-to-br from-slate-500 to-slate-600'}
          icon={Bell}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Core Platform Features</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Live feature modules for memory, persona, thinking, and agentic heartbeat.</p>
          </div>
          <Link
            href="/agent/nanobot"
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Open Runtime
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {featureCards.map((card) => (
            <FeatureCard
              key={card.title}
              title={card.title}
              description={card.description}
              href={card.href}
              metric={card.metric}
              detail={card.detail}
              icon={card.icon}
              tone={card.tone}
            />
          ))}
        </div>
      </section>

      {/* Tables */}
      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        {/* Recent sessions */}
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Recent Sessions</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {state.settings?.preferredModel ?? 'default model'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Key</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Label</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Updated</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentSessions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-400">
                      No sessions yet.
                    </td>
                  </tr>
                ) : recentSessions.map((session) => (
                  <tr key={session.id} className="group transition hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-mono text-[11px] text-rose-600">{session.key}</td>
                    <td className="px-5 py-3 text-slate-700">{session.label ?? session.displayName ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock size={10} className="shrink-0" />
                        {timeAgo(session.updatedAt)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-slate-700">
                      {formatNumber(session.totalTokens ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        {/* Audit activity */}
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Audit Activity</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">Latest user-scoped events</p>
          </div>
          <div className="divide-y divide-slate-50">
            {recentAudit.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No audit events yet.</p>
            ) : recentAudit.map((entry) => {
              const Icon = ACTION_ICONS[entry.action] ?? Zap
              return (
                <div key={entry.id} className="flex items-start gap-3 px-5 py-3 transition hover:bg-slate-50/60">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <Icon size={11} className="text-slate-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-slate-800">{entry.action}</p>
                    <p className="truncate text-[10px] text-slate-400">{entry.resourceType}:{entry.resourceId}</p>
                  </div>
                  <time className="shrink-0 text-[10px] text-slate-400">
                    {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </div>
              )
            })}
          </div>
        </article>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
