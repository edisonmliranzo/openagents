'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sdk } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { useUIStore } from '@/stores/ui'
import type { RosterEntryRow, SpecialistAgentRow } from '@openagents/sdk'
import {
  ArrowRight,
  Bot,
  Code2,
  Cpu,
  Loader2,
  Play,
  Plus,
  Power,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Users,
  Workflow,
  Zap,
} from 'lucide-react'
import clsx from 'clsx'

const ROLES = ['researcher', 'coder', 'writer', 'analyst', 'ops', 'custom'] as const

const ROLE_META: Record<
  string,
  {
    label: string
    gradient: string
    badgeCls: string
    tools: string[]
  }
> = {
  coder: {
    label: 'Software Architect & Coder',
    gradient: 'from-rose-500 to-orange-500',
    badgeCls: 'border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-300',
    tools: ['shell_execute', 'code_execute', 'github_create_pr', 'skill_save'],
  },
  researcher: {
    label: 'Deep Web & Tech Researcher',
    gradient: 'from-cyan-500 to-blue-600',
    badgeCls: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
    tools: ['deep_research', 'web_search', 'web_fetch', 'notes_create'],
  },
  ops: {
    label: 'Windows Systems & DevOps Operator',
    gradient: 'from-emerald-500 to-teal-600',
    badgeCls: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    tools: ['shell_session_run', 'proactive_uptime_monitor', 'browser_screenshot'],
  },
  analyst: {
    label: 'Strategic Planner & Analyst',
    gradient: 'from-amber-500 to-rose-500',
    badgeCls: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300',
    tools: ['delegate_to_specialist', 'mixture_of_agents', 'memory_save_session'],
  },
  writer: {
    label: 'Content & Communications Specialist',
    gradient: 'from-purple-500 to-indigo-600',
    badgeCls: 'border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-300',
    tools: ['notes_create', 'library_save', 'web_search'],
  },
  custom: {
    label: 'Autonomous Specialist',
    gradient: 'from-slate-600 to-slate-800',
    badgeCls: 'border-slate-500/30 bg-slate-500/15 text-slate-600 dark:text-slate-300',
    tools: ['web_search', 'notes_create', 'shell_execute'],
  },
}

export default function SpecialistSwarmStudioPage() {
  const router = useRouter()
  const addToast = useUIStore((s) => s.addToast)
  const createConversation = useChatStore((s) => s.createConversation)
  const sendMessage = useChatStore((s) => s.sendMessage)

  const [agents, setAgents] = useState<SpecialistAgentRow[]>([])
  const [roster, setRoster] = useState<RosterEntryRow[]>([])
  const [installingSlug, setInstallingSlug] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [role, setRole] = useState<string>('researcher')
  const [persona, setPersona] = useState('')
  const [budget, setBudget] = useState('50')
  const [creating, setCreating] = useState(false)

  // Inline mission dispatch state
  const [dispatchAgentName, setDispatchAgentName] = useState<string | null>(null)
  const [missionPrompt, setMissionPrompt] = useState('')
  const [dispatching, setDispatching] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, catalog] = await Promise.all([sdk.specialists.list(), sdk.specialists.roster()])
      setAgents(Array.isArray(list) ? list : [])
      setRoster(Array.isArray(catalog) ? catalog : [])
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load specialists')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  const summary = useMemo(() => {
    const activeCount = agents.filter((a) => a.enabled).length
    const totalBudget = agents.reduce((acc, a) => acc + (a.monthlyBudgetUsd || 0), 0)
    const totalSpent = agents.reduce((acc, a) => acc + (a.spentUsd || 0), 0)
    return { activeCount, totalBudget, totalSpent }
  }, [agents])

  async function handleCreate(custom?: {
    name: string
    role: string
    personaPrompt: string
    monthlyBudgetUsd: number
  }) {
    const targetName = (custom?.name ?? name).trim()
    if (!targetName) {
      addToast('warning', 'Name your specialist first.')
      return
    }
    setCreating(true)
    try {
      await sdk.specialists.create({
        name: targetName,
        role: custom?.role ?? role,
        personaPrompt: (custom?.personaPrompt ?? persona).trim(),
        monthlyBudgetUsd: custom?.monthlyBudgetUsd ?? (Number(budget) || 25),
      })
      if (!custom) {
        setName('')
        setPersona('')
      }
      addToast('success', `@${targetName} joined your Specialist Swarm.`)
      await load()
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to create specialist')
    } finally {
      setCreating(false)
    }
  }

  async function install(entry: RosterEntryRow) {
    setInstallingSlug(entry.slug)
    try {
      await sdk.specialists.installFromRoster(entry.slug)
      addToast('success', `@${entry.name} joined your Specialist Swarm.`)
      await load()
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to install specialist')
    } finally {
      setInstallingSlug(null)
    }
  }

  async function toggle(agent: SpecialistAgentRow) {
    await sdk.specialists
      .update(agent.id, { enabled: !agent.enabled })
      .then(load)
      .catch((err: any) => addToast('error', err?.message))
  }

  async function remove(agent: SpecialistAgentRow) {
    if (!confirm(`Remove @${agent.name} from the swarm?`)) return
    await sdk.specialists
      .remove(agent.id)
      .then(load)
      .catch((err: any) => addToast('error', err?.message))
  }

  async function handleDispatchMission(agentName: string) {
    const taskText = missionPrompt.trim()
    if (!taskText) {
      addToast('warning', 'Enter a mission instruction for the specialist.')
      return
    }
    setDispatching(true)
    try {
      const convId = await createConversation()
      const fullPrompt = `Delegate to specialist @${agentName} using delegate_to_specialist tool or execute directly as @${agentName}: ${taskText}`
      void sendMessage(fullPrompt, {
        displayContent: `@${agentName}: ${taskText}`,
        mode: 'autopilot',
      })
      addToast('success', `Mission dispatched to @${agentName}`)
      setDispatchAgentName(null)
      setMissionPrompt('')
      router.push(convId ? `/chat?conversation=${convId}` : '/chat')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to dispatch mission')
    } finally {
      setDispatching(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-20">
      {/* Header + Swarm KPIs */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-300">
            <Users size={13} />
            <span>Multi-Agent Swarm Orchestration</span>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--tone-strong)] sm:text-3xl">
            Specialist Agent Swarm
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--muted)] max-w-2xl">
            Each specialist has a dedicated role, system persona, tool bindings, and monthly token budget. Dispatch missions directly or let your main agent delegate via <code className="font-mono text-rose-500">delegate_to_specialist</code>.
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="manus-panel px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Swarm Online
            </span>
            <p className="mt-1 text-xl font-black text-emerald-500">
              {summary.activeCount} / {agents.length}
            </p>
          </div>
          <div className="manus-panel px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Monthly Pool
            </span>
            <p className="mt-1 text-xl font-black text-[var(--tone-strong)]">
              ${summary.totalBudget.toFixed(0)}
            </p>
          </div>
          <div className="manus-panel px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Cloud Spend
            </span>
            <p className="mt-1 text-xl font-black text-rose-500">
              ${summary.totalSpent.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Active Specialist Grid */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Active Specialist Roster ({agents.length})
          </p>
        </div>

        {loading ? (
          <div className="manus-panel p-8 text-center text-xs text-[var(--muted)]">
            Loading specialist swarm...
          </div>
        ) : agents.length === 0 ? (
          <div className="manus-panel p-8 text-center">
            <Bot className="mx-auto h-8 w-8 text-[var(--muted)]" />
            <p className="mt-2 text-sm font-bold text-[var(--tone-strong)]">
              No specialists configured
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {agents.map((a) => {
              const meta = ROLE_META[a.role] ?? ROLE_META.custom
              const pct = Math.min(
                100,
                Math.round(((a.spentUsd || 0) / Math.max(0.01, a.monthlyBudgetUsd || 1)) * 100),
              )
              const isDispatchOpen = dispatchAgentName === a.name

              return (
                <div
                  key={a.id}
                  className={clsx(
                    'manus-panel flex flex-col justify-between p-5 transition',
                    !a.enabled && 'opacity-60',
                    isDispatchOpen && 'ring-2 ring-rose-500/50',
                  )}
                >
                  <div>
                    {/* Card Top Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.gradient} font-black text-white shadow-md`}
                        >
                          @{a.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-extrabold text-[var(--tone-strong)]">
                              @{a.name}
                            </h3>
                            <span
                              className={clsx(
                                'rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                                meta.badgeCls,
                              )}
                            >
                              {a.role}
                            </span>
                            {a.enabled && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Ready
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--muted)]">{meta.label}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void toggle(a)}
                          title={a.enabled ? 'Disable specialist' : 'Enable specialist'}
                          className="oa-soft-button rounded-xl p-2 text-[var(--muted)] hover:text-[var(--tone-strong)]"
                        >
                          <Power size={14} className={a.enabled ? 'text-emerald-500' : ''} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(a)}
                          title="Remove specialist"
                          className="oa-soft-button rounded-xl p-2 text-[var(--muted)] hover:text-rose-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Persona */}
                    {a.personaPrompt && (
                      <p className="mt-3 text-xs leading-relaxed text-[var(--tone-default)] bg-[var(--surface-muted)] rounded-xl p-3 border border-[var(--border)]">
                        {a.personaPrompt}
                      </p>
                    )}

                    {/* Bound Tools */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {meta.tools.map((toolName) => (
                        <span
                          key={toolName}
                          className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-0.5 font-mono text-[10px] text-[var(--muted)]"
                        >
                          {toolName}()
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Bottom Bar: Budget + Dispatch Mission */}
                  <div className="mt-5 pt-3 border-t border-[var(--border)] space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-[11px] text-[var(--muted)] mb-1">
                          <span>
                            Budget: ${a.spentUsd.toFixed(2)} / ${a.monthlyBudgetUsd.toFixed(2)}
                          </span>
                          <span className="font-mono">{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
                          <div
                            className={`h-full bg-gradient-to-r ${meta.gradient}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setDispatchAgentName(isDispatchOpen ? null : a.name)
                          setMissionPrompt('')
                        }}
                        className="oa-accent-button inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-white"
                      >
                        <Zap size={13} />
                        <span>{isDispatchOpen ? 'Close' : `Dispatch @${a.name}`}</span>
                      </button>
                    </div>

                    {/* Inline Mission Dispatcher */}
                    {isDispatchOpen && (
                      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.04] p-3 space-y-2">
                        <label className="block font-mono text-[10px] font-bold uppercase tracking-wider text-rose-500">
                          Direct Mission for @{a.name}
                        </label>
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            value={missionPrompt}
                            onChange={(e) => setMissionPrompt(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleDispatchMission(a.name)
                            }}
                            placeholder={`Tell @${a.name} what to build, research, or execute...`}
                            className="oa-input-surface flex-1 rounded-xl px-3 py-2 text-xs outline-none"
                          />
                          <button
                            type="button"
                            disabled={dispatching}
                            onClick={() => void handleDispatchMission(a.name)}
                            className="oa-accent-button inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                          >
                            {dispatching ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <>
                                <Send size={12} />
                                <span>Go</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Built-in Agency Roster Catalog */}
      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Agency Roster Catalog ({roster.filter((r) => !r.installed).length} available)
          </p>
          <p className="hidden font-mono text-[10px] text-[var(--muted)] sm:block">
            Curated personas: identity, workflows, deliverables, success metrics
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roster.map((entry) => {
            const meta = ROLE_META[entry.role] ?? ROLE_META.custom
            return (
              <div
                key={entry.slug}
                className={clsx(
                  'manus-panel flex flex-col justify-between p-4',
                  entry.installed && 'opacity-70',
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-extrabold text-[var(--tone-strong)]">
                      @{entry.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <span
                        className={clsx(
                          'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                          meta.badgeCls,
                        )}
                      >
                        {entry.role}
                      </span>
                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-0.5 font-mono text-[10px] uppercase text-[var(--muted)]">
                        {entry.division}
                      </span>
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs font-semibold text-rose-500">{entry.tagline}</p>
                  <p className="mt-2 text-xs text-[var(--muted)] line-clamp-3">
                    {entry.personaPrompt.replace(/##[^\n]*\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)}
                    ...
                  </p>
                  <p className="mt-2 font-mono text-[10px] text-[var(--muted)]">
                    default budget: ${entry.defaultMonthlyBudgetUsd}/mo
                  </p>
                </div>

                <button
                  type="button"
                  disabled={entry.installed || installingSlug === entry.slug}
                  onClick={() => void install(entry)}
                  className={clsx(
                    'mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition',
                    entry.installed
                      ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 cursor-default'
                      : 'oa-soft-button hover:border-rose-500/40',
                  )}
                >
                  {entry.installed ? (
                    <span>✓ Active in Swarm</span>
                  ) : installingSlug === entry.slug ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Recruiting...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={13} />
                      <span>Recruit @{entry.name}</span>
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Custom Specialist Creator */}
      <div className="manus-panel p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="oa-brand-badge flex h-7 w-7 items-center justify-center rounded-lg text-white">
            <Plus size={15} />
          </div>
          <h2 className="text-sm font-bold text-[var(--tone-strong)]">
            Architect Custom Specialist Agent
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Agent Handle
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nexus"
              className="oa-input-surface w-full rounded-xl px-3.5 py-2 text-sm outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Specialization Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="oa-input-surface w-full rounded-xl px-3.5 py-2 text-sm outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Monthly Budget (USD)
            </label>
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              type="number"
              min="1"
              max="1000"
              step="1"
              className="oa-input-surface w-full rounded-xl px-3.5 py-2 text-sm outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
            System Persona & Operating Directives
          </label>
          <textarea
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            rows={3}
            placeholder="Describe this specialist's domain expertise, preferred tools, and output standards..."
            className="oa-input-surface w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={creating}
            onClick={() => void handleCreate()}
            className="oa-accent-button inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"
          >
            <Plus size={14} />
            <span>{creating ? 'Deploying Specialist...' : 'Deploy Specialist to Swarm'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
