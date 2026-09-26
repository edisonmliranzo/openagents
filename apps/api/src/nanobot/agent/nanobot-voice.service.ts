import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI, { toFile } from 'openai'
import type {
  NanobotVoiceSynthesisInput,
  NanobotVoiceSynthesisResult,
  NanobotVoiceTranscriptionInput,
  NanobotVoiceTranscriptionResult,
} from '../types'

@Injectable()
export class NanobotVoiceService {
  private readonly logger = new Logger(NanobotVoiceService.name)

  constructor(private readonly config: ConfigService) {}

  async transcribe(input: NanobotVoiceTranscriptionInput): Promise<NanobotVoiceTranscriptionResult> {
    const locale = input.locale?.trim() || 'en-US'

    // Real STT: OpenAI Whisper when audio is provided and a key is configured.
    const audioBase64 = input.audioBase64?.trim()
    const openaiKey = (this.config.get<string>('OPENAI_API_KEY') ?? '').trim()
    if (audioBase64 && openaiKey && !this.isPlaceholderKey(openaiKey)) {
      const transcript = await this.transcribeWithWhisper(audioBase64, locale)
      if (transcript) {
        return { transcript, locale, confidence: 0.95, provider: 'openai-whisper' }
      }
    }

    const transcript = this.resolveTranscript(input).trim()
    if (!transcript) {
      throw new BadRequestException(
        'Transcript is required. Send audioBase64 with an OPENAI_API_KEY configured, or pass a transcript.',
      )
    }

    return {
      transcript,
      locale,
      confidence: 0.91,
      provider: 'local-mvp',
    }
  }

  private async transcribeWithWhisper(audioBase64: string, locale: string): Promise<string> {
    try {
      const buffer = Buffer.from(audioBase64.replace(/^data:[^;]+;base64,/, ''), 'base64')
      if (buffer.length < 64) return ''
      const client = new OpenAI({ apiKey: this.config.get<string>('OPENAI_API_KEY')?.trim() })
      const file = await toFile(buffer, 'audio.webm', { type: 'audio/webm' })
      const result = await client.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: locale.split('-')[0],
      })
      return (result.text ?? '').trim()
    } catch (error: any) {
      this.logger.warn(`Whisper transcription failed: ${error?.message ?? 'unknown error'}`)
      return ''
    }
  }

  private isPlaceholderKey(value: string) {
    const normalized = value.trim().toLowerCase()
    return !normalized || normalized === 'sk-...' || normalized.startsWith('your-')
  }

  synthesize(input: NanobotVoiceSynthesisInput): NanobotVoiceSynthesisResult {
    const text = input.text?.trim()
    if (!text) {
      throw new BadRequestException('Text is required for speech synthesis.')
    }

    const locale = input.locale?.trim() || 'en-US'
    const voice = input.voice?.trim() || 'default'
    const rate = Number.isFinite(input.rate) ? Math.max(0.5, Math.min(1.8, Number(input.rate))) : 1
    const pitch = Number.isFinite(input.pitch) ? Math.max(0.5, Math.min(1.8, Number(input.pitch))) : 1
    const clean = text.slice(0, 4000)
    const estimatedDurationMs = Math.round((clean.split(/\s+/).length / 2.8) * 1000)

    return {
      text: clean,
      locale,
      voice,
      ssml: `<speak><prosody rate="${rate.toFixed(2)}" pitch="${pitch.toFixed(2)}">${this.escapeXml(clean)}</prosody></speak>`,
      estimatedDurationMs: Math.max(600, estimatedDurationMs),
    }
  }

  private resolveTranscript(input: NanobotVoiceTranscriptionInput) {
    if (typeof input.transcript === 'string' && input.transcript.trim()) {
      return input.transcript
    }

    const base64 = input.audioBase64?.trim()
    if (!base64) return ''
    try {
      const decoded = Buffer.from(base64, 'base64').toString('utf8')
      return decoded.replace(/\u0000/g, ' ').trim()
    } catch {
      return ''
    }
  }

  private escapeXml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;')
  }
}
