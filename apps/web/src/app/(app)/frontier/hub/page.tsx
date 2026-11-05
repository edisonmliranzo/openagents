'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, ShieldCheck, Cpu, TrendingUp, Network, KeyRound, type LucideIcon } from 'lucide-react'

interface HubFeature {
  slug: string
  title: string
  description: string
  group: GroupId
}

type GroupId = 'safety' | 'execution' | 'quality' | 'growth' | 'platform' | 'data'

const GROUPS: Record<GroupId, { label: string; icon: LucideIcon; tone: string }> = {
  safety: { label: 'Governance & Safety', icon: ShieldCheck, tone: 'text-emerald-500' },
  execution: { label: 'Durable Execution', icon: Cpu, tone: 'text-sky-500' },
  quality: { label: 'Routing & Quality', icon: TrendingUp, tone: 'text-amber-500' },
  growth: { label: 'Growth & Voice', icon: Network, tone: 'text-rose-500' },
  platform: { label: 'Platform & Trust', icon: ShieldCheck, tone: 'text-indigo-500' },
  data: { label: 'Keys, Skills & Sync', icon: KeyRound, tone: 'text-fuchsia-500' },
}

const FEATURES: HubFeature[] = [
  { slug: 'policy-guardrails', title: 'Policy-as-Code Guardrails', description: 'Declarative rules evaluated before every tool runs, with a dry-run tester and evaluation log.', group: 'safety' },
  { slug: 'audit-ledger', title: 'Signed Audit Ledger', description: 'Hash-chained, HMAC-signed record of agent actions with verify and export.', group: 'safety' },
  { slug: 'injection-firewall', title: 'Prompt-Injection Firewall', description: 'Scan untrusted web, email and tool content for injection and quarantine risky text.', group: 'safety' },
  { slug: 'durable-agents', title: 'Durable Long-Running Agents', description: 'Checkpointed runs that survive restarts, with pause, resume, cancel and retries.', group: 'execution' },
  { slug: 'sandbox-exec', title: 'Sandboxed Tool Execution', description: 'Owner-only code and shell runs in Docker or a restricted fallback with hard limits.', group: 'execution' },
  { slug: 'replay-rewind', title: 'Replay & Rewind', description: 'Scrub a run timeline, inspect steps, fork from any step and diff the result.', group: 'execution' },
  { slug: 'smart-router', title: 'Cost-Aware Model Router', description: 'Start on the cheapest capable model, escalate on weak answers, and track savings.', group: 'quality' },
  { slug: 'evals', title: 'Evals & Regression Gate', description: 'Golden task suites, baselines and a CI-friendly pass/fail gate.', group: 'quality' },
  { slug: 'boardroom', title: 'Boardroom with Judge', description: 'Specialist agents debate and a judge scores arguments and issues a verdict.', group: 'quality' },
  { slug: 'outreach-analytics', title: 'Outreach Analytics', description: 'Reply, conversion and revenue by channel and hook, with A/B winners.', group: 'growth' },
  { slug: 'contact-memory', title: 'Unified Contact Memory', description: 'One contact timeline across email, SMS, WhatsApp and social, with context briefs.', group: 'growth' },
  { slug: 'voice-console', title: 'Voice Call Console', description: 'Live transcript, mid-call steering and human takeover for voice calls.', group: 'growth' },
  { slug: 'agent-marketplace', title: 'Agent Marketplace', description: 'Publish and install agents with a permission manifest and creator earnings.', group: 'platform' },
  { slug: 'team-workspace', title: 'Team Workspaces', description: 'Roles, invites, shared memory scopes and approval delegation with an activity feed.', group: 'platform' },
  { slug: 'trust-center', title: 'Trust Center & DPA', description: 'Security posture, subprocessors, retention, a generated DPA and data export or delete requests.', group: 'platform' },
  { slug: 'keys', title: 'Encryption Keys', description: 'Per-user envelope encryption, master-key rotation and rotation history.', group: 'data' },
  { slug: 'skill-proposals', title: 'Self-Improving Skills', description: 'Reusable skills mined from repeated tool sequences, for you to approve.', group: 'data' },
  { slug: 'sync', title: 'Local-First Sync', description: 'End-to-end encrypted memory and settings sync across devices.', group: 'data' },
]

export default function FrontierHubPage() {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return FEATURES
    return FEATURES.filter(
      (f) => f.title.toLowerCase().includes(q) || f.description.toLowerCase().includes(q),
    )
  }, [query])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Frontier Hub</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Advanced OpenAgents capabilities in one place: safety, durability, quality, growth and trust.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search features..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      {(Object.keys(GROUPS) as GroupId[]).map((groupId) => {
        const items = filtered.filter((f) => f.group === groupId)
        if (items.length === 0) return null
        const group = GROUPS[groupId]
        const Icon = group.icon
        return (
          <section key={groupId} className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <Icon className={`h-4 w-4 ${group.tone}`} />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">{group.label}</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((f) => (
                <Link
                  key={f.slug}
                  href={`/frontier/${f.slug}`}
                  className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="text-sm font-bold">{f.title}</div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{f.description}</p>
                </Link>
              ))}
            </div>
          </section>
        )
      })}

      {filtered.length === 0 && (
        <p className="text-sm text-slate-500">No features match &ldquo;{query}&rdquo;.</p>
      )}
    </div>
  )
}
