import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator'
import type { CreateExtractionJobInput, ExtractionSourceKind, ExtractionStatus } from '@openagents/shared'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ExtractionService } from './extraction.service'

const SOURCE_KINDS: ExtractionSourceKind[] = ['pdf', 'email', 'web', 'text']
const STATUSES: ExtractionStatus[] = ['queued', 'processing', 'completed', 'failed', 'needs_review']

class CreateExtractionJobDto implements CreateExtractionJobInput {
  @IsIn(SOURCE_KINDS)
  sourceKind!: ExtractionSourceKind

  @IsString()
  @MaxLength(1000)
  sourceUri!: string

  @IsString()
  @MaxLength(120)
  schemaVersion!: string

  @IsObject()
  schema!: Record<string, unknown>

  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>
}

@ApiTags('extract')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('extract')
export class ExtractionController {
  constructor(private readonly extraction: ExtractionService) {}

  @Post('jobs')
  createJob(@Req() req: any, @Body() dto: CreateExtractionJobDto) {
    return this.extraction.createJob(req.user.id, dto)
  }

  @Get('jobs')
  listJobs(
    @Req() req: any,
    @Query('status') status?: ExtractionStatus,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number.parseInt(limit ?? '30', 10)
    const safe = Number.isFinite(parsed) ? parsed : 30
    const normalizedStatus = status && STATUSES.includes(status) ? status : undefined
    return this.extraction.listJobs(req.user.id, normalizedStatus, safe)
  }

  @Get('jobs/:id')
  getJob(@Req() req: any, @Param('id') id: string) {
    return this.extraction.getJob(req.user.id, id)
  }
}
