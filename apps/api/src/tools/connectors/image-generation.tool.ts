import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

export type ImageGenerationProvider = 'dalle3' | 'stability'
export type ImageSize = '1024x1024' | '1792x1024' | '1024x1792' | '512x512' | '256x256'
export type ImageQuality = 'standard' | 'hd'
export type ImageStyle = 'natural' | 'vivid'

@Injectable()
export class ImageGenerationTool {
  private readonly logger = new Logger(ImageGenerationTool.name)
  private openaiClient: OpenAI | null = null

  private get openai(): OpenAI {
    if (!this.openaiClient) {
      this.openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    }
    return this.openaiClient
  }

  get def(): ToolDefinition {
    return {
      name: 'image_generate',
      displayName: 'Image Generate',
      description:
        'Generate an image from a text prompt using DALL-E 3 (default) or Stability AI. Returns the image URL or base64 data.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the image to generate.',
          },
          provider: {
            type: 'string',
            enum: ['dalle3', 'stability'],
            description: 'Image generation provider. Defaults to "dalle3".',
          },
          size: {
            type: 'string',
            enum: ['1024x1024', '1792x1024', '1024x1792', '512x512', '256x256'],
            description: 'Image dimensions. Defaults to "1024x1024".',
          },
          quality: {
            type: 'string',
            enum: ['standard', 'hd'],
            description: 'DALL-E 3 quality setting. Defaults to "standard".',
          },
          style: {
            type: 'string',
            enum: ['natural', 'vivid'],
            description: 'DALL-E 3 style setting. Defaults to "vivid".',
          },
          n: {
            type: 'number',
            description: 'Number of images to generate (1–4). Defaults to 1.',
          },
          response_format: {
            type: 'string',
            enum: ['url', 'b64_json'],
            description: 'Return image URL or base64 data. Defaults to "url".',
          },
          negative_prompt: {
            type: 'string',
            description: 'Stability AI: things to exclude from the image.',
          },
          cfg_scale: {
            type: 'number',
            description: 'Stability AI: guidance scale (1-35). Defaults to 7.',
          },
          steps: {
            type: 'number',
            description: 'Stability AI: diffusion steps (10-150). Defaults to 30.',
          },
        },
        required: ['prompt'],
      },
    }
  }

  async generate(
    input: {
      prompt: string
      provider?: ImageGenerationProvider
      size?: ImageSize
      quality?: ImageQuality
      style?: ImageStyle
      n?: number
      response_format?: 'url' | 'b64_json'
      negative_prompt?: string
      cfg_scale?: number
      steps?: number
    },
    _userId: string,
  ): Promise<ToolResult> {
    const provider = input.provider ?? 'dalle3'

    if (provider === 'dalle3') {
      return this.generateDalle3(input)
    }
    if (provider === 'stability') {
      return this.generateStability(input)
    }
    return { success: false, output: null, error: `Unknown provider: ${provider}` }
  }

  // ── DALL-E 3 ────────────────────────────────────────────────────────────────

  private async generateDalle3(input: {
    prompt: string
    size?: ImageSize
    quality?: ImageQuality
    style?: ImageStyle
    n?: number
    response_format?: 'url' | 'b64_json'
  }): Promise<ToolResult> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return { success: false, output: null, error: 'OPENAI_API_KEY is not configured.' }
    }

    const size = (input.size as any) ?? '1024x1024'
    const quality = input.quality ?? 'standard'
    const style = input.style ?? 'vivid'
    const n = Math.min(Math.max(input.n ?? 1, 1), 4)
    const response_format = input.response_format ?? 'url'

    this.logger.log(`image_generate/dalle3: "${input.prompt.slice(0, 80)}" size=${size} quality=${quality}`)

    try {
      const response = await this.openai.images.generate({
        model: 'dall-e-3',
        prompt: input.prompt,
        size: size as any,
        quality: quality as any,
        style: style as any,
        n,
        response_format: response_format as any,
      })

      const images = (response.data ?? []).map((img) => ({
        url: img.url ?? null,
        b64_json: img.b64_json ?? null,
        revised_prompt: img.revised_prompt ?? null,
      }))

      return {
        success: true,
        output: {
          provider: 'dalle3',
          model: 'dall-e-3',
          images,
          prompt: input.prompt,
          size,
          quality,
          style,
        },
      }
    } catch (err: any) {
      this.logger.error(`DALL-E 3 error: ${err.message}`)
      return { success: false, output: null, error: err.message }
    }
  }

  // ── Stability AI ────────────────────────────────────────────────────────────

  private async generateStability(input: {
    prompt: string
    size?: ImageSize
    negative_prompt?: string
    cfg_scale?: number
    steps?: number
    n?: number
  }): Promise<ToolResult> {
    const apiKey = process.env.STABILITY_API_KEY
    if (!apiKey) {
      return { success: false, output: null, error: 'STABILITY_API_KEY is not configured.' }
    }

    const [width, height] = (input.size ?? '1024x1024').split('x').map(Number)
    const cfg_scale = input.cfg_scale ?? 7
    const steps = Math.min(Math.max(input.steps ?? 30, 10), 150)
    const samples = Math.min(Math.max(input.n ?? 1, 1), 4)

    this.logger.log(`image_generate/stability: "${input.prompt.slice(0, 80)}" ${width}x${height}`)

    const body: Record<string, unknown> = {
      text_prompts: [
        { text: input.prompt, weight: 1 },
        ...(input.negative_prompt ? [{ text: input.negative_prompt, weight: -1 }] : []),
      ],
      cfg_scale,
      width,
      height,
      steps,
      samples,
    }

    try {
      const res = await fetch(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
          body: JSON.stringify(body),
        },
      )

      if (!res.ok) {
        const text = await res.text()
        return { success: false, output: null, error: `Stability AI error ${res.status}: ${text.slice(0, 400)}` }
      }

      const data = (await res.json()) as { artifacts?: Array<{ base64: string; finishReason: string }> }
      const images = (data.artifacts ?? []).map((a) => ({
        b64_json: a.base64,
        url: null,
        finish_reason: a.finishReason,
      }))

      return {
        success: true,
        output: {
          provider: 'stability',
          model: 'stable-diffusion-xl-1024-v1-0',
          images,
          prompt: input.prompt,
          width,
          height,
          cfg_scale,
          steps,
        },
      }
    } catch (err: any) {
      this.logger.error(`Stability AI error: ${err.message}`)
      return { success: false, output: null, error: err.message }
    }
  }
}
