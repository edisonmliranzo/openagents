import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { MissionControlService } from './mission-control.service'
import type {
  MissionControlEventStatus,
  MissionControlEventType,
} from '@openagents/shared'

function parseListParam(value?: string) {
  if (!value) return []
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

@ApiTags('mission-control')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mission-control')
export class MissionControlController {
  constructor(private mission: MissionControlService) {}

  @Get('events')
  listEvents(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('types') types?: string,
    @Query('statuses') statuses?: string,
    @Query('source') source?: string,
  ) {
    const parsedLimit = Number.parseInt(limit ?? '60', 10)
    const safeLimit = Number.isFinite(parsedLimit) ? parsedLimit : 60
    return this.mission.listEvents(req.user.id, {
      limit: safeLimit,
      cursor,
      types: parseListParam(types) as MissionControlEventType[],
      statuses: parseListParam(statuses) as MissionControlEventStatus[],
      source,
    })
  }

  @Get('events/stream')
  async streamEvents(
    @Req() req: any,
    @Res() res: Response,
    @Query('limit') limit?: string,
  ) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const emit = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const parsedLimit = Number.parseInt(limit ?? '40', 10)
    const safeLimit = Number.isFinite(parsedLimit) ? parsedLimit : 40
    const snapshot = await this.mission.listEvents(req.user.id, { limit: safeLimit })
    emit('snapshot', snapshot)

    const unsubscribe = this.mission.subscribe(req.user.id, (event) => {
      emit('event', event)
    })

    const heartbeat = setInterval(() => {
      emit('heartbeat', { now: new Date().toISOString() })
    }, 25_000)
    heartbeat.unref()

    req.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
      res.end()
    })
  }
}
