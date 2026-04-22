import { Controller, Post, Get, Patch, Delete, Param, Body, Query } from '@nestjs/common'
import { GoalService } from './goal.service'

@Controller('api/v1/goals')
export class GoalController {
  constructor(private goals: GoalService) {}

  @Post()
  create(@Body() body: any) { return this.goals.create(body) }

  @Get()
  list(@Query('userId') userId: string, @Query('status') status?: string) {
    return this.goals.listForUser(userId, status as any)
  }

  @Get(':id')
  get(@Param('id') id: string) { return this.goals.get(id) }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) { return this.goals.update(id, body) }

  @Post(':id/milestones/:milestoneId/complete')
  completeMilestone(@Param('id') id: string, @Param('milestoneId') milestoneId: string) {
    return this.goals.completeMilestone(id, milestoneId)
  }

  @Post(':id/link/:conversationId')
  linkConversation(@Param('id') id: string, @Param('conversationId') cid: string) {
    return this.goals.linkConversation(id, cid)
  }

  @Delete(':id')
  delete(@Param('id') id: string) { return this.goals.delete(id) }
}
