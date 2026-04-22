import { Controller, Post, Get, Param, Body, Query } from '@nestjs/common'
import { DelegationService } from './delegation.service'

@Controller('api/v1/delegation')
export class DelegationController {
  constructor(private delegation: DelegationService) {}

  @Post('tasks')
  createTask(@Body() body: any) {
    return this.delegation.createTask(body)
  }

  @Post('tasks/:id/execute')
  executeTask(@Param('id') id: string) {
    return this.delegation.executeTask(id)
  }

  @Get('tasks')
  listTasks(@Query('userId') userId: string, @Query('limit') limit?: string) {
    return this.delegation.listTasks(userId, limit ? parseInt(limit, 10) : undefined)
  }

  @Get('tasks/:id')
  getTask(@Param('id') id: string) {
    return this.delegation.getTask(id) ?? { error: 'Task not found' }
  }

  @Post('tasks/:id/cancel')
  cancelTask(@Param('id') id: string) {
    return { cancelled: this.delegation.cancelTask(id) }
  }
}
