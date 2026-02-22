import { BadRequestException, Injectable } from '@nestjs/common'
import type {
  NanobotVoiceSynthesisInput,
  NanobotVoiceSynthesisResult,
  NanobotVoiceTranscriptionInput,
  NanobotVoiceTranscriptionResult,
} from '../types'

@Injectable()
export class NanobotVoiceService {
  transcribe(input: NanobotVoiceTranscriptionInput): NanobotVoiceTranscriptionResult {
    const locale = input.locale?.trim() || 'en-US'
    const transcript = this.resolveTranscript(input).trim()
    if (!transcript) {
      throw new BadRequestException('Transcript is required for MVP voice transcription.')
    }

    return {
      transcript,
      locale,
      confidence: 0.91,
      provider: 'local-mvp',
    }
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
