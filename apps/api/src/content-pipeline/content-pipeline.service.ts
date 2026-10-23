import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { DocumentStore } from '../prisma/document-store.service'
import { LLMService } from '../agent/llm.service'
import { CronService } from '../cron/cron.service'
import { PushService } from '../notifications/push.service'
import { TtsService } from '../life/tts.service'
import { VideoRenderService } from './video-render.service'
import { BufferService, type BufferProfile } from './buffer.service'
import { resolveOrientation } from './video-render-args'

const OPENAI_VOICES = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'])

const CONFIG_KIND = 'content-pipeline-config'
const PIPELINE_CRON_NAME = 'Daily content pipeline'

export interface ListProfilesResult {
  success: boolean
  profiles?: BufferProfile[]
  error?: string
}

export interface PipelineConfig {
  niche: string
  audience: string
  tone: string
  platform: string
  orientation: string
  voice: string
  language: string
  topicHint: string
  bufferProfileId: string
  bufferAccessToken: string
  scheduleCron: string
  autoPost: boolean
  notify: boolean
  cronJobId: string
  lastRunSummary: string
}

const DEFAULT_CONFIG: PipelineConfig = {
  niche: 'daily tech and AI news for builders',
  audience: 'tech-curious social media followers',
  tone: 'energetic, conversational, hook-first',
  platform: 'tiktok',
  orientation: 'vertical',
  voice: '',
  language: 'English',
  topicHint: '',
  bufferProfileId: '',
  bufferAccessToken: '',
  scheduleCron: '',
  autoPost: false,
  notify: true,
  cronJobId: '',
  lastRunSummary: '',
}

export interface PipelineRunResult {
  topic: string
  hook: string
  script: string
  caption: string
  hashtags: string[]
  audioPath: string
  videoPath: string
  orientation: string
  durationNote: string
  post: { attempted: boolean; dryRun: boolean; status: string }
  notification: { sent: number }
}

@Injectable()
export class ContentPipelineService {
  private readonly logger = new Logger(ContentPipelineService.name)

  constructor(
    private readonly docs: DocumentStore,
    private readonly llm: LLMService,
    private readonly cron: CronService,
    private readonly push: PushService,
    private readonly tts: TtsService,
    private readonly videoRender: VideoRenderService,
    private readonly buffer: BufferService,
  ) {}

  async getConfig(userId: string): Promise<PipelineConfig & { hasBufferToken: boolean }> {
    const config = await this.docs.read<PipelineConfig>(userId, CONFIG_KIND, () => ({ ...DEFAULT_CONFIG }))
    return { ...DEFAULT_CONFIG, ...config, bufferAccessToken: '', hasBufferToken: Boolean(config.bufferAccessToken || process.env.BUFFER_ACCESS_TOKEN) }
  }

  async configure(userId: string, patch: Partial<PipelineConfig>): Promise<PipelineConfig & { hasBufferToken: boolean }> {
    const current = await this.docs.read<PipelineConfig>(userId, CONFIG_KIND, () => ({ ...DEFAULT_CONFIG }))
    const merged: PipelineConfig = { ...DEFAULT_CONFIG, ...current }

    for (const key of ['niche', 'audience', 'tone', 'platform', 'orientation', 'voice', 'language', 'topicHint', 'bufferProfileId'] as const) {
      if (patch[key] !== undefined) merged[key] = String(patch[key]).trim().slice(0, 500)
    }
    if (patch.scheduleCron !== undefined) merged.scheduleCron = String(patch.scheduleCron).trim().slice(0, 100)
    if (patch.autoPost !== undefined) merged.autoPost = Boolean(patch.autoPost)
    if (patch.notify !== undefined) merged.notify = Boolean(patch.notify)
    if (patch.bufferAccessToken !== undefined) {
      const token = String(patch.bufferAccessToken).trim()
      merged.bufferAccessToken = token ? token.slice(0, 300) : ''
      if (!token) merged.bufferAccessToken = current.bufferAccessToken
    }

    if (merged.orientation) merged.orientation = resolveOrientation(merged.orientation)
    if (!merged.notify) merged.autoPost = merged.autoPost && Boolean(merged.bufferProfileId)

    merged.cronJobId = await this.syncSchedule(userId, merged, current)
    await this.docs.write(userId, CONFIG_KIND, merged)
    this.logger.log(`Content pipeline configured for user ${userId} (schedule: ${merged.scheduleCron || 'manual'})`)
    return { ...merged, bufferAccessToken: '', hasBufferToken: Boolean(merged.bufferAccessToken || process.env.BUFFER_ACCESS_TOKEN) }
  }

  /** Create/replace the daily cron job when scheduleCron is set. */
  private async syncSchedule(userId: string, merged: PipelineConfig, current: PipelineConfig): Promise<string> {
    const wantsSchedule = Boolean(merged.scheduleCron)
    const changed = merged.scheduleCron !== current.scheduleCron
    if (wantsSchedule && (changed || !merged.cronJobId)) {
      const job = await this.cron.createJob(userId, {
        name: PIPELINE_CRON_NAME,
        description: 'Runs the daily content-creator pipeline: script, narration video, post, notify.',
        scheduleKind: 'cron',
        scheduleValue: merged.scheduleCron,
        sessionTarget: 'isolated',
        payloadKind: 'agentTurn',
        payloadText:
          'Run my daily content pipeline now: call the content_pipeline_run tool, then confirm the topic and where the video was saved or posted.',
      })
      return job.id
    }
    return merged.cronJobId
  }

  /** List the user's Buffer social profiles (token from config or env). */
  async listBufferProfiles(userId: string): Promise<ListProfilesResult> {
    const raw = await this.docs.read<PipelineConfig>(userId, CONFIG_KIND, () => ({ ...DEFAULT_CONFIG }))
    const merged: PipelineConfig = { ...DEFAULT_CONFIG, ...raw }
    const token = this.buffer.resolveToken(merged.bufferAccessToken)
    if (!token) {
      return { success: false, error: 'No Buffer access token. Configure bufferAccessToken first (or set BUFFER_ACCESS_TOKEN).' }
    }
    return this.buffer.listProfiles(token)
  }

  async run(userId: string, options?: { dryRun?: boolean }): Promise<PipelineRunResult | { error: string }> {
    const dryRun = options?.dryRun === true
    const config = await this.docs.read<PipelineConfig>(userId, CONFIG_KIND, () => ({ ...DEFAULT_CONFIG }))
    const merged: PipelineConfig = { ...DEFAULT_CONFIG, ...config }

    try {
      // 1. Script + caption generation
      const generated = await this.generateContent(merged)
      if ('error' in generated) return { error: generated.error }
      const { topic, hook, script, caption, hashtags } = generated

      // 2. Narration (user's configured voice first: Fish/ElevenLabs) + video render
      let audioPath: string | undefined
      let narrationProvider = 'user voice (Settings → Voice)'
      const requestedVoice = merged.voice && !OPENAI_VOICES.has(merged.voice) ? merged.voice : ''
      const elevenVoice = requestedVoice && !requestedVoice.startsWith('us-preset-') ? requestedVoice : '21m00Tcm4TlvDq8ikWAM'
      const attempts: Array<{ label: string; opts?: { voiceId?: string; provider?: string } }> = [
        { label: 'per-user TTS (configured provider)', opts: requestedVoice ? { voiceId: requestedVoice } : undefined },
        { label: 'per-user TTS (ElevenLabs)', opts: { provider: 'elevenlabs', voiceId: elevenVoice } },
      ]
      for (const attempt of attempts) {
        try {
          const speech = await this.tts.speak(userId, script, attempt.opts)
          const file = path.join(os.tmpdir(), `openagents-pipeline-narration-${randomUUID()}.mp3`)
          fs.writeFileSync(file, Buffer.from(speech.audioBase64, 'base64'))
          audioPath = file
          narrationProvider = `${attempt.label} (${speech.provider}${speech.cached ? ', cached' : ''})`
          break
        } catch (ttsErr: any) {
          this.logger.warn(`Narration attempt failed — ${attempt.label}: ${ttsErr?.message ?? ttsErr}`)
        }
      }
      if (!audioPath) narrationProvider = 'env TTS fallback'

      const render = await this.videoRender.render({
        narrationText: script,
        audioPath,
        orientation: merged.orientation,
        titleText: hook,
      })
        if (!render.success || !render.videoPath) return { error: `Video render failed: ${render.error ?? 'unknown error'}` }

      // 3. Post via Buffer
      const token = this.buffer.resolveToken(merged.bufferAccessToken)
      let post: PipelineRunResult['post'] = { attempted: false, dryRun, status: 'skipped: autoPost disabled or Buffer not configured' }
      if (merged.autoPost && merged.bufferProfileId && token) {
        if (dryRun) {
          post = { attempted: false, dryRun: true, status: `dry run: would post to Buffer profile ${merged.bufferProfileId}` }
        } else {
          const result = await this.buffer.createUpdate({
            token,
            profileId: merged.bufferProfileId,
            text: `${caption}\n\n${hashtags.join(' ')}`.trim(),
            mediaPath: render.videoPath,
          })
          post = { attempted: true, dryRun: false, status: result.success ? 'posted to Buffer' : `failed: ${result.error}` }
        }
      }

      // 4. Notify
      let notification = { sent: 0 }
      if (merged.notify) {
        const body = post.attempted
          ? `"${topic}" — video ${post.status}.`
          : `"${topic}" — video ready at ${render.videoPath}`
        notification = await this.push.sendToUser(userId, {
          title: 'Daily video ready',
          body,
          url: '/content-pipeline',
        })
      }

      const result: PipelineRunResult = {
        topic,
        hook,
        script,
        caption,
        hashtags,
        audioPath: render.audioPath,
        videoPath: render.videoPath,
        orientation: render.orientation,
        durationNote: `narration via ${narrationProvider}; narration length drives video duration`,
        post,
        notification,
      }

      merged.lastRunSummary = `${new Date().toISOString()} — topic: ${topic}; post: ${post.status}`
      await this.docs.write(userId, CONFIG_KIND, merged)
      this.logger.log(`Pipeline run for user ${userId}: ${post.status}`)
      return result
    } catch (err: any) {
      this.logger.error(`Pipeline run failed for user ${userId}: ${err?.message}`)
      return { error: err?.message ?? 'Pipeline run failed.' }
    }
  }

  private async generateContent(config: PipelineConfig): Promise<
    { topic: string; hook: string; script: string; caption: string; hashtags: string[] } | { error: string }
  > {
    const today = new Date().toISOString().slice(0, 10)
    const system = `You are a short-form video content director for ${config.platform}. You write daily social videos that get watched to the end. Respond ONLY with compact JSON.`
    const user = `Date: ${today}
Niche: ${config.niche}
Audience: ${config.audience}
Tone: ${config.tone}
Language: ${config.language}
${config.topicHint ? `Topic direction from the creator: ${config.topicHint}` : ''}

Produce ONE video concept for today as JSON with exactly these fields:
{"topic": "<=60 chars", "hook": "<=90 chars, the opening line that stops the scroll", "script": "narration script, 70-120 words, plain spoken text, no stage directions", "caption": "post caption, 1-2 sentences", "hashtags": ["#tag1", "#tag2", "#tag3"]}`
    try {
      const response = await this.llm.complete(
        [{ role: 'user', content: user }],
        [],
        system,
      )
      const content = String(response.content ?? '')
      const parsed = this.parseJson(content) ?? this.salvageFields(content)
      if (!parsed?.script) return { error: `Script generation returned unusable content: ${content.slice(0, 200)}` }
      const hashtags = Array.isArray(parsed.hashtags)
        ? parsed.hashtags.slice(0, 8).map((t: unknown) => String(t).slice(0, 40))
        : []
      return {
        topic: String(parsed.topic ?? 'Daily update').slice(0, 120),
        hook: String(parsed.hook ?? parsed.topic ?? '').slice(0, 140),
        script: String(parsed.script).slice(0, 3500),
        caption: String(parsed.caption ?? parsed.topic ?? '').slice(0, 600),
        hashtags,
      }
    } catch (err: any) {
      return { error: `Script generation failed: ${err?.message}` }
    }
  }

  private parseJson(text: string): Record<string, unknown> | null {
    const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) return null
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      return null
    }
  }

  /**
   * Salvage fields from a truncated JSON response (small local models often
   * hit their token budget mid-script). Field-wise regex extraction keeps a
   * mostly-complete run usable instead of failing the whole pipeline.
   */
  private salvageFields(text: string): Record<string, unknown> | null {
    const unquote = (raw: string): string | null => {
      if (!raw) return null
      try {
        return JSON.parse(`"${raw}"`)
      } catch {
        return raw
      }
    }
    const field = (name: string): string | null => {
      const match = new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text)
      return match ? unquote(match[1]) : null
    }
    const script = field('script')
    if (!script) return null
    const hashtagsMatch = /"hashtags"\s*:\s*\[([^\]]*)\]/.exec(text)
    const hashtags = hashtagsMatch
      ? Array.from(hashtagsMatch[1].matchAll(/"((?:[^"\\]|\\.)*)"/g), (m) => unquote(m[1] ?? ''))
          .filter((v): v is string => Boolean(v))
      : []
    return {
      topic: field('topic') ?? '',
      hook: field('hook') ?? '',
      script,
      caption: field('caption') ?? '',
      hashtags,
    }
  }
}
