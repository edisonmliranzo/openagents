import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import type { CreateAgentVersionInput } from '@openagents/shared'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { AgentVersionsService } from './agent-versions.service'

class CreateAgentVersionDto implements CreateAgentVersionInput {
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string
}

class DiffAgentVersionDto {
  @IsString()
  @MinLength(4)
  from!: string

  @IsString()
  @MinLength(4)
  to!: string
}

@ApiTags('agent-versions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agent-versions')
export class AgentVersionsController {
  constructor(private versions: AgentVersionsService) {}

  @Get()
  list(@Req() req: any) {
    return this.versions.list(req.user.id)
  }

  @Get('diff')
  diff(@Req() req: any, @Query() query: DiffAgentVersionDto) {
    return this.versions.diff(req.user.id, query.from, query.to)
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.versions.get(req.user.id, id)
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateAgentVersionDto) {
    return this.versions.create(req.user.id, dto)
  }

  @Post(':id/rollback')
  rollback(@Req() req: any, @Param('id') id: string) {
    return this.versions.rollback(req.user.id, id)
  }
}
