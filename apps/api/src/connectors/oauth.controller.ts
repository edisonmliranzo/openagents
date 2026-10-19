import { Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { Public } from '../common/public.decorator'
import { ConnectorOAuthService } from './oauth.service'

@ApiTags('connectors')
@Controller('connectors')
export class ConnectorOAuthController {
  constructor(private readonly oauth: ConnectorOAuthService) {}

  @Get('oauth/definitions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  definitions() {
    return this.oauth.listDefinitions()
  }

  /** Browser redirect target from the provider. State is HMAC-signed and carries the user id. */
  @Public()
  @Get('oauth/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: any,
  ) {
    const target = await this.oauth.callback({ code, state, error })
    return res.redirect(302, target)
  }

  @Get(':connectorId/oauth/start')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  start(@Req() req: any, @Param('connectorId') connectorId: string) {
    return this.oauth.start(req.user.id, connectorId)
  }

  @Get(':connectorId/oauth/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  status(@Req() req: any, @Param('connectorId') connectorId: string) {
    return this.oauth.status(req.user.id, connectorId)
  }

  @Post(':connectorId/actions/:action')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  runAction(@Req() req: any, @Param('connectorId') connectorId: string, @Param('action') action: string) {
    return this.oauth.runAction(req.user.id, connectorId, action)
  }
}
