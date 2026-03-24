import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  AgentPreset,
  AgentPresetPolicyProfile,
  AgentPresetVisibility,
  ApplyAgentPresetInput,
  ApplyAgentPresetResult,
  CreateAgentPresetInput,
  UpdateAgentPresetInput,
  WorkspaceRole,
} from '@openagents/shared'
import { NanobotSkillsRegistry } from '../nanobot/agent/nanobot-skills.registry'
import { PrismaService } from '../prisma/prisma.service'
import { WorkspacesService } from '../workspaces/workspaces.service'
import { optionalText, parseJsonObject, parseJsonStringArray, safeJsonStringify, sanitizeStringArray } from '../common/json'

@Injectable()
export class AgentPresetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skills: NanobotSkillsRegistry,
    private readonly workspaces: WorkspacesService,
  ) {}

  async list(userId: string): Promise<AgentPreset[]> {
    const workspaceIds = await this.workspaces.listAccessibleIds(userId)
    const rows = await this.prisma.agentPreset.findMany({
      where: {
        OR: [
          { userId },
          ...(workspaceIds.length > 0 ? [{ workspaceId: { in: workspaceIds } }] : []),
        ],
      },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map((row) => this.toPreset(row))
  }

  async get(userId: string, presetId: string): Promise<AgentPreset> {
    const row = await this.requirePreset(userId, presetId, 'viewer')
    return this.toPreset(row)
  }

  async create(userId: string, input: CreateAgentPresetInput): Promise<AgentPreset> {
    const workspaceId = await this.normalizeWorkspaceId(userId, input.workspaceId, 'editor')
    const nowVisibility = this.normalizeVisibility(input.visibility, workspaceId)
    const settings = this.sanitizeSettings(input.settings)
    const policy = this.sanitizePolicy(input.policy)

    const row = await this.prisma.agentPreset.create({
      data: {
        userId,
        workspaceId,
        name: this.requireName(input.name),
        description: optionalText(input.description, 500),
        role: optionalText(input.role, 64) ?? 'assistant',
        outputStyle: optionalText(input.outputStyle, 120),
        autonomyMode: this.normalizeAutonomyMode(input.autonomyMode),
        visibility: nowVisibility,
        preferredProvider: settings.preferredProvider ?? null,
        preferredModel: settings.preferredModel ?? null,
        customSystemPrompt: settings.customSystemPrompt ?? null,
        enabledSkills: safeJsonStringify(sanitizeStringArray(input.enabledSkills, 20, 64), '[]'),
        tools: safeJsonStringify(sanitizeStringArray(input.tools, 20, 120), '[]'),
        connectorIds: safeJsonStringify(sanitizeStringArray(input.connectorIds, 20, 80), '[]'),
        suggestedWorkflowIds: safeJsonStringify(sanitizeStringArray(input.suggestedWorkflowIds, 20, 80), '[]'),
        policyJson: safeJsonStringify(policy),
      },
    })

    return this.toPreset(row)
  }

  async update(userId: string, presetId: string, input: UpdateAgentPresetInput): Promise<AgentPreset> {
    const existing = await this.requirePreset(userId, presetId, 'editor')
    const workspaceId = input.workspaceId === undefined
      ? existing.workspaceId
      : await this.normalizeWorkspaceId(userId, input.workspaceId ?? undefined, 'editor')

    const current = this.toPreset(existing)
    const nextSettings = this.sanitizeSettings({
      preferredProvider: input.settings?.preferredProvider ?? current.settings.preferredProvider,
      preferredModel: input.settings?.preferredModel ?? current.settings.preferredModel,
      customSystemPrompt: input.settings?.customSystemPrompt ?? current.settings.customSystemPrompt,
    })
    const nextPolicy = this.sanitizePolicy({
      ...current.policy,
      ...(input.policy ?? {}),
    })

    const row = await this.prisma.agentPreset.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: this.requireName(input.name) } : {}),
        ...(input.description !== undefined ? { description: optionalText(input.description, 500) } : {}),
        ...(input.role !== undefined ? { role: optionalText(input.role, 64) ?? 'assistant' } : {}),
        ...(input.outputStyle !== undefined ? { outputStyle: optionalText(input.outputStyle, 120) } : {}),
        ...(input.autonomyMode !== undefined
          ? { autonomyMode: this.normalizeAutonomyMode(input.autonomyMode) }
          : {}),
        ...(input.visibility !== undefined
          ? { visibility: this.normalizeVisibility(input.visibility, workspaceId) }
          : {}),
        workspaceId,
        preferredProvider: nextSettings.preferredProvider ?? null,
        preferredModel: nextSettings.preferredModel ?? null,
        customSystemPrompt: nextSettings.customSystemPrompt ?? null,
        ...(input.enabledSkills !== undefined
          ? { enabledSkills: safeJsonStringify(sanitizeStringArray(input.enabledSkills, 20, 64), '[]') }
          : {}),
        ...(input.tools !== undefined
          ? { tools: safeJsonStringify(sanitizeStringArray(input.tools, 20, 120), '[]') }
          : {}),
        ...(input.connectorIds !== undefined
          ? { connectorIds: safeJsonStringify(sanitizeStringArray(input.connectorIds, 20, 80), '[]') }
          : {}),
        ...(input.suggestedWorkflowIds !== undefined
          ? {
            suggestedWorkflowIds: safeJsonStringify(
              sanitizeStringArray(input.suggestedWorkflowIds, 20, 80),
              '[]',
            ),
          }
          : {}),
        policyJson: safeJsonStringify(nextPolicy),
        version: { increment: 1 },
      },
    })

    return this.toPreset(row)
  }

  async remove(userId: string, presetId: string) {
    await this.requirePreset(userId, presetId, 'admin')
    await this.prisma.agentPreset.delete({ where: { id: presetId } })
    return { ok: true as const }
  }

  async apply(userId: string, presetId: string, _input: ApplyAgentPresetInput = {}): Promise<ApplyAgentPresetResult> {
    const existing = await this.requirePreset(userId, presetId, 'viewer')
    const preset = this.toPreset(existing)

    await this.prisma.userSettings.upsert({
      where: { userId },
      update: {
        preferredProvider: preset.settings.preferredProvider ?? undefined,
        preferredModel: preset.settings.preferredModel ?? undefined,
        customSystemPrompt: preset.settings.customSystemPrompt ?? null,
      },
      create: {
        userId,
        preferredProvider: preset.settings.preferredProvider ?? 'anthropic',
        preferredModel: preset.settings.preferredModel ?? 'claude-sonnet-4-6',
        customSystemPrompt: preset.settings.customSystemPrompt ?? null,
      },
    })

    const availableSkills = await this.skills.listForUser(userId)
    const targetIds = new Set(preset.enabledSkills)
    for (const skill of availableSkills) {
      const shouldEnable = targetIds.has(skill.id)
      if (skill.enabled === shouldEnable) continue
      await this.skills.setSkillEnabled(userId, skill.id, shouldEnable)
    }
    const appliedSkills = (await this.skills.listForUser(userId))
      .filter((skill) => skill.enabled)
      .map((skill) => skill.id)

    const appliedAt = new Date()
    const row = await this.prisma.agentPreset.update({
      where: { id: existing.id },
      data: {
        appliedCount: { increment: 1 },
        lastAppliedAt: appliedAt,
      },
    })

    return {
      ok: true,
      preset: this.toPreset(row),
      appliedSkills,
      settings: preset.settings,
      appliedAt: appliedAt.toISOString(),
    }
  }

  private async requirePreset(userId: string, presetId: string, minimumRole: WorkspaceRole) {
    const row = await this.prisma.agentPreset.findUnique({ where: { id: presetId } })
    if (!row) throw new NotFoundException('Preset not found.')
    if (row.userId === userId) return row
    if (!row.workspaceId) throw new ForbiddenException('Preset access denied.')
    await this.workspaces.requireWorkspace(userId, row.workspaceId, minimumRole)
    return row
  }

  private async normalizeWorkspaceId(
    userId: string,
    workspaceId: string | undefined,
    minimumRole: WorkspaceRole,
  ) {
    const normalized = optionalText(workspaceId, 80)
    if (!normalized) return null
    await this.workspaces.requireWorkspace(userId, normalized, minimumRole)
    return normalized
  }

  private requireName(raw: string) {
    const value = optionalText(raw, 80)
    if (!value) throw new BadRequestException('name is required.')
    return value
  }

  private normalizeAutonomyMode(raw: unknown) {
    if (raw === 'copilot' || raw === 'autonomous') return raw
    return 'assist'
  }

  private normalizeVisibility(raw: unknown, workspaceId: string | null): AgentPresetVisibility {
    if (raw === 'workspace' || raw === 'public') return raw
    if (workspaceId) return 'workspace'
    return 'private'
  }

  private sanitizeSettings(input: {
    preferredProvider?: string | null
    preferredModel?: string | null
    customSystemPrompt?: string | null
  } = {}) {
    return {
      ...(optionalText(input.preferredProvider, 80)
        ? { preferredProvider: optionalText(input.preferredProvider, 80) ?? undefined }
        : {}),
      ...(optionalText(input.preferredModel, 120)
        ? { preferredModel: optionalText(input.preferredModel, 120) ?? undefined }
        : {}),
      ...(optionalText(input.customSystemPrompt, 4_000)
        ? { customSystemPrompt: optionalText(input.customSystemPrompt, 4_000) ?? undefined }
        : {}),
    }
  }

  private sanitizePolicy(input: Partial<AgentPresetPolicyProfile> | undefined): AgentPresetPolicyProfile {
    const maxAutonomySteps = typeof input?.maxAutonomySteps === 'number' && Number.isFinite(input.maxAutonomySteps)
      ? Math.max(1, Math.min(Math.trunc(input.maxAutonomySteps), 50))
      : 6
    return {
      defaultDecision: input?.defaultDecision === 'auto' || input?.defaultDecision === 'block'
        ? input.defaultDecision
        : 'confirm',
      approvalScopes: sanitizeStringArray(input?.approvalScopes, 8, 40)
        .filter((scope): scope is AgentPresetPolicyProfile['approvalScopes'][number] =>
          scope === 'local'
            || scope === 'external_read'
            || scope === 'external_write'
            || scope === 'system_mutation',
        ),
      blockedTools: sanitizeStringArray(input?.blockedTools, 20, 120),
      requireApprovalTools: sanitizeStringArray(input?.requireApprovalTools, 20, 120),
      maxAutonomySteps,
    }
  }

  private toPreset(row: {
    id: string
    userId: string
    workspaceId: string | null
    name: string
    description: string | null
    role: string
    outputStyle: string | null
    autonomyMode: string
    visibility: string
    version: number
    preferredProvider: string | null
    preferredModel: string | null
    customSystemPrompt: string | null
    enabledSkills: string
    tools: string
    connectorIds: string
    suggestedWorkflowIds: string
    policyJson: string | null
    appliedCount: number
    lastAppliedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }): AgentPreset {
    const policy = parseJsonObject(row.policyJson)
    const normalizedPolicy = this.sanitizePolicy((policy ?? {}) as Partial<AgentPresetPolicyProfile>)
    return {
      id: row.id,
      userId: row.userId,
      ...(row.workspaceId ? { workspaceId: row.workspaceId } : {}),
      name: row.name,
      ...(row.description ? { description: row.description } : {}),
      role: row.role,
      ...(row.outputStyle ? { outputStyle: row.outputStyle } : {}),
      autonomyMode: this.normalizeAutonomyMode(row.autonomyMode),
      visibility: this.normalizeVisibility(row.visibility, row.workspaceId),
      version: row.version,
      settings: {
        ...(row.preferredProvider ? { preferredProvider: row.preferredProvider } : {}),
        ...(row.preferredModel ? { preferredModel: row.preferredModel } : {}),
        ...(row.customSystemPrompt ? { customSystemPrompt: row.customSystemPrompt } : {}),
      },
      enabledSkills: parseJsonStringArray(row.enabledSkills),
      tools: parseJsonStringArray(row.tools),
      connectorIds: parseJsonStringArray(row.connectorIds),
      suggestedWorkflowIds: parseJsonStringArray(row.suggestedWorkflowIds),
      policy: normalizedPolicy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...(row.lastAppliedAt ? { lastAppliedAt: row.lastAppliedAt.toISOString() } : {}),
      appliedCount: row.appliedCount,
    }
  }
}
