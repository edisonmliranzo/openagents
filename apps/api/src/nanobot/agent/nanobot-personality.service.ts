import { Injectable, Logger } from '@nestjs/common'
import { MemoryService } from '../../memory/memory.service'
import type { NanobotPersonalityState } from '../types'

const PERSONALITY_FILE = 'PERSONA.json'

@Injectable()
export class NanobotPersonalityService {
  private readonly logger = new Logger(NanobotPersonalityService.name)
  private cache = new Map<string, NanobotPersonalityState>()

  constructor(private memory: MemoryService) {}

  async getForUser(userId: string): Promise<NanobotPersonalityState> {
    const cached = this.cache.get(userId)
    if (cached) return cached

    const defaultState = this.defaultState()
    try {
      const file = await this.memory.readFile(userId, PERSONALITY_FILE)
      const parsed = JSON.parse(file.content) as Partial<NanobotPersonalityState>
      const merged = this.normalize({
        style: typeof parsed.style === 'string' ? parsed.style : defaultState.style,
        mood: typeof parsed.mood === 'string' ? parsed.mood : defaultState.mood,
        energy: typeof parsed.energy === 'number' ? parsed.energy : defaultState.energy,
        decisiveness: typeof parsed.decisiveness === 'number' ? parsed.decisiveness : defaultState.decisiveness,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : defaultState.updatedAt,
      })
      this.cache.set(userId, merged)
      return merged
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message.toLowerCase() : ''
      if (message && !message.includes('not found')) {
        this.logger.warn(`Failed to load ${PERSONALITY_FILE} for ${userId}: ${error.message}`)
      }
      this.cache.set(userId, defaultState)
      return defaultState
    }
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
    return [
      'Personality state:',
      `- style: ${state.style}`,
      `- mood: ${state.mood}`,
      `- energy: ${state.energy.toFixed(2)}`,
      `- decisiveness: ${state.decisiveness.toFixed(2)}`,
      'Apply this state consistently while staying concise and practical.',
    ].join('\n')
  }

  private defaultState(): NanobotPersonalityState {
    return {
      style: 'pragmatic-operator',
      mood: 'focused',
      energy: 0.72,
      decisiveness: 0.68,
      updatedAt: new Date().toISOString(),
    }
  }

  private normalize(state: NanobotPersonalityState): NanobotPersonalityState {
    return {
      ...state,
      energy: this.clamp01(state.energy),
      decisiveness: this.clamp01(state.decisiveness),
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
}

