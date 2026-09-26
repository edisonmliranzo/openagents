import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LLM_MODELS, type LLMProvider } from '@openagents/shared'

export type TaskClass = 'small-talk' | 'summarize' | 'search' | 'code' | 'reasoning' | 'general'

export interface Routing {
  provider: LLMProvider
  model?: string
}

const FAST_HINTS = ['mini', 'nano', 'haiku', 'flash', 'lite', 'small', 'instant', 'turbo', '8b', '3b', '1b', '4b', 'e2b', 'e4b', '12b']
const POWERFUL_HINTS = ['opus', 'sonnet', 'o1', 'o3', 'o4', 'r1', 'pro', '70b', '405b', '235b', '120b', '550b', 'ultra', 'super', 'maverick', 'scout', 'gpt-4.5', 'gpt-5', 'gemini-2.5-pro', 'deep-reasoning']

@Injectable()
export class ModelRouterService {
  private readonly logger = new Logger(ModelRouterService.name)

  constructor(private readonly config: ConfigService) {}

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

  /**
   * Adjust the user's default routing for the detected task class:
   * - reasoning/code tasks running on a fast-tier model upgrade to the
   *   provider's powerful model
   * - small-talk/summarize on a powerful model downgrade to fast
   * Only touches the model, never the provider.
   */
  adjust<T extends Routing>(routing: T, taskClass: TaskClass): T {
    if (!this.enabled) return routing
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
