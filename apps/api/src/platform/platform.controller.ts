import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { PlatformService } from './platform.service'
import type { PlatformPlanId } from '@openagents/shared'

const PLAN_IDS: PlatformPlanId[] = ['free', 'pro', 'team']

class SetPlanDto {
  @IsIn(PLAN_IDS)
  planId!: PlatformPlanId
}

class RunEvalDto {
  @IsString()
  @MinLength(1)
  suiteId!: string

  @IsOptional()
  @IsString()
  baseUrl?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  models?: string[]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  rounds?: number
}

@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('platform')
export class PlatformController {
  constructor(private platform: PlatformService) {}

  @Get('templates')
  templates(@Req() req: any) {
    return this.platform.listTemplates(req.user.id)
  }

  @Post('templates/:templateId/install')
  installTemplate(@Req() req: any, @Param('templateId') templateId: string) {
    return this.platform.installTemplate(req.user.id, templateId)
  }

  @Get('fleet')
  fleet(@Req() req: any) {
    return this.platform.fleet(req.user.id)
  }

  @Get('evals/suites')
  evalSuites() {
    return this.platform.evalSuites()
  }

  @Post('evals/run')
  runEval(@Req() req: any, @Body() dto: RunEvalDto) {
    return this.platform.runEval(req.user.id, dto)
  }

  @Get('billing')
  billing(@Req() req: any, @Query('start') start?: string, @Query('end') end?: string) {
    return this.platform.billing(req.user.id, start, end)
  }

  @Get('subscription')
  subscription(@Req() req: any) {
    return this.platform.subscription(req.user.id)
  }

  @Patch('subscription')
  setPlan(@Req() req: any, @Body() dto: SetPlanDto) {
    return this.platform.setPlan(req.user.id, dto)
  }

  @Get('inbox')
  inbox(@Req() req: any, @Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '80', 10)
    const safe = Number.isFinite(parsed) ? parsed : 80
    return this.platform.inbox(req.user.id, safe)
  }
}

