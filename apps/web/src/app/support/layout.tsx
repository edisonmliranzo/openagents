import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Support & Help Center — APIsRouter Setup & Agent Troubleshooting',
  description:
    'Get technical support, documentation guides, APIsRouter setup help, and troubleshooting for your OpenAgents workspace.',
  alternates: { canonical: '/support' },
}

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
