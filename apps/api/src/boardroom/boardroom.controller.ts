import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator'
import { BoardroomService } from './boardroom.service'

class AgentDto {
  @IsString() @MaxLength(40) name!: string
  @IsOptional() @IsString() @MaxLength(300) role?: string
}

class CriterionDto {
  @IsString() @MaxLength(40) name!: string
  @IsNumber() @Min(1) @Max(100) weight!: number
  @IsOptional() @IsString() @MaxLength(200) description?: string
}

class StartDto {
  @IsString() @MaxLength(4000) question!: string
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => AgentDto) agents?: AgentDto[]
  @IsOptional() @IsInt() @Min(1) @Max(3) rounds?: number
  @IsOptional() @IsArray() @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => CriterionDto) rubric?: CriterionDto[]
  /** "provider:model" for the specialists */
  @IsOptional() @IsString() @MaxLength(160) model?: string
  /** "provider:model" for the judge */
  @IsOptional() @IsString() @MaxLength(160) judgeModel?: string
  @IsOptional() @IsNumber() @Min(0.01) @Max(5) maxCostUsd?: number
}

@ApiTags('boardroom')
@ApiBearerAuth()
@Controller('boardroom')
export class BoardroomController {
  constructor(private readonly board: BoardroomService) {}

  @Get('defaults')
  defaults() { return this.board.defaults() }

  @Get('sessions')
  list(@Req() req: any) { return this.board.list(req.user.id) }

  /** Starts a capped session in the background; poll GET sessions/:id. */
  @Post('sessions')
  start(@Req() req: any, @Body() body: StartDto) { return this.board.start(req.user.id, body as any) }

  @Get('sessions/:id')
  get(@Req() req: any, @Param('id') id: string) { return this.board.get(req.user.id, id) }

  @Delete('sessions/:id')
  remove(@Req() req: any, @Param('id') id: string) { return this.board.remove(req.user.id, id) }
}
