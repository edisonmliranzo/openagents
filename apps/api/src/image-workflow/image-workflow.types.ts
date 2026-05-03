export type ImageWorkflowIntent =
  | 'text_to_image'
  | 'image_edit'
  | 'product_photo'
  | 'thumbnail'
  | 'poster'
  | 'logo'
  | 'brand_asset'
  | 'unknown'

export type ImageProvider =
  | 'openai'
  | 'ideogram'
  | 'flux'
  | 'stability'
  | 'atlascloud'
  | 'midjourney'
  | 'custom_api'

export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:5' | '3:2' | '2:3' | '21:9'

export interface ImageSourceAsset {
  id?: string
  type: 'image' | 'logo' | 'product' | 'reference' | 'style_reference'
  url?: string
  filename?: string
  description?: string
}

export interface ImageVariant {
  variantNumber: number
  prompt: string
  negativePrompt: string
  style: string
  provider: ImageProvider
  aspectRatio: ImageAspectRatio
  width: number
  height: number
}

export interface ImageEnhancementStep {
  order: number
  name: string
  action: 'upscale' | 'background_remove' | 'enhance' | 'relight' | 'extend' | 'inpaint'
  provider: ImageProvider
  input: Record<string, unknown>
  outputKey: string
}

export interface ImageWorkflowPlan {
  intent: ImageWorkflowIntent
  title: string
  summary: string
  aspectRatio: ImageAspectRatio
  style: string
  mainPrompt: string
  negativePrompt: string
  provider: ImageProvider
  variantCount: number
  variants: ImageVariant[]
  sourceAssets: ImageSourceAsset[]
  enhancementSteps: ImageEnhancementStep[]
  finalDeliverables: string[]
  safetyNotes: string[]
  missingInputs: string[]
}
