import { Controller, Get, Post, Param, Query, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ApprovalsService } from './approvals.service'

@ApiTags('approvals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('approvals')
export class ApprovalsController {
  constructor(private approvals: ApprovalsService) {}

  @Get()
  list(@Req() req: any, @Query('status') status?: 'pending' | 'approved' | 'denied') {
    return this.approvals.list(req.user.id, status)
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Req() req: any) {
    return this.approvals.resolve(id, req.user.id, true)
  }

  @Post(':id/deny')
  deny(@Param('id') id: string, @Req() req: any) {
    return this.approvals.resolve(id, req.user.id, false)
  }
}
