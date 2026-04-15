'use client'

const DOC_LINKS = [
  {
    title: 'OpenClaw Core Repo',
    href: 'https://github.com/openclaw/openclaw',
    description: 'Reference implementation for dashboard behavior and architecture.',
  },
  {
    title: 'ClawHub Repo',
    href: 'https://github.com/openclaw/clawhub',
    description: 'Related hub UI and workflows used for parity planning.',
  },
  {
    title: 'OpenClaw Dashboard Docs',
    href: 'https://docs.openclaw.ai/web/dashboard',
    description: 'Control-panel navigation and auth behavior reference.',
  },
]

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Docs</h1>
        <p className="mt-1 text-sm text-slate-500">Reference links for dashboard operations and implementation.</p>
      </header>

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
