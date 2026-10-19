'use client'

/** Browser web-push helpers. Registers /sw.js and subscribes via the OpenAgents push API. */

export type PushSupport = 'unsupported' | 'denied' | 'default' | 'granted'

export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  return Notification.permission as PushSupport
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export interface PushApi {
  vapidPublicKey: () => Promise<{ publicKey: string | null }>
  subscribePush: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) => Promise<unknown>
}

export async function enablePushNotifications(api: PushApi): Promise<void> {
  if (getPushSupport() === 'unsupported') throw new Error('Push notifications are not supported in this browser.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')

  const { publicKey } = await api.vapidPublicKey()
  if (!publicKey) throw new Error('Push is not configured on the server (missing VAPID key).')

  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
    })
  }
  const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Invalid push subscription.')
  await api.subscribePush({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } })
}
