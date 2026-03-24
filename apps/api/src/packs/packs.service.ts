import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  CreatePackInput,
  CreateWorkflowInput,
  PackArtifactTemplateTemplate,
  PackBundle,
  PackInstallPreview,
  PackInstallResult,
  PackManifest,
  PackPolicyTemplate,
  PackPresetTemplate,
  PackVisibility,
  PackWorkflowTemplate,
  SearchPacksInput,
  SkillManifest,
  WorkspaceRole,
} from '@openagents/shared'
import { AgentPresetsService } from '../agent-presets/agent-presets.service'
import { ArtifactsService } from '../artifacts/artifacts.service'
import { optionalText, parseJsonObject, parseJsonStringArray, safeJsonStringify, sanitizeStringArray } from '../common/json'
import { PrismaService } from '../prisma/prisma.service'
import { NanobotSkillsRegistry } from '../nanobot/agent/nanobot-skills.registry'
import { ToolsService } from '../tools/tools.service'
import { WorkflowsService } from '../workflows/workflows.service'
import { WorkspacesService } from '../workspaces/workspaces.service'

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?$/

@Injectable()
export class PacksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skills: NanobotSkillsRegistry,
    private readonly tools: ToolsService,
    private readonly workflows: WorkflowsService,
    private readonly workspaces: WorkspacesService,
    private readonly presets: AgentPresetsService,
    private readonly artifacts: ArtifactsService,
  ) {}

  async listMine(userId: string): Promise<PackBundle[]> {
    const workspaceIds = await this.workspaces.listAccessibleIds(userId)
    const rows = await this.prisma.pack.findMany({
      where: {
        OR: [
          { userId },
          ...(workspaceIds.length > 0 ? [{ workspaceId: { in: workspaceIds } }] : []),
        ],
      },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map((row) => this.toPack(row))
  }

  async listPublic(userId: string, input: SearchPacksInput = {}): Promise<PackBundle[]> {
    const query = optionalText(input.q, 120)?.toLowerCase() ?? null
    const tag = optionalText(input.tag, 48)?.toLowerCase() ?? null
    const limit = this.normalizeLimit(input.limit)

    const rows = await this.prisma.pack.findMany({
      where: {
        visibility: 'public',
      },
      orderBy: [{ installCount: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    })

    return rows
      .map((row) => this.toPack(row))
      .filter((pack) => {
        if (tag && !pack.tags.some((entry) => entry.toLowerCase() === tag)) return false
        if (!query) return true
        const haystack = [
          pack.name,
          pack.description ?? '',
          ...pack.tags,
          ...pack.manifest.skills.map((skill) => skill.title),
          ...pack.manifest.presets.map((preset) => preset.preset.name),
          ...pack.manifest.workflows.map((workflow) => workflow.workflow.name),
        ].join(' ').toLowerCase()
        return haystack.includes(query)
      })
      .filter((pack) => pack.userId !== userId || pack.visibility === 'public')
  }

  async get(userId: string, packId: string): Promise<PackBundle> {
    const row = await this.requirePack(userId, packId, 'viewer')
    return this.toPack(row)
  }

  async create(userId: string, input: CreatePackInput): Promise<PackBundle> {
    const workspaceId = await this.normalizeWorkspaceId(userId, input.workspaceId, 'editor')
    const manifest = await this.buildManifest(userId, input)
    const visibility = this.normalizeVisibility(input.visibility, workspaceId)
    const row = await this.prisma.pack.create({
      data: {
        userId,
        workspaceId,
        slug: this.slugify(this.requireName(input.name)),
        name: this.requireName(input.name),
        description: optionalText(input.description, 500),
        version: this.normalizeVersion(input.version),
        visibility,
        tags: safeJsonStringify(sanitizeStringArray(input.tags, 12, 40), '[]'),
        manifestJson: safeJsonStringify(manifest),
      },
    })
    return this.toPack(row)
  }

  async previewInstall(userId: string, packId: string): Promise<PackInstallPreview> {
    const pack = await this.get(userId, packId)
    const knownTools = new Set((await this.tools.getAllDefinitions()).map((tool) => tool.name))
    const requiredTools = new Set<string>()
    for (const skill of pack.manifest.skills) {
      for (const tool of skill.tools) requiredTools.add(tool)
    }
    for (const preset of pack.manifest.presets) {
      for (const tool of preset.preset.tools ?? []) requiredTools.add(tool)
    }

    const missingTools = [...requiredTools]
      .filter((tool) => !knownTools.has(tool))
      .sort((left, right) => left.localeCompare(right))

    return {
      packId: pack.id,
      installable: missingTools.length === 0,
      missingTools,
      counts: {
        skills: pack.manifest.skills.length,
        presets: pack.manifest.presets.length,
        workflows: pack.manifest.workflows.length,
        artifactTemplates: pack.manifest.artifactTemplates.length,
        policies: pack.manifest.policies.length,
      },
    }
  }

  async install(userId: string, packId: string): Promise<PackInstallResult> {
    const preview = await this.previewInstall(userId, packId)
    if (!preview.installable) {
      throw new BadRequestException(`Pack is missing required tools: ${preview.missingTools.join(', ')}`)
    }

    const pack = await this.get(userId, packId)
    const bundledSkills = new Set((await this.skills.listBundled()).map((skill) => skill.id))
    const installedSkills: string[] = []
    const presetIds: string[] = []
    const workflowIds: string[] = []
    const artifactTemplateIds: string[] = []
    const workflowIdMap = new Map<string, string>()

    for (const workflow of pack.manifest.workflows) {
      const created = await this.workflows.create(userId, workflow.workflow)
      workflowIds.push(created.id)
      workflowIdMap.set(workflow.sourceId, created.id)
    }

    for (const skill of pack.manifest.skills) {
      if (bundledSkills.has(skill.id)) {
        await this.skills.setSkillEnabled(userId, skill.id, true)
        installedSkills.push(skill.id)
        continue
      }

      const result = await this.skills.upsertCustomSkill(userId, {
        id: skill.id,
        title: skill.title,
        description: skill.description,
        tools: skill.tools,
        promptAppendix: skill.promptAppendix,
      })
      installedSkills.push(result.skill.id)
    }

    for (const preset of pack.manifest.presets) {
      const remappedWorkflowIds = (preset.preset.suggestedWorkflowIds ?? [])
        .map((sourceId) => workflowIdMap.get(sourceId) ?? sourceId)
      const created = await this.presets.create(userId, {
        ...preset.preset,
        suggestedWorkflowIds: remappedWorkflowIds,
      })
      presetIds.push(created.id)
    }

    for (const template of pack.manifest.artifactTemplates) {
      const created = await this.artifacts.createTemplate(userId, template.template)
      artifactTemplateIds.push(created.id)
    }

    const installedAt = new Date().toISOString()
    await this.prisma.pack.update({
      where: { id: pack.id },
      data: {
        installCount: { increment: 1 },
        installs: {
          upsert: {
            where: {
              packId_userId: {
                packId: pack.id,
                userId,
              },
            },
            update: {
              status: 'installed',
              summary: `Installed ${installedSkills.length} skills, ${presetIds.length} presets, ${workflowIds.length} workflows, and ${artifactTemplateIds.length} artifact templates.`,
            },
            create: {
              userId,
              status: 'installed',
              summary: `Installed ${installedSkills.length} skills, ${presetIds.length} presets, ${workflowIds.length} workflows, and ${artifactTemplateIds.length} artifact templates.`,
            },
          },
        },
      },
    })

    return {
      ok: true,
      pack,
      installed: {
        skills: installedSkills,
        presetIds,
        workflowIds,
        artifactTemplateIds,
      },
      installedAt,
    }
  }

  private async requirePack(userId: string, packId: string, minimumRole: WorkspaceRole) {
    const row = await this.prisma.pack.findUnique({ where: { id: packId } })
    if (!row) throw new NotFoundException('Pack not found.')
    if (row.userId === userId) return row
    if (row.visibility === 'public') return row
    if (!row.workspaceId) throw new ForbiddenException('Pack access denied.')
    await this.workspaces.requireWorkspace(userId, row.workspaceId, minimumRole)
    return row
  }

  private async buildManifest(userId: string, input: CreatePackInput): Promise<PackManifest> {
    const selectedSkillIds = sanitizeStringArray(input.skillIds, 30, 80)
    const selectedPresetIds = sanitizeStringArray(input.presetIds, 30, 80)
    const selectedWorkflowIds = sanitizeStringArray(input.workflowIds, 30, 80)
    const selectedArtifactTemplateIds = sanitizeStringArray(input.artifactTemplateIds, 30, 80)

    const [allSkills, presets, workflows, templates] = await Promise.all([
      this.skills.listForUser(userId),
      Promise.all(selectedPresetIds.map((id) => this.presets.get(userId, id))),
      Promise.all(selectedWorkflowIds.map((id) => this.workflows.get(userId, id))),
      Promise.all(selectedArtifactTemplateIds.map((id) => this.artifacts.getTemplate(userId, id))),
    ])

    const skillMap = new Map(allSkills.map((skill) => [skill.id, skill]))
    const skills = selectedSkillIds.map((skillId) => {
      const skill = skillMap.get(skillId)
      if (!skill) {
        throw new NotFoundException(`Skill "${skillId}" not found.`)
      }
      const manifest: SkillManifest = {
        id: skill.id,
        title: skill.title,
        description: skill.description,
        tools: skill.tools,
        ...(skill.promptAppendix ? { promptAppendix: skill.promptAppendix } : {}),
      }
      return manifest
    })

    const presetTemplates: PackPresetTemplate[] = presets.map((preset) => ({
      sourceId: preset.id,
      preset: {
        name: preset.name,
        ...(preset.description ? { description: preset.description } : {}),
        role: preset.role,
        ...(preset.outputStyle ? { outputStyle: preset.outputStyle } : {}),
        autonomyMode: preset.autonomyMode,
        settings: preset.settings,
        enabledSkills: preset.enabledSkills,
        tools: preset.tools,
        connectorIds: preset.connectorIds,
        suggestedWorkflowIds: preset.suggestedWorkflowIds,
        policy: preset.policy,
      },
    }))

    const workflowTemplates: PackWorkflowTemplate[] = workflows.map((workflow) => ({
      sourceId: workflow.id,
      workflow: this.toCreateWorkflowInput(workflow),
    }))

    const artifactTemplates: PackArtifactTemplateTemplate[] = templates.map((template) => ({
      sourceId: template.id,
      template: {
        name: template.name,
        ...(template.description ? { description: template.description } : {}),
        type: template.type,
        defaultFormat: template.defaultFormat,
        ...(template.outline ? { outline: template.outline } : {}),
        ...(template.promptGuide ? { promptGuide: template.promptGuide } : {}),
        fieldSchema: template.fieldSchema,
      },
    }))

    const policies = (input.policies ?? []).map((policy) => this.sanitizePolicyTemplate(policy))

    if (
      skills.length === 0
      && presetTemplates.length === 0
      && workflowTemplates.length === 0
      && artifactTemplates.length === 0
      && policies.length === 0
    ) {
      throw new BadRequestException('A pack must include at least one skill, preset, workflow, artifact template, or policy.')
    }

    return {
      skills,
      presets: presetTemplates,
      workflows: workflowTemplates,
      artifactTemplates,
      policies,
    }
  }

  private toCreateWorkflowInput(workflow: {
    name: string
    description: string | null
    enabled: boolean
    trigger: CreateWorkflowInput['trigger']
    steps: CreateWorkflowInput['steps']
    budgetUsd?: number
    webhookOutbox?: CreateWorkflowInput['webhookOutbox']
  }): CreateWorkflowInput {
    return {
      name: workflow.name,
      ...(workflow.description ? { description: workflow.description } : {}),
      enabled: workflow.enabled,
      trigger: workflow.trigger,
      steps: workflow.steps,
      ...(workflow.budgetUsd !== undefined ? { budgetUsd: workflow.budgetUsd } : {}),
      ...(workflow.webhookOutbox ? { webhookOutbox: workflow.webhookOutbox } : {}),
    }
  }

  private sanitizePolicyTemplate(input: PackPolicyTemplate): PackPolicyTemplate {
    return {
      id: this.slugify(optionalText(input.id, 64) ?? optionalText(input.name, 64) ?? 'policy'),
      name: this.requireName(input.name),
      ...(optionalText(input.description, 280) ? { description: optionalText(input.description, 280) ?? undefined } : {}),
      defaultDecision: input.defaultDecision === 'auto' || input.defaultDecision === 'block'
        ? input.defaultDecision
        : 'confirm',
      approvalScopes: sanitizeStringArray(input.approvalScopes, 8, 40)
        .filter((scope): scope is PackPolicyTemplate['approvalScopes'][number] =>
          scope === 'local'
            || scope === 'external_read'
            || scope === 'external_write'
            || scope === 'system_mutation',
        ),
      blockedTools: sanitizeStringArray(input.blockedTools, 20, 120),
      requireApprovalTools: sanitizeStringArray(input.requireApprovalTools, 20, 120),
    }
  }

  private normalizeVisibility(raw: unknown, workspaceId: string | null): PackVisibility {
    if (raw === 'workspace' || raw === 'public') return raw
    if (workspaceId) return 'workspace'
    return 'private'
  }

  private normalizeVersion(raw: string | undefined) {
    const value = optionalText(raw, 40) ?? '1.0.0'
    if (!SEMVER_PATTERN.test(value)) {
      throw new BadRequestException(`Invalid semantic version "${value}".`)
    }
    return value
  }

  private normalizeLimit(raw: number | undefined) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 24
    return Math.max(1, Math.min(Math.trunc(raw), 100))
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

  private slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'pack'
  }

  private toPack(row: {
    id: string
    userId: string
    workspaceId: string | null
    slug: string
    name: string
    description: string | null
    version: string
    visibility: string
    tags: string
    manifestJson: string
    installCount: number
    createdAt: Date
    updatedAt: Date
  }): PackBundle {
    const manifest = this.parseManifest(row.manifestJson)
    return {
      id: row.id,
      userId: row.userId,
      ...(row.workspaceId ? { workspaceId: row.workspaceId } : {}),
      slug: row.slug,
      name: row.name,
      ...(row.description ? { description: row.description } : {}),
      version: row.version,
      visibility: this.normalizeVisibility(row.visibility, row.workspaceId),
      tags: parseJsonStringArray(row.tags),
      installCount: row.installCount,
      manifest,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private parseManifest(raw: string): PackManifest {
    const parsed = parseJsonObject(raw)
    if (!parsed) {
      return {
        skills: [],
        presets: [],
        workflows: [],
        artifactTemplates: [],
        policies: [],
      }
    }

    const skills = Array.isArray(parsed.skills)
      ? parsed.skills
        .filter((entry): entry is SkillManifest =>
          Boolean(entry)
          && typeof (entry as SkillManifest).id === 'string'
          && typeof (entry as SkillManifest).title === 'string'
          && typeof (entry as SkillManifest).description === 'string'
          && Array.isArray((entry as SkillManifest).tools),
        )
      : []

    const presets = Array.isArray(parsed.presets)
      ? parsed.presets
        .filter((entry): entry is PackPresetTemplate =>
          Boolean(entry)
          && typeof (entry as PackPresetTemplate).sourceId === 'string'
          && typeof (entry as PackPresetTemplate).preset?.name === 'string',
        )
      : []

    const workflows = Array.isArray(parsed.workflows)
      ? parsed.workflows
        .filter((entry): entry is PackWorkflowTemplate =>
          Boolean(entry)
          && typeof (entry as PackWorkflowTemplate).sourceId === 'string'
          && typeof (entry as PackWorkflowTemplate).workflow?.name === 'string',
        )
      : []

    const artifactTemplates = Array.isArray(parsed.artifactTemplates)
      ? parsed.artifactTemplates
        .filter((entry): entry is PackArtifactTemplateTemplate =>
          Boolean(entry)
          && typeof (entry as PackArtifactTemplateTemplate).sourceId === 'string'
          && typeof (entry as PackArtifactTemplateTemplate).template?.name === 'string',
        )
      : []

    const policies = Array.isArray(parsed.policies)
      ? parsed.policies
        .filter((entry): entry is PackPolicyTemplate =>
          Boolean(entry)
          && typeof (entry as PackPolicyTemplate).id === 'string'
          && typeof (entry as PackPolicyTemplate).name === 'string',
        )
        .map((policy) => this.sanitizePolicyTemplate(policy))
      : []

    return {
      skills,
      presets,
      workflows,
      artifactTemplates,
      policies,
    }
  }
}
