import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

export type AudioProvider = 'openai' | 'elevenlabs'
export type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
export type OpenAITTSModel = 'tts-1' | 'tts-1-hd'
export type AudioFormat = 'mp3' | 'opus' | 'aac' | 'flac'

const MAX_TEXT_LENGTH = 4096

@Injectable()
export class AudioGenerationTool {
  private readonly logger = new Logger(AudioGenerationTool.name)
  private openaiClient: OpenAI | null = null

  private get openai(): OpenAI {
    if (!this.openaiClient) {
      this.openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    }
    return this.openaiClient
  }

  get def(): ToolDefinition {
    return {
      name: 'audio_generate',
      displayName: 'Audio Generate',
      description:
        'Convert text to speech using OpenAI TTS (default) or ElevenLabs. Returns base64-encoded audio and a temp file path.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Text to convert to speech (max 4096 characters).',
          },
          provider: {
            type: 'string',
            enum: ['openai', 'elevenlabs'],
            description: 'TTS provider. Defaults to "openai".',
          },
          voice: {
            type: 'string',
            description:
              'Voice ID. OpenAI voices: alloy, echo, fable, onyx, nova, shimmer. ElevenLabs: use ElevenLabs voice ID.',
          },
          model: {
            type: 'string',
            enum: ['tts-1', 'tts-1-hd'],
            description: 'OpenAI TTS model. "tts-1" is faster, "tts-1-hd" is higher quality. Defaults to "tts-1".',
          },
          format: {
            type: 'string',
            enum: ['mp3', 'opus', 'aac', 'flac'],
            description: 'Audio output format. Defaults to "mp3".',
          },
          speed: {
            type: 'number',
            description: 'OpenAI TTS: speech speed multiplier (0.25–4.0). Defaults to 1.0.',
          },
          stability: {
            type: 'number',
            description: 'ElevenLabs: voice stability (0–1). Defaults to 0.5.',
          },
          similarity_boost: {
            type: 'number',
            description: 'ElevenLabs: similarity boost (0–1). Defaults to 0.75.',
          },
          save_to_file: {
            type: 'boolean',
            description: 'If true, save audio to a temp file and return its path. Defaults to true.',
          },
        },
        required: ['text'],
      },
    }
  }

  async generate(
    input: {
      text: string
      provider?: AudioProvider
      voice?: string
      model?: OpenAITTSModel
      format?: AudioFormat
      speed?: number
      stability?: number
      similarity_boost?: number
      save_to_file?: boolean
    },
    _userId: string,
  ): Promise<ToolResult> {
    const text = input.text?.slice(0, MAX_TEXT_LENGTH)
    if (!text) {
      return { success: false, output: null, error: 'text is required.' }
    }

    const provider = input.provider ?? 'openai'

    if (provider === 'openai') return this.generateOpenAI(input, text)
    if (provider === 'elevenlabs') return this.generateElevenLabs(input, text)
    return { success: false, output: null, error: `Unknown provider: ${provider}` }
  }

  // ── OpenAI TTS ──────────────────────────────────────────────────────────────

  private async generateOpenAI(
    input: {
      voice?: string
      model?: OpenAITTSModel
      format?: AudioFormat
      speed?: number
      save_to_file?: boolean
    },
    text: string,
  ): Promise<ToolResult> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return { success: false, output: null, error: 'OPENAI_API_KEY is not configured.' }
    }

    const voice = (input.voice as OpenAIVoice) ?? 'nova'
    const model = input.model ?? 'tts-1'
    const format = input.format ?? 'mp3'
    const speed = Math.min(Math.max(input.speed ?? 1.0, 0.25), 4.0)
    const saveToFile = input.save_to_file !== false

    this.logger.log(`audio_generate/openai: model=${model} voice=${voice} format=${format}`)

    try {
      const response = await this.openai.audio.speech.create({
        model,
        voice: voice as any,
        input: text,
        response_format: format as any,
        speed,
      })

      const buffer = Buffer.from(await response.arrayBuffer())
      const b64 = buffer.toString('base64')

      let filePath: string | null = null
      if (saveToFile) {
        filePath = path.join(os.tmpdir(), `openagents-tts-${randomUUID()}.${format}`)
        fs.writeFileSync(filePath, buffer)
      }

      return {
        success: true,
        output: {
          provider: 'openai',
          model,
          voice,
          format,
          text_length: text.length,
          audio_b64: b64,
          file_path: filePath,
          size_bytes: buffer.length,
        },
      }
    } catch (err: any) {
      this.logger.error(`OpenAI TTS error: ${err.message}`)
      return { success: false, output: null, error: err.message }
    }
  }

  // ── ElevenLabs ──────────────────────────────────────────────────────────────

  private async generateElevenLabs(
    input: {
      voice?: string
      format?: AudioFormat
      stability?: number
      similarity_boost?: number
      save_to_file?: boolean
    },
    text: string,
  ): Promise<ToolResult> {
    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return { success: false, output: null, error: 'ELEVENLABS_API_KEY is not configured.' }
    }

    const voiceId = input.voice ?? process.env.ELEVENLABS_DEFAULT_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM'
    const stability = Math.min(Math.max(input.stability ?? 0.5, 0), 1)
    const similarityBoost = Math.min(Math.max(input.similarity_boost ?? 0.75, 0), 1)
    const format = input.format ?? 'mp3'
    const saveToFile = input.save_to_file !== false

    this.logger.log(`audio_generate/elevenlabs: voice=${voiceId} format=${format}`)

    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
          },
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        return {
          success: false,
          output: null,
          error: `ElevenLabs error ${res.status}: ${errText.slice(0, 400)}`,
        }
      }

      const arrayBuffer = await res.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const b64 = buffer.toString('base64')

      let filePath: string | null = null
      if (saveToFile) {
        filePath = path.join(os.tmpdir(), `openagents-tts-${randomUUID()}.${format}`)
        fs.writeFileSync(filePath, buffer)
      }

      return {
        success: true,
        output: {
          provider: 'elevenlabs',
          voice_id: voiceId,
          format,
          text_length: text.length,
          audio_b64: b64,
          file_path: filePath,
          size_bytes: buffer.length,
        },
      }
    } catch (err: any) {
      this.logger.error(`ElevenLabs error: ${err.message}`)
      return { success: false, output: null, error: err.message }
    }
  }
}
