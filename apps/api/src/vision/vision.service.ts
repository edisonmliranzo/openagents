import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { LLM_MODELS, type LLMProvider } from '@openagents/shared'
import { LLMService } from '../agent/llm.service'
import { UsersService } from '../users/users.service'
import { safeFetchBuffer } from '../frontier/safe-fetch'

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

const DEFAULT_PROMPT =
  'Describe this image in detail. Include the objects you can see, any text present, the dominant colors, and anything notable.'

const SYSTEM_PROMPT = [
  'You are a precise image analysis engine.',
  'Reply with a single JSON object and nothing else. Shape:',
  '{ "description": string, "labels": string[], "text": string | null, "objects": [{ "name": string, "confidence": number }], "colors": string[] }',
  'Keep the description under 120 words. Use an empty array when a field does not apply.',
].join(' ')

const VISION_MODELS: Partial<Record<LLMProvider, string>> = {
  openai: 'gpt-4o',
  anthropic: LLM_MODELS.anthropic.default,
  google: LLM_MODELS.google.default,
}

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name)

  constructor(
    private llm: LLMService,
    private users: UsersService,
  ) {}

  async analyzeImage(userId: string, input: VisionInput): Promise<ImageAnalysisResult> {
    const errors = this.validateImageInput(input)
    if (errors.length > 0) {
      throw new BadRequestException(errors.join(' '))
    }

    const dataUrl = await this.resolveDataUrl(input)
    const prompt = input.prompt?.trim() || DEFAULT_PROMPT

    const target = await this.resolveProvider(userId, input.provider)

    this.logger.log(
      `Analyzing image via ${target.provider}/${target.model} (${input.imageUrl ? 'remote url' : 'inline base64'})`,
    )

    const response = await this.llm.complete(
      [{ role: 'user', content: `${prompt}\n\n${dataUrl}` }],
      [],
      SYSTEM_PROMPT,
      target.provider,
      target.apiKey,
      target.baseUrl,
      target.model,
    )

    return this.parseResult(response.content ?? '')
  }

  /** Resolves the image into a `data:` URL so the multimodal parser can consume it. */
  private async resolveDataUrl(input: VisionInput): Promise<string> {
    if (input.imageBase64) {
      const raw = input.imageBase64.trim()
      if (raw.startsWith('data:')) return raw
      const mimeType = input.mimeType ?? 'image/png'
      return `data:${mimeType};base64,${raw}`
    }

    const url = input.imageUrl!.trim()
    if (url.startsWith('data:')) return url

    const { buffer, contentType } = await safeFetchBuffer(url)
    const mimeType = contentType.startsWith('image/') ? contentType : (input.mimeType ?? 'image/png')
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  }

  private async resolveProvider(
    userId: string,
    requested?: string,
  ): Promise<{ provider: LLMProvider; model: string; apiKey?: string; baseUrl?: string }> {
    const settings = await this.users.getSettings(userId)
    const configured = (requested ?? settings.preferredProvider ?? 'anthropic')
      .trim()
      .toLowerCase() as LLMProvider

    const provider = (VISION_MODELS[configured] ? configured : 'anthropic') as LLMProvider
    const stored = await this.users.getRawLlmKey(userId, provider).catch(() => null)

    const model =
      settings.preferredModel?.trim() && provider === settings.preferredProvider?.trim().toLowerCase()
        ? settings.preferredModel.trim()
        : VISION_MODELS[provider] ?? LLM_MODELS[provider].default

    return {
      provider,
      model,
      apiKey: stored?.isActive ? stored.apiKey ?? undefined : undefined,
      baseUrl: stored?.isActive ? stored.baseUrl ?? undefined : undefined,
    }
  }

  private parseResult(raw: string): ImageAnalysisResult {
    const text = raw.trim()
    const json = this.extractJson(text)

    if (!json) {
      return {
        description: text || 'The model returned no description.',
        labels: [],
        objects: [],
        colors: [],
      }
    }

    const asStrings = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

    const objects = Array.isArray(json.objects)
      ? json.objects
          .map((entry: any) => ({
            name: typeof entry?.name === 'string' ? entry.name : '',
            confidence: Number(entry?.confidence ?? 0),
          }))
          .filter((entry: { name: string }) => entry.name.length > 0)
      : []

    return {
      description: typeof json.description === 'string' ? json.description : text,
      labels: asStrings(json.labels),
      text: typeof json.text === 'string' ? json.text : undefined,
      objects,
      colors: asStrings(json.colors),
    }
  }

  /** Pulls the first JSON object out of a model response, tolerating code fences. */
  private extractJson(raw: string): Record<string, any> | null {
    const candidates: string[] = []

    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced?.[1]) candidates.push(fenced[1])

    const first = raw.indexOf('{')
    const last = raw.lastIndexOf('}')
    if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1))

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate.trim())
        if (parsed && typeof parsed === 'object') return parsed
      } catch {
        // try the next candidate
      }
    }

    return null
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
      if (input.imageUrl.startsWith('data:')) return errors
      try {
        new URL(input.imageUrl)
      } catch {
        errors.push('imageUrl is not a valid URL.')
      }
    }
    return errors
  }
}
