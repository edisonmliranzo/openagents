import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { AgenticSuiteService } from './agentic-suite.service'
import type {
  AdversarialVerificationRun,
  GrokToneMode,
  HermesSteerConfig,
  OpenClawSoulState,
  SentinelWatcher,
} from './agentic-suite.service'

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

  // 9. Grok DeepSearch + Big Brain + Live Pulse Radar
  @Get('grok')
  getGrokState(@Req() req: any) {
    return this.suite.getGrokState(req.user.id)
  }

  @Post('grok/deepsearch')
  runGrokDeepSearch(
    @Req() req: any,
    @Body() body: { query: string; toneMode?: GrokToneMode; bigBrainEnabled?: boolean },
  ) {
    return this.suite.runGrokDeepSearch(req.user.id, body)
  }

  // 10. OpenClaw Core (SOUL.md / Heartbeat / Multi-Channel Claw)
  @Get('openclaw')
  getOpenClawState(@Req() req: any) {
    return this.suite.getOpenClawState(req.user.id)
  }

  @Post('openclaw/soul')
  updateOpenClawSoul(
    @Req() req: any,
    @Body()
    body: Partial<
      Pick<
        OpenClawSoulState,
        'soulMd' | 'userMd' | 'heartbeatMd' | 'memoryMd' | 'heartbeatIntervalSec' | 'heartbeatEnabled'
      >
    >,
  ) {
    return this.suite.updateOpenClawSoul(req.user.id, body)
  }

  @Post('openclaw/heartbeat')
  runOpenClawHeartbeat(
    @Req() req: any,
    @Body() body: { triggeredBy?: 'manual' | 'autonomous_loop' },
  ) {
    return this.suite.runOpenClawHeartbeat(req.user.id, body?.triggeredBy ?? 'manual')
  }

  // 11. Hermes-3 Steer & Native XML Trace
  @Get('hermes')
  getHermesState(@Req() req: any) {
    return this.suite.getHermesState(req.user.id)
  }

  @Post('hermes/steer')
  updateHermesSteer(@Req() req: any, @Body() body: Partial<HermesSteerConfig>) {
    return this.suite.updateHermesSteer(req.user.id, body)
  }

  @Post('hermes/invoke')
  invokeHermesTrace(@Req() req: any, @Body() body: { prompt: string }) {
    return this.suite.invokeHermesTrace(req.user.id, body)
  }

  // 12. Dots Mixture-of-Reasoners & Dynamic Compute Router
  @Get('dots')
  getDotsState(@Req() req: any) {
    return this.suite.getDotsState(req.user.id)
  }

  @Post('dots/route')
  routeWithDots(@Req() req: any, @Body() body: { prompt: string }) {
    return this.suite.routeWithDots(req.user.id, body)
  }

  // 13. Speculative Pre-Fetch & Zero-Latency Ghost Typing
  @Get('speculative')
  getSpeculativeState(@Req() req: any) {
    return this.suite.getSpeculativeState(req.user.id)
  }

  @Post('speculative/predict')
  predictSpeculative(@Req() req: any, @Body() body: { partialInput?: string; draftText?: string }) {
    return this.suite.predictSpeculative(req.user.id, {
      partialInput: body?.partialInput ?? body?.draftText ?? '',
    })
  }

  // 14. Full-Duplex Live Voice & Screen Co-Pilot
  @Get('copilot')
  getCopilotState(@Req() req: any) {
    return this.suite.getCopilotState(req.user.id)
  }

  @Post('copilot/analyze')
  analyzeScreenFrame(
    @Req() req: any,
    @Body()
    body: {
      windowTitle?: string
      voiceTranscript: string
      domSummary?: string
      screenSummary?: string
    },
  ) {
    return this.suite.analyzeScreenFrame(req.user.id, {
      windowTitle: body?.windowTitle ?? body?.screenSummary ?? 'Shared Browser / IDE Viewport',
      voiceTranscript: body?.voiceTranscript ?? '',
      domSummary: body?.domSummary ?? body?.screenSummary,
    })
  }

  // 15. Prompt & Agent Evolution Arena
  @Get('evolution')
  getEvolutionArena(@Req() req: any) {
    return this.suite.getEvolutionArena(req.user.id)
  }

  @Post('evolution/mutate')
  runEvolutionGeneration(
    @Req() req: any,
    @Body() body: { benchmarkGoal?: string; objective?: string },
  ) {
    return this.suite.runEvolutionGeneration(req.user.id, {
      benchmarkGoal: body?.benchmarkGoal ?? body?.objective ?? 'Maximize accuracy and speed',
    })
  }

  @Post('evolution/:chromosomeId/promote')
  promotePromptVariant(@Req() req: any, @Param('chromosomeId') chromosomeId: string) {
    return this.suite.promotePromptVariant(req.user.id, chromosomeId)
  }

  // 16. Autonomous Web Workflow Recorder (RPA)
  @Get('web-recorder')
  getWebMacros(@Req() req: any) {
    return this.suite.getWebMacros(req.user.id)
  }

  @Post('web-recorder')
  createWebMacro(
    @Req() req: any,
    @Body()
    body: {
      name: string
      targetDomain: string
      demonstrationPrompt?: string
      naturalLanguageGoal?: string
      scheduleCron?: string
    },
  ) {
    return this.suite.createWebMacro(req.user.id, {
      name: body?.name ?? 'Web Macro',
      targetDomain: body?.targetDomain ?? 'https://openagents.us',
      demonstrationPrompt: body?.demonstrationPrompt ?? body?.naturalLanguageGoal ?? '',
      scheduleCron: body?.scheduleCron,
    })
  }

  @Post('web-recorder/:macroId/run')
  executeWebMacro(
    @Req() req: any,
    @Param('macroId') macroId: string,
    @Body() body?: { params?: Record<string, string> },
  ) {
    return this.suite.executeWebMacro(req.user.id, macroId, body?.params)
  }

  // 17. Inline Live Code Sandbox & Micro-App Renderer
  @Get('sandbox')
  getMicroApps(@Req() req: any) {
    return this.suite.getMicroApps(req.user.id)
  }

  @Post('sandbox')
  createMicroApp(
    @Req() req: any,
    @Body()
    body: {
      title: string
      prompt: string
      framework?: 'html_tailwind' | 'svg_interactive' | 'data_dashboard'
    },
  ) {
    return this.suite.createMicroApp(req.user.id, body)
  }

  @Post('sandbox/:appId/publish')
  publishMicroApp(@Req() req: any, @Param('appId') appId: string) {
    return this.suite.publishMicroApp(req.user.id, appId)
  }

  // 18. Personal Knowledge Time-Machine & Contradiction Detector
  @Get('time-machine')
  getTimeMachineState(@Req() req: any) {
    return this.suite.getTimeMachineState(req.user.id)
  }

  @Post('time-machine/query')
  queryTimeMachine(
    @Req() req: any,
    @Body() body: { question?: string; query?: string },
  ) {
    return this.suite.queryTimeMachine(req.user.id, {
      question: body?.question ?? body?.query ?? 'What changed recently?',
    })
  }

  @Post('time-machine/contradictions/:alertId/resolve')
  resolveContradiction(@Req() req: any, @Param('alertId') alertId: string) {
    return this.suite.resolveContradiction(req.user.id, alertId)
  }

  // 19. Firewall & Secret-Zero Outbound Interceptor
  @Get('firewall')
  getFirewallState(@Req() req: any) {
    return this.suite.getFirewallState(req.user.id)
  }

  @Post('firewall/scan')
  scanOutboundPayload(
    @Req() req: any,
    @Body() body: { destination: string; payload: string },
  ) {
    return this.suite.scanOutboundPayload(req.user.id, body)
  }

  @Post('firewall/rules/:ruleId/toggle')
  toggleFirewallRule(@Req() req: any, @Param('ruleId') ruleId: string) {
    return this.suite.toggleFirewallRule(req.user.id, ruleId)
  }

  // 20. Autonomous FinOps & API Arbitrage Engine
  @Get('finops')
  getFinOpsState(@Req() req: any) {
    return this.suite.getFinOpsState(req.user.id)
  }

  @Post('finops/route')
  simulateArbitrageRoute(
    @Req() req: any,
    @Body() body: { prompt: string; maxLatencyMs?: number },
  ) {
    return this.suite.simulateArbitrageRoute(req.user.id, body)
  }

  // 21. Multiplayer Live War Room & Shared Agent Canvas
  @Get('war-room')
  getWarRoomState(@Req() req: any) {
    return this.suite.getWarRoomState(req.user.id)
  }

  @Post('war-room/turn')
  postWarRoomTurn(
    @Req() req: any,
    @Body() body: { message: string; inviteSpecialists?: boolean },
  ) {
    return this.suite.postWarRoomTurn(req.user.id, body)
  }

  @Post('war-room/canvas')
  updateWarRoomCanvas(
    @Req() req: any,
    @Body() body: { sharedCanvasMarkdown: string },
  ) {
    return this.suite.updateWarRoomCanvas(req.user.id, body)
  }

  // 22. 1-Click Prompt-to-Production Ship Pipeline
  @Get('ship')
  getShipPipelines(@Req() req: any) {
    return this.suite.getShipPipelines(req.user.id)
  }

  @Post('ship/run')
  runShipPipeline(
    @Req() req: any,
    @Body() body: { title?: string; promptOrDiff?: string; prompt?: string },
  ) {
    return this.suite.runShipPipeline(req.user.id, {
      title: body?.title ?? body?.prompt?.slice(0, 60) ?? 'Automated Prompt-to-Production Release',
      promptOrDiff: body?.promptOrDiff ?? body?.prompt ?? 'Verified workspace patch',
    })
  }

  @Post('ship/:pipelineId/rollback')
  rollbackShipPipeline(@Req() req: any, @Param('pipelineId') pipelineId: string) {
    return this.suite.rollbackShipPipeline(req.user.id, pipelineId)
  }
}
