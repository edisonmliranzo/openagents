import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Documentation & Developer Guide — APIsRouter, Voice Calls & SDK',
  description:
    'Complete developer documentation for OpenAgents: APIsRouter setup, BYOK configuration, voice & avatar calls, MCP tools, workflows, and SDK integration.',
  alternates: { canonical: '/docs' },
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
