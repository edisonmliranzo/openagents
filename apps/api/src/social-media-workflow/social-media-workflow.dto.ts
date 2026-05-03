import { IsArray, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'
import type { SocialPlatform } from './social-media-workflow.types'

export class CreateSocialMediaWorkflowDto {
  @IsString()
  niche!: string

  @IsOptional()
  @IsString()
  brand?: string

  @IsOptional()
  @IsArray()
  @IsIn(['tiktok', 'instagram', 'youtube', 'twitter', 'linkedin', 'facebook', 'threads'], { each: true })
  platforms?: SocialPlatform[]

  @IsOptional()
  @IsNumber()
  @Min(7)
  @Max(90)
  totalDays?: number

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  postsPerDay?: number

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pillars?: string[]

  @IsOptional()
  @IsString()
  productName?: string

  @IsOptional()
  @IsString()
  callToAction?: string

  @IsOptional()
  @IsString()
  language?: string

  @IsOptional()
  @IsString()
  targetAudience?: string
}
