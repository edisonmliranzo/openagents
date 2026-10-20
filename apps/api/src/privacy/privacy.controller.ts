import { Body, Controller, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { PrivacyService, PrivacySettings } from './privacy.service'

const uid = (req: any): string => req.user?.id ?? req.user?.sub

@ApiTags('privacy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /** JSON bundle of all user data. `?download=1` sets an attachment header. */
  @Get('export')
  async export(@Req() req: any, @Res({ passthrough: true }) res: any, @Query('download') download?: string) {
    const bundle = await this.privacy.exportAll(uid(req))
    if (download && typeof res?.setHeader === 'function') {
      res.setHeader('Content-Disposition', `attachment; filename="openagents-export-${bundle.exportedAt.slice(0, 10)}.json"`)
    }
    return bundle
  }

  @Post('delete-all')
  deleteAll(@Req() req: any, @Body() body: { password?: string }) {
    return this.privacy.deleteAll(uid(req), String(body?.password ?? ''))
  }

  @Get('settings')
  settings(@Req() req: any) {
    return this.privacy.getSettings(uid(req))
  }

  @Put('settings')
  updateSettings(@Req() req: any, @Body() body: Partial<PrivacySettings>) {
    return this.privacy.updateSettings(uid(req), body ?? {})
  }

  @Get('memories')
  memories(@Req() req: any) {
    return this.privacy.listMemories(uid(req))
  }

  @Put('memories/:id/sensitive')
  setSensitive(@Req() req: any, @Param('id') id: string, @Body() body: { sensitive?: boolean }) {
    return this.privacy.setMemorySensitive(uid(req), id, !!body?.sensitive)
  }

  @Get('memories/:id/reveal')
  reveal(@Req() req: any, @Param('id') id: string) {
    return this.privacy.revealMemory(uid(req), id)
  }
}
