import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested, ArrayMaxSize } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { SkillMiningService } from './skill-mining.service'

class StepDto {
  @IsString() @MinLength(1) @MaxLength(120) tool!: string
  @IsString() @MaxLength(400) description!: string
}
class InputDto {
  @IsString() @MinLength(1) @MaxLength(40) name!: string
  @IsIn(['string']) type!: 'string'
  @IsString() @MaxLength(200) description!: string
}
class EditProposalDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(280) description?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) skillId?: string
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => StepDto) steps?: StepDto[]
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => InputDto) inputs?: InputDto[]
}

const uid = (req: any): string => req.user?.id ?? req.user?.sub

@ApiTags('skill-proposals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('skill-proposals')
export class SkillMiningController {
  constructor(private readonly mining: SkillMiningService) {}

  @Get() list(@Req() req: any, @Query('status') status?: string) { return this.mining.list(uid(req), status) }
  @Post('mine') mine(@Req() req: any) { return this.mining.mine(uid(req)) }
  @Get(':id') get(@Req() req: any, @Param('id') id: string) { return this.mining.get(uid(req), id) }
  @Patch(':id') edit(@Req() req: any, @Param('id') id: string, @Body() dto: EditProposalDto) { return this.mining.edit(uid(req), id, dto) }
  @Post(':id/approve') approve(@Req() req: any, @Param('id') id: string, @Body() dto: EditProposalDto) { return this.mining.approve(uid(req), id, dto) }
  @Post(':id/reject') reject(@Req() req: any, @Param('id') id: string) { return this.mining.reject(uid(req), id) }
  @Delete(':id') remove(@Req() req: any, @Param('id') id: string) { return this.mining.remove(uid(req), id) }
}
