import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import type { PolicyEvaluationInput, PolicyScope, PolicySensitivity } from '@openagents/shared'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { PolicyService } from './policy.service'

const POLICY_SCOPES: PolicyScope[] = ['local', 'external_read', 'external_write', 'system_mutation']
const POLICY_SENSITIVITIES: PolicySensitivity[] = ['public', 'internal', 'confidential', 'restricted']

class EvaluatePolicyDto implements PolicyEvaluationInput {
  @IsString()
  @MaxLength(500)
  action!: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  toolName?: string

  @IsOptional()
  @IsIn(POLICY_SCOPES)
  scope?: PolicyScope

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCostUsd?: number

  @IsOptional()
  @IsIn(POLICY_SENSITIVITIES)
  sensitivity?: PolicySensitivity

  @IsOptional()
  @IsBoolean()
  reversible?: boolean

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('policy')
export class PolicyController {
  constructor(private readonly policy: PolicyService) {}

  @Post('evaluate')
  evaluate(@Body() dto: EvaluatePolicyDto) {
    return this.policy.evaluate(dto)
  }
}
