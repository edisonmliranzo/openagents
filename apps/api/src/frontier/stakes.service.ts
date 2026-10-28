import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LLMService } from '../agent/llm.service'
import { flag, clamp } from './frontier.util'

export type StakesLevel = 'low' | 'medium' | 'high'

const HIGH_PATTERNS =
  /\b(pay|payment|purchase|buy|transfer|wire|refund|delete|drop table|unsubscribe|send (this|it|the email|an? email)|post publicly|publish|deploy|production|irreversible|contract|lease|sign|insurance|tax filing|medical|prescription|bank|credit card|invoice)\b/i
const LOW_PATTERNS =
  /^(hi|hello|hey|thanks|thank you|ok(ay)?|yes|no|lol|nice|cool|good|great|wow|hmm)\b[\s!.,]*$/i

@Injectable()
export class StakesService {
  private readonly logger = new Logger(StakesService.name)
  private readonly cache = new Map<string, { level: StakesLevel; at: number }>()

  constructor(
    private readonly config: ConfigService,
    private readonly llm: LLMService,
  ) {}

  get enabled(): boolean {
    return flag(this.config, 'STAKES_AWARE')
  }

  async assess(text: string): Promise<StakesLevel> {
    if (!this.enabled) return 'medium'
    if (LOW_PATTERNS.test(text.trim())) return 'low'
    if (HIGH_PATTERNS.test(text)) return 'high'
    return 'medium'
  }
}
