import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { PrismaService } from '../prisma/prisma.service'
import { EmbeddingService } from '../memory/embedding.service'
import { cosineSimilarity, parseEmbedding } from '../agent/embeddings'

const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 100
const WATCH_INTERVAL_MS = 5 * 60 * 1000
const WATCH_EXTENSIONS = new Set(['.md', '.txt', '.csv', '.json'])

export interface LibraryHit {
  documentId: string
  title: string
  text: string
  score: number
  ordinal: number
}

@Injectable()
export class LibraryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LibraryService.name)
  private timer?: NodeJS.Timeout

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const dir = this.watchDir
    if (!dir) return
    this.timer = setInterval(() => void this.scanWatchFolder(), WATCH_INTERVAL_MS)
    this.timer.unref()
    void this.scanWatchFolder()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private get watchDir(): string {
    return (this.config.get<string>('LIBRARY_WATCH_DIR') ?? '').trim()
  }

  /** Ingest text content as a library document (chunked + embedded). */
  async addText(userId: string, input: { title: string; content: string; source?: string; mimeType?: string }) {
    const title = String(input.title ?? '').trim().slice(0, 200)
    const content = String(input.content ?? '').trim()
    if (!title || !content) throw new BadRequestException('title and content are required.')

    const chunks = this.chunkText(content)
    const doc = await this.prisma.libraryDocument.create({
      data: {
        userId,
        title,
        source: String(input.source ?? 'upload').slice(0, 200),
        mimeType: String(input.mimeType ?? 'text/plain').slice(0, 80),
        status: 'processing',
      },
    })

    let embedded = 0
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!
      const result = await this.embeddings.embed(chunk)
      await this.prisma.libraryChunk.create({
        data: {
          userId,
          documentId: doc.id,
          ordinal: i,
          text: chunk,
          embedding: result ? this.embeddings.serialize(result.vector) : null,
        },
      })
      if (result) embedded += 1
    }

    const updated = await this.prisma.libraryDocument.update({
      where: { id: doc.id },
      data: { status: 'indexed', chunkCount: chunks.length },
    })
    this.logger.log(`Library indexed "${title}" (${chunks.length} chunks, ${embedded} embedded)`)
    return { ...updated, chunks: chunks.length }
  }

  listDocuments(userId: string) {
    return this.prisma.libraryDocument.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, title: true, source: true, mimeType: true, status: true, chunkCount: true, updatedAt: true },
    })
  }

  async removeDocument(userId: string, id: string) {
    const existing = await this.prisma.libraryDocument.findFirst({ where: { id, userId } })
    if (!existing) throw new BadRequestException('Document not found.')
    await this.prisma.libraryDocument.delete({ where: { id: existing.id } })
    return { ok: true }
  }

  /** Semantic search across the user's library. Returns cited chunks. */
  async search(userId: string, query: string, topK = 6): Promise<LibraryHit[]> {
    const clean = String(query ?? '').trim()
    if (!clean) return []
    const embedded = await this.embeddings.embed(clean)
    if (!embedded) return []

    const rows = await this.prisma.libraryChunk.findMany({
      where: { userId, embedding: { not: null } },
      select: { id: true, documentId: true, text: true, ordinal: true, embedding: true, document: { select: { title: true } } },
      take: 3000,
    })

    const scored: LibraryHit[] = []
    for (const row of rows) {
      const vector = parseEmbedding(row.embedding)
      if (!vector) continue
      const score = cosineSimilarity(embedded.vector, vector)
      if (score < 0.2) continue
      scored.push({ documentId: row.documentId, title: row.document.title, text: row.text, score, ordinal: row.ordinal })
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(topK, 20)))
  }

  private async scanWatchFolder() {
    const dir = this.watchDir
    if (!dir) return
    try {
      const stat = await fs.stat(dir).catch(() => null)
      if (!stat?.isDirectory()) return
      const owner =
        (this.config.get<string>('LIBRARY_WATCH_USER_ID') ?? '').trim() ||
        (await this.prisma.user.findFirst({ select: { id: true } }))?.id ||
        ''
      if (!owner) return
      const files = await fs.readdir(dir)
      for (const file of files.slice(0, 50)) {
        const ext = path.extname(file).toLowerCase()
        if (!WATCH_EXTENSIONS.has(ext)) continue
        const fullPath = path.join(dir, file)
        const exists = await this.prisma.libraryDocument.findFirst({ where: { source: fullPath } })
        if (exists) continue
        const content = await fs.readFile(fullPath, 'utf-8').catch(() => '')
        if (!content.trim()) continue
        await this.addText(owner, {
          title: file,
          content: content.slice(0, 200_000),
          source: fullPath,
          mimeType: `text/${ext.slice(1)}`,
        }).catch((error: any) => this.logger.warn(`Watch import failed for ${file}: ${error?.message ?? error}`))
      }
    } catch (error: any) {
      this.logger.warn(`Library watch scan failed: ${error?.message ?? error}`)
    }
  }

  private chunkText(text: string): string[] {
    const clean = text.replace(/\r\n/g, '\n')
    if (clean.length <= CHUNK_SIZE) return [clean]
    const chunks: string[] = []
    let start = 0
    while (start < clean.length) {
      let end = Math.min(start + CHUNK_SIZE, clean.length)
      if (end < clean.length) {
        const newline = clean.lastIndexOf('\n', end)
        if (newline > start + CHUNK_SIZE / 2) end = newline
      }
      chunks.push(clean.slice(start, end).trim())
      if (end >= clean.length) break
      start = Math.max(end - CHUNK_OVERLAP, start + 1)
    }
    return chunks.filter(Boolean)
  }
}
