import { IsArray, IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator'
import type { ImageAspectRatio, ImageProvider, ImageSourceAsset, ImageWorkflowIntent } from './image-workflow.types'

export class CreateImageWorkflowDto {
  @IsString()
  prompt!: string

  @IsOptional()
  @IsIn(['1:1', '16:9', '9:16', '4:5', '3:2', '2:3', '21:9'])
  aspectRatio?: ImageAspectRatio

  @IsOptional()
  @IsString()
  style?: string

  @IsOptional()
  @IsIn(['text_to_image', 'image_edit', 'product_photo', 'thumbnail', 'poster', 'logo', 'brand_asset'])
  intent?: ImageWorkflowIntent

  @IsOptional()
  @IsIn(['openai', 'ideogram', 'flux', 'stability', 'atlascloud', 'midjourney', 'custom_api'])
  provider?: ImageProvider

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  variantCount?: number

  @IsOptional()
  @IsString()
  productName?: string

  @IsOptional()
  @IsString()
  brandName?: string

  @IsOptional()
  @IsString()
  targetPlatform?: string

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  assets?: ImageSourceAsset[]

  @IsOptional()
  @IsBoolean()
  upscale?: boolean
}
