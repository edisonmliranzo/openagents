import { Controller, Get, Put, Delete, Param, Body, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { IsString, IsOptional, IsBoolean } from 'class-validator'
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
}

class UpsertLlmKeyDto {
  @IsString() @IsOptional() apiKey?: string
  @IsString() @IsOptional() baseUrl?: string
  @IsBoolean() @IsOptional() isActive?: boolean
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
}
