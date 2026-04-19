import { Controller, Post, Delete, Get, Body, Req, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { PushService, PushSubscription } from './push.service'

@ApiTags('push')
@Controller('api/v1/push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('vapid-public-key')
  @ApiOperation({ summary: 'Get VAPID public key for client-side push subscription' })
  getVapidKey() {
    return { publicKey: this.push.getVapidPublicKey() }
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Register a push subscription' })
  subscribe(@Req() req: any, @Body() body: PushSubscription) {
    return this.push.subscribe(req.user.sub, body)
  }

  @Delete('subscribe')
  @ApiOperation({ summary: 'Unregister a push subscription' })
  unsubscribe(@Req() req: any, @Body() body: { endpoint: string }) {
    return this.push.unsubscribe(req.user.sub, body.endpoint)
  }

  @Post('test')
  @ApiOperation({ summary: 'Send a test push notification to yourself' })
  async test(@Req() req: any) {
    const result = await this.push.sendToUser(req.user.sub, {
      title: 'OpenAgents',
      body: 'Push notifications are working!',
      url: '/chat',
    })
    return result
  }
}
