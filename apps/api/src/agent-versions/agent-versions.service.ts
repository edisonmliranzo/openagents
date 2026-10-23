import { Injectable, BadRequestException } from '@nestjs/common'
import {
  AgentVersionSnapshot,
  CreateAgentVersionInput,
  AgentVersionDiffResult,
  AgentVersionRollbackResult,
  AgentVersionSettingsSnapshot,
  NanobotRuntimeConfig,
  NanobotSkillState
} from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'
import { NanobotConfigService } from '../nanobot/config/nanobot-config.service'
import { NanobotSkillsRegistry } from '../nanobot/agent/nanobot-skills.registry'

export const DEFAULT_AGENT_ID = 'default'

function toDisplayValue(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  if (value === null) return 'null'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * Produces a flat, human-readable diff. Nested objects are walked so the diff
 * points at `settings.preferredModel` rather than the whole `settings` blob.
 * Values are always rendered as strings — the UI renders them inside <pre>.
 */
function deepDiff(obj1: any, obj2: any, prefix = '') {
  const changes: { path: string; before?: string; after?: string }[] = []
  const left = obj1 ?? {}
  const right = obj2 ?? {}
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])

  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key
    const before = left[key]
    const after = right[key]
    const hadBefore = key in left
    const hadAfter = key in right

    if (!hadBefore) {
      changes.push({ path, after: toDisplayValue(after) })
      continue
    }
    if (!hadAfter) {
      changes.push({ path, before: toDisplayValue(before) })
      continue
    }
    if (JSON.stringify(before) === JSON.stringify(after)) continue

    const bothPlainObjects =
      before &&
      after &&
      typeof before === 'object' &&
      typeof after === 'object' &&
      !Array.isArray(before) &&
      !Array.isArray(after)

    if (bothPlainObjects) {
      changes.push(...deepDiff(before, after, path))
      continue
    }

    changes.push({ path, before: toDisplayValue(before), after: toDisplayValue(after) })
  }

  return changes
}

@Injectable()
export class AgentVersionsService {
  constructor(
    private prisma: PrismaService,
    private nanobotConfig: NanobotConfigService,
    private nanobotSkills: NanobotSkillsRegistry,
  ) {}

  /**
   * Builds the snapshot of the user's *current* agent configuration so a version
   * records the live settings, runtime config and skill toggles at capture time.
   */
  private async captureCurrentState(userId: string): Promise<{
    settings: AgentVersionSettingsSnapshot
    runtimeConfig: NanobotRuntimeConfig
    skills: NanobotSkillState[]
  }> {
    const userSettings = await this.prisma.userSettings
      .findUnique({ where: { userId } })
      .catch(() => null)

    const settings: AgentVersionSettingsSnapshot = {
      ...(userSettings?.preferredProvider ? { preferredProvider: userSettings.preferredProvider } : {}),
      ...(userSettings?.preferredModel ? { preferredModel: userSettings.preferredModel } : {}),
      ...(userSettings?.customSystemPrompt ? { customSystemPrompt: userSettings.customSystemPrompt } : {}),
    }

    const runtimeConfig = this.nanobotConfig.toJSON()
    const skills = await this.nanobotSkills.listForUser(userId).catch(() => [] as NanobotSkillState[])

    return { settings, runtimeConfig, skills }
  }

  async createVersion(
    userId: string,
    agentId: string,
    input: CreateAgentVersionInput,
    snapshot?: AgentVersionSettingsSnapshot,
  ): Promise<AgentVersionSnapshot> {
    const resolvedAgentId = agentId?.trim() || input.agentId?.trim() || DEFAULT_AGENT_ID
    const latest = await this.getLatestVersion(userId, resolvedAgentId)
    const nextVersion = latest ? latest.version + 1 : 1

    const captured = await this.captureCurrentState(userId)
    const settings = snapshot && Object.keys(snapshot).length > 0 ? snapshot : captured.settings

    const version: AgentVersionSnapshot = {
      id: crypto.randomUUID(),
      userId,
      agentId: resolvedAgentId,
      version: nextVersion,
      createdAt: new Date().toISOString(),
      note: input.note,
      settings,
      runtimeConfig: captured.runtimeConfig,
      skills: captured.skills,
    }

    await this.prisma.agentVersion.create({
      data: {
        id: version.id,
        userId,
        agentId: resolvedAgentId,
        version: version.version,
        note: version.note,
        settings: JSON.parse(JSON.stringify(version.settings)),
        runtimeConfig: JSON.parse(JSON.stringify(version.runtimeConfig)),
        skills: JSON.parse(JSON.stringify(version.skills)),
        createdAt: version.createdAt,
      },
    })

    return version
  }

  async getVersions(userId: string, agentId: string, limit?: number): Promise<AgentVersionSnapshot[]> {
    const versions = await this.prisma.agentVersion.findMany({
      where: { userId, agentId },
      orderBy: { version: 'desc' },
      take: this.normalizeLimit(limit, 20),
    })

    return versions.map(v => this.toSnapshot(v))
  }

  /**
   * Lists every version the user owns. When `agentId` is provided the list is
   * narrowed to that agent; otherwise every agent's versions are returned.
   */
  async listForUser(userId: string, agentId?: string, limit?: number): Promise<AgentVersionSnapshot[]> {
    const versions = await this.prisma.agentVersion.findMany({
      where: {
        userId,
        ...(agentId?.trim() ? { agentId: agentId.trim() } : {}),
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      take: this.normalizeLimit(limit, 50),
    })

    return versions.map(v => this.toSnapshot(v))
  }

  /** Guards against NaN/undefined/invalid limits reaching Prisma. */
  private normalizeLimit(value: number | undefined, fallback: number): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return Math.min(Math.floor(parsed), 200)
  }

  async getLatestVersion(userId: string, agentId: string): Promise<AgentVersionSnapshot | null> {
    const versions = await this.getVersions(userId, agentId, 1)
    return versions[0] || null
  }

  async getVersion(userId: string, id: string): Promise<AgentVersionSnapshot> {
    const version = await this.prisma.agentVersion.findUnique({
      where: { id, userId },
    })

    if (!version) {
      throw new BadRequestException('Agent version not found')
    }

    return this.toSnapshot(version)
  }

  async compareVersions(fromId: string, toId: string): Promise<AgentVersionDiffResult> {
    const [from, to] = await Promise.all([
      this.prisma.agentVersion.findUnique({ where: { id: fromId } }),
      this.prisma.agentVersion.findUnique({ where: { id: toId } }),
    ])

    if (!from || !to) {
      throw new BadRequestException('One or both versions not found')
    }

    const changes = [
      ...deepDiff(from.settings, to.settings, 'settings'),
      ...deepDiff(from.runtimeConfig, to.runtimeConfig, 'runtimeConfig'),
      ...deepDiff(from.skills, to.skills, 'skills'),
    ]

    return {
      fromId,
      toId,
      changes,
    }
  }

  async rollbackToVersion(userId: string, versionId: string): Promise<AgentVersionRollbackResult> {
    const version = await this.getVersion(userId, versionId)
    const stored = await this.prisma.agentVersion.findUnique({
      where: { id: versionId, userId },
    })

    const newVersion = await this.createVersion(
      userId,
      stored?.agentId ?? DEFAULT_AGENT_ID,
      { note: `Rolled back to version ${version.version}` },
      version.settings,
    )

    return {
      ok: true,
      restoredVersionId: versionId,
      currentSnapshot: newVersion,
    }
  }

  private toSnapshot(version: {
    id: string
    userId: string
    agentId: string
    version: number
    note: string | null
    settings: unknown
    runtimeConfig: unknown
    skills: unknown
    createdAt: Date
  }): AgentVersionSnapshot {
    return {
      id: version.id,
      userId: version.userId,
      agentId: version.agentId,
      version: version.version,
      createdAt: version.createdAt.toISOString(),
      note: version.note ?? undefined,
      settings: (version.settings ?? {}) as AgentVersionSettingsSnapshot,
      runtimeConfig: (version.runtimeConfig ?? {}) as unknown as NanobotRuntimeConfig,
      skills: (version.skills ?? []) as unknown as NanobotSkillState[],
    }
  }
}
