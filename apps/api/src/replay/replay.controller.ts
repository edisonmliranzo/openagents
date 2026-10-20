import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ReplayService } from './replay.service'

const uid = (req: any): string => req.user?.id ?? req.user?.sub

@ApiTags('replay')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('replay')
export class ReplayController {
  constructor(private readonly replay: ReplayService) {}

  @Get('runs')
  runs(@Req() req: any, @Query('limit') limit?: string, @Query('conversationId') conversationId?: string) {
    return this.replay.listRuns(uid(req), limit ? Number(limit) || 50 : 50, conversationId || undefined)
  }

  @Get('runs/:id')
  run(@Req() req: any, @Param('id') id: string) {
    return this.replay.getRun(uid(req), id)
  }
}
