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
import { IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator'
import type { Response } from 'express'
import { JwtAuthGuard } from '../../auth/guards/jwt.guard'
import { TelegramService, type TelegramUpdate } from './telegram.service'

class CreatePairingDto {
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(240)
  expiresInMinutes?: number
}

class RegisterWebhookDto {
  @IsString()
  @IsUrl()
  webhookUrl!: string
}

@ApiTags('channels')
@Controller('channels/telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name)

  constructor(private telegram: TelegramService) {}

  @Get('health')
  health() {
    return this.telegram.health()
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('chats')
  listChats(@Req() req: any) {
    return this.telegram.listChats(req.user.id)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('chats/:chatId')
  unlinkChat(@Req() req: any, @Param('chatId') chatId: string) {
    return this.telegram.unlinkChat(req.user.id, chatId)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('pairings')
  listPairings(@Req() req: any) {
    return this.telegram.listPairings(req.user.id)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('pairings')
  createPairing(@Req() req: any, @Body() dto: CreatePairingDto) {
    return this.telegram.createPairing(req.user.id, { expiresInMinutes: dto.expiresInMinutes })
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('webhook/register')
  registerWebhook(@Body() dto: RegisterWebhookDto) {
    return this.telegram.registerWebhook(dto.webhookUrl)
  }

  @Post('webhook')
  async webhook(
    @Body() update: TelegramUpdate,
    @Query('secret') secret: string | undefined,
    @Res() res: Response,
  ) {
    this.assertWebhookSecret(secret)
    this.telegram.handleUpdate(update).catch((err) => {
      this.logger.error('Failed to process Telegram update', err)
    })
    res.status(200).json({ ok: true })
  }

  private assertWebhookSecret(secret?: string) {
    const expected = (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim()
    if (!expected) return
    if ((secret ?? '').trim() !== expected) {
      throw new UnauthorizedException('Invalid Telegram webhook secret')
    }
  }
}
