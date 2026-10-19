import { Controller, Get, Param, Post, Query, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { AuditService } from './audit.service'

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  list(
    @Req() req: any,
    @Query('action') action?: string,
    @Query('tool') tool?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number.parseInt(limit ?? '50', 10)
    const take = Number.isFinite(parsed) ? parsed : 50
    return this.audit.list(req.user.id, take, { action, tool, from, to })
  }

  @Post(':id/undo')
  undo(@Req() req: any, @Param('id') id: string) {
    return this.audit.undo(req.user.id, id)
  }
}
