import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import {
  IsArray,
  IsInt,
  IsObject,
  Min,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'
import type { CreatePackInput, PackPolicyTemplate } from '@openagents/shared'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { PacksService } from './packs.service'
import { MarketplaceService } from '../billing/marketplace.service'

class SetPriceDto {
  @IsInt()
  @Min(0)
  amountCents!: number

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string
}

class PackPolicyDto implements PackPolicyTemplate {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id!: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string

  @IsString()
  defaultDecision!: 'auto' | 'confirm' | 'block'

  @IsArray()
  @IsString({ each: true })
  approvalScopes!: Array<'local' | 'external_read' | 'external_write' | 'system_mutation'>

  @IsArray()
  @IsString({ each: true })
  blockedTools!: string[]

  @IsArray()
  @IsString({ each: true })
  requireApprovalTools!: string[]
}

class CreatePackDto implements CreatePackInput {
  @IsOptional()
  @IsString()
  workspaceId?: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  version?: string

  @IsOptional()
  @IsString()
  visibility?: 'private' | 'workspace' | 'public'

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillIds?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  presetIds?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  workflowIds?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  artifactTemplateIds?: string[]

  @IsOptional()
  @IsArray()
  policies?: PackPolicyDto[]
}

@ApiTags('packs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('packs')
export class PacksController {
  constructor(
    private readonly packs: PacksService,
    private readonly marketplace: MarketplaceService,
  ) {}

  @Get()
  listMine(@Req() req: any) {
    return this.packs.listMine(req.user.id)
  }

  @Get('public')
  listPublic(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('tag') tag?: string,
    @Query('limit') limit?: string,
  ) {
    return this.packs.listPublic(req.user.id, {
      q,
      tag,
      limit: typeof limit === 'string' ? Number.parseInt(limit, 10) : undefined,
    })
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.packs.get(req.user.id, id)
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreatePackDto) {
    return this.packs.create(req.user.id, dto)
  }

  @Post(':id/preview')
  preview(@Req() req: any, @Param('id') id: string) {
    return this.packs.previewInstall(req.user.id, id)
  }

  @Get(':id/access')
  access(@Req() req: any, @Param('id') id: string) {
    return this.marketplace.access(req.user.id, 'pack', id)
  }

  /** Set an optional one-time price (cents; 0 = free). Pack owner only. */
  @Post(':id/price')
  async setPrice(@Req() req: any, @Param('id') id: string, @Body() dto: SetPriceDto) {
    const pack = await this.packs.get(req.user.id, id)
    if ((pack as any).userId !== req.user.id) throw new ForbiddenException('Only the pack owner can set a price.')
    return this.marketplace.setPrice(req.user.id, 'pack', id, dto.amountCents, dto.currency, pack.name)
  }

  @Post(':id/install')
  async install(@Req() req: any, @Param('id') id: string) {
    await this.marketplace.assertCanInstall(req.user.id, 'pack', id)
    return this.packs.install(req.user.id, id)
  }
}
