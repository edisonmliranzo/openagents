import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../security/encryption.service'

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

/** Per-user provider keys, stored encrypted in a UserFlag. */
export interface UserTtsConfig {
  provider: 'elevenlabs' | 'fish' | ''
  elevenlabsKey: string
  elevenlabsVoice: string
  fishKey: string
  fishVoice: string
}

const TTS_FLAG_KEY = 'tts_config'
const EMPTY_CONFIG: UserTtsConfig = { provider: '', elevenlabsKey: '', elevenlabsVoice: '', fishKey: '', fishVoice: '' }

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name)
  private readonly memCache = new Map<string, TtsResult>()

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  // ---- Per-user config (encrypted at rest) ----

  async getUserConfig(userId: string): Promise<UserTtsConfig> {
    const flag = await this.prisma.userFlag.findUnique({
      where: { userId_key: { userId, key: TTS_FLAG_KEY } },
      select: { value: true },
    })
    if (!flag?.value) return { ...EMPTY_CONFIG }
    try {
      const stored = JSON.parse(flag.value) as Record<string, unknown>
      const unseal = (v: unknown): string => {
        if (typeof v !== 'string' || !v) return ''
        try {
          return this.encryption.decryptApiKey(v)
        } catch {
          return ''
        }
      }
      return {
        provider: stored.provider === 'elevenlabs' || stored.provider === 'fish' ? stored.provider : '',
        elevenlabsKey: unseal(stored.elevenlabsKey),
        elevenlabsVoice: typeof stored.elevenlabsVoice === 'string' ? stored.elevenlabsVoice : '',
        fishKey: unseal(stored.fishKey),
        fishVoice: typeof stored.fishVoice === 'string' ? stored.fishVoice : '',
      }
    } catch {
      return { ...EMPTY_CONFIG }
    }
  }

  async setUserConfig(
    userId: string,
    patch: { provider?: string; elevenlabsKey?: string | null; elevenlabsVoice?: string; fishKey?: string | null; fishVoice?: string },
  ): Promise<{ saved: true }> {
    const current = await this.getUserConfig(userId)
    // Trim paste artifacts (newlines/spaces) — the #1 cause of "invalid_api_key".
    const nextElKey = patch.elevenlabsKey === null ? '' : patch.elevenlabsKey !== undefined && patch.elevenlabsKey.trim() !== '' ? patch.elevenlabsKey.trim() : current.elevenlabsKey
    const nextFishKey = patch.fishKey === null ? '' : patch.fishKey !== undefined && patch.fishKey.trim() !== '' ? patch.fishKey.trim() : current.fishKey
    // Validate NEW keys before storing so a typo never saves silently.
    if (nextElKey && nextElKey !== current.elevenlabsKey) await this.validateElevenLabs(nextElKey)
    if (nextFishKey && nextFishKey !== current.fishKey) await this.validateFish(nextFishKey)
    const next: UserTtsConfig = {
      provider: patch.provider === 'elevenlabs' || patch.provider === 'fish' || patch.provider === '' ? patch.provider : current.provider,
      elevenlabsKey: nextElKey,
      elevenlabsVoice: patch.elevenlabsVoice !== undefined ? patch.elevenlabsVoice.trim().slice(0, 200) : current.elevenlabsVoice,
      fishKey: nextFishKey,
      fishVoice: patch.fishVoice !== undefined ? patch.fishVoice.trim().slice(0, 200) : current.fishVoice,
    }
    const sealed = {
      provider: next.provider,
      elevenlabsKey: next.elevenlabsKey ? this.encryption.encryptApiKey(next.elevenlabsKey) : '',
      elevenlabsVoice: next.elevenlabsVoice,
      fishKey: next.fishKey ? this.encryption.encryptApiKey(next.fishKey) : '',
      fishVoice: next.fishVoice,
    }
    await this.prisma.userFlag.upsert({
      where: { userId_key: { userId, key: TTS_FLAG_KEY } },
      create: { userId, key: TTS_FLAG_KEY, value: JSON.stringify(sealed) },
      update: { value: JSON.stringify(sealed) },
    })
    return { saved: true }
  }

  /** Reject bad ElevenLabs keys at save time instead of at speak time. */
  private async validateElevenLabs(key: string): Promise<void> {
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': key },
        signal: AbortSignal.timeout(15_000),
      })
      if (res.ok) return
      const detail = await res.text().catch(() => '')
      throw new BadRequestException(
        `ElevenLabs rejected this key (${res.status}). Check you copied the full xi-api-key. ${detail.slice(0, 160)}`,
      )
    } catch (err) {
      if (err instanceof BadRequestException) throw err
      // Network hiccup: allow saving, the speak path will surface it again.
      this.logger.warn(`ElevenLabs key validation unreachable: ${err instanceof Error ? err.message : err}`)
    }
  }

  private async validateFish(key: string): Promise<void> {
    try {
      const res = await fetch('https://api.fish.audio/wallet/self-api', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (res.ok) return
      throw new BadRequestException(`Fish Audio rejected this key (${res.status}). Check you copied the full API key.`)
    } catch (err) {
      if (err instanceof BadRequestException) throw err
      this.logger.warn(`Fish key validation unreachable: ${err instanceof Error ? err.message : err}`)
    }
  }

  /** Safe view for the settings UI — never returns raw keys. */
  async configView(userId: string) {
    const cfg = await this.getUserConfig(userId)
    return {
      provider: cfg.provider || null,
      elevenlabsVoice: cfg.elevenlabsVoice,
      fishVoice: cfg.fishVoice,
      hasElevenlabsKey: Boolean(cfg.elevenlabsKey),
      hasFishKey: Boolean(cfg.fishKey),
      envElevenlabs: Boolean((this.config.get<string>('ELEVENLABS_API_KEY') ?? '').trim()),
      envFish: Boolean((this.config.get<string>('FISH_API_KEY') ?? '').trim()),
    }
  }

  /** Effective keys: per-user config first, env fallback. */
  private async resolveKeys(userId: string): Promise<{ elevenlabsKey: string; fishKey: string; provider: 'elevenlabs' | 'fish' | null; defaultVoice: string }> {
    const cfg = await this.getUserConfig(userId).catch(() => ({ ...EMPTY_CONFIG }))
    const elevenlabsKey = cfg.elevenlabsKey || (this.config.get<string>('ELEVENLABS_API_KEY') ?? '').trim()
    const fishKey = cfg.fishKey || (this.config.get<string>('FISH_API_KEY') ?? '').trim()
    const envElevenVoice = (this.config.get<string>('ELEVENLABS_VOICE_ID') ?? '').trim()
    const envFishVoice = (this.config.get<string>('FISH_REFERENCE_ID') ?? '').trim()
    const provider: 'elevenlabs' | 'fish' | null =
      cfg.provider === 'elevenlabs' || cfg.provider === 'fish'
        ? cfg.provider
        : elevenlabsKey
          ? 'elevenlabs'
          : fishKey
            ? 'fish'
            : null
    const defaultVoice =
      provider === 'elevenlabs'
        ? cfg.elevenlabsVoice || envElevenVoice
        : provider === 'fish'
          ? cfg.fishVoice || envFishVoice
          : ''
    return { elevenlabsKey, fishKey, provider, defaultVoice }
  }

  status() {
    return {
      provider: this.elevenKey()
        ? 'elevenlabs'
        : this.fishKey()
          ? 'fish'
          : null,
      elevenlabs: Boolean(this.elevenKey()),
      fish: Boolean(this.fishKey()),
      defaultVoice: this.defaultVoice(),
    }
  }

  /** Status for a specific user: their saved keys first, then env. */
  async statusFor(userId: string) {
    const keys = await this.resolveKeys(userId)
    return {
      provider: keys.provider,
      elevenlabs: Boolean(keys.elevenlabsKey),
      fish: Boolean(keys.fishKey),
      defaultVoice: keys.defaultVoice,
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

    const keys = await this.resolveKeys(userId)
    const requested = (opts?.provider ?? '').trim().toLowerCase()
    const primary = requested === 'elevenlabs' || requested === 'fish' ? requested : keys.provider
    if (!primary) {
      throw new ServiceUnavailableException(
        'No TTS provider configured. Add your ElevenLabs or Fish Audio key in Settings → Voice.',
      )
    }

    const voiceFallback = (p: 'elevenlabs' | 'fish') =>
      p === 'elevenlabs' ? (opts?.voiceId ?? '').trim() || cfg.elevenlabsVoice || (this.config.get<string>('ELEVENLABS_VOICE_ID') ?? '').trim() : (opts?.voiceId ?? '').trim() || cfg.fishVoice || (this.config.get<string>('FISH_REFERENCE_ID') ?? '').trim()
    const cfg = await this.getUserConfig(userId).catch(() => ({ ...EMPTY_CONFIG }))

    // Try the primary provider; on auth failure fall over to the other one
    // when it has a key, so one bad key never kills the voice entirely.
    const attempts: Array<'elevenlabs' | 'fish'> = [primary]
    const other = primary === 'elevenlabs' ? 'fish' : 'elevenlabs'
    if ((other === 'elevenlabs' && keys.elevenlabsKey) || (other === 'fish' && keys.fishKey)) attempts.push(other)

    let lastError: unknown = null
    for (const provider of attempts) {
      const voiceId = voiceFallback(provider) || keys.defaultVoice
      const cacheKey = createHash('sha1').update(`${provider}:${voiceId}:${clean}`).digest('hex')
      try {
        const mem = this.memCache.get(cacheKey)
        if (mem) return { ...mem, cached: true }
        const disk = await this.readDiskCache(cacheKey, provider, voiceId).catch(() => null)
        if (disk) {
          this.memCache.set(cacheKey, disk)
          return { ...disk, cached: true }
        }
        const result =
          provider === 'elevenlabs'
            ? await this.speakElevenLabs(clean, voiceId, keys.elevenlabsKey)
            : await this.speakFish(clean, voiceId, keys.fishKey)
        this.memCache.set(cacheKey, result)
        void this.writeDiskCache(cacheKey, result).catch((err) => this.logger.warn(`TTS cache write failed: ${err?.message ?? err}`))
        return result
      } catch (err) {
        lastError = err
        const msg = String(err?.message ?? err)
        const authFailed = /\(401\)|\(403\)|invalid_api_key|unauthorized/i.test(msg)
        if (!authFailed || provider === attempts[attempts.length - 1]) throw err
        this.logger.warn(`TTS provider ${provider} rejected the key — falling over to ${other}`)
      }
    }
    throw lastError ?? new ServiceUnavailableException('TTS failed')
  }

  private async speakElevenLabs(text: string, voiceId: string, apiKey: string): Promise<TtsResult> {
    const key = apiKey
    if (!key) throw new ServiceUnavailableException('Add your ElevenLabs API key in Settings → Voice')
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

  private async speakFish(text: string, voiceId: string, apiKey: string): Promise<TtsResult> {
    const key = apiKey
    if (!key) throw new ServiceUnavailableException('Add your Fish Audio API key in Settings → Voice')
    if (!voiceId) {
      throw new ServiceUnavailableException(
        'Fish Audio needs a voice: set a Reference ID in Settings → Voice (a voice/model id from fish.audio).',
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
    const keys = await this.resolveKeys(userId).catch(() => ({ elevenlabsKey: '', fishKey: '' }) as { elevenlabsKey: string; fishKey: string })
    const eleven = keys.elevenlabsKey
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
    const fish = keys.fishKey
    if (fish) {
      // Fish Audio lists voices through /model. Prefer the user's own cloned
      // voices; fall back to the public library when they have none yet.
      const fetchModels = async (selfOnly: boolean): Promise<Array<{ _id: string; title: string }>> => {
        const url = selfOnly
          ? 'https://api.fish.audio/model?self=true&page_size=30&page_num=1'
          : 'https://api.fish.audio/model?page_size=30&page_num=1&sort_by=task_count'
        try {
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${fish}` },
            signal: AbortSignal.timeout(20_000),
          })
          if (!res.ok) return []
          const body = (await res.json()) as { items?: Array<{ _id: string; title: string }> }
          return body.items ?? []
        } catch (err) {
          this.logger.warn(`Fish voice list failed (self=${selfOnly}): ${err instanceof Error ? err.message : err}`)
          return []
        }
      }
      const own = await fetchModels(true)
      const seen = new Set(own.map((v) => v._id))
      for (const v of own) out.push({ id: v._id, name: v.title || 'My voice', provider: 'fish' })
      if (own.length === 0) {
        const popular = await fetchModels(false)
        for (const v of popular) {
          if (seen.has(v._id)) continue
          seen.add(v._id)
          out.push({ id: v._id, name: v.title || 'Voice', provider: 'fish' })
        }
      }
    }
    return out
  }

  /**
   * ElevenLabs instant voice clone: upload a short clean sample (>=10s),
   * get a voice_id back. Store the returned id like any voice id.
   */
  async clone(userId: string, input: { name: string; audioBase64: string; mimeType?: string }): Promise<{ voiceId: string; provider: 'elevenlabs' }> {
    const keys = await this.resolveKeys(userId)
    const key = keys.elevenlabsKey
    if (!key) throw new ServiceUnavailableException('Voice cloning needs an ElevenLabs API key in Settings → Voice')
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
