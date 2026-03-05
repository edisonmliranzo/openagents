import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { MemoryService } from './memory.service'

const MEMORY_EVENT_KINDS = ['conversation', 'workflow', 'incident', 'extraction', 'note'] as const

class UpdateMemoryFileDto {
  @IsString()
  content!: string
}

class QueryMemoryDto {
  @IsString()
  query!: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number

  @IsOptional()
  @IsBoolean()
  includeFacts?: boolean

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidence?: number

  @IsOptional()
  @IsBoolean()
  includeConflicts?: boolean
}

class WriteMemoryEventDto {
  @IsString()
  @IsIn(MEMORY_EVENT_KINDS)
  kind!: (typeof MEMORY_EVENT_KINDS)[number]

  @IsString()
  summary!: string

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>

  @IsOptional()
  @IsString()
  sourceRef?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @IsOptional()
  @IsBoolean()
  piiRedacted?: boolean

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number

  @IsOptional()
  @IsString()
  freshUntil?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 365)
  freshnessHours?: number

  @IsOptional()
  @IsString()
  conflictGroup?: string
}

class UpsertMemoryFactDto {
  @IsString()
  entity!: string

  @IsString()
  key!: string

  @IsString()
  value!: string

  @IsOptional()
  @IsString()
  sourceRef?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number

  @IsOptional()
  @IsString()
  freshUntil?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 365)
  freshnessHours?: number

  @IsOptional()
  @IsString()
  conflictGroup?: string

  @IsOptional()
  @IsBoolean()
  reinforce?: boolean
}

class ResolveMemoryConflictDto {
  @IsOptional()
  @IsIn(['resolved', 'ignored'])
  status?: 'resolved' | 'ignored'
}

class BrowserCaptureDto {
  @IsString()
  url!: string

  @IsString()
  @IsOptional()
  title?: string

  @IsString()
  selection!: string

  @IsString()
  @IsOptional()
  note?: string

  @IsString()
  @IsOptional()
  conversationId?: string
}

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

  @Post('query')
  query(@Req() req: any, @Body() dto: QueryMemoryDto) {
    return this.memory.queryTiered(req.user.id, dto)
  }

  @Post('events')
  writeEvent(@Req() req: any, @Body() dto: WriteMemoryEventDto) {
    return this.memory.writeEvent(req.user.id, dto)
  }

  @Get('facts')
  listFacts(@Req() req: any, @Query('entity') entity?: string, @Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '30', 10)
    const safe = Number.isFinite(parsed) ? parsed : 30
    return this.memory.listFacts(req.user.id, entity, safe)
  }

  @Post('facts')
  upsertFact(@Req() req: any, @Body() dto: UpsertMemoryFactDto) {
    return this.memory.upsertFact(req.user.id, dto)
  }

  @Post('files/sync')
  async syncFiles(@Req() req: any) {
    await this.memory.syncFiles(req.user.id)
    return { ok: true }
  }

  @Get('files')
  listFiles(@Req() req: any) {
    return this.memory.listFiles(req.user.id)
  }

  @Get('files/:name')
  readFile(@Param('name') name: string, @Req() req: any) {
    return this.memory.readFile(req.user.id, name)
  }

  @Put('files/:name')
  writeFile(@Param('name') name: string, @Body() dto: UpdateMemoryFileDto, @Req() req: any) {
    return this.memory.writeFile(req.user.id, name, dto.content)
  }

  @Post('capture')
  capture(@Req() req: any, @Body() dto: BrowserCaptureDto) {
    return this.memory.captureBrowserSelection(req.user.id, dto)
  }

  @Post('curate')
  curate(@Req() req: any) {
    return this.memory.curateNightly(req.user.id, 'manual')
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: any) {
    return this.memory.delete(id, req.user.id)
  }

  @Get('conflicts')
  listConflicts(@Req() req: any, @Query('status') status?: string, @Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '30', 10)
    const safe = Number.isFinite(parsed) ? parsed : 30
    return this.memory.listConflicts(req.user.id, status, safe)
  }

  @Post('conflicts/:id/resolve')
  resolveConflict(@Req() req: any, @Param('id') id: string, @Body() dto: ResolveMemoryConflictDto) {
    return this.memory.resolveConflict(req.user.id, id, dto.status ?? 'resolved')
  }

  @Get('review-queue')
  reviewQueue(@Req() req: any, @Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '30', 10)
    const safe = Number.isFinite(parsed) ? parsed : 30
    return this.memory.getReviewQueue(req.user.id, safe)
  }
}
