import { Injectable } from '@nestjs/common'
import type {
  ApprovalRiskLevel,
  NanobotComplexity,
  NanobotPersonalityState,
  NanobotRuntimeAutomationState,
  NanobotTaskType,
  NanobotThinkingDepth,
  NanobotThinkingRoute,
  NanobotUrgency,
} from '../types'

const DEFAULT_AUTOMATION_STATE: NanobotRuntimeAutomationState = {
  updatedAt: new Date(0).toISOString(),
  personaAutoSwitch: {
    enabled: true,
    switched: false,
    fromProfileId: null,
    toProfileId: null,
    reason: 'No runs yet.',
    taskType: 'general',
  },
  thinkingRouter: {
    thoughtMode: 'reflect',
    thinkingDepth: 'balanced',
    taskType: 'general',
    complexity: 'low',
    urgency: 'normal',
    rationale: 'No routing decision yet.',
  },
  approvalRisk: {
    level: 'low',
    score: 0,
    reason: 'No tool calls yet.',
    autoApproved: false,
    autonomyWithinWindow: false,
    toolName: null,
  },
}

interface PersonaRoutingResult {
  switched: boolean
  nextProfileId: string
  reason: string
  taskType: NanobotTaskType
}

interface RiskScoreInput {
  toolName: string
  toolInput: Record<string, unknown>
  requiresApprovalByPolicy: boolean
  outsideAutonomyWindow: boolean
}

interface RiskScoreResult {
  level: ApprovalRiskLevel
  score: number
  reason: string
}

@Injectable()
export class NanobotRuntimeIntelligenceService {
  private readonly userState = new Map<string, NanobotRuntimeAutomationState>()
  private readonly lastPersonaSwitchAt = new Map<string, number>()
  private readonly personaSwitchCooldownMs = 10 * 60 * 1000

  routeThinking(userMessage: string): NanobotThinkingRoute {
    const compact = userMessage.trim()
    const lower = compact.toLowerCase()
    const urgency = this.pickUrgency(lower)
    const complexity = this.pickComplexity(compact, lower)
    const taskType = this.pickTaskType(lower)
    const thoughtMode = this.pickThoughtMode(lower, taskType, complexity, urgency)
    const thinkingDepth = this.pickThinkingDepth(complexity, urgency)
    const rationale = [
      `task=${taskType}`,
      `complexity=${complexity}`,
      `urgency=${urgency}`,
      `mode=${thoughtMode}`,
      `depth=${thinkingDepth}`,
    ].join(', ')

    return {
      thoughtMode,
      thinkingDepth,
      taskType,
      complexity,
      urgency,
      rationale,
    }
  }

  decidePersonaSwitch(input: {
    userId: string
    route: NanobotThinkingRoute
    currentPersonality: NanobotPersonalityState
  }): PersonaRoutingResult {
    const { userId, route, currentPersonality } = input
    const currentProfile = currentPersonality.profileId
    const suggestedProfile = this.profileForTask(route.taskType, route.urgency)
    const lockBoundary = currentPersonality.boundaries.some((item) =>
      /(lock persona|persona locked|manual persona only|\[lock-persona\])/i.test(item))
    if (lockBoundary) {
      return {
        switched: false,
        nextProfileId: currentProfile,
        reason: 'Persona is locked by boundary guardrail.',
        taskType: route.taskType,
      }
    }

    const lastSwitch = this.lastPersonaSwitchAt.get(userId) ?? 0
    const inCooldown = Date.now() - lastSwitch < this.personaSwitchCooldownMs
    if (inCooldown) {
      return {
        switched: false,
        nextProfileId: currentProfile,
        reason: 'Persona switch skipped to avoid rapid profile thrash.',
        taskType: route.taskType,
      }
    }

    if (suggestedProfile === currentProfile) {
      return {
        switched: false,
        nextProfileId: currentProfile,
        reason: 'Current profile already matches detected task type.',
        taskType: route.taskType,
      }
    }

    this.lastPersonaSwitchAt.set(userId, Date.now())
    return {
      switched: true,
      nextProfileId: suggestedProfile,
      reason: `Task type "${route.taskType}" maps to persona "${suggestedProfile}".`,
      taskType: route.taskType,
    }
  }

  scoreApprovalRisk(input: RiskScoreInput): RiskScoreResult {
    const { toolName, toolInput, requiresApprovalByPolicy, outsideAutonomyWindow } = input
    const lowerTool = toolName.toLowerCase()
    let score = 5
    const reasons: string[] = []

    if (requiresApprovalByPolicy) {
      score += 60
      reasons.push('Tool policy requires explicit approval.')
    }
    if (outsideAutonomyWindow) {
      score += 20
      reasons.push('Execution requested outside autonomy window.')
    }
    if (/(gmail|calendar_create_event|cron_remove|cron_add|draft|send|delete|remove)/i.test(lowerTool)) {
      score += 22
      reasons.push('Tool can mutate external state.')
    }
    if (/(web_fetch|web_search)/i.test(lowerTool)) {
      score += 8
      reasons.push('Tool reads external network sources.')
    }

    const serializedInput = this.safeSerialize(toolInput).toLowerCase()
    if (/(password|api[_-]?key|token|secret|private[_-]?key|credential)/i.test(serializedInput)) {
      score += 28
      reasons.push('Tool input contains credential-like material.')
    }
    if (/(http:\/\/|https:\/\/)/i.test(serializedInput)) {
      score += 10
      reasons.push('Tool input includes URL targets.')
    }
    if (serializedInput.length > 1800) {
      score += 6
      reasons.push('Large input payload increases review complexity.')
    }

    const bounded = Math.max(0, Math.min(100, score))
    const level = bounded >= 70 ? 'high' : bounded >= 35 ? 'medium' : 'low'
    return {
      level,
      score: bounded,
      reason: reasons.length ? reasons.join(' ') : 'Low-impact read-only action.',
    }
  }

  shouldAutoApproveLowRisk(input: {
    riskLevel: ApprovalRiskLevel
    withinAutonomyWindow: boolean
    requiresApprovalByPolicy: boolean
  }) {
    return input.riskLevel === 'low'
      && input.withinAutonomyWindow
      && !input.requiresApprovalByPolicy
  }

  recordPersonaDecision(userId: string, input: {
    switched: boolean
    fromProfileId: string | null
    toProfileId: string | null
    reason: string
    taskType: NanobotTaskType
  }) {
    const current = this.getState(userId)
    this.userState.set(userId, {
      ...current,
      updatedAt: new Date().toISOString(),
      personaAutoSwitch: {
        enabled: true,
        switched: input.switched,
        fromProfileId: input.fromProfileId,
        toProfileId: input.toProfileId,
        reason: input.reason,
        taskType: input.taskType,
      },
    })
  }

  recordThinkingRoute(userId: string, route: NanobotThinkingRoute) {
    const current = this.getState(userId)
    this.userState.set(userId, {
      ...current,
      updatedAt: new Date().toISOString(),
      thinkingRouter: route,
    })
  }

  recordRiskDecision(userId: string, input: {
    level: ApprovalRiskLevel
    score: number
    reason: string
    autoApproved: boolean
    autonomyWithinWindow: boolean
    toolName: string
  }) {
    const current = this.getState(userId)
    this.userState.set(userId, {
      ...current,
      updatedAt: new Date().toISOString(),
      approvalRisk: {
        level: input.level,
        score: input.score,
        reason: input.reason,
        autoApproved: input.autoApproved,
        autonomyWithinWindow: input.autonomyWithinWindow,
        toolName: input.toolName,
      },
    })
  }

  getState(userId: string): NanobotRuntimeAutomationState {
    const current = this.userState.get(userId)
    if (current) return current
    const fallback = this.defaultState()
    this.userState.set(userId, fallback)
    return fallback
  }

  private defaultState(): NanobotRuntimeAutomationState {
    return {
      updatedAt: new Date().toISOString(),
      personaAutoSwitch: { ...DEFAULT_AUTOMATION_STATE.personaAutoSwitch },
      thinkingRouter: { ...DEFAULT_AUTOMATION_STATE.thinkingRouter },
      approvalRisk: { ...DEFAULT_AUTOMATION_STATE.approvalRisk },
    }
  }

  private profileForTask(taskType: NanobotTaskType, urgency: NanobotUrgency) {
    if (taskType === 'research') return 'researcher'
    if (taskType === 'support') return 'support'
    if (taskType === 'ops') return urgency === 'high' ? 'operator' : 'strategist'
    return urgency === 'high' ? 'operator' : 'strategist'
  }

  private pickTaskType(lower: string): NanobotTaskType {
    if (/(research|analy[sz]e|compare|investigate|evidence|sources?)/i.test(lower)) return 'research'
    if (/(incident|deploy|release|runbook|ops|sre|monitor|alert|outage)/i.test(lower)) return 'ops'
    if (/(customer|support|ticket|helpdesk|faq|triage|user issue)/i.test(lower)) return 'support'
    return 'general'
  }

  private pickUrgency(lower: string): NanobotUrgency {
    if (/(urgent|asap|immediately|right now|sev[0-2]|p0|p1)/i.test(lower)) return 'high'
    if (/(today|soon|quick|fast|priority)/i.test(lower)) return 'normal'
    return 'low'
  }

  private pickComplexity(message: string, lower: string): NanobotComplexity {
    let score = 0
    if (message.length > 160) score += 1
    if (message.length > 380) score += 1
    if ((lower.match(/\band\b|\bor\b|\bthen\b|,|;/g) ?? []).length >= 3) score += 1
    if (/(architecture|tradeoff|multi-step|pipeline|migrate|integration|security|compliance)/i.test(lower)) score += 1
    if (/(fix|add|update|change|run|check)/i.test(lower)) score += 1
    if (score >= 4) return 'high'
    if (score >= 2) return 'medium'
    return 'low'
  }

  private pickThoughtMode(
    lower: string,
    taskType: NanobotTaskType,
    complexity: NanobotComplexity,
    urgency: NanobotUrgency,
  ) {
    if (urgency === 'high' && complexity === 'low') return 'act'
    if (taskType === 'research') return 'explore'
    if (complexity === 'high') return 'plan'
    if (/(fix|implement|add|build|run|execute)/i.test(lower)) return 'act'
    return 'reflect'
  }

  private pickThinkingDepth(complexity: NanobotComplexity, urgency: NanobotUrgency): NanobotThinkingDepth {
    if (urgency === 'high' && complexity === 'low') return 'fast'
    if (complexity === 'high') return 'deep'
    if (urgency === 'low' && complexity === 'medium') return 'deep'
    return 'balanced'
  }

  private safeSerialize(value: unknown) {
    try {
      return JSON.stringify(value) ?? ''
    } catch {
      return String(value)
    }
  }
}
