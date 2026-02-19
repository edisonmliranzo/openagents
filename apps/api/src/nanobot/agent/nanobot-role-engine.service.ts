import { Injectable } from '@nestjs/common'
import type { NanobotPersonalityState, NanobotRoleDecision, NanobotThoughtMode } from '../types'

@Injectable()
export class NanobotRoleEngineService {
  evaluate(userMessage: string, personality: NanobotPersonalityState): NanobotRoleDecision {
    const compact = userMessage.trim().replace(/\s+/g, ' ')
    const goal = this.extractGoal(compact)
    const thoughtMode = this.pickThoughtMode(compact)
    const plan = this.buildPlan(goal, thoughtMode)
    const concerns = this.buildConcerns(compact)
    const confidence = this.scoreConfidence(compact, personality, concerns.length)

    return {
      plannerGoal: goal,
      plannerPlan: plan,
      executorIntent: plan[0] ?? 'Clarify target outcome before acting.',
      criticConcerns: concerns,
      confidence,
      thoughtMode,
    }
  }

  buildPromptAppendix(decision: NanobotRoleDecision) {
    const planLines = decision.plannerPlan.map((step, idx) => `${idx + 1}. ${step}`)
    const concernLines = decision.criticConcerns.length
      ? decision.criticConcerns.map((item) => `- ${item}`)
      : ['- No major blockers detected.']

    return [
      'Internal role loop:',
      `Planner goal: ${decision.plannerGoal}`,
      'Planner sequence:',
      ...planLines,
      `Executor intent: ${decision.executorIntent}`,
      `Critic concerns:\n${concernLines.join('\n')}`,
      `Confidence: ${decision.confidence.toFixed(2)}`,
      `Thought mode: ${decision.thoughtMode}`,
      'Follow this plan unless new evidence forces revision.',
    ].join('\n')
  }

  private extractGoal(compact: string) {
    if (!compact) return 'Understand user intent and provide the safest useful next step.'
    const max = 120
    if (compact.length <= max) return compact
    const cut = compact.slice(0, max)
    const boundary = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'))
    return boundary > 40 ? cut.slice(0, boundary + 1) : `${cut.trim()}...`
  }

  private pickThoughtMode(message: string): NanobotThoughtMode {
    const lower = message.toLowerCase()
    if (lower.includes('why') || lower.includes('explain') || /\?$/.test(message)) return 'explore'
    if (lower.includes('plan') || lower.includes('design') || lower.includes('architecture')) return 'plan'
    if (lower.includes('fix') || lower.includes('implement') || lower.includes('add') || lower.includes('build') || lower.includes('run')) return 'act'
    return 'reflect'
  }

  private buildPlan(goal: string, mode: NanobotThoughtMode) {
    if (mode === 'explore') {
      return [
        'Clarify constraints and expected output.',
        'Gather only the missing facts needed to answer.',
        'Deliver concise answer with explicit assumptions.',
      ]
    }
    if (mode === 'plan') {
      return [
        `Break down objective: ${goal}`,
        'Compare at least two approaches and choose one.',
        'Execute the first safe incremental step.',
      ]
    }
    if (mode === 'act') {
      return [
        'Verify current state and preconditions.',
        'Apply the smallest change that moves task forward.',
        'Validate outcome and report the result.',
      ]
    }
    return [
      'Summarize what is known.',
      'Identify one actionable next step.',
      'Keep context ready for follow-up iteration.',
    ]
  }

  private buildConcerns(message: string) {
    const lower = message.toLowerCase()
    const concerns: string[] = []
    if (lower.includes('delete') || lower.includes('drop') || lower.includes('remove')) {
      concerns.push('Potential destructive action; verify intent and scope first.')
    }
    if (lower.includes('password') || lower.includes('key') || lower.includes('token') || lower.includes('secret')) {
      concerns.push('Sensitive credential handling risk; avoid exposing secrets.')
    }
    if (lower.includes('prod') || lower.includes('production')) {
      concerns.push('Production impact risk; prefer non-disruptive validation first.')
    }
    if (lower.includes('quick') || lower.includes('fast') || lower.includes('urgent') || lower.includes('asap')) {
      concerns.push('Time-pressure risk can reduce quality; prioritize high-signal checks.')
    }
    return concerns
  }

  private scoreConfidence(message: string, personality: NanobotPersonalityState, concernCount: number) {
    let score = 0.55
    if (message.length > 20) score += 0.1
    if (message.length > 120) score += 0.05
    score += (personality.decisiveness - 0.5) * 0.2
    score += (personality.energy - 0.5) * 0.1
    score -= concernCount * 0.08
    const bounded = Math.max(0.05, Math.min(0.95, score))
    return Math.round(bounded * 10000) / 10000
  }
}

