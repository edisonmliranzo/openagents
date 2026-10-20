import { Body, Controller, Delete, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { BrowserAutomationService } from './browser-automation.service'
import { WorkflowRecorderService } from './workflow-recorder.service'

const FRAME_INTERVAL_MS = 500 // ~2 fps while active
const IDLE_INTERVAL_MS = 2000

@ApiTags('browser')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('browser')
export class BrowserAutomationController {
  constructor(
    private readonly service: BrowserAutomationService,
    private readonly recorder: WorkflowRecorderService,
  ) {}

  // -- Workflow recorder ------------------------------------------------------

  @Post('sessions/:id/recording/start')
  startRecording(@Req() req: any, @Param('id') id: string) {
    this.service.assertOwner(id, req.user?.id)
    return this.recorder.startRecording(id, req.user.id)
  }

  @Post('sessions/:id/recording/stop')
  stopRecording(@Req() req: any, @Param('id') id: string) {
    this.service.assertOwner(id, req.user?.id)
    return this.recorder.stopRecording(id, req.user.id)
  }

  @Get('sessions/:id/recording')
  recordingStatus(@Req() req: any, @Param('id') id: string) {
    this.service.assertOwner(id, req.user?.id)
    return this.recorder.recordingStatus(id)
  }

  @Get('workflows')
  listWorkflows(@Req() req: any) {
    return this.recorder.list(req.user.id)
  }

  @Post('workflows')
  saveWorkflow(@Req() req: any, @Body() body: any) {
    if (body?.sessionId) this.service.assertOwner(body.sessionId, req.user?.id)
    return this.recorder.save(req.user.id, body)
  }

  @Get('workflows/:wid')
  getWorkflow(@Req() req: any, @Param('wid') wid: string) {
    return this.recorder.get(req.user.id, wid)
  }

  @Delete('workflows/:wid')
  deleteWorkflow(@Req() req: any, @Param('wid') wid: string) {
    return this.recorder.remove(req.user.id, wid)
  }

  @Post('workflows/:wid/run')
  runWorkflow(@Req() req: any, @Param('wid') wid: string, @Body() body: any) {
    return this.recorder.run(req.user.id, wid, body ?? {})
  }

  @Get('sessions')
  list(@Req() req: any) {
    return this.service.listSessions(req.user.id)
  }

  @Post('sessions')
  start(@Req() req: any, @Body('url') url: string) {
    return this.service.startSession(url, req.user.id)
  }

  @Post('sessions/:id/action')
  execute(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    this.service.assertOwner(id, req.user?.id)
    return this.service.executeAction(id, body).then((result) => {
      if (result.status === 'ok') this.recorder.record(id, body)
      return result
    })
  }

  @Get('sessions/:id/pending')
  pending(@Req() req: any, @Param('id') id: string) {
    this.service.assertOwner(id, req.user?.id)
    return this.service.listPending(id)
  }

  @Get('sessions/:id/log')
  log(@Req() req: any, @Param('id') id: string) {
    this.service.assertOwner(id, req.user?.id)
    return this.service.getLog(id)
  }

  @Post('sessions/:id/actions/:pendingId/approve')
  approve(@Req() req: any, @Param('id') id: string, @Param('pendingId') pendingId: string) {
    this.service.assertOwner(id, req.user?.id)
    const pendingAction = this.service.listPending(id).find((p) => p.id === pendingId)?.action
    return this.service.resolvePending(id, pendingId, 'approve').then((result) => {
      if (pendingAction && result.status === 'ok') this.recorder.record(id, pendingAction)
      return result
    })
  }

  @Post('sessions/:id/actions/:pendingId/deny')
  deny(@Req() req: any, @Param('id') id: string, @Param('pendingId') pendingId: string) {
    this.service.assertOwner(id, req.user?.id)
    return this.service.resolvePending(id, pendingId, 'deny')
  }

  /** Server-sent events: screenshot frames + action log + pending approvals. */
  @Get('sessions/:id/stream')
  stream(@Req() req: any, @Res() res: any, @Param('id') id: string) {
    this.service.assertOwner(id, req.user?.id)
    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    let closed = false
    let timer: NodeJS.Timeout | null = null
    let lastShot: string | null = null

    const tick = async () => {
      if (closed) return
      const frame = await this.service.frame(id).catch(() => null)
      if (!frame) {
        res.write(`event: end\ndata: {"reason":"closed"}\n\n`)
        closed = true
        res.end()
        return
      }
      // Skip resending identical screenshots to save bandwidth.
      const payload = { ...frame, screenshot: frame.screenshot === lastShot ? undefined : frame.screenshot }
      lastShot = frame.screenshot
      res.write(`event: frame\ndata: ${JSON.stringify(payload)}\n\n`)
      timer = setTimeout(tick, frame.status === 'active' ? FRAME_INTERVAL_MS : IDLE_INTERVAL_MS)
    }

    req.on('close', () => {
      closed = true
      if (timer) clearTimeout(timer)
    })
    void tick()
  }

  @Get('sessions/:id/state')
  state(@Req() req: any, @Param('id') id: string) {
    this.service.assertOwner(id, req.user?.id)
    return this.service.captureState(id)
  }

  @Delete('sessions/:id')
  close(@Req() req: any, @Param('id') id: string) {
    this.service.assertOwner(id, req.user?.id)
    return this.service.closeSession(id)
  }
}
