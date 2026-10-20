import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ExpoPushService } from './expo-push.service'

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class ExpoPushController {
  constructor(private readonly expo: ExpoPushService) {}

  @Post('expo-token')
  @ApiOperation({ summary: 'Register an Expo push token for the mobile app' })
  register(@Req() req: any, @Body() body: { token: string; platform?: string; deviceName?: string }) {
    return this.expo.register(req.user.id ?? req.user.sub, body)
  }

  @Delete('expo-token')
  @ApiOperation({ summary: 'Unregister an Expo push token' })
  unregister(@Req() req: any, @Body() body: { token: string }) {
    return this.expo.unregister(req.user.id ?? req.user.sub, body?.token ?? '')
  }

  @Post('expo-token/test')
  @ApiOperation({ summary: 'Send a test push to your registered mobile devices' })
  test(@Req() req: any) {
    return this.expo.sendToUser(req.user.id ?? req.user.sub, { title: 'OpenAgents', body: 'Mobile push notifications are working!' })
  }
}
