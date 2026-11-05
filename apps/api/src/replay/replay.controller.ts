import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ReplayService } from './replay.service'
import { ReplayForkService } from './replay-fork.service'

const uid = (req: any): string => req.user?.id ?? req.user?.sub

class ForkRunDto {
  @IsInt() @Min(0)
  stepIndex!: number

  @IsOptional() @IsString() @MaxLength(200)
  model?: string

  @IsOptional() @IsString() @MaxLength(60)
  modelProvider?: string

  @IsOptional() @IsString() @MaxLength(4000)
  instructions?: string

  @IsOptional() @IsString() @MaxLength(160)
  title?: string
}

@ApiTags('replay')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('replay')
export class ReplayController {
  constructor(
    private readonly replay: ReplayService,
    private readonly forks: ReplayForkService,
  ) {}

  @Get('runs')
  runs(@Req() req: any, @Query('limit') limit?: string, @Query('conversationId') conversationId?: string) {
    return this.replay.listRuns(uid(req), limit ? Number(limit) || 50 : 50, conversationId || undefined)
  }

  @Get('runs/:id')
  run(@Req() req: any, @Param('id') id: string) {
    return this.replay.getRun(uid(req), id)
  }

  @Get('runs/:id/timeline')
  timeline(@Req() req: any, @Param('id') id: string) {
    return this.forks.timeline(uid(req), id)
  }

  @Get('runs/:id/steps/:index')
  step(@Req() req: any, @Param('id') id: string, @Param('index', ParseIntPipe) index: number) {
    return this.forks.step(uid(req), id, index)
  }

  @Post('runs/:id/fork')
  fork(@Req() req: any, @Param('id') id: string, @Body() dto: ForkRunDto) {
    return this.forks.fork(uid(req), id, dto)
  }

  @Get('forks')
  listForks(@Req() req: any, @Query('runId') runId?: string) {
    return this.forks.list(uid(req), runId || undefined)
  }

  @Get('forks/:id')
  forkDetail(@Req() req: any, @Param('id') id: string) {
    return this.forks.detail(uid(req), id)
  }

  @Get('forks/:id/diff')
  forkDiff(@Req() req: any, @Param('id') id: string) {
    return this.forks.diff(uid(req), id)
  }
}
