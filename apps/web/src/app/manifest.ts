import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'OpenAgents - Autonomous AI Operating System',
    short_name: 'OpenAgents',
    description: 'Self-hosted autonomous AI agent platform for research, planning, writing, and real work.',
    start_url: '/chat',
    scope: '/',
    display: 'standalone',
    background_color: '#0b1120',
    theme_color: '#0b1120',
    categories: ['productivity', 'utilities', 'developer tools'],
    icons: [
      { src: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'New chat', url: '/chat', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'Mind', url: '/mind', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'Library', url: '/library', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
    ],
    screenshots: [
      {
        src: '/coming-soon-hero.jpg',
        sizes: '1920x1080',
        type: 'image/jpeg',
      },
    ],
  }
}
