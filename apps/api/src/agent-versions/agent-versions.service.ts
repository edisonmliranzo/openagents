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

function deepDiff(obj1: any, obj2: any) {
  const changes: { path: string; before?: string; after?: string }[] = []
  for (const key in obj1) {
    if (JSON.stringify(obj1[key]) !== JSON.stringify(obj2[key])) {
      changes.push({ path: key, before: obj1[key], after: obj2[key] })
    }
  }
  for (const key in obj2) {
    if (!(key in obj1)) {
      changes.push({ path: key, after: obj2[key] })
    }
  }
  return changes
}

@Injectable()
export class AgentVersionsService {
  constructor(private prisma: PrismaService) {}

  async createVersion(
    userId: string,
    agentId: string,
    input: CreateAgentVersionInput,
    snapshot: AgentVersionSettingsSnapshot
  ): Promise<AgentVersionSnapshot> {
    const latest = await this.getLatestVersion(userId, agentId)
    const nextVersion = latest ? latest.version + 1 : 1

    const version: AgentVersionSnapshot = {
      id: crypto.randomUUID(),
      userId,
      version: nextVersion,
      createdAt: new Date().toISOString(),
      note: input.note,
      settings: snapshot,
      runtimeConfig: {} as NanobotRuntimeConfig,
      skills: [],
    }

    await this.prisma.agentVersion.create({
      data: {
        id: version.id,
        userId,
        agentId,
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

  async getVersions(userId: string, agentId: string, limit = 20): Promise<AgentVersionSnapshot[]> {
    const versions = await this.prisma.agentVersion.findMany({
      where: { userId, agentId },
      orderBy: { version: 'desc' },
      take: limit,
    })

    return versions.map(v => ({
      id: v.id,
      userId: v.userId,
      version: v.version,
      createdAt: v.createdAt.toISOString(),
      note: v.note ?? undefined,
      settings: v.settings as AgentVersionSettingsSnapshot,
      runtimeConfig: v.runtimeConfig as unknown as NanobotRuntimeConfig,
      skills: v.skills as unknown as NanobotSkillState[],
    }))
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

    return {
      id: version.id,
      userId: version.userId,
      version: version.version,
      createdAt: version.createdAt.toISOString(),
      note: version.note ?? undefined,
      settings: version.settings as AgentVersionSettingsSnapshot,
      runtimeConfig: version.runtimeConfig as unknown as NanobotRuntimeConfig,
      skills: version.skills as unknown as NanobotSkillState[],
    }
  }

  async compareVersions(fromId: string, toId: string): Promise<AgentVersionDiffResult> {
    const [from, to] = await Promise.all([
      this.prisma.agentVersion.findUnique({ where: { id: fromId } }),
      this.prisma.agentVersion.findUnique({ where: { id: toId } }),
    ])

    if (!from || !to) {
      throw new BadRequestException('One or both versions not found')
    }

    const changes = deepDiff(from.settings, to.settings)

    return {
      fromId,
      toId,
      changes,
    }
  }

  async rollbackToVersion(userId: string, agentId: string, versionId: string): Promise<AgentVersionRollbackResult> {
    const version = await this.getVersion(userId, versionId)

    const newVersion = await this.createVersion(userId, agentId, {
      note: `Rolled back to version ${version.version}`,
    }, version.settings)

    return {
      ok: true,
      restoredVersionId: versionId,
      currentSnapshot: newVersion,
    }
  }
}