import { Injectable } from '@nestjs/common'
import type { TaskClass } from './model-router.service'

export type EffortLevel = 'instant' | 'direct' | 'planned' | 'max'

const LEVELS: EffortLevel[] = ['instant', 'direct', 'planned', 'max']

/**
 * Adaptive effort — the frontier "thinking budget" idea:
 * easy asks get minimal compute, hard asks get planning and verification.
 * `EFFORT_MODE=auto` classifies per message; a manual override can pin a level.
 */
@Injectable()
export class EffortService {
  resolve(userMessage: string, taskClass: TaskClass, override?: string): EffortLevel {
    const manual = String(override ?? '').trim().toLowerCase()
    if (LEVELS.includes(manual as EffortLevel)) return manual as EffortLevel

    const mode = String(process.env.EFFORT_MODE ?? 'auto').trim().toLowerCase()
    if (LEVELS.includes(mode as EffortLevel)) return mode as EffortLevel

    if (taskClass === 'small-talk') return 'instant'
    const len = userMessage.trim().length
    const complex =
      len > 220 ||
      /\b(plan|build|architect|design|analyze|analyse|compare|research|strategy|multi[- ]step|end[- ]to[- ]end|migration|refactor)\b/i.test(userMessage)
    if (complex || taskClass === 'reasoning' || taskClass === 'code') return 'planned'
    return 'direct'
  }

  /** "max" buys extra tool rounds and a forced critic pass. */
  isMax(level: EffortLevel): boolean {
    return level === 'max'
  }

  usesPlanning(level: EffortLevel): boolean {
    return level === 'planned' || level === 'max'
  }
}
