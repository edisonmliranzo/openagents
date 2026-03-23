import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger'
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator'
import { ToolsService } from './tools.service'

class ProcessToolRunDto {
  @IsString()
  @IsNotEmpty()
  userId!: string

  @IsString()
  @IsNotEmpty()
  toolName!: string

  @IsOptional()
  @IsString()
  conversationId?: string

  @IsObject()
  toolInput!: Record<string, unknown>
}

@ApiTags('tools')
@Controller('tools/internal')
export class ToolsInternalController {
  constructor(private readonly tools: ToolsService) {}

  @ApiExcludeEndpoint()
  @Post('process')
  process(
    @Body() dto: ProcessToolRunDto,
    @Headers('x-tool-run-worker-token') token?: string,
  ) {
    this.assertWorkerToken(token)
    return this.tools.execute(dto.toolName, dto.toolInput, dto.userId)
  }

  private assertWorkerToken(token?: string) {
    const expected = (process.env.TOOL_RUN_WORKER_TOKEN ?? '').trim()
    if (!expected) return
    const actual = (token ?? '').trim()
    if (actual !== expected) {
      throw new UnauthorizedException('Invalid tool-run worker token')
    }
  }
}
