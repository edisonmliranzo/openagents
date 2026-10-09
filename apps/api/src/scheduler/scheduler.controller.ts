import { Controller, Post, Get, Delete, Param, Body, Query } from '@nestjs/common'
import { SchedulerService } from './scheduler.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'
@Controller('scheduler')
export class SchedulerController {
  constructor(private scheduler: SchedulerService) {}

  @Post('tasks')
  create(@Body() body: any) { return this.scheduler.create(body) }

  @Get('tasks')
  list(@CurrentUserId() userId: string) { return this.scheduler.list(userId) }

  @Get('tasks/:id')
  get(@Param('id') id: string) { return this.scheduler.get(id) }

  @Post('tasks/:id/enable')
  enable(@Param('id') id: string) { return this.scheduler.enable(id) }

  @Post('tasks/:id/disable')
  disable(@Param('id') id: string) { return this.scheduler.disable(id) }

  @Delete('tasks/:id')
  delete(@Param('id') id: string) { return this.scheduler.delete(id) }
}
