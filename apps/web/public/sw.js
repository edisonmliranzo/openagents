// Minimal installability service worker: no caching (dev-safe), just presence
// so browsers treat OpenAgents as an installable standalone app.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
