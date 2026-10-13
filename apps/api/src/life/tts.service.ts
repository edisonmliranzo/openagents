import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

export interface TtsResult {
  audioBase64: string
  mimeType: string
  provider: 'elevenlabs' | 'fish'
  voiceId: string
  cached: boolean
}

export interface VoiceOption {
  id: string
  name: string
  provider: 'elevenlabs' | 'fish'
  labels?: Record<string, string>
}

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name)
  private readonly memCache = new Map<string, TtsResult>()

  constructor(private readonly config: ConfigService) {}

  /** Which provider is ready with the current env keys. */
  activeProvider(): 'elevenlabs' | 'fish' | null {
    if (this.elevenKey()) return 'elevenlabs'
    if (this.fishKey()) return 'fish'
    return null
  }

  status() {
    return {
      provider: this.activeProvider(),
      elevenlabs: Boolean(this.elevenKey()),
      fish: Boolean(this.fishKey()),
      defaultVoice: this.defaultVoice(),
    }
  }

  private elevenKey(): string {
    return (this.config.get<string>('ELEVENLABS_API_KEY') ?? '').trim()
  }

  private fishKey(): string {
    return (this.config.get<string>('FISH_API_KEY') ?? '').trim()
  }

  private defaultVoice(): string {
    return (
      (this.config.get<string>('ELEVENLABS_VOICE_ID') ?? '').trim() ||
      (this.config.get<string>('FISH_REFERENCE_ID') ?? '').trim() ||
      ''
    )
  }

  /**
   * Synthesize speech. Falls back across configured providers, caches by
   * (text, voice, provider) so repeated briefings don't re-bill.
   */
  async speak(userId: string, text: string, opts?: { voiceId?: string; provider?: string }): Promise<TtsResult> {
    const clean = String(text ?? '').trim()
    if (!clean) throw new BadRequestException('text is required')
    if (clean.length > 5000) throw new BadRequestException('text too long (max 5000 chars)')

    const requested = (opts?.provider ?? '').trim().toLowerCase()
    const provider = requested === 'elevenlabs' || requested === 'fish' ? requested : this.activeProvider()
    if (!provider) {
      throw new ServiceUnavailableException(
        'No TTS provider configured. Add ELEVENLABS_API_KEY (elevenlabs.io) or FISH_API_KEY (fish.audio) to apps/api/.env and restart.',
      )
    }

    const voiceId = (opts?.voiceId ?? '').trim() || this.defaultVoice()
    const key = createHash('sha1').update(`${provider}:${voiceId}:${clean}`).digest('hex')

    const mem = this.memCache.get(key)
    if (mem) return { ...mem, cached: true }

    const disk = await this.readDiskCache(key, provider, voiceId).catch(() => null)
    if (disk) {
      this.memCache.set(key, disk)
      return { ...disk, cached: true }
    }

    const result = provider === 'elevenlabs' ? await this.speakElevenLabs(clean, voiceId) : await this.speakFish(clean, voiceId)
    this.memCache.set(key, result)
    void this.writeDiskCache(key, result).catch((err) => this.logger.warn(`TTS cache write failed: ${err?.message ?? err}`))
    return result
  }

  private async speakElevenLabs(text: string, voiceId: string): Promise<TtsResult> {
    const key = this.elevenKey()
    if (!key) throw new ServiceUnavailableException('ELEVENLABS_API_KEY is not set')
    const voice = voiceId || '21m00Tcm4TlvDq8ikWAM' // ElevenLabs default "Rachel"
    const model = (this.config.get<string>('ELEVENLABS_MODEL') ?? 'eleven_multilingual_v2').trim()

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new ServiceUnavailableException(`ElevenLabs TTS failed (${res.status}): ${detail.slice(0, 200)}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    return { audioBase64: buf.toString('base64'), mimeType: 'audio/mpeg', provider: 'elevenlabs', voiceId: voice, cached: false }
  }

  private async speakFish(text: string, voiceId: string): Promise<TtsResult> {
    const key = this.fishKey()
    if (!key) throw new ServiceUnavailableException('FISH_API_KEY is not set')
    if (!voiceId) {
      throw new ServiceUnavailableException(
        'Fish Audio needs a voice: set FISH_REFERENCE_ID in apps/api/.env (a voice/model id from fish.audio) or pass voiceId.',
      )
    }

    const res = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, reference_id: voiceId, format: 'mp3', mp3_bitrate: 128, normalize: true, latency: 'balanced' }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new ServiceUnavailableException(`Fish Audio TTS failed (${res.status}): ${detail.slice(0, 200)}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    return { audioBase64: buf.toString('base64'), mimeType: 'audio/mpeg', provider: 'fish', voiceId, cached: false }
  }

  /** List voices from the configured providers (best effort). */
  async voices(userId: string): Promise<VoiceOption[]> {
    const out: VoiceOption[] = []
    const eleven = this.elevenKey()
    if (eleven) {
      try {
        const res = await fetch('https://api.elevenlabs.io/v1/voices', {
          headers: { 'xi-api-key': eleven },
          signal: AbortSignal.timeout(20_000),
        })
        if (res.ok) {
          const body = (await res.json()) as { voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string> }> }
          for (const v of body.voices ?? []) {
            out.push({ id: v.voice_id, name: v.name, provider: 'elevenlabs', labels: v.labels })
          }
        }
      } catch (err) {
        this.logger.warn(`ElevenLabs voice list failed: ${err instanceof Error ? err.message : err}`)
      }
    }
    const fish = this.fishKey()
    if (fish) {
      try {
        const res = await fetch('https://api.fish.audio/voice/list?self=true&page_size=25', {
          headers: { Authorization: `Bearer ${fish}` },
          signal: AbortSignal.timeout(20_000),
        })
        if (res.ok) {
          const body = (await res.json()) as { items?: Array<{ _id: string; title: string }> }
          for (const v of body.items ?? []) {
            out.push({ id: v._id, name: v.title, provider: 'fish' })
          }
        }
      } catch (err) {
        this.logger.warn(`Fish voice list failed: ${err instanceof Error ? err.message : err}`)
      }
    }
    return out
  }

  /**
   * ElevenLabs instant voice clone: upload a short clean sample (>=10s),
   * get a voice_id back. Store the returned id like any voice id.
   */
  async clone(userId: string, input: { name: string; audioBase64: string; mimeType?: string }): Promise<{ voiceId: string; provider: 'elevenlabs' }> {
    const key = this.elevenKey()
    if (!key) throw new ServiceUnavailableException('Voice cloning needs ELEVENLABS_API_KEY in apps/api/.env')
    const name = String(input.name ?? '').trim() || `OpenAgents voice ${new Date().toISOString().slice(0, 10)}`
    const b64 = String(input.audioBase64 ?? '').replace(/^data:[^;]+;base64,/, '')
    if (!b64 || b64.length < 1000) throw new BadRequestException('Provide a clean voice sample as audioBase64 (10-60 seconds).')

    const buf = Buffer.from(b64, 'base64')
    const form = new FormData()
    form.append('name', name.slice(0, 80))
    form.append('files', new Blob([new Uint8Array(buf)], { type: input.mimeType || 'audio/mpeg' }), 'sample.mp3')

    const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': key },
      body: form,
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new ServiceUnavailableException(`Clone failed (${res.status}): ${detail.slice(0, 200)}`)
    }
    const body = (await res.json()) as { voice_id?: string }
    if (!body.voice_id) throw new ServiceUnavailableException('Clone returned no voice id')
    return { voiceId: body.voice_id, provider: 'elevenlabs' }
  }

  private ttsCacheDir(): string {
    const raw = this.config.get<string>('TTS_CACHE_DIR') ?? 'data/tts-cache'
    return isAbsolute(raw) ? raw : resolve(process.cwd(), raw)
  }

  private async readDiskCache(key: string, provider: string, voiceId: string): Promise<TtsResult | null> {
    try {
      const p = join(this.ttsCacheDir(), `${key}.mp3`)
      const buf = await fs.readFile(p)
      return { audioBase64: buf.toString('base64'), mimeType: 'audio/mpeg', provider: provider as TtsResult['provider'], voiceId, cached: true }
    } catch {
      return null
    }
  }

  private async writeDiskCache(key: string, result: TtsResult) {
    const dir = this.ttsCacheDir()
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, `${key}.mp3`), Buffer.from(result.audioBase64, 'base64'))
  }
}
