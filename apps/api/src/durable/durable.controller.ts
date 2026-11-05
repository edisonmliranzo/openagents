import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { DurableService } from './durable.service'

const uid = (req: any): string => req.user?.id ?? req.user?.sub

class DurableStepDto {
  @IsIn(['tool', 'llm', 'delay', 'note'])
  kind!: 'tool' | 'llm' | 'delay' | 'note'

  @IsOptional() @IsString() @MaxLength(120)
  name?: string

  @IsOptional() @IsString() @MaxLength(120)
  tool?: string

  @IsOptional() @IsObject()
  input?: Record<string, unknown>

  @IsOptional() @IsString() @MaxLength(4000)
  instruction?: string

  @IsOptional() @IsInt() @Min(0) @Max(600_000)
  delayMs?: number
}

class CreateDurableRunDto {
  @IsString() @MaxLength(160)
  title!: string

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => DurableStepDto)
  steps!: DurableStepDto[]

  @IsOptional() @IsInt() @Min(1) @Max(8)
  maxAttempts?: number

  @IsOptional() @IsInt() @Min(100) @Max(60_000)
  backoffMs?: number

  @IsOptional() @IsBoolean()
  autoStart?: boolean
}

@ApiTags('durable')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('durable')
export class DurableController {
  constructor(private readonly durable: DurableService) {}

  @Get('runs')
  list(@Req() req: any) {
    return this.durable.list(uid(req))
  }

  @Post('runs')
  create(@Req() req: any, @Body() dto: CreateDurableRunDto) {
    return this.durable.create(uid(req), dto)
  }

  @Get('runs/:id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.durable.get(uid(req), id)
  }

  @Post('runs/:id/pause')
  pause(@Req() req: any, @Param('id') id: string) {
    return this.durable.pause(uid(req), id)
  }

  @Post('runs/:id/resume')
  resume(@Req() req: any, @Param('id') id: string) {
    return this.durable.resume(uid(req), id)
  }

  @Post('runs/:id/cancel')
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.durable.cancel(uid(req), id)
  }

  @Delete('runs/:id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.durable.remove(uid(req), id)
  }
}
