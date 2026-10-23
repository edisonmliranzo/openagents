import { Injectable, Logger } from '@nestjs/common'
import { DocumentStore } from '../prisma/document-store.service'

export type PhoneCallStatus =
  | 'pending_approval'
  | 'rejected'
  | 'dialing'
  | 'in_progress'
  | 'completed'
  | 'failed'

export interface PhoneTurn {
  role: 'caller' | 'agent'
  text: string
  at: string
}

export interface PhoneCallRecord {
  id: string
  userId: string
  direction: 'outbound' | 'inbound'
  to: string
  from: string
  goal: string
  status: PhoneCallStatus
  twilioSid?: string
  transcript: PhoneTurn[]
  summary?: string
  error?: string
  createdAt: string
  updatedAt: string
  approvedAt?: string
  endedAt?: string
}

const MAX_CALLS = 200
const KIND = 'phone'

/**
 * Postgres-backed store for phone calls: one document per user holding the
 * call list, plus a callId -> userId index so webhooks can find the owner.
 */
@Injectable()
export class PhoneStore {
  private readonly logger = new Logger(PhoneStore.name)
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private documents: DocumentStore) {}

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn)
    this.queue = next.catch(() => undefined)
    return next
  }

  async list(userId: string) {
    const calls = await this.documents.read<PhoneCallRecord[]>(userId, KIND, () => [], 'calls')
    return [...calls].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async get(userId: string, id: string) {
    const calls = await this.documents.read<PhoneCallRecord[]>(userId, KIND, () => [], 'calls')
    return calls.find((c) => c.id === id) ?? null
  }

  async getById(id: string) {
    const ownerId = await this.documents.readGlobal<string>('phone_index', () => '', id)
    return ownerId ? this.get(ownerId, id) : null
  }

  save(record: PhoneCallRecord) {
    return this.serialize(async () => {
      const calls = await this.documents.read<PhoneCallRecord[]>(record.userId, KIND, () => [], 'calls')
      const idx = calls.findIndex((c) => c.id === record.id)
      record.updatedAt = new Date().toISOString()
      if (idx >= 0) calls[idx] = record
      else calls.unshift(record)
      if (calls.length > MAX_CALLS) calls.length = MAX_CALLS

      await this.documents.write(record.userId, KIND, calls, 'calls')
      // The webhook index maps a call id to its owner.
      await this.documents.writeGlobal('phone_index', record.userId, record.id)
      return record
    })
  }
}
