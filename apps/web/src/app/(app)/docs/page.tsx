import {
  OPENAGENTS_LOCAL_QUICK_START,
  OPENAGENTS_REPO_WEB_URL,
  OPENAGENTS_UBUNTU_SERVER_INSTALL_GUIDE,
} from '@openagents/shared'

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const REPO_BASE = OPENAGENTS_REPO_WEB_URL

const CAPABILITY_CARDS = [
  {
    title: 'Chat + Tasks',
    summary: 'The main assistant workspace for questions, multi-step task execution, and deliverables.',
    uiHref: '/chat',
    apiHref: `${API_ORIGIN}/api/v1/conversations`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/conversations/conversations.service.ts`,
  },
  {
    title: 'Approvals',
    summary: 'Human-in-the-loop controls for risky actions, tool calls, and operational handoffs.',
    uiHref: '/approvals',
    apiHref: `${API_ORIGIN}/api/v1/approvals`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/approvals/approvals.service.ts`,
  },
  {
    title: 'Memory + Sources',
    summary: 'Persistent memory files plus local knowledge sources that can be synced into the assistant.',
    uiHref: '/memory',
    apiHref: `${API_ORIGIN}/api/v1/memory/sources`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/memory/memory.service.ts`,
  },
  {
    title: 'Workflows',
    summary: 'Reusable workflow runs, branching, and result comparison for repeated work.',
    uiHref: '/control/workflows',
    apiHref: `${API_ORIGIN}/api/v1/workflows`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/workflows/workflows.service.ts`,
  },
  {
    title: 'Channels + Connectors',
    summary: 'Channel linking plus Gmail and Calendar connection setup for real actions.',
    uiHref: '/control/channels',
    apiHref: `${API_ORIGIN}/api/v1/connectors`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/connectors/connectors.service.ts`,
  },
  {
    title: 'Lineage',
    summary: 'Trace memory files, approvals, tools, and external sources behind each response.',
    uiHref: '/control/lineage',
    apiHref: `${API_ORIGIN}/api/v1/lineage/recent`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/lineage/lineage.service.ts`,
  },
  {
    title: 'Repair Center',
    summary: 'Inspect stale messages, orphan approvals, and drifted run state, then apply repair actions.',
    uiHref: '/control/repair',
    apiHref: `${API_ORIGIN}/api/v1/conversations/:id/repair`,
    implHref: `${REPO_BASE}/blob/main/apps/api/src/conversations/conversations.service.ts`,
  },
]

const API_SURFACES = [
  {
    title: 'Dry-run tool execution',
    endpoint: `${API_ORIGIN}/api/v1/tools/dry-run`,
    summary: 'Preview likely tool side effects before the assistant commits to the action.',
  },
  {
    title: 'Conversation repair',
    endpoint: `${API_ORIGIN}/api/v1/conversations/:id/repair`,
    summary: 'Inspect and repair waiting approvals, stale messages, and orphaned runs.',
  },
  {
    title: 'Workflow branch run',
    endpoint: `${API_ORIGIN}/api/v1/workflows/:id/runs/branch`,
    summary: 'Replay an existing workflow run with different model, prompt, or input choices.',
  },
  {
    title: 'Workflow compare',
    endpoint: `${API_ORIGIN}/api/v1/workflows/:id/runs/compare`,
    summary: 'Compare workflow outputs, tool usage, and run metrics side-by-side.',
  },
  {
    title: 'Conversation lineage graph',
    endpoint: `${API_ORIGIN}/api/v1/lineage/conversation/:conversationId/graph`,
    summary: 'Return message, approval, tool, and memory provenance for a conversation.',
  },
  {
    title: 'Local knowledge sources',
    endpoint: `${API_ORIGIN}/api/v1/memory/sources`,
    summary: 'Register, sync, and remove local folders or files used as assistant knowledge inputs.',
  },
]

const PRODUCT_DOCS = [
  {
    title: 'Repository',
    href: REPO_BASE,
    description: 'Source code for the web app, API, worker, SDK, and shared types.',
  },
  {
    title: 'README',
    href: `${REPO_BASE}/blob/main/README.md`,
    description: 'Setup, self-hosting commands, and top-level product overview.',
  },
  {
    title: 'MVP Feature Pack',
    href: `${REPO_BASE}/blob/main/docs/mvp-feature-pack.md`,
    description: 'Implementation notes for the current assistant feature set.',
  },
  {
    title: 'Product Expansion Roadmap',
    href: `${REPO_BASE}/blob/main/docs/product-expansion-roadmap.md`,
    description: 'Longer-horizon ideas beyond the current self-hosted MVP.',
  },
  {
    title: 'OpenClaw Parity',
    href: `${REPO_BASE}/blob/main/docs/openclaw-parity.md`,
    description: 'Parity tracking against adjacent agent capabilities.',
  },
  {
    title: 'API Swagger',
    href: `${API_ORIGIN}/docs`,
    description: 'Live API reference exposed by the running backend.',
  },
]

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Docs</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          OpenAgents is a free self-hosted personal AI assistant for real work. Use this page as
          the logged-in documentation hub for product surfaces, new APIs, and deployment references.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">What OpenAgents does</h2>
            <p className="mt-1 text-sm text-slate-500">
              It can answer questions, plan tasks, browse the web, create files, run tools, and
              take approval-gated actions.
            </p>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            Personal assistant + execution runtime
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {CAPABILITY_CARDS.map((feature) => (
            <article key={feature.title} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">{feature.title}</p>
              <p className="mt-1 text-xs text-slate-500">{feature.summary}</p>
              <div className="mt-3 space-y-1 text-xs">
                <a href={feature.uiHref} className="block font-mono text-slate-700 hover:text-red-600">
                  UI: {feature.uiHref}
                </a>
                <a
                  href={feature.apiHref}
                  target="_blank"
                  rel="noreferrer"
                  className="block font-mono text-slate-700 hover:text-red-600"
                >
                  API: {feature.apiHref}
                </a>
                <a
                  href={feature.implHref}
                  target="_blank"
                  rel="noreferrer"
                  className="block font-mono text-slate-700 hover:text-red-600"
                >
                  Impl: {feature.implHref}
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Key API surfaces</h2>
        <p className="mt-1 text-sm text-slate-500">
          These endpoints expose the newer planning, repair, lineage, and knowledge-management
          capabilities.
        </p>
        <div className="mt-4 space-y-3">
          {API_SURFACES.map((entry) => (
            <article key={entry.endpoint} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">{entry.title}</p>
              <p className="mt-1 text-xs text-slate-500">{entry.summary}</p>
              <code className="mt-2 block overflow-x-auto rounded-md bg-slate-900 px-3 py-2 text-[11px] text-slate-100">
                {entry.endpoint}
              </code>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Local install</h2>
        <p className="mt-1 text-sm text-slate-500">
          Canonical local development setup for Windows, macOS, and Ubuntu. Each flow uses
          `pnpm setup` to install dependencies, create env files, start local infrastructure, and
          run Prisma.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {Object.values(OPENAGENTS_LOCAL_QUICK_START).map((platform) => (
            <article key={platform.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">{platform.label}</p>
              <p className="mt-1 text-xs text-slate-500">{platform.runtimeNote}</p>
              <div className="mt-3 rounded-md bg-slate-900 p-3 text-[11px] text-slate-100">
                <p className="font-semibold text-slate-300">Install</p>
                <code className="mt-2 block overflow-x-auto whitespace-pre-wrap">
                  {platform.shellPrefix} {platform.installCommand}
                </code>
                <p className="mt-3 font-semibold text-slate-300">Start</p>
                <code className="mt-2 block overflow-x-auto whitespace-pre-wrap">
                  {platform.shellPrefix} {platform.startCommand}
                </code>
              </div>
              <p className="mt-3 text-xs text-slate-500">{platform.installerNote}</p>
              <details className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                  Manual setup steps
                </summary>
                <pre className="mt-3 overflow-auto rounded-md bg-slate-900 p-3 text-[11px] text-slate-100">
                  {platform.localCommands.map((line) => `${platform.shellPrefix} ${line}`).join('\n')}
                </pre>
              </details>
              <p className="mt-3 text-xs font-medium text-slate-600">
                Access example: {platform.accessExample}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Self-host quick start</h2>
        <p className="mt-1 text-sm text-slate-500">
          Canonical Ubuntu VPS deployment flow for the free self-hosted install.
        </p>
        <pre className="mt-3 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
{OPENAGENTS_UBUNTU_SERVER_INSTALL_GUIDE}
        </pre>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">References</h2>
        <div className="mt-4 space-y-3">
          {PRODUCT_DOCS.map((link) => (
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
    </div>
  )
}
