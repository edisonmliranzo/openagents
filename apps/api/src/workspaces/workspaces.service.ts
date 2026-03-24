import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  CreateWorkspaceInput,
  CreateWorkspaceInvitationInput,
  CreateWorkspaceMemoryEntryInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
} from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'
import { WorkflowsService } from '../workflows/workflows.service'
import { buildWorkspacePermissions, hasWorkspaceRole, normalizeWorkspaceRole } from '../common/workspace-role'
import { optionalText, parseJsonStringArray, safeJsonStringify, sanitizeStringArray } from '../common/json'

const DEFAULT_INVITE_DAYS = 7

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: WorkflowsService,
  ) {}

  async listForUser(userId: string): Promise<Workspace[]> {
    const rows = await this.prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
      include: this.workspaceInclude(),
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map((row) => this.toWorkspace(row))
  }

  async listAccessibleIds(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      select: { workspaceId: true },
    })
    const owned = await this.prisma.workspace.findMany({
      where: { ownerId: userId },
      select: { id: true },
    })
    return [...new Set([...memberships.map((row) => row.workspaceId), ...owned.map((row) => row.id)])]
  }

  async listPendingInvitations(userId: string): Promise<WorkspaceInvitation[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    })
    if (!user?.email) return []

    const now = new Date()
    const rows = await this.prisma.workspaceInvitation.findMany({
      where: {
        email: user.email.toLowerCase(),
        status: 'pending',
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((row) => this.toInvitation(row))
  }

  async getForUser(userId: string, workspaceId: string): Promise<Workspace> {
    const row = await this.requireWorkspace(userId, workspaceId, 'viewer')
    return this.toWorkspace(row)
  }

  async create(userId: string, input: CreateWorkspaceInput): Promise<Workspace> {
    const name = this.requireName(input.name)
    const description = optionalText(input.description, 500)
    const settings = this.mergeSettings(input.settings)

    const row = await this.prisma.workspace.create({
      data: {
        ownerId: userId,
        name,
        description,
        allowMemberInvites: settings.allowMemberInvites,
        requireApprovalForNewMembers: settings.requireApprovalForNewMembers,
        defaultMemberRole: settings.defaultMemberRole,
        sharedMemoryEnabled: settings.sharedMemoryEnabled,
        sharedAgentsEnabled: settings.sharedAgentsEnabled,
        members: {
          create: {
            userId,
            role: 'owner',
            permissions: safeJsonStringify(buildWorkspacePermissions('owner'), '[]'),
          },
        },
      },
      include: this.workspaceInclude(),
    })

    return this.toWorkspace(row)
  }

  async update(userId: string, workspaceId: string, input: UpdateWorkspaceInput): Promise<Workspace> {
    const current = await this.requireWorkspace(userId, workspaceId, 'admin')
    const settings = this.mergeSettings(input.settings, {
      allowMemberInvites: current.allowMemberInvites,
      requireApprovalForNewMembers: current.requireApprovalForNewMembers,
      defaultMemberRole: normalizeWorkspaceRole(current.defaultMemberRole),
      sharedMemoryEnabled: current.sharedMemoryEnabled,
      sharedAgentsEnabled: current.sharedAgentsEnabled,
    })

    const row = await this.prisma.workspace.update({
      where: { id: current.id },
      data: {
        ...(input.name !== undefined ? { name: this.requireName(input.name) } : {}),
        ...(input.description !== undefined ? { description: optionalText(input.description, 500) } : {}),
        allowMemberInvites: settings.allowMemberInvites,
        requireApprovalForNewMembers: settings.requireApprovalForNewMembers,
        defaultMemberRole: settings.defaultMemberRole,
        sharedMemoryEnabled: settings.sharedMemoryEnabled,
        sharedAgentsEnabled: settings.sharedAgentsEnabled,
      },
      include: this.workspaceInclude(),
    })

    return this.toWorkspace(row)
  }

  async invite(userId: string, workspaceId: string, input: CreateWorkspaceInvitationInput): Promise<WorkspaceInvitation> {
    const workspace = await this.requireWorkspace(userId, workspaceId, 'editor')
    const currentRole = this.resolveWorkspaceRole(workspace, userId)
    if (currentRole !== 'owner' && currentRole !== 'admin' && !workspace.allowMemberInvites) {
      throw new ForbiddenException('This workspace does not allow member invites from your role.')
    }

    const email = this.normalizeEmail(input.email)
    const role = normalizeWorkspaceRole(input.role ?? workspace.defaultMemberRole)
    const expiresInDays = this.normalizeInviteDays(input.expiresInDays)
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)

    const invitation = await this.prisma.workspaceInvitation.create({
      data: {
        workspaceId: workspace.id,
        email,
        role,
        invitedByUserId: userId,
        expiresAt,
      },
    })

    return this.toInvitation(invitation)
  }

  async acceptInvitation(userId: string, invitationId: string): Promise<Workspace> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    })
    if (!user?.email) {
      throw new BadRequestException('User email is required to accept an invitation.')
    }

    const invitation = await this.prisma.workspaceInvitation.findUnique({
      where: { id: invitationId },
    })
    if (!invitation) throw new NotFoundException('Invitation not found.')
    if (invitation.status !== 'pending') {
      throw new BadRequestException('Invitation is no longer pending.')
    }
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException('Invitation email does not match the current user.')
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      await this.prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      })
      throw new BadRequestException('Invitation has expired.')
    }

    await this.prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: invitation.workspaceId,
          userId,
        },
      },
      update: {
        role: invitation.role,
        permissions: safeJsonStringify(buildWorkspacePermissions(normalizeWorkspaceRole(invitation.role)), '[]'),
        invitedByUserId: invitation.invitedByUserId,
      },
      create: {
        workspaceId: invitation.workspaceId,
        userId,
        role: invitation.role,
        permissions: safeJsonStringify(buildWorkspacePermissions(normalizeWorkspaceRole(invitation.role)), '[]'),
        invitedByUserId: invitation.invitedByUserId,
      },
    })

    await this.prisma.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: 'accepted' },
    })
    return this.getForUser(userId, invitation.workspaceId)
  }

  async addMemoryEntry(userId: string, workspaceId: string, input: CreateWorkspaceMemoryEntryInput) {
    await this.requireWorkspace(userId, workspaceId, 'editor')
    const title = this.requireName(input.title, 100)
    const content = optionalText(input.content, 8_000)
    if (!content) throw new BadRequestException('content is required.')

    const row = await this.prisma.workspaceMemoryEntry.create({
      data: {
        workspaceId,
        createdByUserId: userId,
        type: this.normalizeMemoryType(input.type),
        title,
        content,
        tags: safeJsonStringify(sanitizeStringArray(input.tags, 12, 48), '[]'),
        sourceRef: optionalText(input.sourceRef, 240),
      },
    })

    return this.toMemoryEntry(row)
  }

  async shareConversation(userId: string, workspaceId: string, conversationId: string) {
    await this.requireWorkspace(userId, workspaceId, 'editor')
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true, title: true },
    })
    if (!conversation) throw new NotFoundException('Conversation not found.')

    return this.prisma.workspaceConversation.upsert({
      where: {
        workspaceId_conversationId: {
          workspaceId,
          conversationId,
        },
      },
      update: {
        title: conversation.title ?? 'Untitled conversation',
        sharedByUserId: userId,
      },
      create: {
        workspaceId,
        conversationId,
        title: conversation.title ?? 'Untitled conversation',
        sharedByUserId: userId,
      },
    })
  }

  async shareWorkflow(userId: string, workspaceId: string, workflowId: string) {
    await this.requireWorkspace(userId, workspaceId, 'editor')
    const workflow = await this.workflows.get(userId, workflowId)

    return this.prisma.workspaceWorkflow.upsert({
      where: {
        workspaceId_workflowId: {
          workspaceId,
          workflowId,
        },
      },
      update: {
        name: workflow.name,
        sharedByUserId: userId,
      },
      create: {
        workspaceId,
        workflowId,
        name: workflow.name,
        sharedByUserId: userId,
      },
    })
  }

  async shareArtifact(userId: string, workspaceId: string, artifactId: string) {
    await this.requireWorkspace(userId, workspaceId, 'editor')
    const artifact = await this.prisma.artifact.findFirst({
      where: { id: artifactId, userId },
      select: { id: true, title: true },
    })
    if (!artifact) throw new NotFoundException('Artifact not found.')

    return this.prisma.workspaceArtifact.upsert({
      where: {
        workspaceId_artifactId: {
          workspaceId,
          artifactId,
        },
      },
      update: {
        sharedByUserId: userId,
      },
      create: {
        workspaceId,
        artifactId,
        sharedByUserId: userId,
      },
    })
  }

  async requireWorkspace(userId: string, workspaceId: string, minimumRole: WorkspaceRole) {
    const row = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: this.workspaceInclude(),
    })
    if (!row) throw new NotFoundException('Workspace not found.')

    const role = this.resolveWorkspaceRole(row, userId)
    if (!role) throw new ForbiddenException('Workspace access denied.')
    if (!hasWorkspaceRole(role, minimumRole)) {
      throw new ForbiddenException(`Workspace action requires ${minimumRole} access.`)
    }
    return row
  }

  private resolveWorkspaceRole(
    workspace: {
      ownerId: string
      members?: Array<{ userId: string; role: string }>
    },
    userId: string,
  ): WorkspaceRole | null {
    if (workspace.ownerId === userId) return 'owner'
    const member = workspace.members?.find((entry) => entry.userId === userId)
    return member ? normalizeWorkspaceRole(member.role) : null
  }

  private mergeSettings(
    input?: Partial<Workspace['settings']>,
    current?: Workspace['settings'],
  ): Workspace['settings'] {
    return {
      allowMemberInvites: input?.allowMemberInvites ?? current?.allowMemberInvites ?? true,
      requireApprovalForNewMembers:
        input?.requireApprovalForNewMembers ?? current?.requireApprovalForNewMembers ?? false,
      defaultMemberRole:
        normalizeWorkspaceRole(input?.defaultMemberRole ?? current?.defaultMemberRole ?? 'editor'),
      sharedMemoryEnabled: input?.sharedMemoryEnabled ?? current?.sharedMemoryEnabled ?? true,
      sharedAgentsEnabled: input?.sharedAgentsEnabled ?? current?.sharedAgentsEnabled ?? true,
    }
  }

  private normalizeInviteDays(value: number | undefined) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_INVITE_DAYS
    return Math.max(1, Math.min(Math.trunc(value), 30))
  }

  private normalizeEmail(value: string) {
    const normalized = value.trim().toLowerCase()
    if (!normalized || !normalized.includes('@')) {
      throw new BadRequestException('A valid email is required.')
    }
    return normalized.slice(0, 200)
  }

  private normalizeMemoryType(value: string | undefined) {
    const normalized = (value ?? 'note').trim().toLowerCase()
    if (normalized === 'fact' || normalized === 'summary' || normalized === 'note') return normalized
    return 'note'
  }

  private requireName(raw: string, maxLength = 80) {
    const value = optionalText(raw, maxLength)
    if (!value) throw new BadRequestException('name is required.')
    return value
  }

  private workspaceInclude() {
    return {
      members: {
        orderBy: { createdAt: 'asc' as const },
      },
      invitations: {
        orderBy: { createdAt: 'desc' as const },
      },
      conversations: {
        orderBy: { createdAt: 'desc' as const },
      },
      workflows: {
        orderBy: { createdAt: 'desc' as const },
      },
      sharedArtifacts: {
        include: {
          artifact: {
            select: {
              title: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' as const },
      },
      memoryEntries: {
        orderBy: { updatedAt: 'desc' as const },
      },
    }
  }

  private toWorkspace(row: {
    id: string
    name: string
    description: string | null
    ownerId: string
    allowMemberInvites: boolean
    requireApprovalForNewMembers: boolean
    defaultMemberRole: string
    sharedMemoryEnabled: boolean
    sharedAgentsEnabled: boolean
    createdAt: Date
    updatedAt: Date
    members: Array<{
      id: string
      workspaceId: string
      userId: string
      role: string
      permissions: string
      invitedByUserId: string | null
      createdAt: Date
    }>
    invitations: Array<{
      id: string
      workspaceId: string
      email: string
      role: string
      invitedByUserId: string
      status: string
      expiresAt: Date
      createdAt: Date
      updatedAt: Date
    }>
    conversations: Array<{
      id: string
      workspaceId: string
      conversationId: string
      title: string
      sharedByUserId: string
      createdAt: Date
    }>
    workflows: Array<{
      id: string
      workspaceId: string
      workflowId: string
      name: string
      sharedByUserId: string
      createdAt: Date
    }>
    sharedArtifacts: Array<{
      id: string
      workspaceId: string
      artifactId: string
      sharedByUserId: string
      createdAt: Date
      artifact: { title: string }
    }>
    memoryEntries: Array<{
      id: string
      workspaceId: string
      createdByUserId: string
      type: string
      title: string
      content: string
      tags: string
      sourceRef: string | null
      createdAt: Date
      updatedAt: Date
    }>
  }): Workspace {
    return {
      id: row.id,
      name: row.name,
      ...(row.description ? { description: row.description } : {}),
      ownerId: row.ownerId,
      members: row.members.map((member) => this.toMember(member)),
      invitations: row.invitations.map((invitation) => this.toInvitation(invitation)),
      conversations: row.conversations.map((conversation) => ({
        id: conversation.id,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.conversationId,
        title: conversation.title,
        sharedByUserId: conversation.sharedByUserId,
        createdAt: conversation.createdAt.toISOString(),
      })),
      workflows: row.workflows.map((workflow) => ({
        id: workflow.id,
        workspaceId: workflow.workspaceId,
        workflowId: workflow.workflowId,
        name: workflow.name,
        sharedByUserId: workflow.sharedByUserId,
        createdAt: workflow.createdAt.toISOString(),
      })),
      artifacts: row.sharedArtifacts.map((artifact) => ({
        id: artifact.id,
        workspaceId: artifact.workspaceId,
        artifactId: artifact.artifactId,
        title: artifact.artifact.title,
        sharedByUserId: artifact.sharedByUserId,
        createdAt: artifact.createdAt.toISOString(),
      })),
      memory: row.memoryEntries.map((entry) => this.toMemoryEntry(entry)),
      settings: {
        allowMemberInvites: row.allowMemberInvites,
        requireApprovalForNewMembers: row.requireApprovalForNewMembers,
        defaultMemberRole: normalizeWorkspaceRole(row.defaultMemberRole),
        sharedMemoryEnabled: row.sharedMemoryEnabled,
        sharedAgentsEnabled: row.sharedAgentsEnabled,
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toMember(row: {
    id: string
    workspaceId: string
    userId: string
    role: string
    permissions: string
    invitedByUserId: string | null
    createdAt: Date
  }): WorkspaceMember {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
      role: normalizeWorkspaceRole(row.role),
      permissions: parseJsonStringArray(row.permissions),
      ...(row.invitedByUserId ? { invitedByUserId: row.invitedByUserId } : {}),
      joinedAt: row.createdAt.toISOString(),
    }
  }

  private toInvitation(row: {
    id: string
    workspaceId: string
    email: string
    role: string
    invitedByUserId: string
    status: string
    expiresAt: Date
    createdAt: Date
    updatedAt: Date
  }): WorkspaceInvitation {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      email: row.email,
      role: normalizeWorkspaceRole(row.role),
      invitedBy: row.invitedByUserId,
      expiresAt: row.expiresAt.toISOString(),
      status: row.status === 'accepted' || row.status === 'declined' || row.status === 'expired'
        ? row.status
        : 'pending',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toMemoryEntry(row: {
    id: string
    workspaceId: string
    createdByUserId: string
    type: string
    title: string
    content: string
    tags: string
    sourceRef: string | null
    createdAt: Date
    updatedAt: Date
  }) {
    const type: 'fact' | 'summary' | 'note' =
      row.type === 'fact' || row.type === 'summary' ? row.type : 'note'
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      createdByUserId: row.createdByUserId,
      type,
      title: row.title,
      content: row.content,
      tags: parseJsonStringArray(row.tags),
      ...(row.sourceRef ? { sourceRef: row.sourceRef } : {}),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}
