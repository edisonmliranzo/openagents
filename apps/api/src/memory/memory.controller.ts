import { Controller, Get, Delete, Param, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { MemoryService } from './memory.service'

@ApiTags('memory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('memory')
export class MemoryController {
  constructor(private memory: MemoryService) {}

  @Get()
  list(@Req() req: any) {
    return this.memory.getForUser(req.user.id)
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: any) {
    return this.memory.delete(id, req.user.id)
  }
}
