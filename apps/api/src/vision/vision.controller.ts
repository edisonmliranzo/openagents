import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { VisionService, type VisionInput } from './vision.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'

@Controller('vision')
@UseGuards(JwtAuthGuard)
export class VisionController {
  constructor(private readonly vision: VisionService) {}

  @Post('analyze')
  analyze(@CurrentUserId() userId: string, @Body() body: VisionInput) {
    return this.vision.analyzeImage(userId, body)
  }
}
