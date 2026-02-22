'use client'

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const REPO_BASE = 'https://github.com/openagents/openagents'
const FEATURE_FOCUS = [
  {
    title: 'Memory / Brain',
    summary: 'Persistent memory entries plus editable core memory files and sync operations.',
    uiHref: '/memory',
    apiHref: `${API_ORIGIN}/api/v1/memory`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/memory/memory.service.ts`,
  },
  {
    title: 'Persona',
    summary: 'Profile-driven style, boundaries, and turn-by-turn personality updates.',
    uiHref: '/agent/nanobot',
    apiHref: `${API_ORIGIN}/api/v1/nanobot/persona/profiles`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/nanobot/agent/nanobot-personality.service.ts`,
  },
  {
    title: 'Thinking',
    summary: 'Session thinking-level controls and agent loop reasoning/execution transitions.',
    uiHref: '/sessions',
    apiHref: `${API_ORIGIN}/api/v1/sessions`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/nanobot/agent/nanobot-loop.service.ts`,
  },
  {
    title: 'Agentic Heartbeat',
    summary: 'Runtime liveness tick flow and autonomy/cron diagnostic triggers.',
    uiHref: '/agent/nanobot',
    apiHref: `${API_ORIGIN}/api/v1/nanobot/heartbeat`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/nanobot/heartbeat/nanobot-heartbeat.service.ts`,
  },
  {
    title: 'Autonomy Windows',
    summary: 'Time-window policy controls that gate autonomous tool execution.',
    uiHref: '/agent/nanobot',
    apiHref: `${API_ORIGIN}/api/v1/nanobot/autonomy/windows`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/memory/memory.service.ts`,
  },
  {
    title: 'Trust Scoring',
    summary: 'Composite trust snapshot across autonomy, memory, tools, safety, and costs.',
    uiHref: '/agent/trust',
    apiHref: `${API_ORIGIN}/api/v1/nanobot/trust`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/nanobot/trust/nanobot-trust.service.ts`,
  },
  {
    title: 'Skills Registry',
    summary: 'Built-in and custom skill registry for agent capability routing.',
    uiHref: '/agent/skills',
    apiHref: `${API_ORIGIN}/api/v1/nanobot/skills`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/nanobot/agent/nanobot-skills.registry.ts`,
  },
  {
    title: 'Workflow Automation',
    summary: 'CRUD and run orchestration for reusable multi-step workflows.',
    uiHref: '/control/workflows',
    apiHref: `${API_ORIGIN}/api/v1/workflows`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/workflows/workflows.service.ts`,
  },
  {
    title: 'Operator Handoffs',
    summary: 'Escalation flow with claim/reply/resolve lifecycle and context carryover.',
    uiHref: '/control/handoffs',
    apiHref: `${API_ORIGIN}/api/v1/handoffs`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/handoffs/handoffs.service.ts`,
  },
  {
    title: 'Lineage Trace',
    summary: 'Traceability for memory files, approvals, tool calls, and message provenance.',
    uiHref: '/control/lineage',
    apiHref: `${API_ORIGIN}/api/v1/lineage/recent`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/lineage/lineage.service.ts`,
  },
]

const DOC_LINKS = [
  {
    title: 'OpenAgents Repository',
    href: REPO_BASE,
    description: 'Primary source code for dashboard, API, worker, and SDK.',
  },
  {
    title: 'OpenAgents README',
    href: `${REPO_BASE}/blob/main/README.md`,
    description: 'Project setup, architecture, and operational commands.',
  },
  {
    title: 'Dashboard Overview',
    href: '/control/overview',
    description: 'Main operations view for control-plane monitoring.',
  },
  {
    title: 'Chat Workspace',
    href: '/chat',
    description: 'Primary conversation runtime for sessions, approvals, and tool calls.',
  },
  {
    title: 'OpenAgent Runtime UI',
    href: '/agent/openagent',
    description: 'Runtime control surface for agent behavior and state.',
  },
  {
    title: 'Memory / Brain Workspace',
    href: '/memory',
    description: 'Long-term memory entries plus editable memory files (SOUL, USER, MEMORY, HEARTBEAT).',
  },
  {
    title: 'Persona Controls',
    href: '/agent/nanobot',
    description: 'Persona profile, boundaries, and behavior tuning for agent runtime.',
  },
  {
    title: 'Thinking Controls',
    href: '/sessions',
    description: 'Session-level thinking mode controls and model behavior overrides.',
  },
  {
    title: 'Agentic Heartbeat + Autonomy',
    href: '/agent/nanobot',
    description: 'Heartbeat triggers, cron diagnostics, and autonomy window scheduling.',
  },
  {
    title: 'Settings Config UI',
    href: '/settings/config',
    description: 'Provider keys, model selection, and runtime configuration.',
  },
  {
    title: 'API Swagger Docs',
    href: `${API_ORIGIN}/docs`,
    description: 'Live API reference for implementation and integration.',
  },
  {
    title: 'API Health Endpoint',
    href: `${API_ORIGIN}/api/v1/health`,
    description: 'Health check for service availability and deployments.',
  },
  {
    title: 'Memory Implementation (API)',
    href: `${REPO_BASE}/blob/main/apps/api/src/memory/memory.service.ts`,
    description: 'Core memory extraction, file sync, autonomy state, and persistence logic.',
  },
  {
    title: 'Persona Implementation (API)',
    href: `${REPO_BASE}/blob/main/apps/api/src/nanobot/agent/nanobot-personality.service.ts`,
    description: 'Persona profile state, prompt appendix generation, and behavioral updates.',
  },
  {
    title: 'Thinking / Agentic Loop (API)',
    href: `${REPO_BASE}/blob/main/apps/api/src/nanobot/agent/nanobot-loop.service.ts`,
    description: 'Agent loop orchestration, thinking transitions, and tool execution flow.',
  },
  {
    title: 'Heartbeat Implementation (API)',
    href: `${REPO_BASE}/blob/main/apps/api/src/nanobot/heartbeat/nanobot-heartbeat.service.ts`,
    description: 'Heartbeat tick emitter and runtime liveness signaling.',
  },
  {
    title: 'MVP Feature Pack Spec',
    href: `${REPO_BASE}/blob/main/docs/mvp-feature-pack.md`,
    description: 'Implementation details for orchestration, marketplace, voice, and capture.',
  },
  {
    title: 'OpenClaw Parity Plan',
    href: `${REPO_BASE}/blob/main/docs/openclaw-parity.md`,
    description: 'Parity status and tracked implementation gaps.',
  },
]

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Docs</h1>
        <p className="mt-1 text-sm text-slate-500">Reference links for memory/brain, persona, thinking, and agentic heartbeat operations + implementation.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Feature Focus</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {FEATURE_FOCUS.map((feature) => (
            <article key={feature.title} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">{feature.title}</p>
              <p className="mt-1 text-xs text-slate-500">{feature.summary}</p>
              <div className="mt-3 space-y-1 text-xs">
                <a href={feature.uiHref} target="_blank" rel="noreferrer" className="block font-mono text-slate-700 hover:text-red-600">
                  UI: {feature.uiHref}
                </a>
                <a href={feature.apiHref} target="_blank" rel="noreferrer" className="block font-mono text-slate-700 hover:text-red-600">
                  API: {feature.apiHref}
                </a>
                <a href={feature.implHref} target="_blank" rel="noreferrer" className="block font-mono text-slate-700 hover:text-red-600">
                  Impl: {feature.implHref}
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Documentation Links</h2>
        <div className="mt-4 space-y-3">
          {DOC_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:border-red-200 hover:bg-red-50/30"
            >
              <p className="text-sm font-semibold text-slate-800">{link.title}</p>
              <p className="mt-1 text-xs text-slate-500">{link.description}</p>
              <p className="mt-1 font-mono text-[11px] text-slate-400">{link.href}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">CLI Quick Commands</h2>
        <pre className="mt-3 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
{`pnpm install
pnpm --filter @openagents/api run db:migrate
pnpm --filter @openagents/api run dev
pnpm --filter @openagents/web run dev`}
        </pre>
      </section>
    </div>
  )
}
