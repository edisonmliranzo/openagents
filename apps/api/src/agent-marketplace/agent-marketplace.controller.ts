import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { AgentMarketplaceService } from './agent-marketplace.service'

class ManifestDto {
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(64, { each: true })
  tools?: string[]

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(253, { each: true })
  networkDomains?: string[]

  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(40, { each: true })
  dataScopes?: string[]
}

class DefinitionDto {
  @IsOptional() @IsString() @MaxLength(8000)
  systemPrompt?: string

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(500, { each: true })
  steps?: string[]
}

class PublishListingDto {
  @IsOptional() @IsIn(['agent', 'workflow'])
  kind?: 'agent' | 'workflow'

  @IsString() @MinLength(2) @MaxLength(80)
  title!: string

  @IsString() @MinLength(2) @MaxLength(1000)
  description!: string

  @IsOptional() @IsString() @MaxLength(32)
  version?: string

  @IsOptional() @IsInt() @Min(0) @Max(10_000_000)
  priceCents?: number

  @IsOptional() @IsString() @MaxLength(3)
  currency?: string

  @IsOptional() @ValidateNested() @Type(() => ManifestDto)
  manifest?: ManifestDto

  @IsOptional() @ValidateNested() @Type(() => DefinitionDto)
  definition?: DefinitionDto
}

class UpdateListingDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80)
  title?: string

  @IsOptional() @IsString() @MinLength(2) @MaxLength(1000)
  description?: string

  @IsOptional() @IsString() @MaxLength(32)
  version?: string

  @IsOptional() @IsInt() @Min(0) @Max(10_000_000)
  priceCents?: number

  @IsOptional() @ValidateNested() @Type(() => ManifestDto)
  manifest?: ManifestDto

  @IsOptional() @ValidateNested() @Type(() => DefinitionDto)
  definition?: DefinitionDto

  @IsOptional() @IsIn(['published', 'unlisted'])
  status?: 'published' | 'unlisted'
}

class InstallDto {
  /** Hash of the manifest the user was shown; proves the consent screen matched the current manifest. */
  @IsString() @MinLength(64) @MaxLength(64)
  manifestHash!: string

  @IsOptional() @ValidateNested() @Type(() => ManifestDto)
  grant?: ManifestDto

  @IsOptional() @IsIn(['test_card', 'test_decline'])
  paymentMethod?: string
}

class AuthorizeDto {
  @IsOptional() @IsString() @MaxLength(64)
  tool?: string

  @IsOptional() @IsString() @MaxLength(40)
  scope?: string

  @IsOptional() @IsString() @MaxLength(2000)
  url?: string
}

@ApiTags('agent-marketplace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agent-marketplace')
export class AgentMarketplaceController {
  constructor(private readonly svc: AgentMarketplaceService) {}

  @Get('info')
  info() {
    return this.svc.info()
  }

  @Get('listings')
  browse(@Req() req: any, @Query('q') q?: string) {
    return this.svc.browse(req.user.id, q?.slice(0, 100))
  }

  @Get('listings/mine')
  mine(@Req() req: any) {
    return this.svc.mine(req.user.id)
  }

  @Get('listings/:id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.svc.get(req.user.id, id)
  }

  @Post('listings')
  publish(@Req() req: any, @Body() dto: PublishListingDto) {
    return this.svc.publish(req.user.id, dto)
  }

  @Patch('listings/:id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateListingDto) {
    return this.svc.update(req.user.id, id, dto)
  }

  @Post('listings/:id/install')
  install(@Req() req: any, @Param('id') id: string, @Body() dto: InstallDto) {
    return this.svc.install(req.user.id, id, dto)
  }

  @Delete('installs/:id')
  uninstall(@Req() req: any, @Param('id') id: string) {
    return this.svc.uninstall(req.user.id, id)
  }

  @Get('installs')
  installs(@Req() req: any) {
    return this.svc.installs(req.user.id)
  }

  @Post('installs/:id/authorize')
  authorize(@Req() req: any, @Param('id') id: string, @Body() dto: AuthorizeDto) {
    return this.svc.authorize(req.user.id, id, dto)
  }

  @Get('earnings')
  earnings(@Req() req: any) {
    return this.svc.earnings(req.user.id)
  }

  @Post('payouts')
  payout(@Req() req: any) {
    return this.svc.requestPayout(req.user.id)
  }
}
