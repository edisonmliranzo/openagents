import type { OpenAgentsClient } from '../client'

// ---------- Outreach analytics ----------
export type OutreachChannel = 'comment' | 'reply' | 'dm' | 'email' | 'sms' | 'whatsapp'
export type OutreachStatus = 'sent' | 'replied' | 'booked' | 'converted'

export interface OutreachItem {
  id: string
  channel: OutreachChannel
  hook: string
  variant: string
  variantText?: string
  recipient?: string
  contactId?: string
  status: OutreachStatus
  revenue: number
  sentAt: string
  repliedAt?: string
  bookedAt?: string
  convertedAt?: string
  note?: string
}

export interface OutreachRateRow {
  key: string
  sent: number
  replied: number
  booked: number
  converted: number
  revenue: number
  replyRate: number
  conversionRate: number
  revenuePerSent: number
  hook?: string
  variant?: string
}

export interface OutreachPromotion {
  hook: string
  variant: string
  variantText?: string
  metric: string
  promotedAt: string
}

export interface OutreachExperiment {
  hook: string
  metric: 'reply' | 'conversion'
  variants: (OutreachRateRow & { variant: string; text?: string })[]
  winner: string | null
  leader: string
  significant: boolean
  pValue: number
  zScore: number
  confidence: number
  verdict: string
  promoted: OutreachPromotion | null
}

export interface OutreachAnalytics {
  totals: OutreachRateRow
  byChannel: OutreachRateRow[]
  byHook: OutreachRateRow[]
  byVariant: OutreachRateRow[]
  experiments: OutreachExperiment[]
  promotions: OutreachPromotion[]
}

// ---------- Contacts ----------
export type ContactStage = 'lead' | 'contacted' | 'engaged' | 'meeting' | 'customer' | 'lost'
export type InteractionDirection = 'inbound' | 'outbound' | 'note'

export interface GrowthContact {
  id: string
  name: string
  emails: string[]
  phones: string[]
  handles: { platform: string; handle: string }[]
  tags: string[]
  notes: string
  stage: ContactStage
  createdAt: string
  updatedAt: string
  lastInteractionAt?: string
  mergedFrom?: string[]
}

export interface ContactInteraction {
  id: string
  contactId: string
  channel: string
  direction: InteractionDirection
  text: string
  at: string
  meta?: Record<string, unknown>
}

export interface ContactBrief {
  contactId: string
  summary: string
  stage: ContactStage
  tags: string[]
  channels: Record<string, number>
  preferredChannel: string | null
  daysSinceLastContact: number | null
  awaitingTheirReply: boolean
  recentInteractions: string[]
}

export interface ContactIdentityInput {
  name?: string
  email?: string
  phone?: string
  handle?: string
  platform?: string
}

// ---------- Voice console ----------
export type VoiceRole = 'caller' | 'agent' | 'human' | 'system'

export interface VoiceTurn {
  seq: number
  role: VoiceRole
  text: string
  at: string
}

export interface VoiceSteeringNote {
  id: string
  text: string
  at: string
  consumed: boolean
}

export interface VoiceSession {
  id: string
  source: 'simulation' | 'phone'
  direction: 'inbound' | 'outbound'
  party: string
  goal: string
  status: 'active' | 'ended'
  humanTakeover: boolean
  steering: VoiceSteeringNote[]
  phoneCallId?: string
  createdAt: string
  updatedAt: string
  endedAt?: string
  lastSeq: number
  transcript: VoiceTurn[]
}

export type VoiceSessionSummary = Omit<VoiceSession, 'transcript'> & { turns: number }

const OUT = '/api/v1/growth/outreach'
const CON = '/api/v1/growth/contacts'
const VOX = '/api/v1/voice-console'

export function createGrowthVoiceApi(client: OpenAgentsClient) {
  return {
    outreach: {
      list: (params: { channel?: string; hook?: string; status?: string; limit?: number } = {}) => {
        const q = new URLSearchParams()
        Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && q.set(k, String(v)))
        const s = q.toString()
        return client.get<OutreachItem[]>(s ? `${OUT}?${s}` : OUT)
      },
      track: (input: { channel: OutreachChannel; hook: string; variant?: string; variantText?: string; recipient?: string; contactName?: string; contactId?: string; note?: string; sentAt?: string }) =>
        client.post<OutreachItem>(OUT, input),
      advance: (id: string, status: OutreachStatus, revenue?: number, note?: string) =>
        client.post<OutreachItem>(`${OUT}/${encodeURIComponent(id)}/advance`, { status, revenue, note }),
      remove: (id: string) => client.delete<{ ok: boolean }>(`${OUT}/${encodeURIComponent(id)}`),
      analytics: (days?: number) => client.get<OutreachAnalytics>(days ? `${OUT}/analytics?days=${days}` : `${OUT}/analytics`),
      experiments: (metric: 'reply' | 'conversion' = 'conversion') => client.get<OutreachExperiment[]>(`${OUT}/experiments?metric=${metric}`),
      promote: (hook: string, variant?: string, metric?: 'reply' | 'conversion') => client.post<OutreachPromotion>(`${OUT}/promote`, { hook, variant, metric }),
      promotions: () => client.get<OutreachPromotion[]>(`${OUT}/promotions`),
    },
    contacts: {
      list: (params: { q?: string; tag?: string; stage?: string } = {}) => {
        const q = new URLSearchParams()
        Object.entries(params).forEach(([k, v]) => v && q.set(k, v))
        const s = q.toString()
        return client.get<GrowthContact[]>(s ? `${CON}?${s}` : CON)
      },
      create: (input: ContactIdentityInput & { tags?: string[]; notes?: string; stage?: ContactStage }) => client.post<GrowthContact>(CON, input),
      get: (id: string) => client.get<{ contact: GrowthContact; timeline: ContactInteraction[] }>(`${CON}/${encodeURIComponent(id)}`),
      update: (id: string, patch: { name?: string; tags?: string[]; notes?: string; stage?: ContactStage; addEmail?: string; addPhone?: string; addHandle?: string; platform?: string }) =>
        client.patch<GrowthContact>(`${CON}/${encodeURIComponent(id)}`, patch),
      remove: (id: string) => client.delete<{ ok: boolean }>(`${CON}/${encodeURIComponent(id)}`),
      addInteraction: (id: string, input: { channel: string; direction: InteractionDirection; text: string; at?: string }) =>
        client.post<ContactInteraction>(`${CON}/${encodeURIComponent(id)}/interactions`, input),
      ingest: (input: ContactIdentityInput & { channel: string; direction: InteractionDirection; text: string; at?: string }) =>
        client.post<{ contact: GrowthContact; interaction: ContactInteraction }>(`${CON}/ingest`, input),
      duplicates: () => client.get<{ contacts: GrowthContact[] }[]>(`${CON}/duplicates`),
      merge: (primaryId: string, duplicateIds: string[]) => client.post<GrowthContact>(`${CON}/merge`, { primaryId, duplicateIds }),
      brief: (id: string) => client.get<ContactBrief>(`${CON}/${encodeURIComponent(id)}/brief`),
    },
    voice: {
      status: () => client.get<{ telephonyConfigured: boolean; from: string | null; simulationAvailable: boolean }>(`${VOX}/status`),
      list: () => client.get<VoiceSessionSummary[]>(`${VOX}/sessions`),
      create: (input: { direction?: 'inbound' | 'outbound'; party?: string; goal?: string; phoneCallId?: string }) => client.post<VoiceSession>(`${VOX}/sessions`, input),
      /** Polling feed: pass the last seen `lastSeq` to receive only new turns. */
      get: (id: string, after = 0) => client.get<VoiceSession>(`${VOX}/sessions/${encodeURIComponent(id)}?after=${after}`),
      steer: (id: string, text: string) => client.post<VoiceSession>(`${VOX}/sessions/${encodeURIComponent(id)}/steer`, { text }),
      takeover: (id: string, enabled: boolean) => client.post<VoiceSession>(`${VOX}/sessions/${encodeURIComponent(id)}/takeover`, { enabled }),
      say: (id: string, text: string) => client.post<VoiceSession>(`${VOX}/sessions/${encodeURIComponent(id)}/say`, { text }),
      simulateCaller: (id: string, text?: string) => client.post<VoiceSession>(`${VOX}/sessions/${encodeURIComponent(id)}/caller`, { text }),
      end: (id: string) => client.post<VoiceSession>(`${VOX}/sessions/${encodeURIComponent(id)}/end`),
      remove: (id: string) => client.delete<{ ok: boolean }>(`${VOX}/sessions/${encodeURIComponent(id)}`),
    },
  }
}
