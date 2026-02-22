import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { MemoryService } from '../memory/memory.service'
import { MissionControlService } from '../mission-control/mission-control.service'
import { NotificationsService } from '../notifications/notifications.service'
import { AuditService } from '../audit/audit.service'
import type {
  CreateHandoffInput,
  HandoffContextApproval,
  HandoffContextMessage,
  HandoffStatus,
  HumanHandoffTicket,
} from '@openagents/shared'

const HANDOFFS_FILE = 'HANDOFFS.json'
const STORE_VERSION = 1
const MAX_HANDOFFS_PER_USER = 2000

interface HandoffStoreFile {
  version: number
  tickets: HumanHandoffTicket[]
}

@Injectable()
export class HandoffsService {
  private readonly logger = new Logger(HandoffsService.name)
  private readonly loadedUsers = new Set<string>()
  private readonly ticketsByUser = new Map<string, HumanHandoffTicket[]>()

  constructor(
    private prisma: PrismaService,
    private memory: MemoryService,
    private mission: MissionControlService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  async list(userId: string, status?: HandoffStatus) {
    await this.ensureLoaded(userId)
    const all = [...(this.ticketsByUser.get(userId) ?? [])]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    if (!status) return all
    return all.filter((ticket) => ticket.status === status)
  }

  async get(userId: string, ticketId: string) {
    const ticket = await this.getTicket(userId, ticketId)
    return { ...ticket }
  }

  async getActiveForConversation(userId: string, conversationId: string) {
    await this.ensureLoaded(userId)
    return [...(this.ticketsByUser.get(userId) ?? [])]
      .filter((ticket) => ticket.conversationId === conversationId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .find((ticket) => ticket.status === 'open' || ticket.status === 'claimed')
      ?? null
  }

  async create(userId: string, input: CreateHandoffInput) {
    const conversationId = this.requireId(input.conversationId, 'Conversation ID')
    await this.assertConversationOwnership(userId, conversationId)
    const existingActive = await this.getActiveForConversation(userId, conversationId)
    if (existingActive) return existingActive

    const now = new Date().toISOString()
    const context = await this.captureContext(userId, conversationId)
    const ticket: HumanHandoffTicket = {
      id: randomUUID(),
      userId,
      conversationId,
      status: 'open',
      reason: this.optionalText(input.reason)?.slice(0, 800) ?? null,
      createdAt: now,
      updatedAt: now,
      claimedByUserId: null,
      claimedAt: null,
      resolvedAt: null,
      returnedAt: null,
      resolutionNote: null,
      context,
      replies: [],
    }

    await this.ensureLoaded(userId)
    const next = [...(this.ticketsByUser.get(userId) ?? []), ticket].slice(-MAX_HANDOFFS_PER_USER)
    this.ticketsByUser.set(userId, next)
    await this.persist(userId)

    void this.notifications.create(
      userId,
      'Human handoff opened',
      `Conversation ${conversationId.slice(0, 8)} escalated to operator queue.`,
      'warning',
    )
    void this.audit.log(userId, 'handoff_create', 'conversation', conversationId, {
      handoffId: ticket.id,
      reason: ticket.reason,
    })
    void this.mission.publish({
      userId,
      type: 'approval',
      status: 'pending',
      source: 'handoff',
      conversationId,
      payload: {
        handoffId: ticket.id,
        reason: ticket.reason,
      },
    })

    return ticket
  }

  async claim(userId: string, ticketId: string) {
    const ticket = await this.getTicket(userId, ticketId)
    if (ticket.status === 'resolved' || ticket.status === 'returned') {
      throw new BadRequestException('Handoff is already closed.')
    }
    if (ticket.status === 'claimed' && ticket.claimedByUserId && ticket.claimedByUserId !== userId) {
      throw new BadRequestException('Handoff already claimed by another operator.')
    }

    const now = new Date().toISOString()
    const next: HumanHandoffTicket = {
      ...ticket,
      status: 'claimed',
      claimedByUserId: userId,
      claimedAt: ticket.claimedAt ?? now,
      updatedAt: now,
    }
    await this.replaceTicket(userId, next)

    void this.audit.log(userId, 'handoff_claim', 'handoff', ticket.id, {
      conversationId: ticket.conversationId,
    })
    void this.mission.publish({
      userId,
      type: 'approval',
      status: 'approved',
      source: 'handoff.claim',
      conversationId: ticket.conversationId,
      payload: { handoffId: ticket.id },
    })
    return next
  }

  async reply(userId: string, ticketId: string, message: string) {
    const ticket = await this.getTicket(userId, ticketId)
    if (ticket.status === 'resolved' || ticket.status === 'returned') {
      throw new BadRequestException('Handoff is closed.')
    }
    if (ticket.status === 'claimed' && ticket.claimedByUserId && ticket.claimedByUserId !== userId) {
      throw new BadRequestException('Handoff is claimed by another operator.')
    }

    const body = this.requireText(message, 'Operator reply')
    const claimed = ticket.status === 'open' ? await this.claim(userId, ticketId) : ticket
    const operatorMessage = `[Human operator] ${body}`
    const created = await this.prisma.message.create({
      data: {
        conversationId: claimed.conversationId,
        role: 'agent',
        status: 'done',
        content: operatorMessage,
      },
      select: { id: true, createdAt: true },
    })
    await this.prisma.conversation.update({
      where: { id: claimed.conversationId },
      data: { lastMessageAt: new Date() },
    })

    const now = new Date().toISOString()
    const next: HumanHandoffTicket = {
      ...claimed,
      status: 'claimed',
      claimedByUserId: userId,
      claimedAt: claimed.claimedAt ?? now,
      updatedAt: now,
      replies: [
        ...claimed.replies,
        {
          id: randomUUID(),
          operatorUserId: userId,
          messageId: created.id,
          message: body,
          createdAt: created.createdAt.toISOString(),
        },
      ].slice(-200),
    }

    await this.replaceTicket(userId, next)

    void this.audit.log(userId, 'handoff_reply', 'handoff', ticket.id, {
      conversationId: ticket.conversationId,
      messageId: created.id,
    })
    void this.mission.publish({
      userId,
      type: 'run',
      status: 'info',
      source: 'handoff.reply',
      conversationId: ticket.conversationId,
      payload: {
        handoffId: ticket.id,
        messageId: created.id,
      },
    })
    return next
  }

  async resolve(userId: string, ticketId: string, resolutionNote?: string) {
    const ticket = await this.getTicket(userId, ticketId)
    if (ticket.status === 'resolved' || ticket.status === 'returned') return ticket

    const note = this.optionalText(resolutionNote)?.slice(0, 1000) ?? null
    const now = new Date().toISOString()
    const next: HumanHandoffTicket = {
      ...ticket,
      status: 'resolved',
      resolutionNote: note,
      resolvedAt: now,
      updatedAt: now,
    }
    await this.replaceTicket(userId, next)

    void this.notifications.create(
      userId,
      'Human handoff resolved',
      `Conversation ${ticket.conversationId.slice(0, 8)} handoff marked resolved.`,
      'success',
    )
    void this.audit.log(userId, 'handoff_resolve', 'handoff', ticket.id, {
      conversationId: ticket.conversationId,
      resolutionNote: note,
    })
    void this.mission.publish({
      userId,
      type: 'run',
      status: 'success',
      source: 'handoff.resolve',
      conversationId: ticket.conversationId,
      payload: {
        handoffId: ticket.id,
        resolutionNote: note,
      },
    })
    return next
  }

  async returnToAgent(userId: string, ticketId: string) {
    const ticket = await this.getTicket(userId, ticketId)
    if (ticket.status === 'returned' || ticket.status === 'resolved') return ticket

    const now = new Date().toISOString()
    const next: HumanHandoffTicket = {
      ...ticket,
      status: 'returned',
      returnedAt: now,
      updatedAt: now,
    }
    await this.replaceTicket(userId, next)

    void this.audit.log(userId, 'handoff_return', 'handoff', ticket.id, {
      conversationId: ticket.conversationId,
    })
    void this.mission.publish({
      userId,
      type: 'run',
      status: 'success',
      source: 'handoff.return',
      conversationId: ticket.conversationId,
      payload: { handoffId: ticket.id },
    })
    return next
  }

  private async captureContext(userId: string, conversationId: string) {
    const [conversation, messages, approvals, memoryContext] = await Promise.all([
      this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true, title: true, userId: true },
      }),
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          role: true,
          status: true,
          content: true,
          createdAt: true,
        },
      }),
      this.prisma.approval.findMany({
        where: {
          conversationId,
          userId,
          status: 'pending',
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          toolName: true,
          status: true,
          createdAt: true,
        },
      }),
      this.memory.buildFilesystemContext(userId).catch(() => ''),
    ])
    if (!conversation || conversation.userId !== userId) {
      throw new NotFoundException(`Conversation "${conversationId}" not found.`)
    }

    return {
      conversationTitle: conversation.title,
      latestMessages: [...messages]
        .reverse()
        .map((message) => ({
          id: message.id,
          role: this.normalizeMessageRole(message.role),
          status: this.normalizeMessageStatus(message.status),
          content: message.content.slice(0, 8000),
          createdAt: message.createdAt.toISOString(),
        })) as HandoffContextMessage[],
      pendingApprovals: approvals.map((approval) => ({
        id: approval.id,
        toolName: approval.toolName,
        status: this.normalizeApprovalStatus(approval.status),
        createdAt: approval.createdAt.toISOString(),
      })) as HandoffContextApproval[],
      memoryContext: memoryContext.slice(0, 16_000),
      capturedAt: new Date().toISOString(),
    }
  }

  private async assertConversationOwnership(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { userId: true },
    })
    if (!conversation || conversation.userId !== userId) {
      throw new NotFoundException(`Conversation "${conversationId}" not found.`)
    }
  }

  private async getTicket(userId: string, ticketId: string) {
    await this.ensureLoaded(userId)
    const ticket = (this.ticketsByUser.get(userId) ?? []).find((item) => item.id === ticketId)
    if (!ticket) throw new NotFoundException(`Handoff "${ticketId}" not found.`)
    return ticket
  }

  private async replaceTicket(userId: string, ticket: HumanHandoffTicket) {
    await this.ensureLoaded(userId)
    const list = [...(this.ticketsByUser.get(userId) ?? [])]
    const index = list.findIndex((item) => item.id === ticket.id)
    if (index === -1) throw new NotFoundException(`Handoff "${ticket.id}" not found.`)
    list[index] = ticket
    this.ticketsByUser.set(userId, list.slice(-MAX_HANDOFFS_PER_USER))
    await this.persist(userId)
  }

  private async ensureLoaded(userId: string) {
    if (this.loadedUsers.has(userId)) return
    const store = await this.readStore(this.storeFilePath(userId))
    const tickets = (store.tickets ?? [])
      .filter((ticket) => ticket.userId === userId)
      .map((ticket) => this.sanitizeStoredTicket(ticket, userId))
      .filter((ticket): ticket is HumanHandoffTicket => Boolean(ticket))
    this.ticketsByUser.set(userId, tickets.slice(-MAX_HANDOFFS_PER_USER))
    this.loadedUsers.add(userId)
  }

  private sanitizeStoredTicket(ticket: HumanHandoffTicket, userId: string): HumanHandoffTicket | null {
    if (!ticket || typeof ticket !== 'object') return null
    const id = this.optionalText(ticket.id)
    const conversationId = this.optionalText(ticket.conversationId)
    const createdAt = this.normalizeIso(ticket.createdAt)
    const updatedAt = this.normalizeIso(ticket.updatedAt)
    const status = this.normalizeStatus(ticket.status)
    if (!id || !conversationId || !createdAt || !updatedAt || !status) return null

    const context = ticket.context && typeof ticket.context === 'object'
      ? ticket.context
      : {
          conversationTitle: null,
          latestMessages: [],
          pendingApprovals: [],
          memoryContext: '',
          capturedAt: createdAt,
        }

    const latestMessages = Array.isArray(context.latestMessages)
      ? context.latestMessages
        .filter((message) => message && typeof message === 'object')
        .map((message) => ({
          id: this.optionalText(message.id) ?? randomUUID(),
          role: message.role === 'user' || message.role === 'agent' || message.role === 'tool' || message.role === 'system'
            ? message.role
            : 'system',
          status: message.status === 'pending' || message.status === 'streaming' || message.status === 'done' || message.status === 'error'
            ? message.status
            : 'done',
          content: String(message.content ?? '').slice(0, 8000),
          createdAt: this.normalizeIso(message.createdAt) ?? createdAt,
        }))
      : []

    const pendingApprovals = Array.isArray(context.pendingApprovals)
      ? context.pendingApprovals
        .filter((approval) => approval && typeof approval === 'object')
        .map((approval) => ({
          id: this.optionalText(approval.id) ?? randomUUID(),
          toolName: this.optionalText(approval.toolName) ?? 'tool',
          status: approval.status === 'pending' || approval.status === 'approved' || approval.status === 'denied'
            ? approval.status
            : 'pending',
          createdAt: this.normalizeIso(approval.createdAt) ?? createdAt,
        }))
      : []

    const replies = Array.isArray(ticket.replies)
      ? ticket.replies
        .filter((reply) => reply && typeof reply === 'object')
        .map((reply) => ({
          id: this.optionalText(reply.id) ?? randomUUID(),
          operatorUserId: this.optionalText(reply.operatorUserId) ?? userId,
          messageId: this.optionalText(reply.messageId) ?? randomUUID(),
          message: String(reply.message ?? '').slice(0, 8000),
          createdAt: this.normalizeIso(reply.createdAt) ?? createdAt,
        }))
      : []

    return {
      id,
      userId,
      conversationId,
      status,
      reason: this.optionalText(ticket.reason),
      createdAt,
      updatedAt,
      claimedByUserId: this.optionalText(ticket.claimedByUserId),
      claimedAt: this.normalizeIso(ticket.claimedAt),
      resolvedAt: this.normalizeIso(ticket.resolvedAt),
      returnedAt: this.normalizeIso(ticket.returnedAt),
      resolutionNote: this.optionalText(ticket.resolutionNote),
      context: {
        conversationTitle: this.optionalText(context.conversationTitle),
        latestMessages,
        pendingApprovals,
        memoryContext: String(context.memoryContext ?? '').slice(0, 16_000),
        capturedAt: this.normalizeIso(context.capturedAt) ?? createdAt,
      },
      replies,
    }
  }

  private normalizeStatus(value: unknown): HandoffStatus | null {
    if (value === 'open' || value === 'claimed' || value === 'resolved' || value === 'returned') return value
    return null
  }

  private normalizeMessageRole(value: unknown): HandoffContextMessage['role'] {
    if (value === 'user' || value === 'agent' || value === 'tool' || value === 'system') return value
    return 'system'
  }

  private normalizeMessageStatus(value: unknown): HandoffContextMessage['status'] {
    if (value === 'pending' || value === 'streaming' || value === 'done' || value === 'error') return value
    return 'done'
  }

  private normalizeApprovalStatus(value: unknown): HandoffContextApproval['status'] {
    if (value === 'pending' || value === 'approved' || value === 'denied') return value
    return 'pending'
  }

  private requireId(value: unknown, label: string) {
    const text = this.optionalText(value)
    if (!text) throw new BadRequestException(`${label} is required.`)
    return text
  }

  private requireText(value: unknown, label: string) {
    const text = this.optionalText(value)
    if (!text) throw new BadRequestException(`${label} is required.`)
    return text
  }

  private optionalText(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed || null
  }

  private normalizeIso(value: unknown) {
    if (value == null) return null
    if (typeof value !== 'string' || !value.trim()) return null
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
  }

  private async persist(userId: string) {
    const filePath = this.storeFilePath(userId)
    const payload: HandoffStoreFile = {
      version: STORE_VERSION,
      tickets: this.ticketsByUser.get(userId) ?? [],
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
  }

  private async readStore(filePath: string): Promise<HandoffStoreFile> {
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<HandoffStoreFile>
      return {
        version: Number.isFinite(parsed.version) ? Number(parsed.version) : STORE_VERSION,
        tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
      }
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : ''
      if (message && !message.toLowerCase().includes('no such file')) {
        this.logger.warn(`Failed to load handoffs store: ${message}`)
      }
      return { version: STORE_VERSION, tickets: [] }
    }
  }

  private storeFilePath(userId: string) {
    const root = (process.env.MEMORY_FILES_ROOT ?? path.resolve(process.cwd(), 'data', 'memory')).trim()
    return path.join(root, userId, HANDOFFS_FILE)
  }
}
