import type { OpenAgentsClient } from '../client'

export type MomentKind = 'meeting_soon' | 'unanswered_email' | 'calendar_conflict' | 'goal_stalled' | 'watch_hit'
export type MomentStatus = 'active' | 'snoozed' | 'dismissed' | 'acted'

export interface MomentAction {
  id: string
  label: string
  href?: string
}

export interface Moment {
  id: string
  key: string
  kind: MomentKind
  title: string
  body: string
  context?: string[]
  actions: MomentAction[]
  status: MomentStatus
  snoozedUntil?: string
  delivered: boolean
  deliveredAt?: string
  actedActionId?: string
  createdAt: string
  updatedAt: string
  expiresAt?: string
}

export interface MomentSettings {
  enabled: boolean
  timezone: string
  quietHours: { enabled: boolean; start: string; end: string }
  maxPerDay: number
  kinds: Record<MomentKind, boolean>
}

export function createMomentsApi(client: OpenAgentsClient) {
  return {
    list: (status?: MomentStatus) =>
      client.get<Moment[]>(
        `/api/v1/proactive/moments${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      ),
    scan: () =>
      client.post<{ created: number; moments: Moment[] }>('/api/v1/proactive/moments/scan'),
    getSettings: () => client.get<MomentSettings>('/api/v1/proactive/moments/settings'),
    updateSettings: (settings: Partial<MomentSettings>) =>
      client.put<MomentSettings>('/api/v1/proactive/moments/settings', settings),
    snooze: (id: string, minutes = 60) =>
      client.post<Moment>(`/api/v1/proactive/moments/${encodeURIComponent(id)}/snooze`, { minutes }),
    dismiss: (id: string) =>
      client.post<Moment>(`/api/v1/proactive/moments/${encodeURIComponent(id)}/dismiss`),
    act: (id: string, actionId?: string) =>
      client.post<{ moment: Moment; action: MomentAction | null }>(
        `/api/v1/proactive/moments/${encodeURIComponent(id)}/act`,
        { actionId },
      ),
  }
}
