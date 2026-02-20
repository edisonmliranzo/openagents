import { Injectable, NotFoundException } from '@nestjs/common'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { NanobotSkillsRegistry } from '../agent/nanobot-skills.registry'
import { NanobotPersonalityService } from '../agent/nanobot-personality.service'
import type {
  NanobotMarketplaceExportInput,
  NanobotMarketplaceExportResult,
  NanobotMarketplaceInstallResult,
  NanobotMarketplacePack,
  NanobotSkillManifest,
} from '../types'

interface PackDefinition {
  id: string
  version: string
  title: string
  description: string
  tags: string[]
  personaProfileId?: string
  skills: NanobotSkillManifest[]
}

const MARKETPLACE_PACKS: PackDefinition[] = [
  {
    id: 'binance-ops',
    version: '1.0.0',
    title: 'Binance Ops',
    description: 'Crypto market workflow pack for Binance tracking, alerts, and execution planning.',
    tags: ['finance', 'crypto', 'binance'],
    personaProfileId: 'strategist',
    skills: [
      {
        id: 'custom-binance-market-scout',
        title: 'Binance Market Scout',
        description: 'Fetch and summarize Binance market context with actionable signal notes.',
        tools: ['web_search', 'web_fetch', 'notes'],
        promptAppendix: 'Use current market data, report trend/risk, and avoid unverified claims.',
      },
      {
        id: 'custom-risk-checkpoint',
        title: 'Risk Checkpoint',
        description: 'Run a concise risk checklist before proposing trade actions.',
        tools: ['notes', 'web_fetch'],
        promptAppendix: 'Always include downside scenarios, invalidation conditions, and confidence level.',
      },
    ],
  },
  {
    id: 'builder-fastlane',
    version: '1.0.0',
    title: 'Builder Fastlane',
    description: 'Engineering pack for rapid debug, patch, and verify workflows.',
    tags: ['engineering', 'coding', 'automation'],
    personaProfileId: 'operator',
    skills: [
      {
        id: 'custom-patch-loop',
        title: 'Patch Loop',
        description: 'Identify minimal fix, implement patch, and validate with targeted checks.',
        tools: ['notes', 'web_fetch'],
        promptAppendix: 'Prefer minimal diffs, verify with focused tests, and report residual risk.',
      },
      {
        id: 'custom-release-checklist',
        title: 'Release Checklist',
        description: 'Create a concise pre-release checklist with rollback guidance.',
        tools: ['notes'],
      },
    ],
  },
  {
    id: 'guardian-sre',
    version: '1.0.0',
    title: 'Guardian SRE',
    description: 'Reliability pack for incident triage and service stability routines.',
    tags: ['ops', 'reliability', 'sre'],
    personaProfileId: 'researcher',
    skills: [
      {
        id: 'custom-incident-triage',
        title: 'Incident Triage',
        description: 'Structure incident investigation into timeline, blast radius, and mitigation steps.',
        tools: ['notes', 'web_fetch'],
      },
      {
        id: 'custom-postmortem-draft',
        title: 'Postmortem Draft',
        description: 'Draft postmortem sections with root cause and prevention actions.',
        tools: ['notes'],
      },
    ],
  },
]

@Injectable()
export class NanobotMarketplaceService {
  constructor(
    private skills: NanobotSkillsRegistry,
    private personality: NanobotPersonalityService,
  ) {}

  async listPacks(userId: string): Promise<NanobotMarketplacePack[]> {
    const current = await this.skills.listForUser(userId)
    const activeIds = new Set(current.map((skill) => skill.id))
    return MARKETPLACE_PACKS.map((pack) => ({
      id: pack.id,
      version: pack.version,
      title: pack.title,
      description: pack.description,
      tags: [...pack.tags],
      ...(pack.personaProfileId ? { personaProfileId: pack.personaProfileId } : {}),
      skills: pack.skills.map((skill) => ({ ...skill })),
      installed: pack.skills.every((skill) => activeIds.has(skill.id)),
    }))
  }

  async installPack(userId: string, packId: string): Promise<NanobotMarketplaceInstallResult> {
    const pack = MARKETPLACE_PACKS.find((candidate) => candidate.id === packId)
    if (!pack) {
      throw new NotFoundException(`Marketplace pack "${packId}" not found.`)
    }

    const installedSkills: string[] = []
    for (const skill of pack.skills) {
      const result = await this.skills.upsertCustomSkill(userId, {
        id: skill.id,
        title: skill.title,
        description: skill.description,
        tools: [...skill.tools],
        promptAppendix: skill.promptAppendix,
      })
      installedSkills.push(result.skill.id)
    }

    let appliedPersonaProfileId: string | undefined
    if (pack.personaProfileId) {
      await this.personality.setProfile(userId, pack.personaProfileId)
      appliedPersonaProfileId = pack.personaProfileId
    }

    const [activeSkills, personality] = await Promise.all([
      this.skills.listForUser(userId),
      this.personality.getForUser(userId),
    ])

    return {
      packId,
      installedAt: new Date().toISOString(),
      installedSkills,
      ...(appliedPersonaProfileId ? { appliedPersonaProfileId } : {}),
      activeSkills,
      personality,
    }
  }

  async exportPack(userId: string, input: NanobotMarketplaceExportInput): Promise<NanobotMarketplaceExportResult> {
    const allSkills = await this.skills.listForUser(userId)
    const bundled = new Set((await this.skills.listBundled()).map((skill) => skill.id))
    const customSkills = allSkills.filter((skill) => !bundled.has(skill.id))

    const explicitIds = new Set((input.skillIds ?? []).map((value) => value.trim()).filter(Boolean))
    const selected = customSkills.filter((skill) => {
      if (explicitIds.size > 0) return explicitIds.has(skill.id)
      if (input.includeOnlyEnabled) return skill.enabled
      return true
    })

    const safeName = input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'marketplace-pack'
    const generatedAt = new Date().toISOString()
    const pack = {
      id: safeName,
      version: '1.0.0',
      title: input.name.trim().slice(0, 100),
      description: (input.description?.trim() || `Exported from OpenAgents on ${generatedAt}`).slice(0, 280),
      generatedAt,
      ...(input.personaProfileId ? { personaProfileId: input.personaProfileId } : {}),
      skills: selected.map((skill) => ({
        id: skill.id,
        title: skill.title,
        description: skill.description,
        tools: [...skill.tools],
        ...(skill.promptAppendix ? { promptAppendix: skill.promptAppendix } : {}),
      })),
    }

    const folder = path.resolve(process.cwd(), 'data', 'marketplace', userId)
    await fs.mkdir(folder, { recursive: true })
    const fileName = `${safeName}.json`
    const fullPath = path.join(folder, fileName)
    await fs.writeFile(fullPath, JSON.stringify(pack, null, 2), 'utf8')

    return {
      fileName,
      savedAt: new Date().toISOString(),
      pack,
    }
  }
}

