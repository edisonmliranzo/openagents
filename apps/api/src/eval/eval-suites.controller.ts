import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsBoolean, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { EvalSuitesService } from './eval-suites.service'

class SuiteDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string
  @IsOptional() @IsString() @MaxLength(500) description?: string
  @IsOptional() @IsString() @MaxLength(4000) system?: string
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsObject({ each: true }) cases?: any[]
}

class TargetDto {
  @IsOptional() @IsString() @MaxLength(80) presetId?: string
  @IsOptional() @IsString() @MaxLength(80) versionId?: string
  /** "provider:model" override */
  @IsOptional() @IsString() @MaxLength(160) model?: string
}

class BaselineDto {
  @IsOptional() @IsString() @MaxLength(80) runId?: string | null
}

class GateDto extends TargetDto {
  @IsOptional() @IsString() @MaxLength(80) runId?: string
  /** Run the suite first (CI mode). */
  @IsOptional() @IsBoolean() run?: boolean
  @IsOptional() @IsNumber() @Min(0) @Max(100) maxDrop?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100) minScore?: number
  @IsOptional() @IsBoolean() failOnCaseRegression?: boolean
}

@ApiTags('eval')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('eval/suites')
export class EvalSuitesController {
  constructor(private readonly suites: EvalSuitesService) {}

  @Get()
  list(@Req() req: any) { return this.suites.listSuites(req.user.id) }

  @Post()
  create(@Req() req: any, @Body() body: SuiteDto) { return this.suites.createSuite(req.user.id, body as any) }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) { return this.suites.getSuite(req.user.id, id) }

  @Put(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: SuiteDto) { return this.suites.updateSuite(req.user.id, id, body) }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) { return this.suites.deleteSuite(req.user.id, id) }

  @Post(':id/run')
  run(@Req() req: any, @Param('id') id: string, @Body() body: TargetDto) { return this.suites.runSuite(req.user.id, id, body ?? {}) }

  @Get(':id/runs')
  runs(@Req() req: any, @Param('id') id: string) { return this.suites.listRuns(req.user.id, id) }

  @Get(':id/runs/:runId')
  runDetail(@Req() req: any, @Param('id') id: string, @Param('runId') runId: string) { return this.suites.getRun(req.user.id, id, runId) }

  @Post(':id/baseline')
  baseline(@Req() req: any, @Param('id') id: string, @Body() body: BaselineDto) { return this.suites.setBaseline(req.user.id, id, body?.runId ?? null) }

  @Get(':id/compare')
  compare(@Req() req: any, @Param('id') id: string, @Query('runId') runId?: string, @Query('against') against?: string) {
    return this.suites.compare(req.user.id, id, runId, against)
  }

  /** CI gate: returns { pass, score, baselineScore, scoreDelta, reasons }. */
  @Post(':id/gate')
  gate(@Req() req: any, @Param('id') id: string, @Body() body: GateDto) { return this.suites.gate(req.user.id, id, body ?? {}) }
}
