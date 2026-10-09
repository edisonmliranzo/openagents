import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

export const metadata: Metadata = {
  title: 'OpenAgents',
  description: 'Free self-hosted personal AI assistant for research, planning, writing, tool use, and real work.',
  applicationName: 'OpenAgents',
  icons: { icon: '/icons/icon-32.png' },
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
    <html lang="en" className={`${plusJakarta.variable} ${ibmPlexMono.variable}`}>
      <body>
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
