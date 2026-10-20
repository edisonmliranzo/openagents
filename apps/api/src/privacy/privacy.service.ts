import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import * as path from 'path'
import { PrismaService } from '../prisma/prisma.service'

/** Prefix for memory content encrypted by the privacy vault (distinct from users.service `enc:v1:`). */
export const VAULT_PREFIX = 'vault:v1:'

export interface PrivacySettings {
  /** When true, all LLM calls for this user must use the local `ollama` provider. */
  localOnly: boolean
  /** Ollama model to use while local-only is on (optional). */
  localModel?: string
}

interface PrivacyFile {
  settings: PrivacySettings
  sensitiveMemoryIds: string[]
}

const safeId = (userId: string) => userId.replace(/[^a-zA-Z0-9_-]/g, '_')

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name)
  private readonly dataRoot = path.resolve(process.env.OPENAGENTS_DATA_DIR ?? path.join(process.cwd(), 'data'))
  private readonly dir = path.join(this.dataRoot, 'privacy')
  private readonly cache = new Map<string, PrivacyFile>()

  constructor(private readonly prisma: PrismaService) {}

  // ── Settings / local-only ─────────────────────────────────────────────────

  private async load(userId: string): Promise<PrivacyFile> {
    const cached = this.cache.get(userId)
    if (cached) return cached
    let data: PrivacyFile = { settings: { localOnly: false }, sensitiveMemoryIds: [] }
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(this.dir, `${safeId(userId)}.json`), 'utf8'))
      data = {
        settings: { localOnly: !!parsed?.settings?.localOnly, localModel: parsed?.settings?.localModel || undefined },
        sensitiveMemoryIds: Array.isArray(parsed?.sensitiveMemoryIds) ? parsed.sensitiveMemoryIds : [],
      }
    } catch {
      // defaults
    }
    this.cache.set(userId, data)
    return data
  }

  private async save(userId: string, data: PrivacyFile) {
    this.cache.set(userId, data)
    try {
      await fs.mkdir(this.dir, { recursive: true })
      await fs.writeFile(path.join(this.dir, `${safeId(userId)}.json`), JSON.stringify(data, null, 2), 'utf8')
    } catch (error: any) {
      this.logger.warn(`Failed to persist privacy settings for ${userId}: ${error?.message ?? error}`)
    }
  }

  async getSettings(userId: string): Promise<PrivacySettings & { sensitiveMemoryCount: number }> {
    const data = await this.load(userId)
    return { ...data.settings, sensitiveMemoryCount: data.sensitiveMemoryIds.length }
  }

  async updateSettings(userId: string, patch: Partial<PrivacySettings>) {
    const data = await this.load(userId)
    if (typeof patch.localOnly === 'boolean') data.settings.localOnly = patch.localOnly
    if (patch.localModel !== undefined) data.settings.localModel = String(patch.localModel || '').trim() || undefined
    await this.save(userId, data)
    return this.getSettings(userId)
  }

  /** True when the user enabled local-only mode: callers must force provider = 'ollama'. */
  async isLocalOnly(userId: string): Promise<boolean> {
    return (await this.load(userId)).settings.localOnly
  }

  /** Convenience: returns the provider/model to use, honoring local-only mode. */
  async resolveProvider<P extends string>(userId: string, provider: P, model?: string) {
    const data = await this.load(userId)
    if (!data.settings.localOnly) return { provider, model }
    return { provider: 'ollama' as const, model: data.settings.localModel }
  }

  // ── Sensitive memories (AES-256-GCM) ──────────────────────────────────────

  private key(): Buffer {
    const raw = (process.env.ENCRYPTION_KEY ?? '').trim() || (process.env.JWT_SECRET ?? '').trim() || 'openagents-local-dev-key'
    const hex = raw.replace(/^0x/i, '')
    if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex')
    return createHash('sha256').update(`privacy-vault:${raw}`).digest()
  }

  isEncrypted(value: string | null | undefined) {
    return !!value && value.startsWith(VAULT_PREFIX)
  }

  encrypt(plain: string): string {
    if (this.isEncrypted(plain)) return plain
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv)
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return `${VAULT_PREFIX}${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`
  }

  decrypt(stored: string): string | null {
    if (!this.isEncrypted(stored)) return stored
    try {
      const [ivHex, tagHex, dataHex] = stored.slice(VAULT_PREFIX.length).split(':')
      const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(ivHex, 'hex'))
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
      return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
    } catch {
      return null
    }
  }

  async listMemories(userId: string) {
    const data = await this.load(userId)
    const memories = await this.prisma.memory.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 500 })
    return memories.map((m) => ({
      id: m.id,
      type: m.type,
      preview: this.isEncrypted(m.content) ? '••••••••' : m.content.slice(0, 200),
      sensitive: this.isEncrypted(m.content) || data.sensitiveMemoryIds.includes(m.id),
      updatedAt: m.updatedAt,
    }))
  }

  async setMemorySensitive(userId: string, memoryId: string, sensitive: boolean) {
    const memory = await this.prisma.memory.findFirst({ where: { id: memoryId, userId } })
    if (!memory) throw new NotFoundException('Memory not found')
    let content = memory.content
    if (sensitive) content = this.encrypt(content)
    else {
      const plain = this.decrypt(content)
      if (plain === null) throw new BadRequestException('Unable to decrypt memory (encryption key changed?)')
      content = plain
    }
    if (content !== memory.content) await this.prisma.memory.update({ where: { id: memoryId }, data: { content } })
    const data = await this.load(userId)
    data.sensitiveMemoryIds = data.sensitiveMemoryIds.filter((id) => id !== memoryId)
    if (sensitive) data.sensitiveMemoryIds.push(memoryId)
    await this.save(userId, data)
    return { id: memoryId, sensitive }
  }

  async revealMemory(userId: string, memoryId: string) {
    const memory = await this.prisma.memory.findFirst({ where: { id: memoryId, userId } })
    if (!memory) throw new NotFoundException('Memory not found')
    return { id: memoryId, content: this.decrypt(memory.content) }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async exportAll(userId: string) {
    const safe = <T>(p: Promise<T>, fallback: T) => p.catch(() => fallback)
    const [user, settings, memories, conversations, artifacts] = await Promise.all([
      safe(
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, avatarUrl: true, role: true, createdAt: true },
        }),
        null,
      ),
      safe(this.prisma.userSettings.findUnique({ where: { userId } }), null),
      safe(this.prisma.memory.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }), [] as any[]),
      safe(
        this.prisma.conversation.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          include: { messages: { orderBy: { createdAt: 'asc' } } },
        }),
        [] as any[],
      ),
      safe(this.prisma.artifact.findMany({ where: { userId }, include: { versions: true } }), [] as any[]),
    ])
    return {
      format: 'openagents-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      user,
      settings,
      privacy: (await this.load(userId)).settings,
      memories: memories.map((m: any) => ({ ...m, content: this.decrypt(m.content) ?? m.content })),
      conversations,
      artifacts,
      featureData: await this.collectFeatureFiles(userId),
    }
  }

  /** Reads every data/<feature>/<safeUserId>.json file belonging to this user. */
  private async collectFeatureFiles(userId: string): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {}
    for (const file of await this.featureFiles(userId)) {
      try {
        out[path.basename(path.dirname(file))] = JSON.parse(await fs.readFile(file, 'utf8'))
      } catch {
        // skip unreadable
      }
    }
    return out
  }

  private async featureFiles(userId: string): Promise<string[]> {
    const name = `${safeId(userId)}.json`
    const files: string[] = []
    try {
      for (const entry of await fs.readdir(this.dataRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const candidate = path.join(this.dataRoot, entry.name, name)
        if (await fs.stat(candidate).then((s) => s.isFile()).catch(() => false)) files.push(candidate)
      }
    } catch {
      // no data dir
    }
    return files
  }

  // ── Delete all ────────────────────────────────────────────────────────────

  async deleteAll(userId: string, password: string) {
    if (!password) throw new BadRequestException('Password is required')
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } })
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Password is incorrect')
    }
    const p = this.prisma as any
    const deleted: Record<string, number> = {}
    const wipe = async (model: string) => {
      try {
        const res = await p[model]?.deleteMany({ where: { userId } })
        if (res) deleted[model] = res.count
      } catch (error: any) {
        this.logger.warn(`privacy wipe: ${model} failed: ${error?.message ?? error}`)
      }
    }
    // Conversations cascade to messages, approvals, agent runs.
    for (const model of [
      'approval',
      'conversation',
      'memoryEvent',
      'memoryFact',
      'memoryConflict',
      'memory',
      'artifact',
      'metricLog',
      'notification',
      'entityEdge',
      'entityNode',
      'goal',
      'learningInteraction',
      'learnedPattern',
    ]) {
      await wipe(model)
    }
    let files = 0
    for (const file of await this.featureFiles(userId)) {
      await fs.rm(file, { force: true }).then(() => files++).catch(() => undefined)
    }
    this.cache.delete(userId)
    return { ok: true, deleted, featureFilesRemoved: files }
  }
}
