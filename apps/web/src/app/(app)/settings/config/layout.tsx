import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'LLM Provider & APIsRouter / BYOK Configuration',
  description:
    'Connect your unified APIsRouter.dev API key (93+ frontier models) or Bring Your Own Key (OpenAI, Anthropic, Google Gemini, DeepSeek, Groq, Ollama).',
  alternates: { canonical: '/settings/config' },
}

export default function SettingsConfigLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
