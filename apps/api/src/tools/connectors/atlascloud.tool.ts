import { Injectable, Logger } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AtlasCloudModel =
  | 'baidu/ERNIE-Image-Turbo/text-to-image'
  | 'black-forest-labs/flux-2-pro/text-to-image'
  | 'google/imagen4-ultra/text-to-image'
  | 'ideogram/ideogram-v3/text-to-image'
  | 'openai/gpt-image-1.5/text-to-image'

type PredictionStatus = 'processing' | 'completed' | 'succeeded' | 'failed'

interface GenerateImageResponse {
  data: { id: string }
}

interface PollResponse {
  data: {
    status: PredictionStatus
    outputs?: string[]
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL = 'https://api.atlascloud.ai/api/v1'
const POLL_INTERVAL_MS = 2_000   // 2 s between polls
const MAX_POLLS = 60             // up to 2 min total

// ── Tool ─────────────────────────────────────────────────────────────────────

@Injectable()
export class AtlasCloudTool {
  private readonly logger = new Logger(AtlasCloudTool.name)

  // ── Tool definition ────────────────────────────────────────────────────────

  get def(): ToolDefinition {
    return {
      name: 'atlascloud_image_generate',
      displayName: 'AtlasCloud Image Generate',
      description:
        'Generate images using AtlasCloud AI models including ERNIE-Image-Turbo (free), FLUX 2 Pro, Imagen 4 Ultra, Ideogram v3, and GPT-Image-1.5. Returns the generated image URL.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the image to generate.',
          },
          model: {
            type: 'string',
            enum: [
              'baidu/ERNIE-Image-Turbo/text-to-image',
              'black-forest-labs/flux-2-pro/text-to-image',
              'google/imagen4-ultra/text-to-image',
              'ideogram/ideogram-v3/text-to-image',
              'openai/gpt-image-1.5/text-to-image',
            ],
            description:
              'Model to use. Defaults to "baidu/ERNIE-Image-Turbo/text-to-image" (free, fast).',
          },
          width: {
            type: 'number',
            description: 'Image width in pixels. Defaults to 1024.',
          },
          height: {
            type: 'number',
            description: 'Image height in pixels. Defaults to 1024.',
          },
          steps: {
            type: 'number',
            description: 'Diffusion steps. Defaults to 8 for ERNIE-Image-Turbo, 20 for others.',
          },
          guidance_scale: {
            type: 'number',
            description: 'Guidance scale (CFG). Defaults to 7.5.',
          },
        },
        required: ['prompt'],
      },
    }
  }

  // ── Public execute method ──────────────────────────────────────────────────

  async generate(
    input: {
      prompt: string
      model?: AtlasCloudModel
      width?: number
      height?: number
      steps?: number
      guidance_scale?: number
    },
    _userId: string,
  ): Promise<ToolResult> {
    const apiKey = process.env.ATLASCLOUD_API_KEY
    if (!apiKey) {
      return { success: false, output: null, error: 'ATLASCLOUD_API_KEY is not configured.' }
    }

    const model: AtlasCloudModel = input.model ?? 'baidu/ERNIE-Image-Turbo/text-to-image'
    const width = input.width ?? 1024
    const height = input.height ?? 1024
    const isErnie = model.includes('ERNIE-Image-Turbo')
    const steps = input.steps ?? (isErnie ? 8 : 20)
    const guidance_scale = input.guidance_scale ?? 7.5

    this.logger.log(
      `atlascloud_image_generate: model=${model} prompt="${input.prompt.slice(0, 80)}" ${width}x${height}`,
    )

    // ── Step 1: Submit generation request ──────────────────────────────────

    let predictionId: string
    try {
      const res = await fetch(`${BASE_URL}/model/generateImage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, prompt: input.prompt, width, height, steps, guidance_scale }),
      })

      if (!res.ok) {
        const text = await res.text()
        return {
          success: false,
          output: null,
          error: `AtlasCloud generate error ${res.status}: ${text.slice(0, 400)}`,
        }
      }

      const data = (await res.json()) as GenerateImageResponse
      predictionId = data?.data?.id
      if (!predictionId) {
        return {
          success: false,
          output: null,
          error: 'AtlasCloud returned no prediction ID.',
        }
      }
    } catch (err: any) {
      this.logger.error(`AtlasCloud generate request failed: ${err.message}`)
      return { success: false, output: null, error: err.message }
    }

    this.logger.log(`atlascloud_image_generate: polling prediction_id=${predictionId}`)

    // ── Step 2: Poll until completed / failed ──────────────────────────────

    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      await sleep(POLL_INTERVAL_MS)

      let pollData: PollResponse
      try {
        const pollRes = await fetch(`${BASE_URL}/model/prediction/${predictionId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })

        if (!pollRes.ok) {
          const text = await pollRes.text()
          return {
            success: false,
            output: null,
            error: `AtlasCloud poll error ${pollRes.status}: ${text.slice(0, 400)}`,
          }
        }

        pollData = (await pollRes.json()) as PollResponse
      } catch (err: any) {
        this.logger.error(`AtlasCloud poll request failed: ${err.message}`)
        return { success: false, output: null, error: err.message }
      }

      const status = pollData?.data?.status
      this.logger.debug(`atlascloud poll attempt=${attempt + 1} status=${status}`)

      if (status === 'completed' || status === 'succeeded') {
        const imageUrl = pollData?.data?.outputs?.[0]
        if (!imageUrl) {
          return {
            success: false,
            output: null,
            error: 'AtlasCloud returned no output URL despite completed status.',
          }
        }

        return {
          success: true,
          output: {
            provider: 'atlascloud',
            model,
            prediction_id: predictionId,
            images: [{ url: imageUrl }],
            prompt: input.prompt,
            width,
            height,
            steps,
            guidance_scale,
          },
        }
      }

      if (status === 'failed') {
        return {
          success: false,
          output: null,
          error: `AtlasCloud prediction ${predictionId} failed during processing.`,
        }
      }

      // status === 'processing' → keep polling
    }

    return {
      success: false,
      output: null,
      error: `AtlasCloud prediction ${predictionId} timed out after ${MAX_POLLS * POLL_INTERVAL_MS / 1000}s.`,
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
