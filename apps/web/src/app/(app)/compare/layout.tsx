import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Compare AI Agent Platforms & 93+ Frontier Models',
  description:
    'Compare OpenAgents with OpenRouter, AutoGPT, CrewAI, and LangGraph across 93+ live 2026 frontier models, voice/avatar latency, and BYOK cost.',
  alternates: { canonical: '/compare' },
}

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
