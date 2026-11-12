// Minimal installability service worker: no runtime caching, just presence
// so browsers treat OpenAgents as an installable standalone app.
//
// Deployments sometimes leave older cached bundles behind on long-lived tabs.
// Clearing Cache Storage on activate keeps the next page load on the current
// build without forcing users to manually clear site data.
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      } catch {
        // Cache Storage may be unavailable in some embedded browsers.
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', () => {})
