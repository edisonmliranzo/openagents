import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards, BadRequestException } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString,
  Max, MaxLength, Min, ValidateNested,
} from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { AuditLedgerService } from './audit-ledger.service'
import { InjectionFirewallService } from './injection-firewall.service'
import { PolicyRulesService, type PolicyRule, type RuleEffect, type RuleScope } from './policy-rules.service'

const EFFECTS: RuleEffect[] = ['deny', 'require_approval', 'warn', 'allow']
const SCOPES: RuleScope[] = ['local', 'external_read', 'external_write', 'system_mutation']

class StrList {
  static opts = { each: true } as const
}

class RuleMatchDto {
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString(StrList.opts) @MaxLength(120, StrList.opts) tools?: string[]
  @IsOptional() @IsArray() @IsIn(SCOPES, StrList.opts) scopes?: RuleScope[]
  @IsOptional() @IsNumber() @Min(0) @Max(100) minRiskScore?: number
  @IsOptional() @IsNumber() @Min(0) costOverUsd?: number
  @IsOptional() @IsNumber() @Min(0) dailySpendOverUsd?: number
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString(StrList.opts) @MaxLength(255, StrList.opts) recipientDomainNotIn?: string[]
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString(StrList.opts) @MaxLength(255, StrList.opts) recipientDomainIn?: string[]
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString(StrList.opts) @MaxLength(255, StrList.opts) urlHostIn?: string[]
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString(StrList.opts) @MaxLength(255, StrList.opts) urlHostNotIn?: string[]
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString(StrList.opts) @MaxLength(200, StrList.opts) inputContains?: string[]
}

class RuleDto {
  @IsString() @MaxLength(120) name!: string
  @IsOptional() @IsString() @MaxLength(500) description?: string
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsIn(EFFECTS) effect!: RuleEffect
  @IsOptional() @IsInt() @Min(0) @Max(10000) priority?: number
  @IsOptional() @ValidateNested() @Type(() => RuleMatchDto) match?: RuleMatchDto
}

class TestRuleDto {
  @IsString() @MaxLength(120) toolName!: string
  @IsOptional() @IsObject() input?: Record<string, unknown>
  @IsOptional() @IsIn(SCOPES) scope?: RuleScope
  @IsOptional() @IsNumber() @Min(0) @Max(100) riskScore?: number
  @IsOptional() @IsNumber() @Min(0) estimatedCostUsd?: number
  /** Optional draft rule to test instead of the saved rule set (editor "try before save"). */
  @IsOptional() @ValidateNested() @Type(() => RuleDto) draftRule?: RuleDto
}

@ApiTags('governance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('policy-rules')
export class PolicyRulesController {
  constructor(private readonly rules: PolicyRulesService) {}

  @Get()
  list(@Req() req: any) {
    return this.rules.list(req.user.id)
  }

  @Post()
  create(@Req() req: any, @Body() dto: RuleDto) {
    return this.rules.upsert(req.user.id, dto as any).catch((e: Error) => { throw new BadRequestException(e.message) })
  }

  @Put(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: RuleDto) {
    return this.rules.upsert(req.user.id, dto as any, id).catch((e: Error) => { throw new NotFoundException(e.message) })
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    if (!(await this.rules.remove(req.user.id, id))) throw new NotFoundException('Rule not found')
    return { ok: true }
  }

  /** Dry-run: evaluates a sample action against saved rules (or a draft rule) without executing anything. */
  @Post('test')
  test(@Req() req: any, @Body() dto: TestRuleDto) {
    const now = new Date().toISOString()
    const inline: PolicyRule[] | undefined = dto.draftRule
      ? [{ id: 'draft', name: dto.draftRule.name, enabled: true, effect: dto.draftRule.effect, priority: 0, match: (dto.draftRule.match ?? {}) as any, createdAt: now, updatedAt: now }]
      : undefined
    return this.rules.dryRun(req.user.id, {
      toolName: dto.toolName,
      input: dto.input ?? {},
      scope: dto.scope,
      riskScore: dto.riskScore,
      estimatedCostUsd: dto.estimatedCostUsd,
    }, inline)
  }

  @Get('log')
  log(@Req() req: any, @Query('limit') limit?: string) {
    return this.rules.evaluationLog(req.user.id, Number.parseInt(limit ?? '50', 10) || 50)
  }
}

class NoteDto {
  @IsString() @MaxLength(120) action!: string
  @IsOptional() @IsString() @MaxLength(240) resource?: string
  @IsOptional() @IsObject() data?: Record<string, unknown>
}

@ApiTags('governance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit-ledger')
export class AuditLedgerController {
  constructor(private readonly ledger: AuditLedgerService) {}

  @Get()
  list(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.ledger.list(req.user.id, Number.parseInt(limit ?? '100', 10) || 100, Math.max(0, Number.parseInt(offset ?? '0', 10) || 0))
  }

  @Get('verify')
  verify(@Req() req: any) {
    return this.ledger.verify(req.user.id)
  }

  @Get('export')
  export(@Req() req: any) {
    return this.ledger.export(req.user.id)
  }

  /** Manually append a user note to the chain. */
  @Post('entries')
  append(@Req() req: any, @Body() dto: NoteDto) {
    return this.ledger.append(req.user.id, dto.action, dto.resource ?? 'note', dto.data ?? {}, 'user')
  }

  /** Tamper-detection demo on an in-memory copy; never alters the stored ledger. */
  @Post('tamper-demo')
  tamperDemo(@Req() req: any) {
    return this.ledger.tamperDemo(req.user.id)
  }
}

class ScanDto {
  @IsString() @MaxLength(100000) text!: string
  @IsOptional() @IsString() @MaxLength(160) source?: string
  @IsOptional() @IsInt() @Min(1) @Max(100) threshold?: number
}

@ApiTags('governance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('injection-firewall')
export class InjectionFirewallController {
  constructor(private readonly firewall: InjectionFirewallService) {}

  @Post('scan')
  scan(@Req() req: any, @Body() dto: ScanDto) {
    return this.firewall.inspect(req.user.id, dto.text, dto.source?.trim() || 'manual-scan', { threshold: dto.threshold })
  }

  @Get('detections')
  detections(@Req() req: any, @Query('limit') limit?: string) {
    return this.firewall.recent(req.user.id, Number.parseInt(limit ?? '50', 10) || 50)
  }
}
