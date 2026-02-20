import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsInt, IsOptional, Max, Min } from 'class-validator'
import type { Response } from 'express'
import { JwtAuthGuard } from '../../auth/guards/jwt.guard'
import { WhatsAppService, type WhatsAppInboundPayload } from './whatsapp.service'

class CreatePairingDto {
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(240)
  expiresInMinutes?: number
}

@ApiTags('channels')
@Controller('channels/whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name)

  constructor(private whatsapp: WhatsAppService) {}

  @Get('health')
  health() {
    return this.whatsapp.health()
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('pairings')
  listPairings(@Req() req: any) {
    return this.whatsapp.listPairings(req.user.id)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('pairings')
  createPairing(@Req() req: any, @Body() dto: CreatePairingDto) {
    return this.whatsapp.createPairing(req.user.id, {
      expiresInMinutes: dto.expiresInMinutes,
    })
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('devices')
  listDevices(@Req() req: any) {
    return this.whatsapp.listDevices(req.user.id)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('devices/:deviceId')
  unlinkDevice(@Req() req: any, @Param('deviceId') deviceId: string) {
    return this.whatsapp.unlinkDevice(req.user.id, deviceId)
  }

  @Post('webhook')
  webhook(
    @Body() payload: Record<string, unknown>,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    this.assertWebhookToken(token)
    this.whatsapp.handleInbound(payload as WhatsAppInboundPayload).catch((error) => {
      this.logger.error('Failed to process WhatsApp inbound webhook', error)
    })

    res.setHeader('Content-Type', 'text/xml')
    res.status(200).send('<Response></Response>')
  }

  private assertWebhookToken(token?: string) {
    const expected = (process.env.WHATSAPP_WEBHOOK_TOKEN ?? '').trim()
    if (!expected) return
    const actual = (token ?? '').trim()
    if (actual !== expected) {
      throw new UnauthorizedException('Invalid webhook token')
    }
  }
}
