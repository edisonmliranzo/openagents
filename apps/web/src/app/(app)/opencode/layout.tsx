import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'OpenCode TUI Studio & APIsRouter CLI Generator — Build vs Plan Agents',
  description:
    'Interactive Terminal UI (TUI) Coding Agent Studio with Tab-switchable Build & Plan agents, @general subagent, /init AGENTS.md generator, /undo Git snapshots, and 1-click opencode.json config pre-wired to APIsRouter.dev (93+ models).',
  alternates: { canonical: '/opencode' },
}

export default function OpenCodeStudioLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
