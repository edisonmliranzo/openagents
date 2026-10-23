import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { randomUUID } from 'crypto'
import type { LLMProvider, WorkspaceRole } from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'
import { DocumentStore } from '../prisma/document-store.service'
import { buildWorkspacePermissions, hasWorkspaceRole, normalizeWorkspaceRole } from '../common/workspace-role'
import { safeJsonStringify } from '../common/json'
import { WorkspacesService } from './workspaces.service'

export interface ThreadMessage {
  id: string
  authorId: string
  /** 'agent' for AI replies */
  authorType: 'user' | 'agent'
  content: string
  mentions: string[]
  createdAt: string
}

export interface WorkspaceThread {
  id: string
  workspaceId: string
  title: string
  createdBy: string
  createdAt: string
  updatedAt: string
  messages: ThreadMessage[]
}

interface ThreadsFile {
  threads: WorkspaceThread[]
}

/** "member" is the UI name for the stored "editor" role. */
export function normalizeTeamRole(raw: unknown): WorkspaceRole {
  if (typeof raw === 'string' && raw.trim().toLowerCase() === 'member') return 'editor'
  return normalizeWorkspaceRole(raw)
}

const AGENT_MENTION_RE = /(^|\s)@(agent|openagents|ai)\b/i
const MAX_THREADS = 200
const MAX_MESSAGES = 500

@Injectable()
export class WorkspaceCollabService {
  private readonly logger = new Logger(WorkspaceCollabService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesService,
    private readonly moduleRef: ModuleRef,
    private readonly documents: DocumentStore,
  ) {}

  // ── Members & invites ──────────────────────────────────────────────────────

  inviteUrl(invitationId: string) {
    const base = (process.env.WEB_URL ?? process.env.FRONTEND_URL ?? '').replace(/\/$/, '')
    return `${base}/workspaces?invite=${encodeURIComponent(invitationId)}`
  }

  async myRole(userId: string, workspaceId: string) {
    const row = await this.workspaces.requireWorkspace(userId, workspaceId, 'viewer')
    if (row.ownerId === userId) return { role: 'owner' as WorkspaceRole }
    const member = row.members.find((m) => m.userId === userId)
    return { role: normalizeWorkspaceRole(member?.role) }
  }

  async updateMemberRole(actorId: string, workspaceId: string, memberUserId: string, rawRole: unknown) {
    const row = await this.workspaces.requireWorkspace(actorId, workspaceId, 'admin')
    const role = normalizeTeamRole(rawRole)
    if (role === 'owner') throw new BadRequestException('Ownership transfer is not supported here.')
    if (memberUserId === row.ownerId) throw new ForbiddenException('The owner role cannot be changed.')
    const actorRole: WorkspaceRole = row.ownerId === actorId
      ? 'owner'
      : normalizeWorkspaceRole(row.members.find((m) => m.userId === actorId)?.role)
    const target = row.members.find((m) => m.userId === memberUserId)
    if (!target) throw new NotFoundException('Member not found.')
    if (actorRole !== 'owner' && (normalizeWorkspaceRole(target.role) === 'admin' || role === 'admin')) {
      throw new ForbiddenException('Only the owner can manage admins.')
    }
    await this.prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: memberUserId } },
      data: { role, permissions: safeJsonStringify(buildWorkspacePermissions(role), '[]') },
    })
    return this.workspaces.getForUser(actorId, workspaceId)
  }

  async removeMember(actorId: string, workspaceId: string, memberUserId: string) {
    const isSelf = actorId === memberUserId
    const row = await this.workspaces.requireWorkspace(actorId, workspaceId, isSelf ? 'viewer' : 'admin')
    if (memberUserId === row.ownerId) throw new ForbiddenException('The owner cannot be removed.')
    const target = row.members.find((m) => m.userId === memberUserId)
    if (!target) throw new NotFoundException('Member not found.')
    if (!isSelf && row.ownerId !== actorId && normalizeWorkspaceRole(target.role) === 'admin') {
      throw new ForbiddenException('Only the owner can remove admins.')
    }
    await this.prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: memberUserId } },
    })
    return { ok: true }
  }

  async revokeInvitation(actorId: string, workspaceId: string, invitationId: string) {
    await this.workspaces.requireWorkspace(actorId, workspaceId, 'admin')
    const inv = await this.prisma.workspaceInvitation.findFirst({ where: { id: invitationId, workspaceId } })
    if (!inv) throw new NotFoundException('Invitation not found.')
    await this.prisma.workspaceInvitation.update({ where: { id: inv.id }, data: { status: 'declined' } })
    return { ok: true }
  }

  async deleteMemoryEntry(actorId: string, workspaceId: string, entryId: string) {
    const row = await this.workspaces.requireWorkspace(actorId, workspaceId, 'editor')
    const entry = await this.prisma.workspaceMemoryEntry.findFirst({ where: { id: entryId, workspaceId } })
    if (!entry) throw new NotFoundException('Memory entry not found.')
    const actorRole: WorkspaceRole = row.ownerId === actorId
      ? 'owner'
      : normalizeWorkspaceRole(row.members.find((m) => m.userId === actorId)?.role)
    if (entry.createdByUserId !== actorId && !hasWorkspaceRole(actorRole, 'admin')) {
      throw new ForbiddenException('Only admins can delete other members\' memory entries.')
    }
    await this.prisma.workspaceMemoryEntry.delete({ where: { id: entry.id } })
    return { ok: true }
  }

  // ── Threads ────────────────────────────────────────────────────────────────

  async listThreads(userId: string, workspaceId: string) {
    await this.workspaces.requireWorkspace(userId, workspaceId, 'viewer')
    const data = await this.load(userId, workspaceId)
    return data.threads
      .map((t) => ({ ...t, messageCount: t.messages.length, messages: t.messages.slice(-1) }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async getThread(userId: string, workspaceId: string, threadId: string) {
    await this.workspaces.requireWorkspace(userId, workspaceId, 'viewer')
    const thread = (await this.load(userId, workspaceId)).threads.find((t) => t.id === threadId)
    if (!thread) throw new NotFoundException('Thread not found.')
    return thread
  }

  async createThread(userId: string, workspaceId: string, input: { title?: string; message?: string }) {
    await this.workspaces.requireWorkspace(userId, workspaceId, 'editor')
    const data = await this.load(userId, workspaceId)
    if (data.threads.length >= MAX_THREADS) throw new BadRequestException('Thread limit reached.')
    const now = new Date().toISOString()
    const thread: WorkspaceThread = {
      id: randomUUID(),
      workspaceId,
      title: String(input?.title ?? '').trim().slice(0, 120) || 'New thread',
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      messages: [],
    }
    data.threads.push(thread)
    await this.save(userId, workspaceId, data)
    if (input?.message?.trim()) return this.postMessage(userId, workspaceId, thread.id, { content: input.message })
    return thread
  }

  async deleteThread(userId: string, workspaceId: string, threadId: string) {
    const row = await this.workspaces.requireWorkspace(userId, workspaceId, 'editor')
    const data = await this.load(userId, workspaceId)
    const thread = data.threads.find((t) => t.id === threadId)
    if (!thread) throw new NotFoundException('Thread not found.')
    const role: WorkspaceRole = row.ownerId === userId
      ? 'owner'
      : normalizeWorkspaceRole(row.members.find((m) => m.userId === userId)?.role)
    if (thread.createdBy !== userId && !hasWorkspaceRole(role, 'admin')) {
      throw new ForbiddenException('Only admins can delete other members\' threads.')
    }
    data.threads = data.threads.filter((t) => t.id !== threadId)
    await this.save(userId, workspaceId, data)
    return { ok: true }
  }

  async postMessage(userId: string, workspaceId: string, threadId: string, input: { content?: string }) {
    const row = await this.workspaces.requireWorkspace(userId, workspaceId, 'editor')
    const content = String(input?.content ?? '').trim().slice(0, 8000)
    if (!content) throw new BadRequestException('content is required.')
    const data = await this.load(userId, workspaceId)
    const thread = data.threads.find((t) => t.id === threadId)
    if (!thread) throw new NotFoundException('Thread not found.')

    const mentions = [...content.matchAll(/(?:^|\s)@([a-zA-Z0-9_.-]+)/g)].map((m) => m[1].toLowerCase())
    const message: ThreadMessage = {
      id: randomUUID(),
      authorId: userId,
      authorType: 'user',
      content,
      mentions,
      createdAt: new Date().toISOString(),
    }
    thread.messages.push(message)
    thread.updatedAt = message.createdAt

    if (AGENT_MENTION_RE.test(content)) {
      if (!row.sharedAgentsEnabled) {
        thread.messages.push(this.agentMessage('Shared agents are disabled for this workspace.'))
      } else {
        const reply = await this.agentReply(userId, workspaceId, thread).catch((err) => {
          this.logger.warn(`Workspace agent reply failed: ${(err as Error).message}`)
          return 'Sorry, I could not respond right now.'
        })
        thread.messages.push(this.agentMessage(reply))
      }
      thread.updatedAt = new Date().toISOString()
    }

    thread.messages = thread.messages.slice(-MAX_MESSAGES)
    await this.save(userId, workspaceId, data)
    return thread
  }

  private agentMessage(content: string): ThreadMessage {
    return { id: randomUUID(), authorId: 'agent', authorType: 'agent', content, mentions: [], createdAt: new Date().toISOString() }
  }

  /** Reply using the workspace briefing (shared memory only) — billed to the member who mentioned the agent. */
  private async agentReply(userId: string, workspaceId: string, thread: WorkspaceThread) {
    const { briefing } = await this.workspaces.buildBriefing(userId, workspaceId)
    // Resolved lazily to avoid a module import cycle (Agent → Tools → … → Workspaces).
    const { LLMService } = await import('../agent/llm.service')
    const { UsersService } = await import('../users/users.service')
    const llm = this.moduleRef.get(LLMService, { strict: false })
    const users = this.moduleRef.get(UsersService, { strict: false })

    const settings = await this.prisma.userSettings.findUnique({ where: { userId } }).catch(() => null)
    const provider = (settings?.preferredProvider ?? 'ollama') as LLMProvider
    const key = await users.getRawLlmKey(userId, provider).catch(() => null)
    const apiKey = key?.isActive ? (key.apiKey ?? key.loginPassword ?? undefined) : undefined
    const baseUrl = key?.isActive ? (key.baseUrl ?? undefined) : undefined

    const transcript = thread.messages.slice(-20)
      .map((m) => `${m.authorType === 'agent' ? 'Agent' : `Member ${m.authorId.slice(0, 8)}`}: ${m.content}`)
      .join('\n')
    const response = await llm.complete(
      [{ role: 'user', content: `Thread "${thread.title}":\n${transcript}\n\nReply to the latest message that mentions you.` }],
      [],
      `You are the OpenAgents team assistant inside a shared workspace. Use only the workspace context below; do not reveal any individual member's private data.\n\n${briefing}`,
      provider,
      apiKey,
      baseUrl,
      settings?.preferredModel ?? undefined,
    )
    return (response.content ?? '').trim() || 'I have nothing to add yet.'
  }

  // ── Storage ────────────────────────────────────────────────────────────────

  private async load(userId: string, workspaceId: string): Promise<ThreadsFile> {
    const parsed = await this.documents.read<Partial<ThreadsFile>>(
      userId,
      'workspace_threads',
      () => ({}),
      workspaceId,
    )
    return { threads: Array.isArray(parsed.threads) ? parsed.threads : [] }
  }

  private async save(userId: string, workspaceId: string, data: ThreadsFile) {
    await this.documents.write(userId, 'workspace_threads', data, workspaceId)
  }
}
