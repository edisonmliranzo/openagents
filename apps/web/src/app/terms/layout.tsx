import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — Platform Governance & BYOK Usage',
  description:
    'Read the OpenAgents Terms of Service covering autonomous agent execution, human-in-the-loop approvals, APIsRouter & BYOK usage, and platform governance.',
  alternates: { canonical: '/terms' },
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
