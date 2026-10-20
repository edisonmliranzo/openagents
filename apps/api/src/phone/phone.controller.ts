import {
  Body, Controller, ForbiddenException, Get, Headers, HttpCode, NotFoundException, Param, Post, Query, Req, Res, UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { PhoneService } from './phone.service'

const uid = (req: any): string => req.user?.id ?? req.user?.sub

@ApiTags('phone')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('phone')
export class PhoneController {
  constructor(private readonly phone: PhoneService) {}

  @Get('status')
  status() {
    return this.phone.status()
  }

  @Get('calls')
  list(@Req() req: any) {
    return this.phone.list(uid(req))
  }

  @Get('calls/:id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.phone.get(uid(req), id)
  }

  /** Queues a call. It is NEVER dialed until approved via POST calls/:id/approve. */
  @Post('calls')
  create(@Req() req: any, @Body() body: { to?: string; goal?: string }) {
    return this.phone.request(uid(req), String(body?.to ?? ''), String(body?.goal ?? ''))
  }

  @Post('calls/:id/approve')
  @HttpCode(200)
  approve(@Req() req: any, @Param('id') id: string) {
    return this.phone.approve(uid(req), id)
  }

  @Post('calls/:id/reject')
  @HttpCode(200)
  reject(@Req() req: any, @Param('id') id: string) {
    return this.phone.reject(uid(req), id)
  }
}

/** Unauthenticated Twilio webhooks, protected by X-Twilio-Signature (HMAC-SHA1). */
@ApiTags('phone')
@Controller('phone')
export class PhoneWebhookController {
  constructor(private readonly phone: PhoneService) {}

  private verify(req: Request, signature?: string) {
    const url = `${this.phone.publicBase}${req.originalUrl}`
    if (!this.phone.validateSignature(url, (req.body ?? {}) as Record<string, unknown>, signature)) {
      throw new ForbiddenException('Invalid Twilio signature')
    }
  }

  private twiml(res: Response, body: string) {
    res.type('text/xml').send(body)
  }

  @Post('twilio/voice/:callId')
  async voice(@Req() req: Request, @Res() res: Response, @Param('callId') callId: string, @Headers('x-twilio-signature') sig?: string) {
    this.verify(req, sig)
    this.twiml(res, await this.phone.voiceTwiml(callId))
  }

  @Post('twilio/gather/:callId')
  async gather(@Req() req: Request, @Res() res: Response, @Param('callId') callId: string, @Headers('x-twilio-signature') sig?: string) {
    this.verify(req, sig)
    this.twiml(res, await this.phone.gatherResult(callId, req.body ?? {}))
  }

  @Post('twilio/status/:callId')
  @HttpCode(204)
  async status(@Req() req: Request, @Param('callId') callId: string, @Headers('x-twilio-signature') sig?: string) {
    this.verify(req, sig)
    await this.phone.statusCallback(callId, req.body ?? {})
  }

  /** Configure as the "A call comes in" webhook of TWILIO_PHONE_NUMBER. */
  @Post('twilio/inbound')
  async inbound(@Req() req: Request, @Res() res: Response, @Headers('x-twilio-signature') sig?: string) {
    this.verify(req, sig)
    this.twiml(res, await this.phone.inboundTwiml(req.body ?? {}))
  }

  /** Short-lived signed TTS audio for <Play>. */
  @Get('audio/:id')
  audio(@Param('id') id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    const hit = this.phone.getAudio(id, exp, sig)
    if (!hit) throw new NotFoundException()
    res.setHeader('Content-Type', hit.mime)
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.send(hit.buf)
  }
}
