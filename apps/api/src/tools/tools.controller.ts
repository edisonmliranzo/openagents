import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ToolsService } from './tools.service'

@ApiTags('tools')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tools')
export class ToolsController {
  constructor(private tools: ToolsService) {}

  @Get()
  list() {
    return this.tools.getAllDefinitions()
  }
}
