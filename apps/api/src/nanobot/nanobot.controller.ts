import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { NanobotService } from './nanobot.service'
import { NanobotHeartbeatService } from './heartbeat/nanobot-heartbeat.service'

@ApiTags('nanobot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('nanobot')
export class NanobotController {
  constructor(
    private nanobot: NanobotService,
    private heartbeat: NanobotHeartbeatService,
  ) {}

  @Get('health')
  health(@Req() req: any) {
    return this.nanobot.health(req.user.id)
  }

  @Post('heartbeat')
  heartbeatTick(@Req() req: any) {
    return this.heartbeat.tick(req.user.id)
  }
}

