import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { StudyService } from './study.service'

@ApiTags('study')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('study')
export class StudyController {
  constructor(private readonly study: StudyService) {}

  @Get('gaps')
  gaps(@Req() req: any) {
    return this.study.listGaps(req.user.id)
  }

  @Post('run')
  async run(@Req() req: any) {
    const gaps = await this.study.listGaps(req.user.id)
    const open = gaps.filter((g: { status: string }) => g.status === 'open').slice(0, 2)
    let studied = 0
    for (const gap of open) {
      const ok = await this.study
        .studyGap(req.user.id, gap.label)
        .catch(() => false)
      if (ok) studied += 1
    }
    return { ok: true, attempted: open.length, studied }
  }
}
