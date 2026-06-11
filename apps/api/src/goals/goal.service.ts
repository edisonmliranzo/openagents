import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface Goal {
  id: string
  userId: string
  title: string
  description: string
  status: 'active' | 'paused' | 'completed' | 'abandoned'
  priority: 'low' | 'medium' | 'high' | 'critical'
  milestones: GoalMilestone[]
  progress: number // 0-100
  conversationIds: string[]
  tags: string[]
  dueDate?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface GoalMilestone {
  id: string
  title: string
  completed: boolean
  completedAt?: string
}

@Injectable()
export class GoalService {
  private readonly logger = new Logger(GoalService.name)
  private goals = new Map<string, Goal>()

  constructor(private readonly prisma: PrismaService) {}

  private async syncGoalToMemory(userId: string, goal: Goal) {
    try {
      const factKey = `goal_${goal.id}`
      await this.prisma.memoryFact.upsert({
        where: {
          userId_entity_key: {
            userId,
            entity: 'user_goals',
            key: factKey,
          },
        },
        create: {
          userId,
          entity: 'user_goals',
          key: factKey,
          value: JSON.stringify({
            title: goal.title,
            description: goal.description,
            status: goal.status,
            progress: goal.progress,
            priority: goal.priority,
            milestones: goal.milestones.map((m) => ({ title: m.title, completed: m.completed })),
            dueDate: goal.dueDate,
          }),
          confidence: 0.9,
        },
        update: {
          value: JSON.stringify({
            title: goal.title,
            description: goal.description,
            status: goal.status,
            progress: goal.progress,
            priority: goal.priority,
            milestones: goal.milestones.map((m) => ({ title: m.title, completed: m.completed })),
            dueDate: goal.dueDate,
          }),
          confidence: 0.9,
        },
      })

      await this.prisma.memoryEvent.create({
        data: {
          userId,
          kind: 'note',
          summary: `Goal "${goal.title}" updated (status: ${goal.status}, progress: ${goal.progress}%)`,
          payload: JSON.stringify({ goalId: goal.id, title: goal.title, status: goal.status, progress: goal.progress }),
          confidence: 0.9,
        },
      })
    } catch (err: any) {
      this.logger.warn(`Failed to sync goal to memory: ${err.message}`)
    }
  }

  private async deleteGoalFromMemory(userId: string, goalId: string) {
    try {
      await this.prisma.memoryFact.deleteMany({
        where: {
          userId,
          entity: 'user_goals',
          key: `goal_${goalId}`,
        },
      })
    } catch (err: any) {
      this.logger.warn(`Failed to delete goal from memory: ${err.message}`)
    }
  }

  async create(input: {
    userId: string
    title: string
    description: string
    priority?: Goal['priority']
    milestones?: string[]
    tags?: string[]
    dueDate?: string
  }): Promise<Goal> {
    const goal: Goal = {
      id: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: input.userId,
      title: input.title,
      description: input.description,
      status: 'active',
      priority: input.priority ?? 'medium',
      milestones: (input.milestones ?? []).map((title, i) => ({
        id: `ms-${i}-${Date.now()}`,
        title,
        completed: false,
      })),
      progress: 0,
      conversationIds: [],
      tags: input.tags ?? [],
      dueDate: input.dueDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    this.goals.set(goal.id, goal)
    this.logger.log(`Created goal "${goal.title}" for user ${input.userId}`)
    await this.syncGoalToMemory(input.userId, goal)
    return goal
  }

  async update(goalId: string, patch: Partial<Pick<Goal, 'title' | 'description' | 'status' | 'priority' | 'dueDate' | 'tags'>>): Promise<Goal | null> {
    const goal = this.goals.get(goalId)
    if (!goal) return null

    Object.assign(goal, patch, { updatedAt: new Date().toISOString() })
    if (patch.status === 'completed') {
      goal.completedAt = new Date().toISOString()
      goal.progress = 100
    }
    await this.syncGoalToMemory(goal.userId, goal)
    return goal
  }

  async completeMilestone(goalId: string, milestoneId: string): Promise<Goal | null> {
    const goal = this.goals.get(goalId)
    if (!goal) return null

    const milestone = goal.milestones.find((m) => m.id === milestoneId)
    if (milestone) {
      milestone.completed = true
      milestone.completedAt = new Date().toISOString()
    }

    const total = goal.milestones.length
    const completed = goal.milestones.filter((m) => m.completed).length
    goal.progress = total > 0 ? Math.round((completed / total) * 100) : 0
    goal.updatedAt = new Date().toISOString()

    if (goal.progress === 100) {
      goal.status = 'completed'
      goal.completedAt = new Date().toISOString()
    }

    await this.syncGoalToMemory(goal.userId, goal)
    return goal
  }

  async linkConversation(goalId: string, conversationId: string): Promise<void> {
    const goal = this.goals.get(goalId)
    if (goal && !goal.conversationIds.includes(conversationId)) {
      goal.conversationIds.push(conversationId)
      await this.syncGoalToMemory(goal.userId, goal)
    }
  }

  async listForUser(userId: string, status?: Goal['status']): Promise<Goal[]> {
    const goals = Array.from(this.goals.values())
      .filter((g) => g.userId === userId)
      .filter((g) => !status || g.status === status)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return goals
  }

  async get(goalId: string): Promise<Goal | null> {
    return this.goals.get(goalId) ?? null
  }

  async delete(goalId: string): Promise<boolean> {
    const goal = this.goals.get(goalId)
    if (!goal) return false
    await this.deleteGoalFromMemory(goal.userId, goalId)
    return this.goals.delete(goalId)
  }

  async getActiveGoalSummary(userId: string): Promise<string> {
    const active = await this.listForUser(userId, 'active')
    if (active.length === 0) return ''
    return active
      .slice(0, 5)
      .map((g) => `- [${g.priority}] ${g.title} (${g.progress}% complete)`)
      .join('\n')
  }
}
