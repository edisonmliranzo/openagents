import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { BriefingService } from './briefing.service'

@ApiTags('briefing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('briefing')
export class BriefingController {
  constructor(private readonly briefing: BriefingService) {}

  @Post('run')
  async run(@Req() req: any) {
    const sent = await this.briefing.sendBriefing(req.user.id, { force: true })
    return { ok: true, sent }
  }
}
