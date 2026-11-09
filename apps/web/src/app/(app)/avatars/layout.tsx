import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Avatar Studio — Realistic Video Avatars',
  description: 'Create a realistic multi-angle video avatar from a photo, pick a Fish Audio or ElevenLabs voice, and talk to your AI agent face-to-face.',
  alternates: { canonical: '/avatars' },
}

export default function AvatarsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
