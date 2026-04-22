import { Injectable, Logger } from '@nestjs/common'

export interface ImageAnalysisResult {
  description: string
  labels: string[]
  text?: string
  objects?: Array<{ name: string; confidence: number }>
  colors?: string[]
  safeSearch?: { adult: string; violence: string }
}

export interface VisionInput {
  imageUrl?: string
  imageBase64?: string
  mimeType?: string
  prompt?: string
  provider?: 'openai' | 'google' | 'anthropic'
}

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name)

  async analyzeImage(input: VisionInput): Promise<ImageAnalysisResult> {
    const { imageUrl, imageBase64, prompt } = input
    if (!imageUrl && !imageBase64) {
      throw new Error('Provide either imageUrl or imageBase64')
    }

    // Build a description prompt for the vision model
    const analysisPrompt = prompt ?? 'Describe this image in detail. Include objects, text, colors, and any notable features.'

    this.logger.log(`Analyzing image: ${imageUrl?.slice(0, 60) ?? 'base64 data'}`)

    // For now, return a structured result placeholder. The actual vision call
    // is wired through the LLM service's multi-modal support.
    return {
      description: `Image analysis requested: ${analysisPrompt}`,
      labels: [],
      text: undefined,
      objects: [],
      colors: [],
    }
  }

  buildVisionMessage(input: VisionInput): { role: 'user'; content: string } {
    const parts: string[] = []
    if (input.prompt) {
      parts.push(input.prompt)
    }
    if (input.imageUrl) {
      parts.push(`[Image: ${input.imageUrl}]`)
    }
    if (input.imageBase64) {
      parts.push(`[Attached image: ${input.mimeType ?? 'image/png'}, ${Math.round((input.imageBase64.length * 3) / 4 / 1024)}KB]`)
      parts.push(input.imageBase64)
    }
    return {
      role: 'user',
      content: parts.join('\n\n'),
    }
  }

  validateImageInput(input: VisionInput): string[] {
    const errors: string[] = []
    if (!input.imageUrl && !input.imageBase64) {
      errors.push('Either imageUrl or imageBase64 is required.')
    }
    if (input.imageBase64 && !input.mimeType) {
      errors.push('mimeType is required when providing imageBase64.')
    }
    if (input.imageUrl) {
      try {
        new URL(input.imageUrl)
      } catch {
        errors.push('imageUrl is not a valid URL.')
      }
    }
    return errors
  }
}
