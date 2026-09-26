import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LLM_MODELS, type LLMProvider } from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'

export type TaskClass = 'small-talk' | 'summarize' | 'search' | 'code' | 'reasoning' | 'general'

export interface Routing {
  provider: LLMProvider
  model?: string
}

export interface OutcomeInput {
  userId: string
  taskClass: TaskClass
  provider: LLMProvider
  model?: string | null
  durationMs: number
  success: boolean
  toolCalls: number
}

const FAST_HINTS = ['mini', 'nano', 'haiku', 'flash', 'lite', 'small', 'instant', 'turbo', '8b', '3b', '1b', '4b', 'e2b', 'e4b', '12b']
const POWERFUL_HINTS = ['opus', 'sonnet', 'o1', 'o3', 'o4', 'r1', 'pro', '70b', '405b', '235b', '120b', '550b', 'ultra', 'super', 'maverick', 'scout', 'gpt-4.5', 'gpt-5', 'gemini-2.5-pro', 'deep-reasoning']
const LEARNED_MIN_SAMPLES = 5
const LEARNED_WINDOW_DAYS = 30

@Injectable()
export class ModelRouterService {
  private readonly logger = new Logger(ModelRouterService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  get enabled(): boolean {
    const raw = (this.config.get<string>('ROUTING_AUTO') ?? 'false').trim().toLowerCase()
    return ['1', 'true', 'yes', 'on'].includes(raw)
  }

  classify(userMessage: string): TaskClass {
    const normalized = (userMessage ?? '').trim().toLowerCase()
    if (!normalized) return 'general'
    if (/^(hi|hey|hello|yo|sup|howdy|good\s?(morning|afternoon|evening)|thanks?|thank you|thx|bye|ok(ay)?|nice|cool|great)\b/.test(normalized) && normalized.length < 40) {
      return 'small-talk'
    }
    if (/\b(summari[sz]e|tl;?dr|condense|shorten|recap)\b/.test(normalized)) return 'summarize'
    if (/\b(search|look up|find out|latest|news|current|what'?s happening|price|weather)\b/.test(normalized)) return 'search'
    if (/\b(code|function|debug|refactor|script|compile|implement|typescript|python|javascript|api endpoint|regex|sql)\b/.test(normalized)) return 'code'
    if (/\b(plan|strategy|architect|design|compare|analyze|analyse|why|should i|trade|invest|research|deep)\b/.test(normalized)) return 'reasoning'
    return 'general'
  }

  private tierOf(model: string): 'fast' | 'powerful' | 'unknown' {
    const normalized = model.toLowerCase()
    if (POWERFUL_HINTS.some((hint) => normalized.includes(hint))) return 'powerful'
    if (FAST_HINTS.some((hint) => normalized.includes(hint))) return 'fast'
    return 'unknown'
  }

  /** Record how a run went so routing can learn from real outcomes. */
  async logOutcome(input: OutcomeInput): Promise<void> {
    if (!input.model) return
    try {
      await this.prisma.routingOutcome.create({
        data: {
          userId: input.userId,
          taskClass: input.taskClass,
          provider: input.provider,
          model: input.model,
          durationMs: Math.max(0, input.durationMs),
          success: input.success,
          toolCalls: input.toolCalls,
        },
      })
    } catch (error: any) {
      this.logger.debug(`Outcome logging skipped: ${error?.message ?? error}`)
    }
  }

  /**
   * Best-performing model for this user + task class from real outcomes in
   * the last 30 days. Only considers models on the current provider (keys
   * for other providers may not exist). Needs a minimum sample size.
   */
  async bestLearnedModel(
    userId: string,
    provider: LLMProvider,
    taskClass: TaskClass,
  ): Promise<string | null> {
    const since = new Date(Date.now() - LEARNED_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const rows = await this.prisma.routingOutcome.findMany({
      where: { userId, provider, taskClass, createdAt: { gte: since } },
      select: { model: true, durationMs: true, success: true },
      take: 500,
    })
    if (rows.length < LEARNED_MIN_SAMPLES) return null

    const byModel = new Map<string, { samples: number; successes: number; totalMs: number }>()
    for (const row of rows) {
      const entry = byModel.get(row.model) ?? { samples: 0, successes: 0, totalMs: 0 }
      entry.samples += 1
      if (row.success) entry.successes += 1
      entry.totalMs += row.durationMs
      byModel.set(row.model, entry)
    }

    let bestModel: string | null = null
    let bestScore = -Infinity
    for (const [model, entry] of byModel) {
      if (entry.samples < LEARNED_MIN_SAMPLES) continue
      const successRate = entry.successes / entry.samples
      if (successRate < 0.6) continue
      const avgSeconds = entry.totalMs / entry.samples / 1000
      // Score: success dominates, speed breaks ties.
      const score = successRate * 10 - Math.min(avgSeconds / 60, 3)
      if (score > bestScore) {
        bestScore = score
        bestModel = model
      }
    }
    return bestModel
  }

  /**
   * Adjust the user's default routing for the detected task class:
   * - learned outcomes (preferred, once enough data exists)
   * - otherwise heuristics: reasoning/code upgrade to powerful,
   *   small-talk/summarize downgrade to fast
   * Only touches the model, never the provider.
   */
  async adjust<T extends Routing>(routing: T, taskClass: TaskClass, userId?: string): Promise<T> {
    if (!this.enabled) return routing

    if (userId) {
      const learned = await this.bestLearnedModel(userId, routing.provider, taskClass).catch(() => null)
      if (learned && learned !== routing.model) {
        this.logger.debug(`Router(learned): ${taskClass} -> ${learned}`)
        return { ...routing, model: learned }
      }
    }

    const currentModel = routing.model?.trim() || LLM_MODELS[routing.provider].default
    const tier = this.tierOf(currentModel)

    if ((taskClass === 'reasoning' || taskClass === 'code') && tier === 'fast') {
      const powerful = LLM_MODELS[routing.provider].powerful
      if (powerful !== currentModel) {
        this.logger.debug(`Router: ${taskClass} task upgraded ${currentModel} -> ${powerful}`)
        return { ...routing, model: powerful }
      }
    }

    if ((taskClass === 'small-talk' || taskClass === 'summarize') && tier === 'powerful') {
      const fast = LLM_MODELS[routing.provider].fast
      if (fast !== currentModel) {
        this.logger.debug(`Router: ${taskClass} task downgraded ${currentModel} -> ${fast}`)
        return { ...routing, model: fast }
      }
    }

    return routing
  }
}
