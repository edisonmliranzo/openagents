import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { MemoryService } from '../../memory/memory.service'
import type { NanobotSkillManifest, NanobotSkillState } from '../types'

const CUSTOM_SKILLS_FILE = 'SKILLS.json'

const BUNDLED_SKILLS: NanobotSkillManifest[] = [
  {
    id: 'github',
    title: 'GitHub',
    description: 'Repository lookups and issue triage helpers.',
    tools: ['web_fetch'],
    promptAppendix: 'When discussing repos, prefer concrete file paths and diffs.',
  },
  {
    id: 'weather',
    title: 'Weather',
    description: 'Weather lookup and planning assistant.',
    tools: ['web_fetch'],
  },
  {
    id: 'tmux',
    title: 'Terminal Session',
    description: 'Terminal workflow automation and command sequencing.',
    tools: ['notes'],
  },
]

interface SkillStoreFile {
  customSkills?: Array<{
    id?: unknown
    title?: unknown
    description?: unknown
    tools?: unknown
    promptAppendix?: unknown
  }>
  enabledSkillIds?: unknown
}

export interface UpsertNanobotSkillInput {
  id?: string
  title: string
  description?: string
  tools?: string[]
  promptAppendix?: string
}

export interface UpsertNanobotSkillResult {
  skill: NanobotSkillManifest
  created: boolean
  skills: NanobotSkillState[]
}

@Injectable()
export class NanobotSkillsRegistry {
  private readonly logger = new Logger(NanobotSkillsRegistry.name)
  private enabledSkillsByUser = new Map<string, Set<string>>()
  private customSkillsByUser = new Map<string, NanobotSkillManifest[]>()
  private loadedUsers = new Set<string>()

  constructor(private memory: MemoryService) {}

  async listBundled() {
    return BUNDLED_SKILLS
  }

  async getActiveForUser(userId: string) {
    await this.ensureLoaded(userId)
    const allSkills = this.getAllSkills(userId)
    const enabled = this.enabledSkillsByUser.get(userId)
    if (!enabled) return allSkills
    return allSkills.filter((skill) => enabled.has(skill.id))
  }

  async listForUser(userId: string): Promise<NanobotSkillState[]> {
    await this.ensureLoaded(userId)
    const allSkills = this.getAllSkills(userId)
    const enabled = this.enabledSkillsByUser.get(userId)
    return allSkills.map((skill) => ({
      ...skill,
      enabled: enabled ? enabled.has(skill.id) : true,
    }))
  }

  async setSkillEnabled(userId: string, skillId: string, enabled: boolean): Promise<NanobotSkillState[]> {
    await this.ensureLoaded(userId)
    const allSkills = this.getAllSkills(userId)
    const skillExists = allSkills.some((skill) => skill.id === skillId)
    if (!skillExists) {
      throw new NotFoundException(`Skill "${skillId}" not found`)
    }

    const allSkillIds = allSkills.map((skill) => skill.id)
    const current = this.enabledSkillsByUser.get(userId) ?? new Set(allSkillIds)

    if (enabled) {
      current.add(skillId)
    } else {
      current.delete(skillId)
    }

    this.enabledSkillsByUser.set(userId, current)
    await this.persist(userId)
    return this.listForUser(userId)
  }

  async upsertCustomSkill(userId: string, input: UpsertNanobotSkillInput): Promise<UpsertNanobotSkillResult> {
    await this.ensureLoaded(userId)

    const title = input.title.trim()
    if (!title) {
      throw new BadRequestException('Skill title is required.')
    }

    const custom = [...(this.customSkillsByUser.get(userId) ?? [])]
    const bundledIds = new Set(BUNDLED_SKILLS.map((skill) => skill.id))
    const existingIds = new Set(this.getAllSkills(userId).map((skill) => skill.id))
    const requestedId = input.id?.trim()
    const baseId = requestedId ? this.normalizeSkillId(requestedId) : this.buildCustomSkillId(title)

    if (!baseId) {
      throw new BadRequestException('Skill id is invalid.')
    }
    if (bundledIds.has(baseId)) {
      throw new BadRequestException(`Skill id "${baseId}" is reserved by bundled skills.`)
    }

    const existingIdx = custom.findIndex((skill) => skill.id === baseId)
    const created = existingIdx === -1
    const nextId = created
      ? this.ensureUniqueSkillId(baseId, existingIds)
      : baseId

    const description = input.description?.trim() || `User-defined skill: ${title}`
    const tools = this.sanitizeTools(input.tools)
    const promptAppendix = input.promptAppendix?.trim()
    const nextSkill: NanobotSkillManifest = {
      id: nextId,
      title: title.slice(0, 80),
      description: description.slice(0, 280),
      tools,
      ...(promptAppendix ? { promptAppendix: promptAppendix.slice(0, 1000) } : {}),
    }

    if (existingIdx === -1) {
      custom.push(nextSkill)
    } else {
      custom[existingIdx] = nextSkill
    }

    this.customSkillsByUser.set(userId, custom)

    const allSkillIds = this.getAllSkills(userId).map((skill) => skill.id)
    const current = this.enabledSkillsByUser.get(userId) ?? new Set(allSkillIds)
    current.add(nextSkill.id)
    this.enabledSkillsByUser.set(userId, current)

    await this.persist(userId)

    return {
      skill: nextSkill,
      created,
      skills: await this.listForUser(userId),
    }
  }

  private async ensureLoaded(userId: string) {
    if (this.loadedUsers.has(userId)) return

    const bundledIds = new Set(BUNDLED_SKILLS.map((skill) => skill.id))
    try {
      const file = await this.memory.readFile(userId, CUSTOM_SKILLS_FILE)
      const parsed = JSON.parse(file.content) as SkillStoreFile
      const custom = this.parseCustomSkills(parsed?.customSkills, bundledIds)
      this.customSkillsByUser.set(userId, custom)

      const allIds = new Set([...bundledIds, ...custom.map((skill) => skill.id)])
      const enabled = this.parseEnabledSkillIds(parsed?.enabledSkillIds, allIds)
      this.enabledSkillsByUser.set(userId, enabled ?? new Set(allIds))
    } catch (error: any) {
      this.customSkillsByUser.set(userId, [])
      this.enabledSkillsByUser.set(userId, new Set(bundledIds))

      const message = typeof error?.message === 'string' ? error.message : ''
      if (message && !message.toLowerCase().includes('not found')) {
        this.logger.warn(`Failed to load ${CUSTOM_SKILLS_FILE} for user ${userId}: ${message}`)
      }
    }

    this.loadedUsers.add(userId)
  }

  private async persist(userId: string) {
    const payload = {
      customSkills: this.customSkillsByUser.get(userId) ?? [],
      enabledSkillIds: [...(this.enabledSkillsByUser.get(userId) ?? [])],
    }
    await this.memory.writeFile(userId, CUSTOM_SKILLS_FILE, JSON.stringify(payload, null, 2))
  }

  private getAllSkills(userId: string) {
    return [...BUNDLED_SKILLS, ...(this.customSkillsByUser.get(userId) ?? [])]
  }

  private parseCustomSkills(raw: SkillStoreFile['customSkills'], bundledIds: Set<string>) {
    if (!Array.isArray(raw)) return []

    const out: NanobotSkillManifest[] = []
    const usedIds = new Set([...bundledIds])
    for (const candidate of raw) {
      if (!candidate || typeof candidate !== 'object') continue
      const rawTitle = typeof candidate.title === 'string' ? candidate.title.trim() : ''
      if (!rawTitle) continue

      const requestedId = typeof candidate.id === 'string'
        ? this.normalizeSkillId(candidate.id)
        : this.buildCustomSkillId(rawTitle)
      if (!requestedId) continue

      const id = this.ensureUniqueSkillId(requestedId, usedIds)
      usedIds.add(id)

      const rawDescription = typeof candidate.description === 'string' ? candidate.description.trim() : ''
      const rawPrompt = typeof candidate.promptAppendix === 'string' ? candidate.promptAppendix.trim() : ''
      const rawTools = Array.isArray(candidate.tools)
        ? candidate.tools.filter((tool): tool is string => typeof tool === 'string')
        : []

      out.push({
        id,
        title: rawTitle.slice(0, 80),
        description: (rawDescription || `User-defined skill: ${rawTitle}`).slice(0, 280),
        tools: this.sanitizeTools(rawTools),
        ...(rawPrompt ? { promptAppendix: rawPrompt.slice(0, 1000) } : {}),
      })
    }

    return out
  }

  private parseEnabledSkillIds(raw: unknown, allIds: Set<string>) {
    if (!Array.isArray(raw)) return null
    const enabled = new Set<string>()
    for (const entry of raw) {
      if (typeof entry !== 'string') continue
      const value = entry.trim()
      if (value && allIds.has(value)) enabled.add(value)
    }
    return enabled
  }

  private sanitizeTools(raw: string[] | undefined) {
    const deduped: string[] = []
    const seen = new Set<string>()
    for (const tool of raw ?? []) {
      const normalized = tool.trim()
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      deduped.push(normalized)
      if (deduped.length >= 16) break
    }
    return deduped.length > 0 ? deduped : ['notes']
  }

  private normalizeSkillId(raw: string) {
    return raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64)
  }

  private buildCustomSkillId(title: string) {
    const slug = this.normalizeSkillId(title)
    if (!slug) return ''
    return slug.startsWith('custom-') ? slug : `custom-${slug}`
  }

  private ensureUniqueSkillId(baseId: string, existing: Set<string>) {
    if (!existing.has(baseId)) return baseId
    let index = 2
    while (index < 1000) {
      const candidate = `${baseId}-${index}`
      if (!existing.has(candidate)) return candidate
      index += 1
    }
    return `${baseId}-${Date.now()}`
  }
}
