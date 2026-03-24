import {
  Body,
  Controller,
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
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'
import type { CreateArtifactInput, CreateArtifactTemplateInput, CreateArtifactVersionInput } from '@openagents/shared'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ArtifactsService } from './artifacts.service'

class ArtifactSourceDto {
  @IsOptional()
  @IsString()
  conversationId?: string

  @IsOptional()
  @IsString()
  workflowId?: string

  @IsOptional()
  @IsString()
  presetId?: string

  @IsOptional()
  @IsString()
  packId?: string
}

class CreateArtifactDto implements CreateArtifactInput {
  @IsOptional()
  @IsString()
  workspaceId?: string

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string

  @IsString()
  type!: CreateArtifactInput['type']

  @IsOptional()
  @IsString()
  status?: CreateArtifactInput['status']

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[]

  @IsOptional()
  @IsString()
  format?: string

  @IsOptional()
  @IsString()
  content?: string

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>

  @IsOptional()
  @IsObject()
  source?: ArtifactSourceDto
}

class CreateArtifactVersionDto implements CreateArtifactVersionInput {
  @IsOptional()
  @IsString()
  format?: string

  @IsString()
  content!: string

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

class CreateArtifactTemplateDto implements CreateArtifactTemplateInput {
  @IsOptional()
  @IsString()
  workspaceId?: string

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsString()
  type!: CreateArtifactTemplateInput['type']

  @IsOptional()
  @IsString()
  defaultFormat?: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  outline?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  promptGuide?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fieldSchema?: string[]
}

@ApiTags('artifacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('artifacts')
export class ArtifactsController {
  constructor(private readonly artifacts: ArtifactsService) {}

  @Get()
  list(@Req() req: any) {
    return this.artifacts.list(req.user.id)
  }

  @Get('templates')
  listTemplates(@Req() req: any) {
    return this.artifacts.listTemplates(req.user.id)
  }

  @Post('templates')
  createTemplate(@Req() req: any, @Body() dto: CreateArtifactTemplateDto) {
    return this.artifacts.createTemplate(req.user.id, dto)
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.artifacts.get(req.user.id, id)
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateArtifactDto) {
    return this.artifacts.create(req.user.id, dto)
  }

  @Post(':id/versions')
  addVersion(@Req() req: any, @Param('id') id: string, @Body() dto: CreateArtifactVersionDto) {
    return this.artifacts.addVersion(req.user.id, id, dto)
  }

  @Post(':id/export')
  exportArtifact(@Req() req: any, @Param('id') id: string, @Query('format') format?: string) {
    return this.artifacts.exportArtifact(req.user.id, id, format)
  }
}
