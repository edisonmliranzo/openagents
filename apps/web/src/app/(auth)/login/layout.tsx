import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In — Autonomous AI Agent Workspace',
  description:
    'Sign in to your OpenAgents workspace to manage autonomous AI agents, live voice & avatar calls, APIsRouter keys, and multi-channel workflows.',
  alternates: { canonical: '/login' },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
