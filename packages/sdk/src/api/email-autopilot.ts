import type { OpenAgentsClient } from '../client'

export type TriageCategory = 'urgent' | 'reply_needed' | 'fyi' | 'newsletter' | 'invoice'
export type EmailRuleAction = 'label' | 'archive' | 'draft' | 'forward'
export type EmailDraftStatus = 'pending' | 'approved' | 'sent' | 'rejected' | 'failed'

export interface EmailRule {
  id: string
  match: string
  action: EmailRuleAction
  value?: string
  enabled: boolean
  requireApproval: boolean
  createdAt: string
}

export interface EmailRuleInput {
  match?: string
  action?: EmailRuleAction
  value?: string
  enabled?: boolean
  requireApproval?: boolean
}

export interface TriagedEmail {
  id: string
  threadId: string
  from: string
  fromEmail: string
  subject: string
  snippet: string
  date: string
  category: TriageCategory
  reason: string
  messageIdHeader?: string
  unread: boolean
}

export interface EmailTriageSummary {
  lastRunAt: string | null
  counts: Record<TriageCategory, number>
  items: TriagedEmail[]
}

export interface EmailDraft {
  id: string
  kind: 'reply' | 'forward'
  gmailDraftId?: string
  messageId: string
  threadId: string
  to: string
  subject: string
  body: string
  status: EmailDraftStatus
  ruleId?: string
  error?: string
  createdAt: string
  updatedAt: string
}

export interface PendingEmailAction {
  id: string
  ruleId: string
  action: EmailRuleAction
  value?: string
  messageId: string
  subject: string
  from: string
  status: 'pending' | 'approved' | 'rejected' | 'done' | 'failed'
  createdAt: string
}

export interface EmailStyleProfile {
  summary: string
  greeting: string
  signOff: string
  avgLength: number
  tone: string
  samples: number
  updatedAt: string
}

export function createEmailAutopilotApi(client: OpenAgentsClient) {
  return {
    triage: () => client.get<EmailTriageSummary>('/api/v1/email-autopilot/triage'),
    run: () =>
      client.post<{
        triaged: number
        newMessages: number
        drafted: number
        ruleHits: number
        pendingApprovals: number
      }>('/api/v1/email-autopilot/run'),
    drafts: (status?: EmailDraftStatus) =>
      client.get<EmailDraft[]>(
        `/api/v1/email-autopilot/drafts${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      ),
    editDraft: (id: string, body: { body?: string; subject?: string; to?: string }) =>
      client.patch<EmailDraft>(`/api/v1/email-autopilot/drafts/${encodeURIComponent(id)}`, body),
    approveDraft: (id: string) =>
      client.post<EmailDraft>(`/api/v1/email-autopilot/drafts/${encodeURIComponent(id)}/approve`),
    rejectDraft: (id: string) =>
      client.post<EmailDraft>(`/api/v1/email-autopilot/drafts/${encodeURIComponent(id)}/reject`),
    actions: () => client.get<PendingEmailAction[]>('/api/v1/email-autopilot/actions'),
    approveAction: (id: string) =>
      client.post<PendingEmailAction>(`/api/v1/email-autopilot/actions/${encodeURIComponent(id)}/approve`),
    rejectAction: (id: string) =>
      client.post<PendingEmailAction>(`/api/v1/email-autopilot/actions/${encodeURIComponent(id)}/reject`),
    rules: () => client.get<EmailRule[]>('/api/v1/email-autopilot/rules'),
    createRule: (input: EmailRuleInput) => client.post<EmailRule>('/api/v1/email-autopilot/rules', input),
    updateRule: (id: string, input: EmailRuleInput) =>
      client.patch<EmailRule>(`/api/v1/email-autopilot/rules/${encodeURIComponent(id)}`, input),
    deleteRule: (id: string) =>
      client.delete<{ deleted: boolean }>(`/api/v1/email-autopilot/rules/${encodeURIComponent(id)}`),
    style: () => client.get<{ profile: EmailStyleProfile | null }>('/api/v1/email-autopilot/style'),
    learnStyle: () => client.post<EmailStyleProfile>('/api/v1/email-autopilot/style/learn'),
  }
}
