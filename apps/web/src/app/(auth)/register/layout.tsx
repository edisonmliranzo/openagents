import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create Free Account — Launch Your AI Agent in 60 Seconds',
  description:
    'Create your free OpenAgents account. Connect your APIsRouter unified API key (93+ frontier models) or Bring Your Own Key (BYOK) and start building.',
  alternates: { canonical: '/register' },
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
