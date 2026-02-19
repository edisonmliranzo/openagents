import { Controller, Post, Body, UseGuards, Req, Get, Query } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { IsString, IsOptional } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { LLMService } from './llm.service'
import { UsersService } from '../users/users.service'
import type { LLMProvider } from '@openagents/shared'

class TestLlmDto {
  @IsString() provider: string
  @IsString() @IsOptional() apiKey?: string
  @IsString() @IsOptional() baseUrl?: string
  @IsString() @IsOptional() model?: string
}

@ApiTags('agent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agent')
export class AgentController {
  constructor(
    private llm: LLMService,
    private users: UsersService,
  ) {}

  @Get('ollama-models')
  async listOllamaModels(@Req() req: any, @Query('baseUrl') baseUrl?: string) {
    let resolvedBaseUrl = baseUrl?.trim()

    if (!resolvedBaseUrl) {
      const stored = await this.users.getRawLlmKey(req.user.id, 'ollama')
      if (stored?.isActive && stored.baseUrl) {
        resolvedBaseUrl = stored.baseUrl
      }
    }

    const models = await this.llm.listOllamaModels(resolvedBaseUrl)
    return { models }
  }

  @Post('test-llm')
  async testLlm(@Body() dto: TestLlmDto, @Req() req: any) {
    let apiKey = dto.apiKey
    let baseUrl = dto.baseUrl

    // If no key provided in the request, fall back to the user's stored key
    if (!apiKey && !baseUrl) {
      const stored = await this.users.getRawLlmKey(req.user.id, dto.provider)
      if (stored?.isActive) {
        apiKey = stored.apiKey ?? undefined
        baseUrl = stored.baseUrl ?? undefined
      }
    }

    return this.llm.testConnection(dto.provider as LLMProvider, apiKey, baseUrl, dto.model)
  }
}
