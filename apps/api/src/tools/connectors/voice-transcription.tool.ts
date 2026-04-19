import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class VoiceTranscriptionTool {
  private readonly logger = new Logger(VoiceTranscriptionTool.name)
  private openaiClient: OpenAI | null = null

  private get openai(): OpenAI {
    if (!this.openaiClient) {
      this.openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    }
    return this.openaiClient
  }

  get def(): ToolDefinition {
    return {
      name: 'voice_transcribe',
      displayName: 'Voice Transcribe',
      description:
        'Transcribe audio to text using OpenAI Whisper. Accepts base64-encoded audio (webm/mp3/wav/m4a). Returns transcript text.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          audio_base64: {
            type: 'string',
            description: 'Base64-encoded audio data.',
          },
          language: {
            type: 'string',
            description: 'Optional BCP-47 language code hint (e.g. "en", "es"). Auto-detected if omitted.',
          },
          format: {
            type: 'string',
            enum: ['webm', 'mp3', 'wav', 'm4a'],
            description: 'Audio format of the base64 data. Defaults to "webm".',
          },
        },
        required: ['audio_base64'],
      },
    }
  }

  async transcribe(
    input: {
      audio_base64: string
      language?: string
      format?: 'webm' | 'mp3' | 'wav' | 'm4a'
    },
    _userId: string,
  ): Promise<ToolResult> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return { success: false, output: null, error: 'OPENAI_API_KEY is not configured.' }
    }

    if (!input.audio_base64) {
      return { success: false, output: null, error: 'audio_base64 is required.' }
    }

    const format = input.format ?? 'webm'
    const timestamp = Date.now()
    const tmpPath = path.join('/tmp', `voice_${timestamp}.${format}`)

    this.logger.log(`voice_transcribe: format=${format} language=${input.language ?? 'auto'}`)

    try {
      // Decode base64 and write to temp file
      const buffer = Buffer.from(input.audio_base64, 'base64')
      fs.writeFileSync(tmpPath, buffer)

      const startedAt = Date.now()

      // Call Whisper API
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tmpPath) as any,
        model: 'whisper-1',
        ...(input.language ? { language: input.language } : {}),
      })

      const duration_ms = Date.now() - startedAt

      return {
        success: true,
        output: {
          transcript: transcription.text,
          language: input.language ?? null,
          duration_ms,
        },
      }
    } catch (err: any) {
      this.logger.error(`voice_transcribe error: ${err.message}`)
      return { success: false, output: null, error: err.message }
    } finally {
      // Clean up temp file
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath)
        }
      } catch (cleanupErr: any) {
        this.logger.warn(`Failed to clean up temp file ${tmpPath}: ${cleanupErr.message}`)
      }
    }
  }
}
