import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { promises as fs } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { isAbsolute, join, resolve } from 'node:path'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'

const MAX_IMAGE_BYTES = 6 * 1024 * 1024

@Injectable()
export class ClipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly config: ConfigService,
  ) {}

  /** Store a screenshot/text/link clip; captions images via a vision model when available. */
  async create(
    userId: string,
    input: { kind?: string; text?: string; sourceUrl?: string; imageBase64?: string; caption?: string },
  ) {
    const kind = ['image', 'text', 'link'].includes(String(input.kind)) ? String(input.kind) : input.imageBase64 ? 'image' : 'text'
    let imagePath: string | null = null
    let caption = input.caption?.trim() || null

    if (kind === 'image') {
      const b64 = String(input.imageBase64 ?? '').replace(/^data:image\/\w+;base64,/, '')
      if (!b64) throw new BadRequestException('imageBase64 is required for image clips')
      const buf = Buffer.from(b64, 'base64')
      if (buf.length > MAX_IMAGE_BYTES) throw new BadRequestException('Image too large (max 6MB)')
      const dir = this.clipsDir()
      await fs.mkdir(dir, { recursive: true })
      imagePath = join(dir, `${randomBytes(12).toString('hex')}.png`)
      await fs.writeFile(imagePath, buf)
      caption = caption ?? (await this.captionImage(imagePath).catch(() => null))
    }

    const text = kind === 'image' ? (input.text ?? '') : String(input.text ?? '').trim()
    if (kind !== 'image' && !text && !input.sourceUrl) {
      throw new BadRequestException('Add text or a source URL to clip.')
    }

    return this.prisma.memoryClip.create({
      data: {
        userId,
        kind,
        sourceUrl: input.sourceUrl?.slice(0, 1000) ?? null,
        imagePath,
        text: text.slice(0, 8000),
        caption: caption?.slice(0, 1000) ?? null,
      },
    })
  }

  list(userId: string, q?: string) {
    const where: Record<string, unknown> = { userId }
    if (q?.trim()) {
      where.OR = [
        { text: { contains: q.trim() } },
        { caption: { contains: q.trim() } },
        { sourceUrl: { contains: q.trim() } },
      ]
    }
    return this.prisma.memoryClip.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
  }

  async remove(userId: string, id: string) {
    const clip = await this.prisma.memoryClip.findFirst({ where: { id, userId } })
    if (!clip) throw new NotFoundException('Clip not found')
    await this.prisma.memoryClip.delete({ where: { id } })
    if (clip.imagePath) await fs.unlink(clip.imagePath).catch(() => undefined)
    return { ok: true }
  }

  /** Ask a local vision model (if configured) to describe the screenshot. */
  private async captionImage(imagePath: string): Promise<string | null> {
    const model = (this.config.get<string>('VISION_MODEL') ?? '').trim()
    if (!model) return null
    const ollamaUrl = (this.config.get<string>('OLLAMA_BASE_URL') ?? 'http://127.0.0.1:11434').replace(/\/$/, '')
    const data = await fs.readFile(imagePath)
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: 'Describe this screenshot in one short sentence.', images: [data.toString('base64')], stream: false }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { response?: string }
    const text = String(body.response ?? '').trim()
    return text.length ? text.slice(0, 500) : null
  }

  private clipsDir(): string {
    const raw = this.config.get<string>('CLIPS_DIR') ?? 'data/clips'
    return isAbsolute(raw) ? raw : resolve(process.cwd(), raw)
  }
}
