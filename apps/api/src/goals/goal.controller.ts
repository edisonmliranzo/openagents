import { Controller, Post, Get, Patch, Put, Delete, Param, Body, Query, UseGuards, Req, NotFoundException } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { GoalService } from './goal.service'
import { GoalPlannerService } from './goal-planner.service'

@ApiTags('goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('goals')
export class GoalController {
  constructor(
    private goals: GoalService,
    private planner: GoalPlannerService,
  ) {}

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.goals.create({ ...(body ?? {}), userId: req.user.id })
  }

  @Get()
  list(@Req() req: any, @Query('status') status?: string) {
    return this.goals.listForUser(req.user.id, status as any)
  }

  @Get('progress/log')
  getProgressLog(@Req() req: any, @Query('limit') limit?: string) {
    return this.planner.getLog(req.user.id, limit ? Number(limit) : 100)
  }

  @Get(':id')
  async get(@Req() req: any, @Param('id') id: string) {
    const goal = await this.goals.get(req.user.id, id)
    if (!goal) throw new NotFoundException('Goal not found')
    return goal
  }

  @Get(':id/plan')
  getPlan(@Req() req: any, @Param('id') id: string) {
    return this.planner.getPlan(req.user.id, id)
  }

  @Post(':id/plan')
  async generatePlan(@Req() req: any, @Param('id') id: string) {
    const res = await this.planner.createPlan(req.user.id, id)
    if (!res) throw new NotFoundException('Goal not found')
    return res
  }

  @Put(':id/plan/auto-advance')
  async setAutoAdvance(@Req() req: any, @Param('id') id: string, @Body() body: { autoAdvance?: boolean }) {
    const plan = await this.planner.setAutoAdvance(req.user.id, id, Boolean(body?.autoAdvance))
    if (!plan) throw new NotFoundException('Goal plan not found')
    return plan
  }

  @Post(':id/plan/step')
  async advanceStep(@Req() req: any, @Param('id') id: string) {
    const res = await this.planner.advance(req.user.id, id, 'manual')
    if (!res) throw new NotFoundException('Active goal or plan not found')
    return res
  }

  @Post(':id/plan/steps/:stepId/decide')
  async decideStep(
    @Req() req: any,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body() body: { approve?: boolean },
  ) {
    const res = await this.planner.decide(req.user.id, id, stepId, Boolean(body?.approve))
    if (!res) throw new NotFoundException('Step awaiting approval not found')
    return res
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
