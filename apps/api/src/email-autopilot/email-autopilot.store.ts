import { Injectable, Logger } from '@nestjs/common'
import { DocumentStore } from '../prisma/document-store.service'

export type TriageCategory = 'urgent' | 'reply_needed' | 'fyi' | 'newsletter' | 'invoice'
export const TRIAGE_CATEGORIES: TriageCategory[] = ['urgent', 'reply_needed', 'fyi', 'newsletter', 'invoice']

export type RuleAction = 'label' | 'archive' | 'draft' | 'forward'
/** Actions that change state outside the inbox (or are hard to undo) need approval. */
export const RISKY_ACTIONS: RuleAction[] = ['forward', 'archive']

export interface EmailRule {
  id: string
  /** Gmail-like match, e.g. "from:*@vendor.com subject:invoice" */
  match: string
  action: RuleAction
  /** label name for `label`, address for `forward` */
  value?: string
  enabled: boolean
  /** Risky actions default to true and cannot be set to false. */
  requireApproval: boolean
  createdAt: string
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

export type DraftStatus = 'pending' | 'approved' | 'sent' | 'rejected' | 'failed'
export interface EmailDraft {
  id: string
  kind: 'reply' | 'forward'
  gmailDraftId?: string
  messageId: string
  threadId: string
  to: string
  subject: string
  body: string
  status: DraftStatus
  ruleId?: string
  error?: string
  createdAt: string
  updatedAt: string
}

export interface PendingAction {
  id: string
  ruleId: string
  action: RuleAction
  value?: string
  messageId: string
  subject: string
  from: string
  status: 'pending' | 'approved' | 'rejected' | 'done' | 'failed'
  createdAt: string
}

export interface StyleProfile {
  summary: string
  greeting: string
  signOff: string
  avgLength: number
  tone: string
  samples: number
  updatedAt: string
}

export interface EmailAutopilotFile {
  rules: EmailRule[]
  triage: TriagedEmail[]
  drafts: EmailDraft[]
  pendingActions: PendingAction[]
  style: StyleProfile | null
  processedIds: string[]
  lastRunAt?: string
}

const empty = (): EmailAutopilotFile => ({
  rules: [],
  triage: [],
  drafts: [],
  pendingActions: [],
  style: null,
  processedIds: [],
})

const KIND = 'email_autopilot'

@Injectable()
export class EmailAutopilotStore {
  private readonly logger = new Logger(EmailAutopilotStore.name)

  constructor(private documents: DocumentStore) {}

  async load(userId: string): Promise<EmailAutopilotFile> {
    const data = await this.documents.read<EmailAutopilotFile>(userId, KIND, empty)
    const normalized: EmailAutopilotFile = { ...empty(), ...data }
    for (const k of ['rules', 'triage', 'drafts', 'pendingActions', 'processedIds'] as const) {
      if (!Array.isArray(normalized[k])) (normalized as any)[k] = []
    }
    return normalized
  }

  async save(userId: string, data: EmailAutopilotFile) {
    data.drafts = data.drafts.slice(0, 200)
    data.pendingActions = data.pendingActions.slice(0, 200)
    data.processedIds = data.processedIds.slice(-1000)
    await this.documents.write(userId, KIND, data)
  }
}
