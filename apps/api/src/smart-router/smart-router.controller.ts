import { Body, Controller, Get, Post, Put, Query, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator'
import { SmartRouterService } from './smart-router.service'

class RungDto {
  @IsString() @MaxLength(40) provider!: string
  @IsString() @MaxLength(120) model!: string
}

class ChecksDto {
  @IsOptional() @IsBoolean() refusal?: boolean
  @IsOptional() @IsBoolean() malformed?: boolean
  @IsOptional() @IsBoolean() lowConfidence?: boolean
}

class PolicyDto {
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => RungDto) ladder?: RungDto[]
  @IsOptional() @IsInt() @Min(0) @Max(100) minConfidence?: number
  @IsOptional() @IsInt() @Min(0) @Max(4) maxEscalations?: number
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ChecksDto) checks?: ChecksDto
  @IsOptional() @IsInt() @Min(0) @Max(100) standardAt?: number
  @IsOptional() @IsInt() @Min(0) @Max(100) complexAt?: number
}

class PreviewDto {
  @IsString() @MaxLength(8000) prompt!: string
  @IsOptional() @IsNumber() @Min(0) @Max(200) toolCount?: number
}

class RunDto {
  @IsString() @MaxLength(8000) prompt!: string
  @IsOptional() @IsString() @MaxLength(2000) system?: string
  @IsOptional() @IsBoolean() expectJson?: boolean
}

@ApiTags('smart-router')
@ApiBearerAuth()
@Controller('smart-router')
export class SmartRouterController {
  constructor(private readonly router: SmartRouterService) {}

  @Get('policy')
  getPolicy(@Req() req: any) {
    return this.router.getPolicy(req.user.id)
  }

  @Put('policy')
  setPolicy(@Req() req: any, @Body() body: PolicyDto) {
    return this.router.setPolicy(req.user.id, body as any)
  }

  @Post('preview')
  preview(@Req() req: any, @Body() body: PreviewDto) {
    return this.router.preview(req.user.id, body.prompt, body.toolCount)
  }

  /** Execute with cheap-first routing + escalation, recording savings. */
  @Post('run')
  run(@Req() req: any, @Body() body: RunDto) {
    return this.router.run(req.user.id, body)
  }

  @Get('savings')
  savings(@Req() req: any, @Query('days') days?: string) {
    return this.router.savings(req.user.id, days ? parseInt(days, 10) : 30)
  }
}
