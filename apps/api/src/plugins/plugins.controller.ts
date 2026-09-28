import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { PluginsService } from './plugins.service'

@ApiTags('plugins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plugins')
export class PluginsController {
  constructor(private readonly plugins: PluginsService) {}

  @Get()
  list(@Req() req: any) {
    return this.plugins.list(req.user.id)
  }

  @Post(':key/enable')
  enable(@Req() req: any, @Param('key') key: string) {
    return this.plugins.setEnabled(req.user.id, key, true)
  }

  @Post(':key/disable')
  disable(@Req() req: any, @Param('key') key: string) {
    return this.plugins.setEnabled(req.user.id, key, false)
  }
}
