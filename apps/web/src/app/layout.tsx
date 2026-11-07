import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import { RouteMetaManager } from '@/components/seo/RouteMetaManager'
import { AnalyticsProvider } from '@/components/analytics/AnalyticsProvider'

const SITE_URL = 'https://openagents.edison0220.workers.dev'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'OpenAgents — Autonomous AI Agent Workspace, Voice & Avatar Calls, APIsRouter (93+ Frontier Models)',
    template: '%s | OpenAgents',
  },
  description:
    'Deploy personal AI agents with real-time Voice Calls, Animated 3D Avatars, and 93+ frontier models via APIsRouter (Claude 5.5, GPT-6.1, Gemini 4, DeepSeek V4.1, Kimi K3.1, Grok 4.7) or Bring Your Own Key (BYOK).',
  applicationName: 'OpenAgents',
  keywords: [
    'OpenAgents',
    'AI Agent Platform',
    'APIsRouter',
    'Autonomous AI Agents',
    'Voice AI Calls',
    'Animated AI Avatars',
    'Claude Sonnet 5.5',
    'GPT-6.1 Sol Pro',
    'Gemini 4 Argon',
    'DeepSeek V4.1',
    'Bring Your Own Key',
    'BYOK AI',
  ],
  authors: [{ name: 'OpenAgents Team', url: SITE_URL }],
  creator: 'OpenAgents',
  publisher: 'OpenAgents',
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'OpenAgents',
    title: 'OpenAgents — Autonomous AI Agent Workspace, Voice & Avatar Calls, APIsRouter (93+ Frontier Models)',
    description:
      'Deploy personal AI agents with real-time Voice Calls, Animated 3D Avatars, and 93+ frontier models via APIsRouter (Claude 5.5, GPT-6.1, Gemini 4, DeepSeek V4.1, Kimi K3.1, Grok 4.7) or Bring Your Own Key (BYOK).',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'OpenAgents — Autonomous AI Agent Platform with Voice & Avatar Calls and 93+ Frontier Models via APIsRouter',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OpenAgents — Autonomous AI Agent Workspace & Voice/Avatar Studio',
    description:
      'Talk live with your AI agent via Voice & Animated Avatars. Powered by 93+ frontier 2026 models on APIsRouter.dev or Bring Your Own Key (BYOK).',
    images: ['/og-image.png'],
  },
  appleWebApp: {
    capable: true,
    title: 'OpenAgents',
    statusBarStyle: 'default',
    startupImage: [{ url: '/icons/icon-512.png' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b1120',
}

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500'],
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark theme-dark ${plusJakarta.variable} ${ibmPlexMono.variable}`}>
      <body>
        <RouteMetaManager />
        <AnalyticsProvider />
        {children}
        {process.env.NODE_ENV === 'production' && (
          <script
            dangerouslySetInnerHTML={{
              __html: "if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){})}",
            }}
          />
        )}
      </body>
    </html>
  )
}
