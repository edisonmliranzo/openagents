import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import { CronService } from '../../cron/cron.service'

@Injectable()
export class CronTool {
  constructor(private cron: CronService) {}

  get addDef(): ToolDefinition {
    return {
      name: 'cron_add',
      displayName: 'Cron Add',
      description: 'Create a recurring or one-shot scheduled task.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Task label (optional)' },
          schedule: { type: 'string', description: 'Schedule text: interval, cron expression, or ISO datetime' },
          task: { type: 'string', description: 'What should run when the schedule triggers' },
          oneShot: { type: 'boolean', description: 'Treat schedule as one-time execution.' },
        },
        required: ['schedule', 'task'],
      },
    }
  }

  get listDef(): ToolDefinition {
    return {
      name: 'cron_list',
      displayName: 'Cron List',
      description: 'List all scheduled tasks.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    }
  }

  get removeDef(): ToolDefinition {
    return {
      name: 'cron_remove',
      displayName: 'Cron Remove',
      description: 'Remove a scheduled task by ID.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Cron job ID' },
        },
        required: ['id'],
      },
    }
  }

  async add(input: { name?: string; schedule: string; task: string; oneShot?: boolean }, userId: string): Promise<ToolResult> {
    const schedule = input.schedule?.trim()
    const task = input.task?.trim()
    if (!schedule || !task) {
      return { success: false, output: null, error: 'Both "schedule" and "task" are required.' }
    }

    const { kind, value } = this.resolveSchedule(schedule, !!input.oneShot)
    const created = await this.cron.createJob(userId, {
      name: input.name?.trim() || `task-${new Date().toISOString()}`,
      scheduleKind: kind,
      scheduleValue: value,
      payloadKind: 'agentTurn',
      payloadText: task,
      sessionTarget: 'main',
      deliveryMode: 'none',
      enabled: true,
    })

    return {
      success: true,
      output: {
        id: created.id,
        name: created.name,
        scheduleKind: created.scheduleKind,
        scheduleValue: created.scheduleValue,
      },
    }
  }

  async list(_input: Record<string, unknown>, userId: string): Promise<ToolResult> {
    const jobs = await this.cron.listJobs(userId)
    return {
      success: true,
      output: {
        count: jobs.length,
        jobs: jobs.map((job) => ({
          id: job.id,
          name: job.name,
          enabled: job.enabled,
          scheduleKind: job.scheduleKind,
          scheduleValue: job.scheduleValue,
          payloadText: job.payloadText,
        })),
      },
    }
  }

  async remove(input: { id: string }, userId: string): Promise<ToolResult> {
    const id = input.id?.trim()
    if (!id) {
      return { success: false, output: null, error: 'Job id is required.' }
    }
    await this.cron.deleteJob(userId, id)
    return { success: true, output: { removed: true, id } }
  }

  private resolveSchedule(schedule: string, oneShot: boolean) {
    if (oneShot || this.isIsoDateTime(schedule)) {
      return { kind: 'at' as const, value: schedule }
    }

    const parts = schedule.trim().split(/\s+/)
    if (parts.length >= 5) {
      return { kind: 'cron' as const, value: schedule }
    }

    return { kind: 'every' as const, value: schedule }
  }

  private isIsoDateTime(value: string) {
    if (!value.includes('T')) return false
    const parsed = Date.parse(value)
    return Number.isFinite(parsed)
  }
}
