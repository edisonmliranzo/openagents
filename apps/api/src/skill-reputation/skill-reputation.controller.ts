import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { SkillReputationService } from './skill-reputation.service'

@ApiTags('skill-reputation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('skill-reputation')
export class SkillReputationController {
  constructor(private reputation: SkillReputationService) {}

  @Get()
  list(@Req() req: any) {
    return this.reputation.list(req.user.id)
  }

  @Get(':skillId/history')
  history(@Req() req: any, @Param('skillId') skillId: string, @Query('days') days?: string) {
    const parsed = Number.parseInt(days ?? '30', 10)
    const safe = Number.isFinite(parsed) ? parsed : 30
    return this.reputation.history(req.user.id, skillId, safe)
  }
}
