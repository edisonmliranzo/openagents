import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LLMService } from './llm.service'
import { LLM_MODELS, type LLMProvider } from '@openagents/shared'

export interface CriticVerdict {
  verdict: 'pass' | 'revise'
  feedback: string
}

const CRITIC_SYSTEM_PROMPT = `You are a strict answer reviewer. You will see a USER REQUEST and a DRAFT ANSWER from another AI.
Decide if the draft fully and correctly answers the request.
- Reply PASS if the draft is on-topic, complete, and not hallucinating specifics it cannot know.
- Reply REVISE followed by ONE concrete instruction (max 240 chars) describing what is missing or wrong.
Format: first line exactly PASS or REVISE. If REVISE, second line is the instruction.`

@Injectable()
export class CriticService {
  private readonly logger = new Logger(CriticService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly llm: LLMService,
  ) {}

  get enabled(): boolean {
    const raw = (this.config.get<string>('CRITIC_ENABLED') ?? 'true').trim().toLowerCase()
    return !['0', 'false', 'no', 'off'].includes(raw)
  }

  shouldReview(input: { taskClass: string; answerLength: number; usedTools: boolean }): boolean {
    if (!this.enabled) return false
    // Small talk and tool-grounded answers don't need a critic; spend the
    // review budget on substantive direct answers.
    if (input.usedTools) return false
    if (input.taskClass === 'small-talk') return false
    return input.answerLength >= 300
  }

  async review(input: {
    userMessage: string
    draft: string
    provider: LLMProvider
    apiKey?: string
    baseUrl?: string
  }): Promise<CriticVerdict> {
    try {
      const response = await this.withTimeout(
        this.llm.complete(
          [
            {
              role: 'user',
              content: `USER REQUEST:\n${input.userMessage.slice(0, 1500)}\n\nDRAFT ANSWER:\n${input.draft.slice(0, 3000)}`,
            },
          ],
          [],
          CRITIC_SYSTEM_PROMPT,
          input.provider,
          input.apiKey,
          input.baseUrl,
          this.config.get<string>('CRITIC_MODEL')?.trim() || LLM_MODELS[input.provider].fast,
        ),
        Number(this.config.get<string>('CRITIC_TIMEOUT_MS') ?? 10000),
      )

      const text = (response.content ?? '').trim()
      const firstLine = text.split(/\r?\n/)[0]?.trim().toUpperCase() ?? ''
      if (firstLine.startsWith('REVISE')) {
        const feedback = (text.split(/\r?\n/)[1] ?? '').trim().slice(0, 240)
        return { verdict: 'revise', feedback: feedback || 'Make the answer more directly responsive to the request.' }
      }
      return { verdict: 'pass', feedback: '' }
    } catch (error: any) {
      // A failed critic must never block or degrade the user's answer.
      this.logger.debug(`Critic review skipped: ${error?.message ?? error}`)
      return { verdict: 'pass', feedback: '' }
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    const timeout = Math.max(2000, Math.min(ms, 20000))
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`critic timeout after ${timeout}ms`)), timeout),
      ),
    ])
  }
}
