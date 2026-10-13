import type { OpenAgentsClient } from '../client'

export interface JanitorRunRow {
  id: string
  folder: string
  status: string
  appliedAt: string | null
  createdAt: string
}

export interface JanitorMove {
  from: string
  to: string
  action: 'rename' | 'move'
  reason: string
}

export interface InboxDigestRow {
  id: string
  summary: string
  items: string
  triagedAt: string
}

export interface CrmPersonRow {
  id: string
  name: string
  summary: string
  mentions: number
  lastSeenAt: string | null
  daysSince: number | null
  bucket: 'fresh' | 'warm' | 'stale' | 'cold'
}

export interface ClipRow {
  id: string
  kind: string
  sourceUrl: string | null
  text: string
  caption: string | null
  createdAt: string
}

export interface ApprovalRuleRow {
  id: string
  toolPattern: string
  decision: 'allow' | 'deny'
  note: string
  enabled: boolean
  createdAt: string
}

export interface AnticipationRow {
  id: string
  patternText: string
  exampleCount: number
  cadenceDays: number
  lastSeenAt: string
  nextDueAt: string
  status: string
}

export interface ReplayDay {
  date: string
  tasks: Array<{ id: string; title: string; status: string; startedAt: string | null; finishedAt: string | null }>
  events: Array<{ taskId: string; taskTitle: string; kind: string; message: string; at: string }>
  journal: Array<{ id: string; tool: string; undone: boolean; taskId: string | null; at: string }>
  stats: { tasks: number; steps: number; sideEffects: number; undone: number }
}

export interface AgentTokenRow {
  id: string
  name: string
  tokenPrefix: string
  scopes: string
  budgetUsd: number
  spentUsd: number
  callCount: number
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export function createLifeApi(client: OpenAgentsClient) {
  return {
    // Downloads janitor
    janitorScan: (folder: string) => client.post<{ id: string; folder: string; scanned: number; moves: JanitorMove[] }>('/api/v1/life/janitor/scan', { folder }),
    janitorApply: (id: string) => client.post<{ applied: number; total: number; errors: string[] }>(`/api/v1/life/janitor/${id}/apply`, {}),
    janitorList: () => client.get<JanitorRunRow[]>('/api/v1/life/janitor'),

    // Inbox autopilot
    inboxTriage: (query?: string) => client.post<InboxDigestRow>('/api/v1/life/inbox/triage', { query }),
    inboxList: () => client.get<InboxDigestRow[]>('/api/v1/life/inbox'),

    // Personal CRM
    crmRoster: (workspaceId?: string) =>
      client.get<CrmPersonRow[]>(`/api/v1/life/crm${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`),
    crmNudge: (personId: string) => client.post<{ draft: string }>(`/api/v1/life/crm/${personId}/nudge`, {}),

    // Clips (screenshot/link/text memory)
    createClip: (input: { kind?: string; text?: string; sourceUrl?: string; imageBase64?: string; caption?: string }) =>
      client.post<ClipRow>('/api/v1/life/clips', input),
    listClips: (q?: string) => client.get<ClipRow[]>(`/api/v1/life/clips${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    deleteClip: (id: string) => client.delete<{ ok: boolean }>(`/api/v1/life/clips/${id}`),

    // Podcast mode
    podcast: (scope: 'today' | 'yesterday' = 'today') =>
      client.get<{ script: string; sections: Record<string, number> }>(`/api/v1/life/podcast?scope=${scope}`),

    // Approval delegation rules
    listRules: () => client.get<ApprovalRuleRow[]>('/api/v1/life/rules'),
    createRule: (input: { toolPattern: string; decision?: 'allow' | 'deny'; note?: string }) =>
      client.post<ApprovalRuleRow>('/api/v1/life/rules', input),
    compileRules: (sentence: string) => client.post<ApprovalRuleRow[]>('/api/v1/life/rules/compile', { sentence }),
    updateRule: (id: string, patch: { enabled?: boolean; decision?: 'allow' | 'deny' }) =>
      client.patch<ApprovalRuleRow>(`/api/v1/life/rules/${id}`, patch),
    deleteRule: (id: string) => client.delete<{ ok: boolean }>(`/api/v1/life/rules/${id}`),

    // Dry-run (shadow) mode
    getShadow: () => client.get<{ shadowMode: boolean }>('/api/v1/life/shadow'),
    setShadow: (enabled: boolean) => client.post<{ shadowMode: boolean }>('/api/v1/life/shadow', { enabled }),

    // Audit replay
    replayDay: (date: string) => client.get<ReplayDay>(`/api/v1/life/replay?date=${encodeURIComponent(date)}`),

    // Anticipatory reminders
    listAnticipations: () => client.get<AnticipationRow[]>('/api/v1/life/anticipations'),
    learnAnticipations: () => client.post<{ created: number; updated: number }>('/api/v1/life/anticipations/learn', {}),
    updateAnticipation: (id: string, patch: { status?: string; cadenceDays?: number }) =>
      client.patch<AnticipationRow>(`/api/v1/life/anticipations/${id}`, patch),

    // Agent API tokens
    listTokens: () => client.get<AgentTokenRow[]>('/api/v1/life/tokens'),
    createToken: (input: { name: string; scopes?: string[]; budgetUsd?: number }) =>
      client.post<{ token: string; scopes: string[]; name: string }>('/api/v1/life/tokens', input),
    revokeToken: (id: string) => client.delete<{ ok: boolean }>(`/api/v1/life/tokens/${id}`),

    // Realistic TTS (ElevenLabs / Fish Audio)
    ttsStatus: () => client.get<{ provider: string | null; elevenlabs: boolean; fish: boolean; defaultVoice: string }>('/api/v1/life/tts/status'),
    ttsVoices: () => client.get<Array<{ id: string; name: string; provider: string; labels?: Record<string, string> }>>('/api/v1/life/tts/voices'),
    tts: (text: string, opts?: { voiceId?: string; provider?: string }) =>
      client.post<{ audioBase64: string; mimeType: string; provider: string; voiceId: string; cached: boolean }>('/api/v1/life/tts', { text, ...opts }),
    ttsClone: (input: { name: string; audioBase64: string; mimeType?: string }) =>
      client.post<{ voiceId: string; provider: string }>('/api/v1/life/tts/clone', input),
  }
}
