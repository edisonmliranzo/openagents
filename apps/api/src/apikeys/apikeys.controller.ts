import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ApiKeysService } from './apikeys.service'

@Controller('apikeys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get('health')
  getHealth() {
    return this.apiKeysService.getHealth()
  }

  @Post('rotate')
  async rotate(@Body() body: { envVar: string; newValue: string }) {
    if (!body.envVar || !body.newValue) {
      return { success: false, message: 'envVar and newValue are required' }
    }
    return this.apiKeysService.rotateKey(body.envVar, body.newValue)
  }
}
