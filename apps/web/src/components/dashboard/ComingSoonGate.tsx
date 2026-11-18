'use client'

import Link from 'next/link'
import { FlaskConical } from 'lucide-react'

/**
 * Experimental Labs pages whose NestJS backend has not been ported to the
 * Cloudflare Worker yet. They render an honest "Coming soon" panel instead
 * of firing 501 requests. Remove a route here as soon as its API is ported.
 */
export const UNAVAILABLE_ROUTES = new Set<string>([
  '/agent/distiller',
  '/agent/evolution',
  '/agent/labs',
  '/agent/marketplace',
  '/agent/nanobot',
  '/agent/presets',
  '/agent/reverse-engineer',
  '/agent/skills',
  '/agent/speculative',
  '/agent/tool-forge',
  '/agent/tree-of-actions',
  '/agent/trust',
  '/agent/versions',
  '/autonomy',
  '/beam',
  '/boardroom',
  '/browser',
  '/cartographer',
  '/computer-use',
  '/control/benchmark',
  '/control/inbox',
  '/control/lineage',
  '/control/mission-control',
  '/control/repair',
  '/copilot',
  '/database-lab',
  '/debate',
  '/digital-twin',
  '/finops',
  '/flow-guardian',
  '/frontier',
  '/frontier/agent-marketplace',
  '/frontier/audit-ledger',
  '/frontier/boardroom',
  '/frontier/contact-memory',
  '/frontier/durable-agents',
  '/frontier/evals',
  '/frontier/injection-firewall',
  '/frontier/keys',
  '/frontier/outreach-analytics',
  '/frontier/policy-guardrails',
  '/frontier/replay-rewind',
  '/frontier/sandbox-exec',
  '/frontier/skill-proposals',
  '/frontier/smart-router',
  '/frontier/sync',
  '/frontier/trust-center',
  '/frontier/voice-console',
  '/growth',
  '/inbox',
  '/mind',
  '/overnight',
  '/replay',
  '/sandbox',
  '/security/chaos',
  '/security/firewall',
  '/security/ledger',
  '/sentinel',
  '/share',
  '/ship',
  '/swarm/market',
  '/swarm/verifier',
  '/team',
  '/teams',
  '/time-machine',
  '/war-room',
  '/workflows/recorder',
])

export function isUnavailableRoute(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return UNAVAILABLE_ROUTES.has(normalized)
}

export function ComingSoonGate({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  if (!isUnavailableRoute(pathname)) return <>{children}</>
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
        <FlaskConical className="h-7 w-7" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
        Coming soon to OpenAgents Cloud
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        This Labs module is scheduled for migration to the edge backend and will switch on here automatically once
        ready. Chat, Voice Calls, Avatars, Memory, Tasks, Goals, Workflows, Channels, Usage &amp; Costs, and Billing
        are all live today.
      </p>
      <Link
        href="/chat"
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
      >
        Back to Chat
      </Link>
    </div>
  )
}
