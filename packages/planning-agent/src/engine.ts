export interface PlanStep {
  id: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  result?: unknown
  subSteps?: PlanStep[]
}

export interface Plan {
  id: string
  goal: string
  steps: PlanStep[]
  status: 'planning' | 'executing' | 'completed' | 'failed'
  createdAt: string
  completedAt?: string
}

export interface PlanningConfig {
  maxDepth?: number
  maxIterations?: number
  allowSubtasks?: boolean
}

export class PlanningAgent {
  private config: PlanningConfig

  constructor(config: PlanningConfig = {}) {
    this.config = {
      maxDepth: 5,
      maxIterations: 10,
      allowSubtasks: true,
      ...config,
    }
  }

  async createPlan(goal: string, context?: Record<string, unknown>): Promise<Plan> {
    const plan: Plan = {
      id: this.generateId(),
      goal,
      steps: [],
      status: 'planning',
      createdAt: new Date().toISOString(),
    }

    const decomposed = await this.decomposeGoal(goal, context)
    plan.steps = decomposed
    plan.status = 'executing'

    return plan
  }

  async executePlan(plan: Plan, executor: (step: PlanStep) => Promise<unknown>): Promise<Plan> {
    for (const step of plan.steps) {
      if (plan.status === 'failed') break

      step.status = 'in_progress'

      try {
        step.result = await executor(step)
        step.status = 'completed'
      } catch (err) {
        step.status = 'failed'
        plan.status = 'failed'
        break
      }

      if (step.subSteps?.length) {
        for (const subStep of step.subSteps) {
          subStep.status = 'in_progress'
          try {
            subStep.result = await executor(subStep)
            subStep.status = 'completed'
          } catch {
            subStep.status = 'failed'
          }
        }
      }
    }

    if (plan.status === 'executing') {
      plan.status = 'completed'
      plan.completedAt = new Date().toISOString()
    }

    return plan
  }

  async revisePlan(plan: Plan, feedback: string): Promise<Plan> {
    const newPlan = await this.createPlan(plan.goal)
    const failedSteps = plan.steps.filter((s) => s.status === 'failed')

    for (const failed of failedSteps) {
      const alternatives = await this.generateAlternatives(failed.description)
      if (alternatives.length > 0) {
        const newStep = {
          id: this.generateId(),
          description: alternatives[0],
          status: 'pending' as const,
        }
        newPlan.steps.push(newStep)
      }
    }

    return newPlan
  }

  private async decomposeGoal(
    goal: string,
    _context?: Record<string, unknown>,
  ): Promise<PlanStep[]> {
    const words = goal.split(' ')
    const steps: PlanStep[] = []

    if (words.length > 20) {
      const half = Math.floor(words.length / 2)
      const firstHalf = words.slice(0, half).join(' ')
      const secondHalf = words.slice(half).join(' ')

      steps.push({ id: this.generateId(), description: firstHalf, status: 'pending' })
      steps.push({ id: this.generateId(), description: secondHalf, status: 'pending' })
    } else {
      steps.push({ id: this.generateId(), description: goal, status: 'pending' })
    }

    return steps.map((step, i) => ({
      ...step,
      subSteps: [
        {
          id: `${step.id}-sub${i}-1`,
          description: `Analyze: ${step.description}`,
          status: 'pending',
        },
        {
          id: `${step.id}-sub${i}-2`,
          description: `Execute: ${step.description}`,
          status: 'pending',
        },
        {
          id: `${step.id}-sub${i}-3`,
          description: `Verify: ${step.description}`,
          status: 'pending',
        },
      ],
    }))
  }

  private async generateAlternatives(failedStep: string): Promise<string[]> {
    return [
      `Simplified: ${failedStep}`,
      `Alternative approach to: ${failedStep}`,
      `Break down: ${failedStep}`,
    ]
  }

  private generateId(): string {
    return `step-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}

export function createPlanningAgent(config?: PlanningConfig): PlanningAgent {
  return new PlanningAgent(config)
}
