import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentUserId } from '../auth/current-user-id.decorator'
import { Public } from '../common/public.decorator'
import { MissionsService } from './missions.service'
import { QuestionsService } from './questions.service'
import { UndoService } from './undo.service'
import { GraphService } from './graph.service'
import { HandoffService } from './handoff.service'

@ApiTags('autonomy')
@ApiBearerAuth()
@Controller('autonomy')
export class AutonomyController {
  constructor(
    private readonly missions: MissionsService,
    private readonly questions: QuestionsService,
    private readonly undo: UndoService,
    private readonly graph: GraphService,
    private readonly handoff: HandoffService,
  ) {}

  // ---- Missions (multi-day persistent agents) ----

  @Get('missions')
  listMissions(@CurrentUserId() userId: string) {
    return this.missions.list(userId)
  }

  @Post('missions')
  createMission(
    @CurrentUserId() userId: string,
    @Body() body: { title?: string; goal: string; successCriteria?: string; intervalHours?: number },
  ) {
    return this.missions.create(userId, body)
  }

  @Get('missions/:id')
  getMission(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.missions.get(userId, id)
  }

  @Post('missions/:id')
  updateMission(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: { status?: string; intervalHours?: number; title?: string },
  ) {
    return this.missions.update(userId, id, body)
  }

  @Post('missions/:id/run')
  runMission(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.missions.runNow(userId, id)
  }

  @Post('missions/:id/report')
  reportMission(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.missions.buildReport(userId, id)
  }

  // ---- Clarifying questions inbox ----

  @Get('questions')
  listQuestions(@CurrentUserId() userId: string, @Query('status') status?: string) {
    return this.questions.list(userId, status)
  }

  @Post('questions/:id/answer')
  answerQuestion(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: { answer: string }) {
    return this.questions.answer(userId, id, body.answer)
  }

  @Post('questions/:id/dismiss')
  dismissQuestion(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.questions.dismiss(userId, id)
  }

  // ---- Action journal (undo / time travel) ----

  @Get('journal')
  listJournal(@CurrentUserId() userId: string, @Query('limit') limit?: string) {
    return this.undo.list(userId, Number(limit) || 60)
  }

  @Post('journal/:id/undo')
  undoEntry(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.undo.undo(userId, id)
  }

  @Post('tasks/:taskId/undo')
  undoTask(@CurrentUserId() userId: string, @Param('taskId') taskId: string) {
    return this.undo.undoTask(userId, taskId)
  }

  // ---- Entity memory graph ----

  @Get('graph')
  getGraph(@CurrentUserId() userId: string, @Query('limit') limit?: string) {
    return this.graph.getGraph(userId, Number(limit) || 80)
  }

  @Post('graph/rebuild')
  rebuildGraph(@CurrentUserId() userId: string) {
    return this.graph.rebuildFromConversations(userId)
  }

  @Delete('graph/:id')
  deleteNode(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.graph.deleteNode(userId, id)
  }

  // ---- Cross-device handoff links ----

  @Get('handoff')
  listHandoffs(@CurrentUserId() userId: string) {
    return this.handoff.list(userId)
  }

  @Post('tasks/:taskId/handoff')
  createHandoff(@CurrentUserId() userId: string, @Param('taskId') taskId: string, @Body() body: { label?: string; ttlHours?: number }) {
    return this.handoff.create(userId, taskId, body.label, body.ttlHours)
  }

  @Delete('handoff/:id')
  revokeHandoff(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.handoff.revoke(userId, id)
  }

  /** Public follow page data: token grants read-only task status. */
  @Public()
  @Get('h/:token')
  resolveHandoff(@Param('token') token: string) {
    return this.handoff.resolve(token)
  }
}
