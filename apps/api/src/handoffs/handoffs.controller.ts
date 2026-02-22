import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'
import type {
  CreateHandoffInput,
  HandoffStatus,
  ReplyHandoffInput,
  ResolveHandoffInput,
} from '@openagents/shared'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { HandoffsService } from './handoffs.service'

class CreateHandoffDto implements CreateHandoffInput {
  @IsString()
  conversationId!: string

  @IsOptional()
  @IsString()
  @MaxLength(800)
  reason?: string
}

class ReplyHandoffDto implements ReplyHandoffInput {
  @IsString()
  @MaxLength(8000)
  message!: string
}

class ResolveHandoffDto implements ResolveHandoffInput {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string
}

@ApiTags('handoffs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('handoffs')
export class HandoffsController {
  constructor(private handoffs: HandoffsService) {}

  @Get()
  list(
    @Req() req: any,
    @Query('status') status?: string,
  ) {
    const normalized = (status ?? '').trim()
    const safe = normalized === 'open' || normalized === 'claimed' || normalized === 'resolved' || normalized === 'returned'
      ? normalized
      : undefined
    return this.handoffs.list(req.user.id, safe as HandoffStatus | undefined)
  }

  @Get('active/:conversationId')
  active(@Req() req: any, @Param('conversationId') conversationId: string) {
    return this.handoffs.getActiveForConversation(req.user.id, conversationId)
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.handoffs.get(req.user.id, id)
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateHandoffDto) {
    return this.handoffs.create(req.user.id, dto)
  }

  @Post(':id/claim')
  claim(@Req() req: any, @Param('id') id: string) {
    return this.handoffs.claim(req.user.id, id)
  }

  @Post(':id/reply')
  reply(@Req() req: any, @Param('id') id: string, @Body() dto: ReplyHandoffDto) {
    return this.handoffs.reply(req.user.id, id, dto.message)
  }

  @Post(':id/resolve')
  resolve(@Req() req: any, @Param('id') id: string, @Body() dto: ResolveHandoffDto) {
    return this.handoffs.resolve(req.user.id, id, dto.resolutionNote)
  }

  @Post(':id/return')
  returnToAgent(@Req() req: any, @Param('id') id: string) {
    return this.handoffs.returnToAgent(req.user.id, id)
  }
}
