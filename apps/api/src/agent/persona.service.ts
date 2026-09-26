import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { TaskClass } from './model-router.service'

/**
 * Persona routing: give each task class the operating style of a specialist.
 * Frontier models feel "mode-aware" because their harness tells them what
 * kind of expert they are being right now.
 */
@Injectable()
export class PersonaService {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    const raw = (this.config.get<string>('PERSONA_ROUTING') ?? 'true').trim().toLowerCase()
    return !['0', 'false', 'no', 'off'].includes(raw)
  }

  appendixFor(taskClass: TaskClass): string {
    switch (taskClass) {
      case 'reasoning':
        return 'Adopt the Planner persona: decompose the problem before answering, state assumptions, weigh trade-offs, and end with a clear recommendation.'
      case 'code':
        return 'Adopt the Engineer persona: produce complete runnable code, handle errors explicitly, prefer simple solutions, and briefly explain non-obvious choices.'
      case 'search':
        return 'Adopt the Researcher persona: gather from tools before asserting, cite sources inline, distinguish facts from inference, and flag stale or conflicting data.'
      case 'summarize':
        return 'Adopt the Editor persona: compress ruthlessly, preserve decisions and numbers, lead with the conclusion, and never invent detail absent from the source.'
      case 'small-talk':
        return 'Adopt the Companion persona: warm, brief, human. One or two sentences.'
      default:
        return 'Adopt the Chief-of-Staff persona: understand the real goal, act decisively, and deliver finished work rather than options.'
    }
  }
}
