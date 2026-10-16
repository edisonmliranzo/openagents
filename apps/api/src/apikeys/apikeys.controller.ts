import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ApiKeysService } from './apikeys.service'

@Controller('apikeys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  private assertAdmin(req: any) {
    const role = String(req?.user?.role ?? '').toLowerCase()
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenException('Only platform administrators can view or rotate server API keys.')
    }
  }

  @Get('health')
  getHealth(@Req() req: any) {
    this.assertAdmin(req)
    return this.apiKeysService.getHealth()
  }

  @Post('rotate')
  async rotate(@Req() req: any, @Body() body: { envVar: string; newValue: string }) {
    this.assertAdmin(req)
    if (!body.envVar || !body.newValue) {
      return { success: false, message: 'envVar and newValue are required' }
    }
    return this.apiKeysService.rotateKey(body.envVar, body.newValue)
  }
}

