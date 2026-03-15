import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Logger,
  Param,
  Post,
  RawBodyRequest,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsInt, IsOptional, Max, Min } from 'class-validator'
import type { Request, Response } from 'express'
import { JwtAuthGuard } from '../../auth/guards/jwt.guard'
import { SlackService, type SlackEventPayload } from './slack.service'

class CreatePairingDto {
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(240)
  expiresInMinutes?: number
}

@ApiTags('channels')
@Controller('channels/slack')
export class SlackController {
  private readonly logger = new Logger(SlackController.name)

  constructor(private slack: SlackService) {}

  @Get('health')
  health() {
    return this.slack.health()
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('workspaces')
  listWorkspaces(@Req() req: any) {
    return this.slack.listWorkspaces(req.user.id)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('workspaces/:workspaceId')
  unlinkWorkspace(@Req() req: any, @Param('workspaceId') workspaceId: string) {
    return this.slack.unlinkWorkspace(req.user.id, workspaceId)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('pairings')
  listPairings(@Req() req: any) {
    return this.slack.listPairings(req.user.id)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('pairings')
  createPairing(@Req() req: any, @Body() dto: CreatePairingDto) {
    return this.slack.createPairing(req.user.id, { expiresInMinutes: dto.expiresInMinutes })
  }

  @Post('webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: SlackEventPayload,
    @Headers('x-slack-request-timestamp') timestamp: string,
    @Headers('x-slack-signature') signature: string,
    @Res() res: Response,
  ) {
    const rawBody = req.rawBody?.toString() ?? JSON.stringify(payload)
    if (!this.slack.verifySlackSignature(rawBody, timestamp, signature)) {
      throw new UnauthorizedException('Invalid Slack signature')
    }

    const result = await this.slack.handleEvent(payload).catch((err) => {
      this.logger.error('Failed to handle Slack event', err)
      return {}
    })

    // Return challenge for URL verification or 200 OK for events
    res.status(200).json(result)
  }
}
