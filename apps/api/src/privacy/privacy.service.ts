import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
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

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name)

  constructor(private readonly prisma: PrismaService) {}

  // ── Settings / local-only ─────────────────────────────────────────────────

  private async load(userId: string): Promise<PrivacyFile> {
    const row = await this.prisma.privacyVault.findUnique({ where: { userId } })
    if (!row) return { settings: { localOnly: false }, sensitiveMemoryIds: [] }
    return {
      settings: {
        localOnly: !!row.localOnly,
        localModel: row.localModel || undefined,
      },
      sensitiveMemoryIds: Array.isArray(row.sensitiveMemoryIds)
        ? (row.sensitiveMemoryIds as string[])
        : [],
    }
  }

  private async save(userId: string, data: PrivacyFile) {
    await this.prisma.privacyVault.upsert({
      where: { userId },
      create: {
        userId,
        localOnly: data.settings.localOnly,
        localModel: data.settings.localModel ?? null,
        sensitiveMemoryIds: JSON.parse(JSON.stringify(data.sensitiveMemoryIds)),
      },
      update: {
        localOnly: data.settings.localOnly,
        localModel: data.settings.localModel ?? null,
        sensitiveMemoryIds: JSON.parse(JSON.stringify(data.sensitiveMemoryIds)),
      },
    })
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

  /**
   * Collects the user's feature documents straight from the database.
   * They used to be JSON files under data/<feature>/<userId>.json — reading them
   * from Postgres means the export is complete and can never miss a file that
   * was written but not flushed.
   */
  private async collectFeatureFiles(userId: string): Promise<Record<string, unknown>> {
    const rows = await this.prisma.userDocument.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    })

    const out: Record<string, unknown> = {}
    for (const row of rows) {
      const bucket = (out[row.kind] ??= {}) as Record<string, unknown>
      if (row.key) bucket[row.key] = row.data
      else out[`${row.kind}.value`] = row.data
    }
    return out
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
      'userDocument',
      'pushSubscription',
      'expoPushToken',
      'warRoom',
      'warRoomMessage',
      'pinnedMessage',
      'messageReaction',
      'generativeComponent',
      'abTest',
      'conversationTemplate',
      'customTool',
    ]) {
      await wipe(model)
    }

    let documents = 0
    try {
      const res = await this.prisma.userDocument.deleteMany({ where: { userId } })
      documents = res.count
    } catch (error: any) {
      this.logger.warn(`privacy wipe: userDocument failed: ${error?.message ?? error}`)
    }
    await this.prisma.privacyVault.deleteMany({ where: { userId } }).catch(() => undefined)

    return { ok: true, deleted, featureFilesRemoved: documents }
  }
}
