import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'OpenAgents',
    short_name: 'OpenAgents',
    description: 'Self-hosted AI agent platform for work, learning, and life.',
    start_url: '/chat',
    scope: '/',
    display: 'standalone',
    background_color: '#f3f6fd',
    theme_color: '#0b1120',
    categories: ['productivity', 'utilities'],
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
  }
}
