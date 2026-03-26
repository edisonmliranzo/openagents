import { Controller, Get, Put, Post, Patch, Delete, Param, Body, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { IsString, IsOptional, IsBoolean, IsIn } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { UsersService } from './users.service'

class UpdateProfileDto {
  @IsString() @IsOptional() name?: string
  @IsString() @IsOptional() avatarUrl?: string
}

class UpdateSettingsDto {
  @IsString() @IsOptional() preferredProvider?: string
  @IsString() @IsOptional() preferredModel?: string
  @IsString() @IsOptional() customSystemPrompt?: string
  @IsString() @IsOptional() lastActiveConversationId?: string
  @IsBoolean() @IsOptional() beginnerMode?: boolean
  @IsString() @IsOptional() onboardingCompletedAt?: string
}

class UpsertLlmKeyDto {
  @IsString() @IsOptional() apiKey?: string
  @IsString() @IsOptional() baseUrl?: string
  @IsString() @IsOptional() loginEmail?: string
  @IsString() @IsOptional() loginPassword?: string
  @IsString() @IsOptional() subscriptionPlan?: string
  @IsBoolean() @IsOptional() isActive?: boolean
}

class AddFallbackLlmKeyDto {
  @IsString() apiKey!: string
  @IsString() @IsOptional() label?: string
}

class CreateUserDomainDto {
  @IsString() domain!: string
  @IsString() @IsOptional() @IsIn(['manual', 'cloudflare', 'caddy', 'nginx']) provider?: string
  @IsString() @IsOptional() @IsIn(['pending', 'active', 'error']) status?: string
  @IsString() @IsOptional() targetHost?: string
  @IsString() @IsOptional() proxyInstructions?: string
}

class UpdateUserDomainDto {
  @IsString() @IsOptional() @IsIn(['manual', 'cloudflare', 'caddy', 'nginx']) provider?: string
  @IsString() @IsOptional() @IsIn(['pending', 'active', 'error']) status?: string
  @IsString() @IsOptional() targetHost?: string
  @IsString() @IsOptional() proxyInstructions?: string
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  getProfile(@Req() req: any) {
    return this.users.getProfile(req.user.id)
  }

  @Put('me')
  updateProfile(@Body() dto: UpdateProfileDto, @Req() req: any) {
    return this.users.updateProfile(req.user.id, dto)
  }

  @Get('me/settings')
  getSettings(@Req() req: any) {
    return this.users.getSettings(req.user.id)
  }

  @Put('me/settings')
  updateSettings(@Body() dto: UpdateSettingsDto, @Req() req: any) {
    return this.users.updateSettings(req.user.id, dto)
  }

  // ── LLM API Keys ──────────────────────────────────────────────────────────

  @Get('me/llm-keys')
  getLlmKeys(@Req() req: any) {
    return this.users.getLlmKeys(req.user.id)
  }

  @Put('me/llm-keys/:provider')
  upsertLlmKey(
    @Param('provider') provider: string,
    @Body() dto: UpsertLlmKeyDto,
    @Req() req: any,
  ) {
    return this.users.upsertLlmKey(req.user.id, provider, dto)
  }

  @Delete('me/llm-keys/:provider')
  deleteLlmKey(@Param('provider') provider: string, @Req() req: any) {
    return this.users.deleteLlmKey(req.user.id, provider)
  }

  // Fallback LLM keys (multi-key rotation / failover)
  @Get('me/llm-keys/:provider/fallbacks')
  listFallbackLlmKeys(@Param('provider') provider: string, @Req() req: any) {
    return this.users.listFallbackLlmKeys(req.user.id, provider)
  }

  @Post('me/llm-keys/:provider/fallbacks')
  addFallbackLlmKey(
    @Param('provider') provider: string,
    @Body() dto: AddFallbackLlmKeyDto,
    @Req() req: any,
  ) {
    return this.users.addFallbackLlmKey(req.user.id, provider, dto.apiKey, dto.label)
  }

  @Delete('me/llm-keys/:provider/fallbacks/:id')
  removeFallbackLlmKey(@Param('id') id: string, @Req() req: any) {
    return this.users.removeFallbackLlmKey(req.user.id, id)
  }

  // Domains
  @Get('me/domains')
  listDomains(@Req() req: any) {
    return this.users.listDomains(req.user.id)
  }

  @Post('me/domains')
  createDomain(@Body() dto: CreateUserDomainDto, @Req() req: any) {
    return this.users.createDomain(req.user.id, dto)
  }

  @Patch('me/domains/:id')
  updateDomain(@Param('id') id: string, @Body() dto: UpdateUserDomainDto, @Req() req: any) {
    return this.users.updateDomain(req.user.id, id, dto)
  }

  @Delete('me/domains/:id')
  deleteDomain(@Param('id') id: string, @Req() req: any) {
    return this.users.deleteDomain(req.user.id, id)
  }
}
