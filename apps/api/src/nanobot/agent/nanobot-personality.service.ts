import { Injectable, Logger } from '@nestjs/common'
import { MemoryService } from '../../memory/memory.service'
import type { NanobotPersonaProfile, NanobotPersonalityState } from '../types'

const PERSONALITY_FILE = 'PERSONA.json'
const SOUL_FILE = 'SOUL.md'
const DEFAULT_PROFILE_ID = 'operator'
const MAX_BOUNDARIES = 8

const PERSONA_PROFILES: NanobotPersonaProfile[] = [
  {
    id: 'operator',
    label: 'Operator',
    description: 'Fast execution and practical delivery for implementation tasks.',
    style: 'pragmatic-operator',
    mood: 'focused',
    energy: 0.72,
    decisiveness: 0.68,
    boundaries: [
      'Prefer concrete actions over abstract discussion.',
      'Do not execute destructive changes without explicit confirmation.',
      'Keep responses concise and implementation-focused.',
    ],
  },
  {
    id: 'researcher',
    label: 'Researcher',
    description: 'Careful analysis with evidence and conservative recommendations.',
    style: 'analytical-researcher',
    mood: 'curious',
    energy: 0.58,
    decisiveness: 0.52,
    boundaries: [
      'State assumptions before conclusions.',
      'Prioritize source-backed claims over speculation.',
      'Flag uncertainty and risk explicitly.',
    ],
  },
  {
    id: 'strategist',
    label: 'Strategist',
    description: 'Planning-first profile focused on milestones, sequencing, and tradeoffs.',
    style: 'strategic-planner',
    mood: 'deliberate',
    energy: 0.64,
    decisiveness: 0.62,
    boundaries: [
      'Break large work into clear phased milestones.',
      'Do not skip risk assessment for high-impact changes.',
      'Always provide next-step options with tradeoffs.',
    ],
  },
  {
    id: 'support',
    label: 'Support',
    description: 'User-support profile optimized for clarity, empathy, and safe resolution steps.',
    style: 'support-troubleshooter',
    mood: 'calm',
    energy: 0.6,
    decisiveness: 0.56,
    boundaries: [
      'Acknowledge user impact and keep the response solution-focused.',
      'Do not ask for secrets or private credentials in plain text.',
      'Provide reversible troubleshooting steps before risky actions.',
    ],
  },
]

@Injectable()
export class NanobotPersonalityService {
  private readonly logger = new Logger(NanobotPersonalityService.name)
  private cache = new Map<string, NanobotPersonalityState>()

  constructor(private memory: MemoryService) {}

  listProfiles() {
    return PERSONA_PROFILES.map((profile) => ({ ...profile, boundaries: [...profile.boundaries] }))
  }

  async getForUser(userId: string): Promise<NanobotPersonalityState> {
    const cached = this.cache.get(userId)
    if (cached) return cached

    const defaultState = this.defaultState()
    const soulBoundaries = await this.readSoulBoundaries(userId)
    try {
      const file = await this.memory.readFile(userId, PERSONALITY_FILE)
      const parsed = JSON.parse(file.content) as Partial<NanobotPersonalityState>
      const profileId = typeof parsed.profileId === 'string' ? parsed.profileId : defaultState.profileId
      const profile = this.profileById(profileId)
      const parsedBoundaries = Array.isArray(parsed.boundaries)
        ? parsed.boundaries.filter((value): value is string => typeof value === 'string')
        : []
      const merged = this.normalize({
        profileId: profile.id,
        style: typeof parsed.style === 'string' ? parsed.style : defaultState.style,
        mood: typeof parsed.mood === 'string' ? parsed.mood : defaultState.mood,
        energy: typeof parsed.energy === 'number' ? parsed.energy : defaultState.energy,
        decisiveness: typeof parsed.decisiveness === 'number' ? parsed.decisiveness : defaultState.decisiveness,
        boundaries: this.mergeBoundaries(profile.boundaries, parsedBoundaries, soulBoundaries),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : defaultState.updatedAt,
      })
      this.cache.set(userId, merged)
      return merged
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message.toLowerCase() : ''
      if (message && !message.includes('not found')) {
        this.logger.warn(`Failed to load ${PERSONALITY_FILE} for ${userId}: ${error.message}`)
      }
      const fallback = this.normalize({
        ...defaultState,
        boundaries: this.mergeBoundaries(
          this.profileById(defaultState.profileId).boundaries,
          defaultState.boundaries,
          soulBoundaries,
        ),
      })
      this.cache.set(userId, fallback)
      return fallback
    }
  }

  async setProfile(userId: string, profileId: string) {
    const current = await this.getForUser(userId)
    const profile = this.profileById(profileId)
    const soulBoundaries = await this.readSoulBoundaries(userId)
    const next = this.normalize({
      ...current,
      profileId: profile.id,
      style: profile.style,
      mood: profile.mood,
      energy: profile.energy,
      decisiveness: profile.decisiveness,
      boundaries: this.mergeBoundaries(profile.boundaries, current.boundaries, soulBoundaries),
    })
    this.cache.set(userId, next)
    await this.persist(userId, next)
    return next
  }

  async setBoundaries(userId: string, boundaries: string[]) {
    const current = await this.getForUser(userId)
    const profile = this.profileById(current.profileId)
    const soulBoundaries = await this.readSoulBoundaries(userId)
    const next = this.normalize({
      ...current,
      boundaries: this.mergeBoundaries(profile.boundaries, boundaries, soulBoundaries),
    })
    this.cache.set(userId, next)
    await this.persist(userId, next)
    return next
  }

  async updateForTurn(
    userId: string,
    input: {
      userMessage: string
      success: boolean
      hadTools?: boolean
      toolCount?: number
    },
  ) {
    const current = await this.getForUser(userId)
    const next: NanobotPersonalityState = { ...current }

    if (!input.success) {
      next.mood = 'cautious'
      next.energy -= 0.08
      next.decisiveness -= 0.1
    } else {
      if (input.hadTools || (input.toolCount ?? 0) > 0) {
        next.mood = 'engaged'
        next.energy += 0.05
        next.decisiveness += 0.06
      } else {
        next.mood = 'focused'
        next.energy += 0.02
        next.decisiveness += 0.03
      }
    }

    const lower = input.userMessage.toLowerCase()
    if (/\?$/.test(input.userMessage.trim()) || lower.startsWith('why ') || lower.startsWith('how ')) {
      next.mood = 'curious'
      next.style = 'analytical-pragmatic'
    } else if (lower.includes('urgent') || lower.includes('asap')) {
      next.style = 'decisive-operator'
      next.decisiveness += 0.05
    }

    const normalized = this.normalize(next)
    this.cache.set(userId, normalized)
    await this.persist(userId, normalized)
    return normalized
  }

  buildPromptAppendix(state: NanobotPersonalityState) {
    const boundaryLines = state.boundaries.length
      ? state.boundaries.map((item) => `- ${item}`)
      : ['- Do not violate explicit user safety constraints.']

    return [
      'Personality state:',
      `- profile: ${state.profileId}`,
      `- style: ${state.style}`,
      `- mood: ${state.mood}`,
      `- energy: ${state.energy.toFixed(2)}`,
      `- decisiveness: ${state.decisiveness.toFixed(2)}`,
      'Strict behavior boundaries:',
      ...boundaryLines,
      'Apply this state consistently while staying concise and practical.',
    ].join('\n')
  }

  private defaultState(): NanobotPersonalityState {
    const profile = this.profileById(DEFAULT_PROFILE_ID)
    return {
      profileId: profile.id,
      style: profile.style,
      mood: profile.mood,
      energy: profile.energy,
      decisiveness: profile.decisiveness,
      boundaries: [...profile.boundaries],
      updatedAt: new Date().toISOString(),
    }
  }

  private normalize(state: NanobotPersonalityState): NanobotPersonalityState {
    const profile = this.profileById(state.profileId)
    const boundaries = this.sanitizeBoundaries(state.boundaries, profile.boundaries)
    return {
      ...state,
      profileId: profile.id,
      energy: this.clamp01(state.energy),
      decisiveness: this.clamp01(state.decisiveness),
      boundaries,
      updatedAt: new Date().toISOString(),
    }
  }

  private clamp01(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(1, value))
  }

  private async persist(userId: string, state: NanobotPersonalityState) {
    await this.memory.writeFile(userId, PERSONALITY_FILE, JSON.stringify(state, null, 2))
  }

  private profileById(profileId: string | null | undefined) {
    const normalized = (profileId ?? '').trim().toLowerCase()
    return PERSONA_PROFILES.find((profile) => profile.id === normalized) ?? PERSONA_PROFILES[0]
  }

  private sanitizeBoundaries(boundaries: string[] | undefined, fallback: string[]) {
    const merged = this.mergeBoundaries(fallback, boundaries ?? [], [])
    return merged.length > 0 ? merged : [...fallback]
  }

  private mergeBoundaries(profileBoundaries: string[], userBoundaries: string[], soulBoundaries: string[]) {
    const out: string[] = []
    const seen = new Set<string>()
    for (const source of [profileBoundaries, userBoundaries, soulBoundaries]) {
      for (const item of source) {
        const text = item.trim()
        if (!text) continue
        const key = text.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(text.slice(0, 220))
        if (out.length >= MAX_BOUNDARIES) return out
      }
    }
    return out
  }

  private async readSoulBoundaries(userId: string) {
    try {
      const soul = await this.memory.readFile(userId, SOUL_FILE)
      const lines = soul.content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      const candidates = lines
        .filter((line) =>
          (/^[-*]\s+/.test(line) && /(must|never|always|do not|don't|avoid)/i.test(line))
          || /^must\s+/i.test(line)
          || /^never\s+/i.test(line),
        )
        .map((line) => line.replace(/^[-*]\s+/, '').trim())
      return candidates.slice(0, 4)
    } catch {
      return []
    }
  }
}
