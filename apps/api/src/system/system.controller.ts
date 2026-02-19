import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { SystemService } from './system.service'

class OllamaBenchmarkDto {
  @IsString()
  @IsOptional()
  baseUrl?: string

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  models?: string[]

  @IsInt()
  @Min(1)
  @Max(3)
  @Type(() => Number)
  @IsOptional()
  rounds?: number
}

@ApiTags('system')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('system')
export class SystemController {
  constructor(private system: SystemService) {}

  @Get('usage')
  usage() {
    return this.system.usage()
  }

  @Get('costs')
  costs(@Req() req: any, @Query('start') start?: string, @Query('end') end?: string) {
    return this.system.costs(req.user.id, start, end)
  }

  @Post('ollama-benchmark')
  benchmarkOllama(@Body() dto: OllamaBenchmarkDto) {
    return this.system.benchmarkOllama(dto.baseUrl, dto.models, dto.rounds)
  }
}
