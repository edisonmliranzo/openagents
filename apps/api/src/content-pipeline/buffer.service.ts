import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'node:fs'

const BUFFER_API = 'https://api.buffer.com/1'
const MAX_TEXT = 5000

export interface BufferProfile {
  id: string
  service: string
  service_username?: string
  formatted_service?: string
  avatar?: string
}

export interface BufferListResult {
  success: boolean
  profiles?: BufferProfile[]
  error?: string
}

export interface BufferPostResult {
  success: boolean
  bufferResponse?: unknown
  error?: string
}

@Injectable()
export class BufferService {
  private readonly logger = new Logger(BufferService.name)

  resolveToken(userToken?: string | null): string | null {
    const token = (userToken ?? '').trim() || (process.env.BUFFER_ACCESS_TOKEN ?? '').trim()
    return token || null
  }

  async listProfiles(token: string): Promise<BufferListResult> {
    try {
      const res = await fetch(`${BUFFER_API}/profiles.json?access_token=${encodeURIComponent(token)}`, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        return { success: false, error: `Buffer API ${res.status}: ${(await res.text()).slice(0, 300)}` }
      }
      const data = (await res.json()) as any[]
      const profiles: BufferProfile[] = (Array.isArray(data) ? data : [])
        .filter((p) => p && p.id)
        .map((p) => ({
          id: String(p.id),
          service: String(p.service ?? ''),
          service_username: p.service_username ?? undefined,
          formatted_service: p.formatted_service ?? undefined,
          avatar: p.avatar ?? undefined,
        }))
      return { success: true, profiles }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Buffer request failed.' }
    }
  }

  /**
   * Create (and by default immediately queue) an update on a Buffer profile.
   * mediaPath: optional image/video file uploaded as multipart media.
   */
  async createUpdate(input: {
    token: string
    profileId: string
    text: string
    mediaPath?: string | null
    scheduledAt?: string | null
  }): Promise<BufferPostResult> {
    try {
      const form = new FormData()
      form.append('text', String(input.text ?? '').slice(0, MAX_TEXT))
      if (input.scheduledAt) form.append('scheduled_at', input.scheduledAt)
      else form.append('now', 'true')

      if (input.mediaPath && fs.existsSync(input.mediaPath)) {
        const bytes = fs.readFileSync(input.mediaPath)
        const isVideo = /\.(mp4|mov|webm)$/i.test(input.mediaPath)
        form.append(
          isVideo ? 'media[video]' : 'media[photo]',
          new Blob([new Uint8Array(bytes)], { type: isVideo ? 'video/mp4' : 'image/png' }),
          path_base(input.mediaPath),
        )
      }

      const res = await fetch(
        `${BUFFER_API}/${encodeURIComponent(input.profileId)}/updates/create.json?access_token=${encodeURIComponent(input.token)}`,
        { method: 'POST', body: form },
      )
      const body = (await res.text()).slice(0, 2000)
      if (!res.ok) {
        this.logger.warn(`Buffer create update failed: ${res.status} ${body.slice(0, 200)}`)
        return { success: false, error: `Buffer API ${res.status}: ${body}` }
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(body)
      } catch {
        parsed = { raw: body }
      }
      return { success: true, bufferResponse: parsed }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Buffer request failed.' }
    }
  }
}

function path_base(p: string): string {
  const parts = String(p).split(/[\\/]/)
  return parts[parts.length - 1] || 'media'
}
