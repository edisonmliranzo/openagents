import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  AgentVersionDiffEntry,
  AgentVersionDiffResult,
  AgentVersionSnapshot,
  CreateAgentVersionInput,
  NanobotRuntimeConfig,
  NanobotSkillState,
} from '@openagents/shared'
import { UsersService } from '../users/users.service'
import { NanobotConfigService } from '../nanobot/config/nanobot-config.service'
import { NanobotSkillsRegistry } from '../nanobot/agent/nanobot-skills.registry'
import { MissionControlService } from '../mission-control/mission-control.service'

const AGENT_VERSIONS_FILE = 'AGENT_VERSIONS.json'
const STORE_VERSION = 1
const MAX_SNAPSHOTS_PER_USER = 200

interface AgentVersionStoreFile {
  version: number
  snapshots: AgentVersionSnapshot[]
}

@Injectable()
export class AgentVersionsService {
  private readonly logger = new Logger(AgentVersionsService.name)
  private readonly loadedUsers = new Set<string>()
  private readonly snapshotsByUser = new Map<string, AgentVersionSnapshot[]>()

  constructor(
    private users: UsersService,
    private config: NanobotConfigService,
    private skills: NanobotSkillsRegistry,
    private mission: MissionControlService,
  ) {}

  async list(userId: string) {
    await this.ensureLoaded(userId)
    return [...(this.snapshotsByUser.get(userId) ?? [])]
      .sort((a, b) => b.version - a.version || b.createdAt.localeCompare(a.createdAt))
  }

  async get(userId: string, snapshotId: string) {
    const snapshot = await this.getSnapshot(userId, snapshotId)
    return { ...snapshot }
  }

  async create(userId: string, input: CreateAgentVersionInput = {}) {
    return this.captureSnapshot(userId, input, { publishEvent: true })
  }

  async diff(userId: string, fromId: string, toId: string): Promise<AgentVersionDiffResult> {
    const from = await this.getSnapshot(userId, fromId)
    const to = await this.getSnapshot(userId, toId)
    return {
      fromId,
      toId,
      changes: this.buildDiff(from, to),
    }
  }

  async rollback(userId: string, snapshotId: string) {
    const target = await this.getSnapshot(userId, snapshotId)
    void this.mission.publish({
      userId,
      type: 'version_change',
      status: 'started',
      source: 'agent-versions.rollback',
      payload: {
        snapshotId: target.id,
        version: target.version,
      },
    })

    try {
      await this.users.updateSettings(userId, {
        preferredProvider: target.settings.preferredProvider,
        preferredModel: target.settings.preferredModel,
        customSystemPrompt: target.settings.customSystemPrompt,
      })

      this.config.updateRuntime({
        enabled: target.runtimeConfig.enabled,
        maxLoopSteps: target.runtimeConfig.maxLoopSteps,
        shadowMode: target.runtimeConfig.shadowMode,
        runtimeLabel: target.runtimeConfig.runtimeLabel,
      })

      const skillRestore = await this.restoreSkills(userId, target.skills)

      const currentSnapshot = await this.captureSnapshot(
        userId,
        { note: `Rollback to v${target.version} (${target.id.slice(0, 8)})` },
        { publishEvent: false },
      )

      void this.mission.publish({
        userId,
        type: 'version_change',
        status: 'success',
        source: 'agent-versions.rollback',
        payload: {
          restoredSnapshotId: target.id,
          restoredVersion: target.version,
          currentSnapshotId: currentSnapshot.id,
          currentVersion: currentSnapshot.version,
          recreatedSkills: skillRestore.recreated,
          missingSkills: skillRestore.missing,
          changedSkillCount: skillRestore.changed,
        },
      })

      return {
        ok: true as const,
        restoredVersionId: target.id,
        currentSnapshot,
      }
    } catch (error: unknown) {
      void this.mission.publish({
        userId,
        type: 'failure',
        status: 'failed',
        source: 'agent-versions.rollback',
        payload: {
          snapshotId: target.id,
          error: this.safeError(error),
        },
      })
      throw error
    }
  }

  private async captureSnapshot(
    userId: string,
    input: CreateAgentVersionInput,
    options: { publishEvent: boolean },
  ) {
    await this.ensureLoaded(userId)
    const existing = [...(this.snapshotsByUser.get(userId) ?? [])]
    const settings = await this.users.getSettings(userId)
    const skills = await this.skills.listForUser(userId)

    const nextVersion = existing.length === 0
      ? 1
      : Math.max(...existing.map((snapshot) => snapshot.version)) + 1
    const now = new Date().toISOString()

    const snapshot: AgentVersionSnapshot = {
      id: randomUUID(),
      userId,
      version: nextVersion,
      note: this.optionalText(input.note)?.slice(0, 280) ?? null,
      createdAt: now,
      settings: {
        preferredProvider: this.optionalText(settings.preferredProvider) ?? 'anthropic',
        preferredModel: this.optionalText(settings.preferredModel) ?? 'claude-sonnet-4-6',
        customSystemPrompt: this.optionalText(settings.customSystemPrompt),
      },
      runtimeConfig: this.sanitizeRuntimeConfig(this.config.toJSON()),
      skills: this.sanitizeSkills(skills),
    }

    existing.push(snapshot)
    this.snapshotsByUser.set(userId, existing.slice(-MAX_SNAPSHOTS_PER_USER))
    await this.persist(userId)

    if (options.publishEvent) {
      void this.mission.publish({
        userId,
        type: 'version_change',
        status: 'success',
        source: 'agent-versions.create',
        payload: {
          snapshotId: snapshot.id,
          version: snapshot.version,
          note: snapshot.note,
        },
      })
    }

    return snapshot
  }

  private async restoreSkills(userId: string, targetSkills: NanobotSkillState[]) {
    const desiredById = new Map(targetSkills.map((skill) => [skill.id, skill]))
    let current = await this.skills.listForUser(userId)
    const currentIds = new Set(current.map((skill) => skill.id))

    const recreated: string[] = []
    const missing: string[] = []
    for (const target of targetSkills) {
      if (currentIds.has(target.id)) continue
      try {
        await this.skills.upsertCustomSkill(userId, {
          id: target.id,
          title: target.title,
          description: target.description,
          tools: target.tools,
          promptAppendix: target.promptAppendix,
        })
        recreated.push(target.id)
      } catch (error: unknown) {
        this.logger.warn(`Failed to recreate missing skill "${target.id}": ${this.safeError(error)}`)
        missing.push(target.id)
      }
    }

    current = await this.skills.listForUser(userId)
    let changed = 0
    for (const skill of current) {
      const desired = desiredById.get(skill.id)
      const shouldEnable = desired ? desired.enabled : false
      if (skill.enabled === shouldEnable) continue
      await this.skills.setSkillEnabled(userId, skill.id, shouldEnable)
      changed += 1
    }

    return { changed, recreated, missing }
  }

  private buildDiff(from: AgentVersionSnapshot, to: AgentVersionSnapshot): AgentVersionDiffEntry[] {
    const changes: AgentVersionDiffEntry[] = []
    const pushChange = (pathName: string, before: unknown, after: unknown) => {
      const beforeText = this.diffValue(before)
      const afterText = this.diffValue(after)
      if (beforeText === afterText) return
      changes.push({ path: pathName, before: beforeText, after: afterText })
    }

    pushChange('settings.preferredProvider', from.settings.preferredProvider, to.settings.preferredProvider)
    pushChange('settings.preferredModel', from.settings.preferredModel, to.settings.preferredModel)
    pushChange('settings.customSystemPrompt', from.settings.customSystemPrompt, to.settings.customSystemPrompt)

    pushChange('runtime.enabled', from.runtimeConfig.enabled, to.runtimeConfig.enabled)
    pushChange('runtime.maxLoopSteps', from.runtimeConfig.maxLoopSteps, to.runtimeConfig.maxLoopSteps)
    pushChange('runtime.shadowMode', from.runtimeConfig.shadowMode, to.runtimeConfig.shadowMode)
    pushChange('runtime.runtimeLabel', from.runtimeConfig.runtimeLabel, to.runtimeConfig.runtimeLabel)

    const fromSkills = new Map(from.skills.map((skill) => [skill.id, skill]))
    const toSkills = new Map(to.skills.map((skill) => [skill.id, skill]))
    const skillIds = [...new Set([...fromSkills.keys(), ...toSkills.keys()])].sort((a, b) => a.localeCompare(b))

    for (const skillId of skillIds) {
      const before = fromSkills.get(skillId)
      const after = toSkills.get(skillId)
      if (!before || !after) {
        pushChange(`skills.${skillId}`, before ?? null, after ?? null)
        continue
      }
      pushChange(`skills.${skillId}.enabled`, before.enabled, after.enabled)
      pushChange(`skills.${skillId}.title`, before.title, after.title)
      pushChange(`skills.${skillId}.description`, before.description, after.description)
      pushChange(`skills.${skillId}.tools`, before.tools, after.tools)
      pushChange(
        `skills.${skillId}.promptAppendix`,
        before.promptAppendix ?? null,
        after.promptAppendix ?? null,
      )
    }

    return changes
  }

  private diffValue(value: unknown): string | null {
    if (value == null) return null
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  private async getSnapshot(userId: string, snapshotId: string) {
    await this.ensureLoaded(userId)
    const snapshot = (this.snapshotsByUser.get(userId) ?? []).find((item) => item.id === snapshotId)
    if (!snapshot) throw new NotFoundException(`Agent version "${snapshotId}" not found.`)
    return snapshot
  }

  private async ensureLoaded(userId: string) {
    if (this.loadedUsers.has(userId)) return
    const store = await this.readStore(this.storeFilePath(userId))
    const snapshots = (store.snapshots ?? [])
      .filter((snapshot) => snapshot.userId === userId)
      .map((snapshot) => this.sanitizeStoredSnapshot(snapshot, userId))
      .filter((snapshot): snapshot is AgentVersionSnapshot => Boolean(snapshot))
      .slice(-MAX_SNAPSHOTS_PER_USER)
    this.snapshotsByUser.set(userId, snapshots)
    this.loadedUsers.add(userId)
  }

  private sanitizeStoredSnapshot(snapshot: AgentVersionSnapshot, userId: string): AgentVersionSnapshot | null {
    if (!snapshot || typeof snapshot !== 'object') return null
    const createdAt = this.normalizeIso(snapshot.createdAt)
    if (!createdAt) return null

    const settingsRaw = this.asRecord(snapshot.settings) ?? {}
    const preferredProvider = this.optionalText(settingsRaw.preferredProvider) ?? 'anthropic'
    const preferredModel = this.optionalText(settingsRaw.preferredModel) ?? 'claude-sonnet-4-6'
    const customSystemPrompt = this.optionalText(settingsRaw.customSystemPrompt)

    const versionRaw = Number.parseInt(`${snapshot.version ?? 0}`, 10)
    const version = Number.isFinite(versionRaw) ? Math.max(1, versionRaw) : 1

    return {
      id: this.optionalText(snapshot.id) ?? randomUUID(),
      userId,
      version,
      note: this.optionalText(snapshot.note),
      createdAt,
      settings: {
        preferredProvider,
        preferredModel,
        customSystemPrompt,
      },
      runtimeConfig: this.sanitizeRuntimeConfig(snapshot.runtimeConfig),
      skills: this.sanitizeSkills(snapshot.skills),
    }
  }

  private sanitizeRuntimeConfig(raw: unknown): NanobotRuntimeConfig {
    const record = this.asRecord(raw) ?? {}
    const maxLoopStepsRaw = Number.parseInt(`${record.maxLoopSteps ?? 8}`, 10)
    const maxLoopSteps = Number.isFinite(maxLoopStepsRaw) ? Math.max(1, Math.min(maxLoopStepsRaw, 64)) : 8

    return {
      enabled: Boolean(record.enabled),
      maxLoopSteps,
      shadowMode: Boolean(record.shadowMode),
      runtimeLabel: this.optionalText(record.runtimeLabel)?.slice(0, 80) ?? 'nanobot',
    }
  }

  private sanitizeSkills(raw: unknown): NanobotSkillState[] {
    if (!Array.isArray(raw)) return []
    const out: NanobotSkillState[] = []
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue
      const record = entry as Partial<NanobotSkillState>
      const id = this.optionalText(record.id)
      const title = this.optionalText(record.title)
      const description = this.optionalText(record.description)
      if (!id || !title || !description) continue

      const tools: string[] = []
      const seenTools = new Set<string>()
      for (const tool of Array.isArray(record.tools) ? record.tools : []) {
        const value = this.optionalText(tool)
        if (!value || seenTools.has(value)) continue
        seenTools.add(value)
        tools.push(value)
        if (tools.length >= 16) break
      }

      out.push({
        id: id.slice(0, 64),
        title: title.slice(0, 120),
        description: description.slice(0, 300),
        tools: tools.length > 0 ? tools : ['notes'],
        ...(this.optionalText(record.promptAppendix)
          ? { promptAppendix: this.optionalText(record.promptAppendix)!.slice(0, 2000) }
          : {}),
        enabled: Boolean(record.enabled),
      })
      if (out.length >= 500) break
    }
    return out
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  }

  private optionalText(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed || null
  }

  private normalizeIso(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
  }

  private safeError(error: unknown) {
    if (error instanceof Error) return error.message
    return typeof error === 'string' ? error : 'Unknown error'
  }

  private async persist(userId: string) {
    const filePath = this.storeFilePath(userId)
    const payload: AgentVersionStoreFile = {
      version: STORE_VERSION,
      snapshots: this.snapshotsByUser.get(userId) ?? [],
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
  }

  private async readStore(filePath: string): Promise<AgentVersionStoreFile> {
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<AgentVersionStoreFile>
      return {
        version: Number.isFinite(parsed.version) ? Number(parsed.version) : STORE_VERSION,
        snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      }
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : ''
      if (message && !message.toLowerCase().includes('no such file')) {
        this.logger.warn(`Failed to read agent versions store: ${message}`)
      }
      return { version: STORE_VERSION, snapshots: [] }
    }
  }

  private storeFilePath(userId: string) {
    const root = (process.env.MEMORY_FILES_ROOT ?? path.resolve(process.cwd(), 'data', 'memory')).trim()
    return path.join(root, userId, AGENT_VERSIONS_FILE)
  }
}
