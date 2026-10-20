import type { OpenAgentsClient } from '../client'

export type BriefingSectionKey = 'email' | 'calendar' | 'tasks' | 'news' | 'memory'

export interface BriefingSettings {
  enabled: boolean
  /** Local time, HH:mm */
  time: string
  /** IANA timezone */
  timezone: string
  sections: Record<BriefingSectionKey, boolean>
  /** Topics searched for the news card (default: ['AI', 'technology']) */
  newsTopics?: string[]
}

export interface BriefingCard {
  section: BriefingSectionKey
  title: string
  items: string[]
}

export interface BriefingRecord {
  id: string
  createdAt: string
  dateKey: string
  trigger: 'scheduled' | 'manual'
  summary: string
  cards: BriefingCard[]
}

export function createBriefingApi(client: OpenAgentsClient) {
  return {
    latest: () => client.get<{ briefing: BriefingRecord | null }>('/api/v1/briefing/latest'),

    history: (limit = 30) => client.get<BriefingRecord[]>(`/api/v1/briefing/history?limit=${limit}`),

    getSettings: () => client.get<BriefingSettings>('/api/v1/briefing/settings'),

    updateSettings: (patch: Partial<BriefingSettings>) =>
      client.put<BriefingSettings>('/api/v1/briefing/settings', patch),

    run: () => client.post<{ ok: boolean; briefing: BriefingRecord }>('/api/v1/briefing/run'),

    // Web push helpers (backed by the notifications push controller)
    vapidPublicKey: () => client.get<{ publicKey: string | null }>('/api/v1/push/vapid-public-key'),

    subscribePush: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
      client.post<{ ok: boolean; total: number }>('/api/v1/push/subscribe', subscription),

    testPush: () => client.post<{ sent: number; failed: number }>('/api/v1/push/test'),
  }
}
