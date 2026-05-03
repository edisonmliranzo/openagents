import { Injectable } from '@nestjs/common'
import { CreateImageWorkflowDto } from './image-workflow.dto'
import { IMAGE_WORKFLOW_AGENT_SYSTEM_PROMPT } from './image-workflow.prompt'
import type {
  ImageAspectRatio,
  ImageEnhancementStep,
  ImageProvider,
  ImageVariant,
  ImageWorkflowIntent,
  ImageWorkflowPlan,
} from './image-workflow.types'

@Injectable()
export class ImageWorkflowService {
  createPlan(input: CreateImageWorkflowDto): ImageWorkflowPlan {
    const prompt = input.prompt.trim()
    const lower = prompt.toLowerCase()

    const intent = input.intent ?? this.detectIntent(lower, input)
    const aspectRatio = input.aspectRatio ?? this.defaultAspectRatio(intent, input.targetPlatform)
    const style = input.style ?? this.detectStyle(lower, intent)
    const provider = input.provider ?? this.pickProvider(lower, intent)
    const variantCount = input.variantCount ?? 4
    const { width, height } = this.dimensionsFromAspectRatio(aspectRatio)

    const mainPrompt = this.buildMainPrompt(prompt, intent, style, input)
    const negativePrompt = this.buildNegativePrompt(intent)

    const variants = this.buildVariants({
      mainPrompt,
      negativePrompt,
      style,
      provider,
      aspectRatio,
      width,
      height,
      variantCount,
      intent,
    })

    const enhancementSteps = this.buildEnhancementSteps(intent, input.upscale ?? true, provider)

    return {
      intent,
      title: this.buildTitle(intent, input.productName ?? input.brandName),
      summary: this.buildSummary(intent, style, aspectRatio, provider),
      aspectRatio,
      style,
      mainPrompt,
      negativePrompt,
      provider,
      variantCount,
      variants,
      sourceAssets: input.assets ?? [],
      enhancementSteps,
      finalDeliverables: this.buildDeliverables(intent, variantCount, aspectRatio),
      safetyNotes: [
        'Do not generate images of real people without consent.',
        'Review all AI-generated images before publishing.',
        'Upscale to at least 2x before final export.',
      ],
      missingInputs: this.findMissingInputs(intent, input),
    }
  }

  getSystemPrompt() {
    return {
      name: 'OpenAgents Image Workflow Agent',
      prompt: IMAGE_WORKFLOW_AGENT_SYSTEM_PROMPT,
    }
  }

  getCapabilities() {
    return {
      intents: ['text_to_image', 'image_edit', 'product_photo', 'thumbnail', 'poster', 'logo', 'brand_asset'],
      providers: ['openai', 'ideogram', 'flux', 'stability', 'atlascloud', 'midjourney'],
      aspectRatios: ['1:1', '16:9', '9:16', '4:5', '3:2', '2:3', '21:9'],
      enhancements: ['upscale', 'background_remove', 'enhance', 'relight', 'extend', 'inpaint'],
    }
  }

  private detectIntent(lower: string, input: CreateImageWorkflowDto): ImageWorkflowIntent {
    const hasAssets = (input.assets?.length ?? 0) > 0
    if (hasAssets && (lower.includes('edit') || lower.includes('change') || lower.includes('replace'))) return 'image_edit'
    if (lower.includes('product photo') || lower.includes('product image') || lower.includes('product shot')) return 'product_photo'
    if (lower.includes('thumbnail')) return 'thumbnail'
    if (lower.includes('poster') || lower.includes('banner') || lower.includes('flyer')) return 'poster'
    if (lower.includes('logo')) return 'logo'
    if (lower.includes('brand') || lower.includes('asset') || lower.includes('kit')) return 'brand_asset'
    return 'text_to_image'
  }

  private defaultAspectRatio(intent: ImageWorkflowIntent, platform?: string): ImageAspectRatio {
    if (intent === 'thumbnail') return '16:9'
    if (intent === 'logo') return '1:1'
    if (intent === 'poster') return '2:3'
    if (intent === 'product_photo') return '1:1'
    if (platform === 'tiktok' || platform === 'instagram_reels') return '9:16'
    if (platform === 'youtube') return '16:9'
    return '1:1'
  }

  private dimensionsFromAspectRatio(ar: ImageAspectRatio): { width: number; height: number } {
    const map: Record<ImageAspectRatio, { width: number; height: number }> = {
      '1:1': { width: 1024, height: 1024 },
      '16:9': { width: 1792, height: 1024 },
      '9:16': { width: 1024, height: 1792 },
      '4:5': { width: 896, height: 1120 },
      '3:2': { width: 1536, height: 1024 },
      '2:3': { width: 1024, height: 1536 },
      '21:9': { width: 2048, height: 896 },
    }
    return map[ar]
  }

  private detectStyle(lower: string, intent: ImageWorkflowIntent): string {
    if (lower.includes('cinematic')) return 'cinematic realistic'
    if (lower.includes('luxury')) return 'luxury editorial high-end commercial'
    if (lower.includes('minimalist')) return 'minimalist clean white studio'
    if (lower.includes('cartoon') || lower.includes('animated')) return 'stylized cartoon illustration'
    if (lower.includes('anime')) return 'anime art style'
    if (lower.includes('watercolor')) return 'watercolor illustration'
    if (lower.includes('neon') || lower.includes('cyberpunk')) return 'neon cyberpunk aesthetic'
    if (intent === 'product_photo') return 'clean white studio product photography, professional lighting, 4K sharp'
    if (intent === 'thumbnail') return 'bold vibrant YouTube thumbnail, high contrast, eye-catching'
    if (intent === 'logo') return 'clean vector logo design, minimal, bold, scalable'
    if (intent === 'poster') return 'cinematic movie poster, dramatic lighting, bold typography'
    return 'photorealistic high-quality commercial image'
  }

  private pickProvider(lower: string, intent: ImageWorkflowIntent): ImageProvider {
    if (lower.includes('openai') || lower.includes('dall-e') || lower.includes('dalle')) return 'openai'
    if (lower.includes('ideogram')) return 'ideogram'
    if (lower.includes('flux')) return 'flux'
    if (lower.includes('stability') || lower.includes('sdxl')) return 'stability'
    if (intent === 'logo' || intent === 'brand_asset') return 'ideogram'
    if (intent === 'product_photo') return 'openai'
    if (intent === 'thumbnail') return 'ideogram'
    if (intent === 'poster') return 'flux'
    return 'openai'
  }

  private buildMainPrompt(
    userPrompt: string,
    intent: ImageWorkflowIntent,
    style: string,
    input: CreateImageWorkflowDto,
  ): string {
    const subjectContext = input.productName
      ? `Product: ${input.productName}. `
      : input.brandName
        ? `Brand: ${input.brandName}. `
        : ''

    const qualityTail =
      intent === 'product_photo'
        ? ', clean white or gradient background, professional studio lighting, sharp focus, 8K resolution, commercial photography quality'
        : intent === 'thumbnail'
          ? ', bold colors, high contrast, dramatic lighting, clear focal point, eye-catching composition'
          : intent === 'logo'
            ? ', vector style, clean edges, scalable, bold, minimal, professional brand identity'
            : ', ultra high quality, professional composition, sharp details, production-ready'

    return `${subjectContext}${userPrompt}. Style: ${style}${qualityTail}`
  }

  private buildNegativePrompt(intent: ImageWorkflowIntent): string {
    const base = 'blurry, low quality, distorted, watermark, text overlay, noisy, artifact, deformed, ugly, bad anatomy'
    if (intent === 'product_photo') return `${base}, cluttered background, dark shadows, overexposed`
    if (intent === 'logo') return `${base}, complex details, photograph, realistic texture, gradients`
    if (intent === 'thumbnail') return `${base}, dark, boring, low contrast, plain`
    return base
  }

  private buildVariants(args: {
    mainPrompt: string
    negativePrompt: string
    style: string
    provider: ImageProvider
    aspectRatio: ImageAspectRatio
    width: number
    height: number
    variantCount: number
    intent: ImageWorkflowIntent
  }): ImageVariant[] {
    const styleVariants = [
      args.style,
      `${args.style}, alternative color palette, slightly different composition`,
      `${args.style}, closer crop, emphasis on detail`,
      `${args.style}, wider shot, more environment context`,
    ]

    return Array.from({ length: args.variantCount }, (_, i) => ({
      variantNumber: i + 1,
      prompt: i === 0 ? args.mainPrompt : `${args.mainPrompt}, ${styleVariants[i % styleVariants.length]}`,
      negativePrompt: args.negativePrompt,
      style: styleVariants[i % styleVariants.length],
      provider: args.provider,
      aspectRatio: args.aspectRatio,
      width: args.width,
      height: args.height,
    }))
  }

  private buildEnhancementSteps(
    intent: ImageWorkflowIntent,
    upscale: boolean,
    provider: ImageProvider,
  ): ImageEnhancementStep[] {
    const steps: ImageEnhancementStep[] = []
    let order = 1

    if (intent === 'product_photo') {
      steps.push({
        order: order++,
        name: 'Remove background',
        action: 'background_remove',
        provider: 'custom_api',
        input: { threshold: 0.85 },
        outputKey: 'product_no_bg',
      })
    }

    if (upscale) {
      steps.push({
        order: order++,
        name: 'Upscale 4x',
        action: 'upscale',
        provider,
        input: { scale: 4, denoise: 0.3 },
        outputKey: 'upscaled_image',
      })
    }

    if (intent === 'product_photo' || intent === 'brand_asset') {
      steps.push({
        order: order++,
        name: 'Enhance and sharpen',
        action: 'enhance',
        provider,
        input: { sharpen: true, colorCorrect: true },
        outputKey: 'enhanced_image',
      })
    }

    return steps
  }

  private buildDeliverables(intent: ImageWorkflowIntent, variantCount: number, aspectRatio: ImageAspectRatio): string[] {
    return [
      `${variantCount} image variants at ${aspectRatio}`,
      'Upscaled final image (4x)',
      intent === 'product_photo' ? 'Transparent background PNG' : 'Full background image',
      'Generation prompts for each variant',
      'High-resolution export ready for print and web',
    ]
  }

  private buildTitle(intent: ImageWorkflowIntent, name?: string): string {
    if (intent === 'product_photo') return `${name ?? 'Product'} Photo Workflow`
    if (intent === 'thumbnail') return 'YouTube Thumbnail Workflow'
    if (intent === 'logo') return `${name ?? 'Brand'} Logo Workflow`
    if (intent === 'poster') return 'Poster Design Workflow'
    if (intent === 'brand_asset') return `${name ?? 'Brand'} Asset Workflow`
    return 'AI Image Generation Workflow'
  }

  private buildSummary(
    intent: ImageWorkflowIntent,
    style: string,
    aspectRatio: ImageAspectRatio,
    provider: ImageProvider,
  ): string {
    return `Creates a ${style} image for ${intent} at ${aspectRatio}. Provider: ${provider}. Includes variants, upscaling, and enhancement steps.`
  }

  private findMissingInputs(intent: ImageWorkflowIntent, input: CreateImageWorkflowDto): string[] {
    const missing: string[] = []
    if (!input.prompt?.trim()) missing.push('Image prompt is required.')
    if (intent === 'logo' && !input.brandName) missing.push('Brand name is recommended for logo generation.')
    if (intent === 'product_photo' && !input.productName) missing.push('Product name recommended for product photo generation.')
    return missing
  }
}
