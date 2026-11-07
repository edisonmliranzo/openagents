import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Live Voice Calls & Expressive 3D Avatars',
  description:
    'Talk naturally with your AI agent via full-duplex WebRTC voice calls, lip-synced expressive avatars, and outbound/inbound AI phone automation.',
  alternates: { canonical: '/phone' },
}

export default function PhoneLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
