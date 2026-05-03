import { IsArray, IsIn, IsObject, IsOptional, IsString } from 'class-validator'
import type { AgentIntent, UploadedFile } from './master-agent.types'

const VALID_INTENTS: AgentIntent[] = [
  'coding', 'video_generation', 'image_generation', 'voiceover', 'music_generation',
  'content_creation', 'research', 'business_strategy', 'app_builder', 'website_builder',
  'ecommerce', 'customer_support', 'automation', 'social_media', 'document_creation',
  'email', 'calendar', 'trading', 'unknown',
]

export class RouteRequestDto {
  @IsString()
  message!: string

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  uploadedFiles?: UploadedFile[]

  @IsOptional()
  @IsString()
  context?: string

  @IsOptional()
  @IsIn(VALID_INTENTS)
  previousIntent?: AgentIntent
}

export class DetectIntentDto {
  @IsString()
  message!: string

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  uploadedFiles?: UploadedFile[]
}
