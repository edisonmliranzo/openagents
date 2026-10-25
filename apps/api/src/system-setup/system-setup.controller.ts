import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { SystemSetupService } from './system-setup.service'

@ApiTags('setup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('setup')
export class SystemSetupController {
  constructor(private readonly setup: SystemSetupService) {}

  /** The 5-minute onboarding checklist: what works, what's missing, what to do next. */
  @Get('health')
  health(@Req() req: any) {
    return this.setup.health(req.user?.id ?? null)
  }

  @Post('health')
  refresh(@Req() req: any, @Body() _body: Record<string, unknown>) {
    return this.setup.health(req.user?.id ?? null)
  }
}
