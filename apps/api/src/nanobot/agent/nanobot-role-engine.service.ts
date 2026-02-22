import { Injectable } from '@nestjs/common'
import type {
  NanobotComplexity,
  NanobotPersonalityState,
  NanobotRoleDecision,
  NanobotThinkingDepth,
  NanobotThinkingRoute,
  NanobotThoughtMode,
  NanobotUrgency,
} from '../types'

@Injectable()
export class NanobotRoleEngineService {
  evaluate(
    userMessage: string,
    personality: NanobotPersonalityState,
    route?: NanobotThinkingRoute,
  ): NanobotRoleDecision {
    const compact = userMessage.trim().replace(/\s+/g, ' ')
    const goal = this.extractGoal(compact)
    const thoughtMode = route?.thoughtMode ?? this.pickThoughtMode(compact)
    const thinkingDepth = route?.thinkingDepth ?? 'balanced'
    const complexity = route?.complexity ?? 'low'
    const urgency = route?.urgency ?? 'normal'
    const taskType = route?.taskType ?? 'general'
    const plan = this.buildPlan(goal, thoughtMode, thinkingDepth, urgency)
    const concerns = this.buildConcerns(compact)
    const confidence = this.scoreConfidence(compact, personality, concerns.length, complexity, urgency)

    return {
      plannerGoal: goal,
      plannerPlan: plan,
      executorIntent: plan[0] ?? 'Clarify target outcome before acting.',
      criticConcerns: concerns,
      confidence,
      thoughtMode,
      taskType,
      thinkingDepth,
      complexity,
      urgency,
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
      `Thinking depth: ${decision.thinkingDepth}`,
      `Task type: ${decision.taskType}`,
      `Complexity: ${decision.complexity}`,
      `Urgency: ${decision.urgency}`,
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

  private buildPlan(
    goal: string,
    mode: NanobotThoughtMode,
    depth: NanobotThinkingDepth,
    urgency: NanobotUrgency,
  ) {
    const validationStep = depth === 'deep'
      ? 'Perform an additional verification pass and call out risks explicitly.'
      : 'Validate output and return concise next actions.'
    const urgencyStep = urgency === 'high'
      ? 'Prioritize the smallest safe action that unblocks execution immediately.'
      : 'Prioritize correctness before speed.'

    if (mode === 'explore') {
      return [
        'Clarify constraints and expected output.',
        'Gather only the missing facts needed to answer.',
        validationStep,
      ]
    }
    if (mode === 'plan') {
      return [
        `Break down objective: ${goal}`,
        'Compare at least two approaches and choose one.',
        urgencyStep,
        validationStep,
      ]
    }
    if (mode === 'act') {
      return [
        'Verify current state and preconditions.',
        'Apply the smallest change that moves task forward.',
        urgencyStep,
        validationStep,
      ]
    }
    return [
      'Summarize what is known.',
      'Identify one actionable next step.',
      validationStep,
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

  private scoreConfidence(
    message: string,
    personality: NanobotPersonalityState,
    concernCount: number,
    complexity: NanobotComplexity,
    urgency: NanobotUrgency,
  ) {
    let score = 0.55
    if (message.length > 20) score += 0.1
    if (message.length > 120) score += 0.05
    score += (personality.decisiveness - 0.5) * 0.2
    score += (personality.energy - 0.5) * 0.1
    if (complexity === 'high') score -= 0.08
    if (urgency === 'high') score -= 0.03
    score -= concernCount * 0.08
    const bounded = Math.max(0.05, Math.min(0.95, score))
    return Math.round(bounded * 10000) / 10000
  }
}
