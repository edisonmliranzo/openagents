import { Injectable, Logger } from '@nestjs/common'
import { promises as fs } from 'fs'
import * as path from 'path'

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

@Injectable()
export class EmailAutopilotStore {
  private readonly logger = new Logger(EmailAutopilotStore.name)
  private readonly dir = path.resolve(
    process.env.EMAIL_AUTOPILOT_DATA_DIR ?? path.join(process.cwd(), 'data', 'email-autopilot'),
  )
  private readonly cache = new Map<string, EmailAutopilotFile>()

  private fileFor(userId: string) {
    return path.join(this.dir, `${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
  }

  async load(userId: string): Promise<EmailAutopilotFile> {
    const cached = this.cache.get(userId)
    if (cached) return cached
    let data = empty()
    try {
      const parsed = JSON.parse(await fs.readFile(this.fileFor(userId), 'utf8')) as Partial<EmailAutopilotFile>
      data = { ...data, ...parsed }
      for (const k of ['rules', 'triage', 'drafts', 'pendingActions', 'processedIds'] as const) {
        if (!Array.isArray(data[k])) (data as any)[k] = []
      }
    } catch {
      // defaults
    }
    this.cache.set(userId, data)
    return data
  }

  async save(userId: string, data: EmailAutopilotFile) {
    data.drafts = data.drafts.slice(0, 200)
    data.pendingActions = data.pendingActions.slice(0, 200)
    data.processedIds = data.processedIds.slice(-1000)
    this.cache.set(userId, data)
    try {
      await fs.mkdir(this.dir, { recursive: true })
      await fs.writeFile(this.fileFor(userId), JSON.stringify(data, null, 2), 'utf8')
    } catch (error: any) {
      this.logger.warn(`Failed to persist email autopilot data for ${userId}: ${error?.message ?? error}`)
    }
  }
}
