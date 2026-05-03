import { IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator'
import type { VideoAspectRatio, VideoSourceAsset } from './video-workflow.types'

export class CreateVideoWorkflowDto {
  @IsString()
  prompt!: string

  @IsOptional()
  @IsIn(['9:16', '16:9', '1:1', '4:5', '21:9'])
  aspectRatio?: VideoAspectRatio

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(600)
  durationSeconds?: number

  @IsOptional()
  @IsIn(['tiktok', 'youtube_shorts', 'instagram_reels', 'youtube', 'ads', 'general'])
  targetPlatform?: 'tiktok' | 'youtube_shorts' | 'instagram_reels' | 'youtube' | 'ads' | 'general'

  @IsOptional()
  @IsString()
  style?: string

  @IsOptional()
  @IsString()
  language?: string

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  assets?: VideoSourceAsset[]

  @IsOptional()
  @IsString()
  productName?: string

  @IsOptional()
  @IsString()
  productDescription?: string

  @IsOptional()
  @IsString()
  callToAction?: string
}
