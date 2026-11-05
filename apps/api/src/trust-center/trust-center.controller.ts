import { Body, Controller, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { TrustCenterService } from './trust-center.service'

class RetentionDto {
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(3650)
  conversationsDays?: number | null

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(3650)
  auditLogDays?: number | null

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(3650)
  memoriesDays?: number | null
}

class ApplyRetentionDto {
  /** Must be true to actually delete; otherwise a dry run is performed. */
  @IsOptional() @IsBoolean()
  confirm?: boolean
}

class CreateRequestDto {
  @IsIn(['export', 'delete'])
  type!: 'export' | 'delete'

  @IsOptional() @IsString() @MaxLength(300)
  note?: string
}

class ConfirmDeleteDto {
  @IsString() @MaxLength(200)
  password!: string
}

@ApiTags('trust-center')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trust-center')
export class TrustCenterController {
  constructor(private readonly svc: TrustCenterService) {}

  @Get('posture')
  posture() {
    return this.svc.posture()
  }

  @Get('subprocessors')
  subprocessors() {
    return this.svc.subprocessors()
  }

  @Get('retention')
  retention(@Req() req: any) {
    return this.svc.getRetention(req.user.id)
  }

  @Put('retention')
  setRetention(@Req() req: any, @Body() dto: RetentionDto) {
    return this.svc.setRetention(req.user.id, dto)
  }

  @Post('retention/apply')
  applyRetention(@Req() req: any, @Body() dto: ApplyRetentionDto) {
    return this.svc.applyRetention(req.user.id, dto?.confirm !== true)
  }

  @Get('dpa')
  dpa(@Req() req: any, @Query('customer') customer?: string) {
    return this.svc.generateDpa(customer ?? '', req.user.id)
  }

  @Get('dpa/download')
  dpaDownload(@Req() req: any, @Res({ passthrough: true }) res: any, @Query('customer') customer?: string) {
    const { filename, markdown } = this.svc.generateDpa(customer ?? '', req.user.id)
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return markdown
  }

  @Get('requests')
  requests(@Req() req: any) {
    return this.svc.listRequests(req.user.id)
  }

  @Post('requests')
  createRequest(@Req() req: any, @Body() dto: CreateRequestDto) {
    return this.svc.createRequest(req.user.id, dto.type, dto.note)
  }

  @Get('requests/:id/download')
  async download(@Req() req: any, @Param('id') id: string, @Res({ passthrough: true }) res: any) {
    const bundle = await this.svc.downloadExport(req.user.id, id)
    res.setHeader('Content-Disposition', `attachment; filename="openagents-export-${bundle.exportedAt.slice(0, 10)}.json"`)
    return bundle
  }

  @Post('requests/:id/confirm')
  confirm(@Req() req: any, @Param('id') id: string, @Body() dto: ConfirmDeleteDto) {
    return this.svc.confirmDelete(req.user.id, id, dto.password)
  }
}
