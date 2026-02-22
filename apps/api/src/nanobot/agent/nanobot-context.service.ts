import { Injectable } from '@nestjs/common'
import { NanobotMemoryStore } from './nanobot-memory.store'
import type { NanobotSkillManifest } from '../types'

const BASE_PROMPT = `You are Nanobot, an execution-focused AI operator.
Keep responses concise, actionable, and safety-aware.
When user requests match available tools, use the tools first instead of refusing with generic capability limits.
Prefer explicit steps, concrete commands, and transparent assumptions.`

@Injectable()
export class NanobotContextService {
  constructor(private memoryStore: NanobotMemoryStore) {}

  async buildSystemPrompt(userId: string, activeSkills: NanobotSkillManifest[]) {
    const memoryLines = await this.memoryStore.getUserContext(userId)
    const skillPrompt = activeSkills
      .map((skill) => skill.promptAppendix)
      .filter((value): value is string => Boolean(value))
      .join('\n')

    const parts = [BASE_PROMPT]

    if (memoryLines.length) {
      parts.push(`User memory context:\n${memoryLines.join('\n')}`)
    }

    if (skillPrompt.trim()) {
      parts.push(`Active skill guidance:\n${skillPrompt}`)
    }

    return parts.join('\n\n')
  }
}
