import { Controller, Post, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ReflectionService } from './reflection.service'

@ApiTags('reflection')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reflection')
export class ReflectionController {
  constructor(private readonly reflection: ReflectionService) {}

  @Post('run')
  run(@Req() req: any) {
    return this.reflection.reflect(req.user.id)
  }
}
