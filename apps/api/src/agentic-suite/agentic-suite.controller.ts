import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { AgenticSuiteService } from './agentic-suite.service'
import type { AdversarialVerificationRun, SentinelWatcher } from './agentic-suite.service'

@ApiTags('agentic')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agentic')
export class AgenticSuiteController {
  constructor(private readonly suite: AgenticSuiteService) {}

  // 1. Dynamic Tool Forge
  @Get('tool-forge')
  listForgedTools(@Req() req: any) {
    return this.suite.listForgedTools(req.user.id)
  }

  @Post('tool-forge/synthesize')
  synthesizeTool(
    @Req() req: any,
    @Body()
    body: {
      name: string
      description: string
      capabilityPrompt: string
      sampleInput?: Record<string, unknown>
    },
  ) {
    return this.suite.synthesizeTool(req.user.id, body)
  }

  @Post('tool-forge/:toolId/verify')
  verifyTool(
    @Req() req: any,
    @Param('toolId') toolId: string,
    @Body() body: { testInput?: Record<string, unknown> },
  ) {
    return this.suite.verifyTool(req.user.id, toolId, body?.testInput)
  }

  @Post('tool-forge/:toolId/register')
  hotRegisterTool(@Req() req: any, @Param('toolId') toolId: string) {
    return this.suite.hotRegisterTool(req.user.id, toolId)
  }

  @Post('tool-forge/:toolId/execute')
  executeForgedTool(
    @Req() req: any,
    @Param('toolId') toolId: string,
    @Body() body: { input?: Record<string, unknown> },
  ) {
    return this.suite.executeForgedTool(req.user.id, toolId, body?.input ?? {})
  }

  @Delete('tool-forge/:toolId')
  deleteForgedTool(@Req() req: any, @Param('toolId') toolId: string) {
    return this.suite.deleteForgedTool(req.user.id, toolId)
  }

  // 2. Tree-of-Actions
  @Get('tree-of-actions')
  listRollouts(@Req() req: any) {
    return this.suite.listRollouts(req.user.id)
  }

  @Post('tree-of-actions/run')
  runRollout(@Req() req: any, @Body() body: { goal: string; branchCount?: number }) {
    return this.suite.runRollout(req.user.id, body)
  }

  // 3. Closed-Loop Computer Use
  @Get('computer-use')
  listComputerSessions(@Req() req: any) {
    return this.suite.listComputerSessions(req.user.id)
  }

  @Post('computer-use/start')
  startComputerSession(
    @Req() req: any,
    @Body() body: { objective: string; targetUrl?: string; maxSteps?: number },
  ) {
    return this.suite.startComputerSession(req.user.id, body)
  }

  @Post('computer-use/:sessionId/step')
  stepComputerSession(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Body() body: { instruction?: string },
  ) {
    return this.suite.stepComputerSession(req.user.id, sessionId, body?.instruction)
  }

  // 4. Ambient Sentinel
  @Get('sentinel')
  getSentinelState(@Req() req: any) {
    return this.suite.getSentinelState(req.user.id)
  }

  @Post('sentinel/watchers')
  createSentinelWatcher(
    @Req() req: any,
    @Body()
    body: {
      name: string
      signalType: SentinelWatcher['signalType']
      target: string
      condition: string
      reflexAction: string
    },
  ) {
    return this.suite.createSentinelWatcher(req.user.id, body)
  }

  @Post('sentinel/watchers/:watcherId/toggle')
  toggleSentinelWatcher(@Req() req: any, @Param('watcherId') watcherId: string) {
    return this.suite.toggleSentinelWatcher(req.user.id, watcherId)
  }

  @Post('sentinel/pulse')
  pulseSentinel(@Req() req: any, @Body() body: { watcherId?: string }) {
    return this.suite.pulseSentinel(req.user.id, body?.watcherId)
  }

  @Post('sentinel/incidents/:incidentId/resolve')
  resolveSentinelIncident(@Req() req: any, @Param('incidentId') incidentId: string) {
    return this.suite.resolveSentinelIncident(req.user.id, incidentId)
  }

  // 5. Adversarial Critic & Breaker Loop
  @Get('verifier')
  listVerifierRuns(@Req() req: any) {
    return this.suite.listVerifierRuns(req.user.id)
  }

  @Post('verifier/run')
  runVerifierLoop(
    @Req() req: any,
    @Body() body: { task: string; artifactType?: AdversarialVerificationRun['artifactType'] },
  ) {
    return this.suite.runVerifierLoop(req.user.id, body)
  }

  // 6. Overnight Mission Runner
  @Get('overnight')
  listOvernightMissions(@Req() req: any) {
    return this.suite.listOvernightMissions(req.user.id)
  }

  @Post('overnight')
  createOvernightMission(
    @Req() req: any,
    @Body()
    body: {
      title: string
      objective: string
      maxBudgetUsd?: number
      autoBacktrack?: boolean
    },
  ) {
    return this.suite.createOvernightMission(req.user.id, body)
  }

  @Post('overnight/:missionId/run')
  runOvernightMission(@Req() req: any, @Param('missionId') missionId: string) {
    return this.suite.runOvernightMission(req.user.id, missionId)
  }

  @Post('overnight/:missionId/rewind')
  rewindOvernightMission(
    @Req() req: any,
    @Param('missionId') missionId: string,
    @Body() body: { checkpointId: string },
  ) {
    return this.suite.rewindOvernightMission(req.user.id, missionId, body.checkpointId)
  }

  // 7. Episodic World-Model & Shadow Digital Twin
  @Get('digital-twin')
  getDigitalTwin(@Req() req: any) {
    return this.suite.getDigitalTwin(req.user.id)
  }

  @Post('digital-twin/sync')
  syncDigitalTwin(@Req() req: any) {
    return this.suite.syncDigitalTwin(req.user.id)
  }

  @Post('digital-twin/shadow')
  generateShadowActions(@Req() req: any, @Body() body: { contextPrompt?: string }) {
    return this.suite.generateShadowActions(req.user.id, body?.contextPrompt)
  }

  @Post('digital-twin/shadow/:cardId')
  actOnShadowCard(
    @Req() req: any,
    @Param('cardId') cardId: string,
    @Body() body: { decision: 'approved' | 'dismissed' },
  ) {
    return this.suite.actOnShadowCard(req.user.id, cardId, body.decision)
  }

  // 8. Contract-Net Swarm Market
  @Get('swarm-market')
  getSwarmMarket(@Req() req: any) {
    return this.suite.getSwarmMarket(req.user.id)
  }

  @Post('swarm-market/broadcast')
  broadcastMarketTask(@Req() req: any, @Body() body: { task: string }) {
    return this.suite.broadcastMarketTask(req.user.id, body)
  }
}
