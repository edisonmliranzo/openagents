import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  Artifact,
  ArtifactDetail,
  ArtifactExportResult,
  ArtifactTemplate,
  ArtifactType,
  CreateArtifactInput,
  CreateArtifactTemplateInput,
  CreateArtifactVersionInput,
  WorkspaceRole,
} from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'
import { WorkspacesService } from '../workspaces/workspaces.service'
import { optionalText, parseJsonObject, parseJsonStringArray, safeJsonStringify, sanitizeStringArray } from '../common/json'

@Injectable()
export class ArtifactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesService,
  ) {}

  async list(userId: string): Promise<Artifact[]> {
    const workspaceIds = await this.workspaces.listAccessibleIds(userId)
    const rows = await this.prisma.artifact.findMany({
      where: {
        OR: [
          { userId },
          ...(workspaceIds.length > 0
            ? [
              { workspaceId: { in: workspaceIds } },
              { sharedLinks: { some: { workspaceId: { in: workspaceIds } } } },
            ]
            : []),
        ],
      },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
        _count: {
          select: { versions: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map((row) => this.toArtifact(row))
  }

  async get(userId: string, artifactId: string): Promise<ArtifactDetail> {
    const row = await this.requireArtifact(userId, artifactId, 'viewer')
    return this.toArtifactDetail(row)
  }

  async create(userId: string, input: CreateArtifactInput): Promise<ArtifactDetail> {
    const workspaceId = await this.normalizeWorkspaceId(userId, input.workspaceId, 'editor')
    const title = this.requireName(input.title)
    const type = this.normalizeType(input.type)
    const format = this.normalizeFormat(input.format)
    const content = input.content ?? ''

    const row = await this.prisma.artifact.create({
      data: {
        userId,
        workspaceId,
        title,
        type,
        status: this.normalizeStatus(input.status),
        summary: optionalText(input.summary, 500),
        labels: safeJsonStringify(sanitizeStringArray(input.labels, 16, 48), '[]'),
        sourceConversationId: optionalText(input.source?.conversationId, 80),
        sourceWorkflowId: optionalText(input.source?.workflowId, 80),
        sourcePresetId: optionalText(input.source?.presetId, 80),
        sourcePackId: optionalText(input.source?.packId, 80),
        versions: {
          create: {
            version: 1,
            format,
            content: typeof content === 'string' ? content : String(content),
            note: optionalText(input.note, 280),
            metadata: input.metadata ? safeJsonStringify(input.metadata) : null,
          },
        },
      },
      include: this.artifactDetailInclude(),
    })

    return this.toArtifactDetail(row)
  }

  async addVersion(userId: string, artifactId: string, input: CreateArtifactVersionInput): Promise<ArtifactDetail> {
    const current = await this.requireArtifact(userId, artifactId, 'editor')
    const nextVersion = (current.versions[0]?.version ?? 0) + 1
    const format = this.normalizeFormat(input.format)
    const content = input.content
    if (typeof content !== 'string') throw new BadRequestException('content is required.')

    const row = await this.prisma.artifact.update({
      where: { id: current.id },
      data: {
        versions: {
          create: {
            version: nextVersion,
            format,
            content,
            note: optionalText(input.note, 280),
            metadata: input.metadata ? safeJsonStringify(input.metadata) : null,
          },
        },
      },
      include: this.artifactDetailInclude(),
    })

    return this.toArtifactDetail(row)
  }

  async exportArtifact(userId: string, artifactId: string, requestedFormat?: string): Promise<ArtifactExportResult> {
    const artifact = await this.get(userId, artifactId)
    const latest = artifact.currentVersion
    const format = this.normalizeFormat(requestedFormat ?? latest.format)
    const content = format === latest.format
      ? latest.content
      : this.renderExportContent(artifact, format)
    return {
      artifactId: artifact.id,
      versionId: latest.id,
      fileName: `${this.slugify(artifact.title)}.${this.extensionForFormat(format)}`,
      mimeType: this.mimeTypeForFormat(format),
      content,
      exportedAt: new Date().toISOString(),
    }
  }

  async listTemplates(userId: string): Promise<ArtifactTemplate[]> {
    const workspaceIds = await this.workspaces.listAccessibleIds(userId)
    const rows = await this.prisma.artifactTemplate.findMany({
      where: {
        OR: [
          { userId },
          ...(workspaceIds.length > 0 ? [{ workspaceId: { in: workspaceIds } }] : []),
        ],
      },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map((row) => this.toTemplate(row))
  }

  async getTemplate(userId: string, templateId: string): Promise<ArtifactTemplate> {
    const row = await this.prisma.artifactTemplate.findUnique({ where: { id: templateId } })
    if (!row) throw new NotFoundException('Artifact template not found.')
    if (row.userId !== userId) {
      if (!row.workspaceId) throw new ForbiddenException('Artifact template access denied.')
      await this.workspaces.requireWorkspace(userId, row.workspaceId, 'viewer')
    }
    return this.toTemplate(row)
  }

  async createTemplate(userId: string, input: CreateArtifactTemplateInput): Promise<ArtifactTemplate> {
    const workspaceId = await this.normalizeWorkspaceId(userId, input.workspaceId, 'editor')
    const row = await this.prisma.artifactTemplate.create({
      data: {
        userId,
        workspaceId,
        name: this.requireName(input.name),
        description: optionalText(input.description, 500),
        type: this.normalizeType(input.type),
        defaultFormat: this.normalizeFormat(input.defaultFormat),
        outline: optionalText(input.outline, 4_000),
        promptGuide: optionalText(input.promptGuide, 2_000),
        fieldSchema: safeJsonStringify(sanitizeStringArray(input.fieldSchema, 20, 80), '[]'),
      },
    })
    return this.toTemplate(row)
  }

  private async requireArtifact(userId: string, artifactId: string, minimumRole: WorkspaceRole) {
    const row = await this.prisma.artifact.findUnique({
      where: { id: artifactId },
      include: this.artifactDetailInclude(),
    })
    if (!row) throw new NotFoundException('Artifact not found.')
    if (row.userId === userId) return row

    const workspaceIds = [row.workspaceId, ...row.sharedLinks.map((link) => link.workspaceId)]
      .filter((value): value is string => Boolean(value))

    for (const workspaceId of workspaceIds) {
      try {
        await this.workspaces.requireWorkspace(userId, workspaceId, minimumRole)
        return row
      } catch {
        continue
      }
    }

    throw new ForbiddenException('Artifact access denied.')
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

  private artifactDetailInclude() {
    return {
      versions: {
        orderBy: { version: 'desc' as const },
      },
      _count: {
        select: { versions: true },
      },
      sharedLinks: {
        select: { workspaceId: true },
      },
    }
  }

  private toArtifact(row: {
    id: string
    userId: string
    workspaceId: string | null
    title: string
    type: string
    status: string
    summary: string | null
    labels: string
    sourceConversationId: string | null
    sourceWorkflowId: string | null
    sourcePresetId: string | null
    sourcePackId: string | null
    createdAt: Date
    updatedAt: Date
    versions: Array<{
      id: string
      artifactId: string
      version: number
      format: string
      content: string
      note: string | null
      metadata: string | null
      createdAt: Date
    }>
    _count: { versions: number }
  }): Artifact {
    const currentVersion = row.versions[0]
    if (!currentVersion) {
      throw new BadRequestException(`Artifact "${row.id}" has no versions.`)
    }

    return {
      id: row.id,
      userId: row.userId,
      ...(row.workspaceId ? { workspaceId: row.workspaceId } : {}),
      title: row.title,
      type: this.normalizeType(row.type),
      status: this.normalizeStatus(row.status),
      ...(row.summary ? { summary: row.summary } : {}),
      labels: parseJsonStringArray(row.labels),
      source: {
        ...(row.sourceConversationId ? { conversationId: row.sourceConversationId } : {}),
        ...(row.sourceWorkflowId ? { workflowId: row.sourceWorkflowId } : {}),
        ...(row.sourcePresetId ? { presetId: row.sourcePresetId } : {}),
        ...(row.sourcePackId ? { packId: row.sourcePackId } : {}),
      },
      currentVersion: this.toVersion(currentVersion),
      versionCount: row._count.versions,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toArtifactDetail(row: {
    id: string
    userId: string
    workspaceId: string | null
    title: string
    type: string
    status: string
    summary: string | null
    labels: string
    sourceConversationId: string | null
    sourceWorkflowId: string | null
    sourcePresetId: string | null
    sourcePackId: string | null
    createdAt: Date
    updatedAt: Date
    versions: Array<{
      id: string
      artifactId: string
      version: number
      format: string
      content: string
      note: string | null
      metadata: string | null
      createdAt: Date
    }>
    _count: { versions: number }
  }): ArtifactDetail {
    return {
      ...this.toArtifact(row),
      versions: row.versions.map((version) => this.toVersion(version)),
    }
  }

  private toVersion(row: {
    id: string
    artifactId: string
    version: number
    format: string
    content: string
    note: string | null
    metadata: string | null
    createdAt: Date
  }) {
    return {
      id: row.id,
      artifactId: row.artifactId,
      version: row.version,
      format: row.format,
      content: row.content,
      ...(row.note ? { note: row.note } : {}),
      ...(parseJsonObject(row.metadata) ? { metadata: parseJsonObject(row.metadata) ?? undefined } : {}),
      createdAt: row.createdAt.toISOString(),
    }
  }

  private toTemplate(row: {
    id: string
    userId: string
    workspaceId: string | null
    name: string
    description: string | null
    type: string
    defaultFormat: string
    outline: string | null
    promptGuide: string | null
    fieldSchema: string
    createdAt: Date
    updatedAt: Date
  }): ArtifactTemplate {
    return {
      id: row.id,
      userId: row.userId,
      ...(row.workspaceId ? { workspaceId: row.workspaceId } : {}),
      name: row.name,
      ...(row.description ? { description: row.description } : {}),
      type: this.normalizeType(row.type),
      defaultFormat: row.defaultFormat,
      ...(row.outline ? { outline: row.outline } : {}),
      ...(row.promptGuide ? { promptGuide: row.promptGuide } : {}),
      fieldSchema: parseJsonStringArray(row.fieldSchema),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private renderExportContent(artifact: ArtifactDetail, format: string) {
    if (format === 'json') {
      return JSON.stringify({
        title: artifact.title,
        type: artifact.type,
        status: artifact.status,
        summary: artifact.summary ?? null,
        labels: artifact.labels,
        source: artifact.source,
        version: artifact.currentVersion.version,
        content: artifact.currentVersion.content,
      }, null, 2)
    }
    return artifact.currentVersion.content
  }

  private requireName(raw: string) {
    const value = optionalText(raw, 120)
    if (!value) throw new BadRequestException('name is required.')
    return value
  }

  private normalizeType(raw: unknown): ArtifactType {
    if (
      raw === 'report'
      || raw === 'spreadsheet'
      || raw === 'landing_page'
      || raw === 'dataset_export'
      || raw === 'brief'
    ) {
      return raw
    }
    return 'doc'
  }

  private normalizeStatus(raw: unknown) {
    if (raw === 'generated' || raw === 'published' || raw === 'archived') return raw
    return 'draft'
  }

  private normalizeFormat(raw: unknown) {
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (value === 'html' || value === 'json' || value === 'csv' || value === 'txt') return value
    return 'markdown'
  }

  private extensionForFormat(format: string) {
    if (format === 'html') return 'html'
    if (format === 'json') return 'json'
    if (format === 'csv') return 'csv'
    if (format === 'txt') return 'txt'
    return 'md'
  }

  private mimeTypeForFormat(format: string) {
    if (format === 'html') return 'text/html'
    if (format === 'json') return 'application/json'
    if (format === 'csv') return 'text/csv'
    if (format === 'txt') return 'text/plain'
    return 'text/markdown'
  }

  private slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'artifact'
  }
}
