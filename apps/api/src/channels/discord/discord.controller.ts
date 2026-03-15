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
import { DiscordService, type DiscordInteraction } from './discord.service'

class CreatePairingDto {
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(240)
  expiresInMinutes?: number
}

@ApiTags('channels')
@Controller('channels/discord')
export class DiscordController {
  private readonly logger = new Logger(DiscordController.name)

  constructor(private discord: DiscordService) {}

  @Get('health')
  health() {
    return this.discord.health()
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('servers')
  listServers(@Req() req: any) {
    return this.discord.listServers(req.user.id)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('servers/:serverId')
  unlinkServer(@Req() req: any, @Param('serverId') serverId: string) {
    return this.discord.unlinkServer(req.user.id, serverId)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('pairings')
  listPairings(@Req() req: any) {
    return this.discord.listPairings(req.user.id)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('pairings')
  createPairing(@Req() req: any, @Body() dto: CreatePairingDto) {
    return this.discord.createPairing(req.user.id, { expiresInMinutes: dto.expiresInMinutes })
  }

  /**
   * Discord Interactions Endpoint.
   * Must be registered as the "Interactions Endpoint URL" in the Discord Developer Portal.
   * Discord verifies requests using Ed25519 signatures.
   */
  @Post('webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() interaction: DiscordInteraction,
    @Headers('x-signature-ed25519') signature: string,
    @Headers('x-signature-timestamp') timestamp: string,
    @Res() res: Response,
  ) {
    const rawBody = req.rawBody?.toString() ?? JSON.stringify(interaction)
    if (!this.discord.verifyDiscordSignature(rawBody, timestamp ?? '', signature ?? '')) {
      throw new UnauthorizedException('Invalid Discord signature')
    }

    const result = await this.discord.handleInteraction(interaction).catch((err) => {
      this.logger.error('Failed to handle Discord interaction', err)
      return { type: 1 }
    })

    res.status(200).json(result)
  }
}
