import { Injectable } from '@nestjs/common'
import { CostService, RouterSettings, RouterTier } from './cost.service'

export interface RouteInput {
  userId: string
  prompt: string
  /** Number of tools the agent will expose for this call. */
  toolCount?: number
  /** Provider/model the user would otherwise use (manual mode returns this). */
  fallbackProvider?: string
  fallbackModel?: string
}

export interface RouteDecision {
  provider: string
  model: string
  tier: RouterTier
  score: number
  reasons: string[]
  mode: RouterSettings['mode']
  overBudget: boolean
}

const COMPLEX_KEYWORDS = [
  'architect', 'refactor', 'design', 'prove', 'analy', 'debug', 'optimi', 'migrat',
  'research', 'strategy', 'plan', 'multi-step', 'step by step', 'compare', 'security', 'algorithm',
]
const TOOL_KEYWORDS = [
  'search', 'browse', 'fetch', 'download', 'run ', 'execute', 'deploy', 'email', 'calendar',
  'file', 'commit', 'schedule', 'scrape', 'latest', 'today',
]
const SIMPLE_KEYWORDS = ['hi', 'hello', 'thanks', 'thank you', 'translate', 'summarize', 'define', 'what is']

@Injectable()
export class ModelRouterService {
  constructor(private costs: CostService) {}

  /** Pure heuristic classification: 0-100 score -> tier. */
  classify(prompt: string, toolCount = 0): { tier: RouterTier; score: number; reasons: string[] } {
    const text = (prompt ?? '').toLowerCase()
    const reasons: string[] = []
    let score = 0

    const len = text.length
    if (len > 4000) { score += 35; reasons.push('very long prompt') }
    else if (len > 1200) { score += 20; reasons.push('long prompt') }
    else if (len > 300) { score += 10; reasons.push('medium prompt') }

    const codeSignals = (text.match(/```|function |class |import |=>|def |select .* from|\{\s*\n/g) ?? []).length
    if (codeSignals > 0) { score += Math.min(30, 12 + codeSignals * 4); reasons.push('contains code') }

    const complexHits = COMPLEX_KEYWORDS.filter((k) => text.includes(k))
    if (complexHits.length) { score += Math.min(30, complexHits.length * 10); reasons.push(`complex keywords: ${complexHits.slice(0, 3).join(', ')}`) }

    const toolHits = TOOL_KEYWORDS.filter((k) => text.includes(k))
    if (toolHits.length) { score += Math.min(20, toolHits.length * 7); reasons.push('likely needs tools') }
    if (toolCount > 10) { score += 5 }

    if (len < 120 && SIMPLE_KEYWORDS.some((k) => text.startsWith(k) || text.includes(` ${k}`))) {
      score -= 15
      reasons.push('simple conversational ask')
    }

    score = Math.max(0, Math.min(100, score))
    const tier: RouterTier = score >= 45 ? 'complex' : score >= 15 ? 'standard' : 'simple'
    return { tier, score, reasons }
  }

  async route(input: RouteInput): Promise<RouteDecision> {
    const settings = await this.costs.getRouterSettings(input.userId)
    const { tier, score, reasons } = this.classify(input.prompt, input.toolCount)
    const budget = await this.costs.getBudgetStatus(input.userId)
    const overBudget = budget.capUsd > 0 && budget.spentUsd >= budget.capUsd

    const pick = (t: RouterTier) => settings.tiers[t]
    let choice = pick(tier)
    let effectiveTier = tier

    switch (settings.mode) {
      case 'manual':
        return {
          provider: input.fallbackProvider ?? choice.provider,
          model: input.fallbackModel ?? choice.model,
          tier, score, reasons, mode: settings.mode, overBudget,
        }
      case 'auto-cheapest':
        effectiveTier = tier === 'complex' ? 'standard' : 'simple'
        break
      case 'best':
        effectiveTier = tier === 'simple' ? 'standard' : 'complex'
        break
      case 'balanced':
      default:
        break
    }
    // When over the monthly cap, always downgrade to the simple tier.
    if (overBudget) { effectiveTier = 'simple'; reasons.push('monthly budget cap reached') }
    choice = pick(effectiveTier)
    return { provider: choice.provider, model: choice.model, tier: effectiveTier, score, reasons, mode: settings.mode, overBudget }
  }
}
