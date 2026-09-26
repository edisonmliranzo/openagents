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

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function parseMilestones(raw: string | null | undefined): GoalMilestone[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
      .map((m) => ({
        id: String(m.id ?? ''),
        title: String(m.title ?? ''),
        completed: Boolean(m.completed),
        ...(typeof m.completedAt === 'string' ? { completedAt: m.completedAt } : {}),
      }))
      .filter((m) => m.id && m.title)
  } catch {
    return []
  }
}

@Injectable()
export class GoalService {
  private readonly logger = new Logger(GoalService.name)

  constructor(private readonly prisma: PrismaService) {}

  private toGoal(row: {
    id: string
    userId: string
    title: string
    description: string
    status: string
    priority: string
    milestones: string
    progress: number
    conversationIds: string
    tags: string
    dueDate: string | null
    createdAt: Date
    updatedAt: Date
    completedAt: string | null
  }): Goal {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      description: row.description,
      status: row.status as Goal['status'],
      priority: row.priority as Goal['priority'],
      milestones: parseMilestones(row.milestones),
      progress: row.progress,
      conversationIds: parseJsonArray(row.conversationIds),
      tags: parseJsonArray(row.tags),
      ...(row.dueDate ? { dueDate: row.dueDate } : {}),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...(row.completedAt ? { completedAt: row.completedAt } : {}),
    }
  }

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
    const now = Date.now()
    const milestones: GoalMilestone[] = (input.milestones ?? []).map((title, i) => ({
      id: `ms-${i}-${now}`,
      title,
      completed: false,
    }))
    const row = await this.prisma.goal.create({
      data: {
        id: `goal-${now}-${Math.random().toString(36).slice(2, 8)}`,
        userId: input.userId,
        title: input.title,
        description: input.description ?? '',
        status: 'active',
        priority: input.priority ?? 'medium',
        milestones: JSON.stringify(milestones),
        progress: 0,
        conversationIds: '[]',
        tags: JSON.stringify(input.tags ?? []),
        dueDate: input.dueDate ?? null,
      },
    })
    const goal = this.toGoal(row)
    this.logger.log(`Created goal "${goal.title}" for user ${input.userId}`)
    await this.syncGoalToMemory(input.userId, goal)
    return goal
  }

  async update(userId: string, goalId: string, patch: Partial<Pick<Goal, 'title' | 'description' | 'status' | 'priority' | 'dueDate' | 'tags'>>): Promise<Goal | null> {
    const existing = await this.prisma.goal.findFirst({ where: { id: goalId, userId } })
    if (!existing) return null

    const data: Record<string, unknown> = {}
    if (patch.title !== undefined) data.title = patch.title
    if (patch.description !== undefined) data.description = patch.description
    if (patch.status !== undefined) data.status = patch.status
    if (patch.priority !== undefined) data.priority = patch.priority
    if (patch.dueDate !== undefined) data.dueDate = patch.dueDate || null
    if (patch.tags !== undefined) data.tags = JSON.stringify(patch.tags)
    if (patch.status === 'completed') {
      data.completedAt = new Date().toISOString()
      data.progress = 100
    }

    const row = await this.prisma.goal.update({ where: { id: existing.id }, data: data as never })
    const goal = this.toGoal(row)
    await this.syncGoalToMemory(userId, goal)
    return goal
  }

  async completeMilestone(userId: string, goalId: string, milestoneId: string): Promise<Goal | null> {
    const existing = await this.prisma.goal.findFirst({ where: { id: goalId, userId } })
    if (!existing) return null

    const milestones = parseMilestones(existing.milestones)
    const milestone = milestones.find((m) => m.id === milestoneId)
    if (milestone) {
      milestone.completed = true
      milestone.completedAt = new Date().toISOString()
    }

    const total = milestones.length
    const completed = milestones.filter((m) => m.completed).length
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0

    const row = await this.prisma.goal.update({
      where: { id: existing.id },
      data: {
        milestones: JSON.stringify(milestones),
        progress,
        ...(progress === 100
          ? { status: 'completed', completedAt: new Date().toISOString() }
          : {}),
      },
    })
    const goal = this.toGoal(row)
    await this.syncGoalToMemory(userId, goal)
    return goal
  }

  async linkConversation(userId: string, goalId: string, conversationId: string): Promise<void> {
    const existing = await this.prisma.goal.findFirst({ where: { id: goalId, userId } })
    if (!existing) return
    const ids = parseJsonArray(existing.conversationIds)
    if (ids.includes(conversationId)) return
    const row = await this.prisma.goal.update({
      where: { id: existing.id },
      data: { conversationIds: JSON.stringify([...ids, conversationId]) },
    })
    await this.syncGoalToMemory(userId, this.toGoal(row))
  }

  async listForUser(userId: string, status?: Goal['status']): Promise<Goal[]> {
    const rows = await this.prisma.goal.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map((row) => this.toGoal(row))
  }

  async get(userId: string, goalId: string): Promise<Goal | null> {
    const row = await this.prisma.goal.findFirst({ where: { id: goalId, userId } })
    return row ? this.toGoal(row) : null
  }

  async delete(userId: string, goalId: string): Promise<boolean> {
    const existing = await this.prisma.goal.findFirst({ where: { id: goalId, userId } })
    if (!existing) return false
    await this.prisma.goal.delete({ where: { id: existing.id } })
    await this.deleteGoalFromMemory(userId, goalId)
    return true
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
