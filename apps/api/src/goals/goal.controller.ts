import { Controller, Post, Get, Patch, Delete, Param, Body, Query, UseGuards, Req, NotFoundException } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { GoalService } from './goal.service'

@ApiTags('goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('goals')
export class GoalController {
  constructor(private goals: GoalService) {}

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.goals.create({ ...(body ?? {}), userId: req.user.id })
  }

  @Get()
  list(@Req() req: any, @Query('status') status?: string) {
    return this.goals.listForUser(req.user.id, status as any)
  }

  @Get(':id')
  async get(@Req() req: any, @Param('id') id: string) {
    const goal = await this.goals.get(req.user.id, id)
    if (!goal) throw new NotFoundException('Goal not found')
    return goal
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const goal = await this.goals.update(req.user.id, id, body ?? {})
    if (!goal) throw new NotFoundException('Goal not found')
    return goal
  }

  @Post(':id/milestones/:milestoneId/complete')
  async completeMilestone(@Req() req: any, @Param('id') id: string, @Param('milestoneId') milestoneId: string) {
    const goal = await this.goals.completeMilestone(req.user.id, id, milestoneId)
    if (!goal) throw new NotFoundException('Goal not found')
    return goal
  }

  @Post(':id/link/:conversationId')
  linkConversation(@Req() req: any, @Param('id') id: string, @Param('conversationId') cid: string) {
    return this.goals.linkConversation(req.user.id, id, cid)
  }

  @Delete(':id')
  delete(@Req() req: any, @Param('id') id: string) { return this.goals.delete(req.user.id, id) }
}
