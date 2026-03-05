import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'
import type {
  InstallSkillVersionInput,
  PinSkillVersionInput,
  PublishSkillVersionInput,
  RollbackSkillVersionInput,
} from '@openagents/shared'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { SkillRegistryService } from './skill-registry.service'

class SkillManifestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id!: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string

  @IsString()
  @MinLength(1)
  @MaxLength(280)
  description!: string

  @IsArray()
  @IsString({ each: true })
  tools!: string[]

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  promptAppendix?: string
}

class SkillCompatibilityDto {
  @IsOptional()
  @IsString()
  minApiVersion?: string

  @IsOptional()
  @IsString()
  maxApiVersion?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredTools?: string[]
}

class PublishSkillVersionDto implements PublishSkillVersionInput {
  @ValidateNested()
  @Type(() => SkillManifestDto)
  skill!: SkillManifestDto

  @IsString()
  @MinLength(1)
  version!: string

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  changelog!: string

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SkillCompatibilityDto)
  compatibility?: SkillCompatibilityDto
}

class InstallSkillVersionDto implements InstallSkillVersionInput {
  @IsOptional()
  @IsString()
  version?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  agentId?: string
}

class RollbackSkillVersionDto implements RollbackSkillVersionInput {
  @IsOptional()
  @IsString()
  targetVersion?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  agentId?: string
}

class PinSkillVersionDto implements PinSkillVersionInput {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  agentId!: string

  @IsString()
  @MinLength(1)
  version!: string
}

@ApiTags('skill-registry')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('skill-registry')
export class SkillRegistryController {
  constructor(private readonly registry: SkillRegistryService) {}

  @Get()
  list(@Req() req: any) {
    return this.registry.list(req.user.id)
  }

  @Get(':skillId')
  get(@Req() req: any, @Param('skillId') skillId: string) {
    return this.registry.get(req.user.id, skillId)
  }

  @Post('publish')
  publish(@Req() req: any, @Body() dto: PublishSkillVersionDto) {
    return this.registry.publish(req.user.id, dto)
  }

  @Post(':skillId/install')
  install(@Req() req: any, @Param('skillId') skillId: string, @Body() dto: InstallSkillVersionDto) {
    return this.registry.install(req.user.id, skillId, dto)
  }

  @Post(':skillId/rollback')
  rollback(@Req() req: any, @Param('skillId') skillId: string, @Body() dto: RollbackSkillVersionDto) {
    return this.registry.rollback(req.user.id, skillId, dto)
  }

  @Post(':skillId/pin')
  pin(@Req() req: any, @Param('skillId') skillId: string, @Body() dto: PinSkillVersionDto) {
    return this.registry.pin(req.user.id, skillId, dto)
  }
}
