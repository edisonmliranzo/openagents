import { BadGatewayException, Body, Controller, Get, Headers, Param, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { TasksService } from '../tasks/tasks.service'
import { TokensService } from './tokens.service'
import { Public } from '../common/public.decorator'

/**
 * Machine-facing API for third-party apps. Authenticated with a scoped agent
 * API token (X-Agent-Token header) instead of a user JWT, with per-token
 * budgets. Create tokens in Autonomy → API tokens.
 */
@ApiTags('agent-api')
@Controller('agent-api')
export class AgentApiController {
  constructor(
    private readonly tasks: TasksService,
    private readonly tokens: TokensService,
  ) {}

  private async auth(token: string, needed: string) {
    const row = await this.tokens.verify(token)
    const scopes = this.tokens.scopesOf(row)
    if (!scopes.includes(needed)) throw new BadGatewayException(`Token lacks scope "${needed}"`)
    return row
  }

  @Public()
  @Post('tasks')
  async createTask(@Headers('x-agent-token') token: string, @Body() body: { goal: string; successCriteria?: string; maxSteps?: number }) {
    const row = await this.auth(token, 'tasks:write')
    const task = await this.tasks.create(row.userId, {
      goal: String(body.goal ?? ''),
      successCriteria: body.successCriteria,
      maxSteps: body.maxSteps,
    })
    // Rough usage accounting: one task ≈ $0.02 of model time on a token budget.
    await this.tokens.recordUsage(row.id, 0.02)
    return { id: task.id, status: task.status, title: task.title }
  }

  @Public()
  @Get('tasks/:id')
  async getTask(@Headers('x-agent-token') token: string, @Param('id') id: string) {
    const row = await this.auth(token, 'tasks:read')
    const task = await this.tasks.get(row.userId, id)
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      result: task.result,
      error: task.error,
      createdAt: task.createdAt,
      finishedAt: task.finishedAt,
      events: task.events.map((e) => ({ kind: e.kind, message: e.message, at: e.createdAt })),
    }
  }
}
