import { Body, Controller, Get, HttpException, HttpStatus, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { BriefingService } from './briefing.service'
import type { BriefingSettings } from './briefing.store'

const uid = (req: any): string => req.user?.id ?? req.user?.sub

@ApiTags('briefing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('briefing')
export class BriefingController {
  constructor(private readonly briefing: BriefingService) {}

  @Get('latest')
  async latest(@Req() req: any) {
    return { briefing: await this.briefing.getLatest(uid(req)) }
  }

  @Get('history')
  history(@Req() req: any, @Query('limit') limit?: string) {
    return this.briefing.getHistory(uid(req), limit ? Number(limit) || 30 : 30)
  }

  @Get('settings')
  settings(@Req() req: any) {
    return this.briefing.getSettings(uid(req))
  }

  @Put('settings')
  updateSettings(@Req() req: any, @Body() body: Partial<BriefingSettings>) {
    return this.briefing.updateSettings(uid(req), body ?? {})
  }

  @Post('run')
  async run(@Req() req: any) {
    try {
      const briefing = await this.briefing.runNow(uid(req))
      return { ok: true, briefing }
    } catch (error: any) {
      throw new HttpException(error?.message ?? 'Briefing failed', HttpStatus.CONFLICT)
    }
  }
}
