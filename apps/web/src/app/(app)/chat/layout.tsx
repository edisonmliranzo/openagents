import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Live Agent Chat & Multimodal Studio',
  description:
    'Chat with your autonomous AI agent powered by Claude Sonnet 5.5, GPT-6.1 Sol Pro, Gemini 4 Argon, DeepSeek V4.1, and Grok 4.7 with live voice & expressive avatar mode.',
  alternates: { canonical: '/chat' },
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
