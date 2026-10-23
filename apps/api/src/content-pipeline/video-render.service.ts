import { Injectable, Logger } from '@nestjs/common'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { AudioGenerationTool } from '../tools/connectors/audio-generation.tool'
import { buildRenderArgs, resolveOrientation, truncateTitle, type VideoOrientation } from './video-render-args'

const FFMPEG_TIMEOUT_MS = 120_000

export interface VideoRenderResult {
  success: boolean
  error?: string
  videoPath?: string
  audioPath?: string
  orientation?: VideoOrientation
  title?: string
}

@Injectable()
export class VideoRenderService {
  private readonly logger = new Logger(VideoRenderService.name)

  constructor(private readonly audioGeneration: AudioGenerationTool) {}

  async render(input: {
    narrationText?: string
    audioPath?: string
    orientation?: string
    titleText?: string
    backgroundImagePath?: string
  }): Promise<VideoRenderResult> {
    try {
      const orientation = resolveOrientation(input.orientation)
      const title = truncateTitle(input.titleText ?? '')

      let audioPath = input.audioPath?.trim() || ''
      if (!audioPath) {
        if (!input.narrationText?.trim()) {
          return { success: false, error: 'Either narrationText or audioPath is required.' }
        }
        let tts = await this.audioGeneration.generate({ text: input.narrationText.slice(0, 4000), format: 'mp3', save_to_file: true }, '')
        if (!tts.success && (process.env.ELEVENLABS_API_KEY ?? '').trim()) {
          this.logger.warn('OpenAI TTS unavailable — falling back to ElevenLabs narration')
          tts = await this.audioGeneration.generate({ text: input.narrationText.slice(0, 4000), provider: 'elevenlabs', format: 'mp3', save_to_file: true }, '')
        }
        const ttsOut = (tts.output ?? null) as { file_path?: string } | null
        if (!tts.success || !ttsOut?.file_path) {
          return { success: false, error: `Narration TTS failed: ${tts.error ?? 'no file produced'}` }
        }
        audioPath = String(ttsOut.file_path)
      }
      if (!fs.existsSync(audioPath)) {
        return { success: false, error: `Audio file not found: ${audioPath}` }
      }
      let backgroundImagePath = input.backgroundImagePath?.trim() || ''
      if (backgroundImagePath && !fs.existsSync(backgroundImagePath)) {
        this.logger.warn(`Background image missing, falling back to solid color: ${backgroundImagePath}`)
        backgroundImagePath = ''
      }

      const outputPath = path.join(os.tmpdir(), `openagents-video-${randomUUID()}.mp4`)
      const spec = {
        orientation,
        audioPath,
        outputPath,
        backgroundImagePath: backgroundImagePath || null,
        titleText: title || null,
      }

      let args = buildRenderArgs(spec)
      try {
        await this.runFfmpeg(args)
      } catch (drawtextError) {
        if (!spec.titleText) throw drawtextError
        this.logger.warn(`Render with title overlay failed (${drawtextError instanceof Error ? drawtextError.message : String(drawtextError)}); retrying without overlay`)
        args = buildRenderArgs({ ...spec, titleText: null })
        await this.runFfmpeg(args)
      }

      const size = fs.statSync(outputPath).size
      this.logger.log(`Rendered ${outputPath} (${Math.round(size / 1024)} KB, ${orientation})`)
      return { success: true, videoPath: outputPath, audioPath, orientation, title }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Video render failed.' }
    }
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile('ffmpeg', args, { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, _stdout, stderr) => {
        if (err) {
          const tail = String(stderr ?? '').split('\n').slice(-6).join(' ').slice(0, 400)
          reject(new Error(`ffmpeg failed: ${tail || err.message}`))
          return
        }
        resolve()
      })
    })
  }
}
