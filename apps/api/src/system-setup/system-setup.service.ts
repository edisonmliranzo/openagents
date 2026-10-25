import { Injectable, Logger } from '@nestjs/common'
import { execFile } from 'node:child_process'
import { PrismaService } from '../prisma/prisma.service'

export interface CheckItem {
  id: string
  label: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
  fix?: string
}

export interface SetupHealth {
  generatedAt: string
  score: number
  ready: boolean
  checks: CheckItem[]
  nextSteps: string[]
}

const KEY_PRESETS: Array<{ env: string; label: string; fix: string }> = [
  { env: 'ANTHROPIC_API_KEY', label: 'Anthropic (Claude) LLM key', fix: 'Add ANTHROPIC_API_KEY to apps/api/.env for first-class LLM access.' },
  { env: 'OPENAI_API_KEY', label: 'OpenAI key (LLM + TTS + Whisper)', fix: 'Add a valid OPENAI_API_KEY to apps/api/.env — the current value looks like a placeholder.' },
  { env: 'GEMINI_API_KEY', label: 'Gemini key', fix: 'Add GEMINI_API_KEY to apps/api/.env for provider fallback.' },
  { env: 'ELEVENLABS_API_KEY', label: 'ElevenLabs TTS key', fix: 'Add ELEVENLABS_API_KEY (or configure a voice key in Settings → Voice).' },
  { env: 'BRAVE_SEARCH_API_KEY', label: 'Brave web search key', fix: 'Add BRAVE_SEARCH_API_KEY for high-quality web search.' },
  { env: 'SEARXNG_API_KEY', label: 'SearXNG search key', fix: 'Optional: SEARXNG_API_KEY as a search fallback.' },
  { env: 'STABILITY_API_KEY', label: 'Stability image key', fix: 'Optional: STABILITY_API_KEY for image generation.' },
]

/**
 * The 5-minute-onboarding backend: one endpoint that tells a fresh (or
 * broken) install exactly what works, what is missing, and what to do next.
 */
@Injectable()
export class SystemSetupService {
  private readonly logger = new Logger(SystemSetupService.name)

  constructor(private readonly prisma: PrismaService) {}

  async health(userId: string | null): Promise<SetupHealth> {
    const checks: CheckItem[] = []
    const nextSteps: string[] = []

    // 1. Database
    try {
      await this.prisma.$queryRaw`SELECT 1`
      checks.push({ id: 'database', label: 'PostgreSQL database', status: 'ok', detail: 'Connected.' })
    } catch (err: any) {
      checks.push({
        id: 'database', label: 'PostgreSQL database', status: 'fail',
        detail: `Unreachable: ${err?.message ?? 'unknown error'}`,
        fix: 'Start the Postgres container (docker start docker-postgres-1) and check DATABASE_URL.',
      })
    }

    // 2. Provider keys (presence + placeholder detection)
    for (const preset of KEY_PRESETS) {
      const raw = (process.env[preset.env] ?? '').trim()
      if (!raw) {
        checks.push({ id: `key_${preset.env}`, label: preset.label, status: 'warn', detail: 'Not set.', fix: preset.fix })
      } else if (raw.length < 10 || /^(sk-?xxx|xxx|placeholder|your[-_]?key|change[-_]?me)/i.test(raw)) {
        checks.push({ id: `key_${preset.env}`, label: preset.label, status: 'fail', detail: `Set but looks like a placeholder ("${raw.slice(0, 4)}...").`, fix: preset.fix })
      } else {
        checks.push({ id: `key_${preset.env}`, label: preset.label, status: 'ok', detail: `Set (${raw.slice(0, 3)}...${raw.slice(-3)}).` })
      }
    }

    // 3. Local Ollama (offline LLM fallback)
    try {
      const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const body = (await res.json()) as { models?: unknown[] }
        checks.push({
          id: 'ollama', label: 'Local Ollama fallback', status: 'ok',
          detail: `${body.models?.length ?? 0} local model(s) available.`,
        })
      } else {
        checks.push({ id: 'ollama', label: 'Local Ollama fallback', status: 'warn', detail: `Port 11434 responded ${res.status}.` })
      }
    } catch {
      checks.push({ id: 'ollama', label: 'Local Ollama fallback', status: 'warn', detail: 'Not reachable on 127.0.0.1:11434.', fix: 'Optional: install Ollama for a zero-cost offline LLM fallback.' })
    }

    // 4. ffmpeg (video narration pipeline)
    checks.push(await this.checkFfmpeg())

    // 5. Web push (notifications)
    const hasPushKeys = Boolean((process.env.VAPID_PUBLIC_KEY ?? '').trim() && (process.env.VAPID_PRIVATE_KEY ?? '').trim())
    checks.push(hasPushKeys
      ? { id: 'push', label: 'Web push notifications', status: 'ok', detail: 'VAPID keys configured.' }
      : { id: 'push', label: 'Web push notifications', status: 'warn', detail: 'VAPID keys not configured.', fix: 'Set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY so the assistant can notify you.' })

    // 6. User-level readiness
    if (userId) {
      try {
        const [memoryCount, skillCount, pipelineRows] = await Promise.all([
          this.prisma.memoryFact.count({ where: { userId } }),
          this.prisma.userSkill.count({ where: { userId } }),
          this.prisma.userDocument.count({ where: { userId, kind: 'content-pipeline-config' } }),
        ])
        checks.push({
          id: 'user_memory', label: 'Assistant memory',
          status: memoryCount > 0 ? 'ok' : 'warn',
          detail: memoryCount > 0 ? `${memoryCount} facts remembered.` : 'No facts yet — the assistant learns as you talk.',
        })
        checks.push({
          id: 'user_skills', label: 'Your skill library',
          status: skillCount > 0 ? 'ok' : 'warn',
          detail: `${skillCount} skill(s) saved.`,
        })
        if (pipelineRows > 0) checks.push({ id: 'content_pipeline', label: 'Content creator pipeline', status: 'ok', detail: 'Configured.' })
        if (memoryCount === 0) nextSteps.push('Tell the assistant about yourself in chat — it saves durable facts automatically.')
        if (skillCount === 0) nextSteps.push('Ask the assistant to "teach yourself" any topic; learned procedures become skills.')
        nextSteps.push('Try: "run my content pipeline" or "crawl <docs url> into my library".')
      } catch (err: any) {
        this.logger.warn(`User readiness check failed: ${err?.message ?? err}`)
      }
    }

    const failed = checks.filter((c) => c.status === 'fail')
    const warned = checks.filter((c) => c.status === 'warn')
    for (const c of failed) nextSteps.push(c.fix ?? `Fix: ${c.label}`)
    const score = Math.round(
      (checks.filter((c) => c.status === 'ok').length / Math.max(1, checks.length)) * 100,
    )

    return {
      generatedAt: new Date().toISOString(),
      score,
      ready: failed.length === 0 && this.prisma ? checks.some((c) => c.id === 'database' && c.status === 'ok') : false,
      checks,
      nextSteps: [...new Set(nextSteps)].slice(0, 8),
    }
  }

  private checkFfmpeg(): Promise<CheckItem> {
    return new Promise((resolve) => {
      execFile('ffmpeg', ['-version'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
        if (err) {
          resolve({
            id: 'ffmpeg', label: 'ffmpeg (video narration)', status: 'warn',
            detail: 'Not found on PATH.',
            fix: 'Install ffmpeg (winget install Gyan.FFmpeg) to enable the narration-video pipeline.',
          })
          return
        }
        const first = String(stdout).split('\n')[0] ?? 'installed'
        resolve({ id: 'ffmpeg', label: 'ffmpeg (video narration)', status: 'ok', detail: first.slice(0, 80) })
      })
    })
  }
}
