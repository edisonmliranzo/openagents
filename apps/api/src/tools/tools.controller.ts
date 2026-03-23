import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { IsObject, IsOptional, IsString } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ToolsService } from './tools.service'

class ToolDryRunDto {
  @IsString()
  toolName!: string

  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>
}

@ApiTags('tools')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tools')
export class ToolsController {
  constructor(private tools: ToolsService) {}

  @Get()
  async list() {
    return this.tools.getAllDefinitions()
  }

  @Post('dry-run')
  async dryRun(@Req() req: any, @Body() dto: ToolDryRunDto) {
    return this.tools.dryRun(req.user.id, dto.toolName, dto.input ?? {})
  }
}
