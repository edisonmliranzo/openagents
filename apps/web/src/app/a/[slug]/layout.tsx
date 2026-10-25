import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ slug: 'default' }]
}

export default function PublicAgentSlugLayout({ children }: { children: ReactNode }) {
  return children
}
