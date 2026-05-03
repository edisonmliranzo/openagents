import { IsArray, IsIn, IsNumber, IsOptional, IsString } from 'class-validator'
import type { UGCAdDuration, UGCAdIntent } from './ugc-ad-workflow.types'

export class CreateUGCAdWorkflowDto {
  @IsOptional()
  @IsString()
  prompt?: string

  @IsString()
  productName!: string

  @IsOptional()
  @IsString()
  productDescription?: string

  @IsOptional()
  @IsString()
  targetAudience?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  uniqueSellingPoints?: string[]

  @IsOptional()
  @IsString()
  callToAction?: string

  @IsOptional()
  @IsIn(['tiktok_shop', 'instagram_reels', 'youtube_shorts', 'meta_ads'])
  platform?: 'tiktok_shop' | 'instagram_reels' | 'youtube_shorts' | 'meta_ads'

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  durations?: UGCAdDuration[]

  @IsOptional()
  @IsString()
  creatorStyle?: string

  @IsOptional()
  @IsIn(['English', 'Spanish', 'Portuguese', 'French'])
  language?: string

  @IsOptional()
  @IsIn(['product_ugc_script', 'ugc_video_prompt', 'tiktok_shop_ad', 'affiliate_product_video', 'bof_conversion_ad'])
  intent?: UGCAdIntent
}
