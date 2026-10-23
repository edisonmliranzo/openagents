import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../security/encryption.service'

export interface VaultSecretView {
  id: string
  name: string
  scope: string
  /** Non-secret context the agent may see. The value is never included. */
  hint?: string
  lastUsedAt?: string
  createdAt: string
  updatedAt: string
}

const MAX_SECRETS = 200
const MAX_NAME = 80
const MAX_HINT = 200
const MAX_VALUE = 16_000

/**
 * The Secure Vault.
 *
 * Credentials stored here are usable by connectors and tools, but the agent
 * never sees their values: every read path returns metadata only, and the
 * plaintext is decrypted only inside {@link reveal} — which is deliberately not
 * exposed over HTTP. A tool resolves a secret by *name*, gets the plaintext
 * server-side, and uses it without the value ever entering the model's
 * context.
 */
@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name)

  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
  ) {}

  // ── Store ─────────────────────────────────────────────────────────────────

  async list(userId: string, scope?: string): Promise<VaultSecretView[]> {
    const rows = await this.prisma.vaultSecret.findMany({
      where: { userId, ...(scope ? { scope } : {}) },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map((row) => this.toView(row))
  }

  async put(
    userId: string,
    input: { name: string; scope?: string; value: string; hint?: string },
  ): Promise<VaultSecretView> {
    const name = String(input.name ?? '').trim().slice(0, MAX_NAME)
    if (!name) throw new Error('Secret name is required.')

    const value = String(input.value ?? '')
    if (!value) throw new Error('Secret value is required.')
    if (value.length > MAX_VALUE) throw new Error(`Secret value must be under ${MAX_VALUE} characters.`)

    const scope = String(input.scope ?? 'generic').trim().slice(0, MAX_NAME) || 'generic'

    const existing = await this.prisma.vaultSecret.findUnique({
      where: { userId_scope_name: { userId, scope, name } },
    })
    if (!existing) {
      const count = await this.prisma.vaultSecret.count({ where: { userId } })
      if (count >= MAX_SECRETS) throw new Error(`Vault limit reached (${MAX_SECRETS}).`)
    }

    const encrypted = this.encryption.encrypt(value)
    const hint = input.hint ? String(input.hint).slice(0, MAX_HINT) : null

    const row = await this.prisma.vaultSecret.upsert({
      where: { userId_scope_name: { userId, scope, name } },
      create: {
        userId,
        name,
        scope,
        value: encrypted.encrypted,
        iv: encrypted.iv,
        authTag: encrypted.authTag ?? '',
        hint,
      },
      update: {
        value: encrypted.encrypted,
        iv: encrypted.iv,
        authTag: encrypted.authTag ?? '',
        ...(hint !== null ? { hint } : {}),
      },
    })

    this.logger.log(`Stored vault secret "${scope}/${name}" for user ${userId}`)
    return this.toView(row)
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const row = await this.prisma.vaultSecret.findFirst({ where: { id, userId } })
    if (!row) return false
    await this.prisma.vaultSecret.delete({ where: { id } })
    return true
  }

  // ── Use ───────────────────────────────────────────────────────────────────

  /**
   * Resolves a secret for server-side use. The plaintext is returned to the
   * caller (a connector or tool), never to the model.
   */
  async reveal(userId: string, name: string, scope = 'generic'): Promise<string | null> {
    const row = await this.prisma.vaultSecret.findUnique({
      where: { userId_scope_name: { userId, scope, name } },
    })
    if (!row) return null

    await this.prisma.vaultSecret
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined)

    try {
      return this.encryption.decrypt({
        encrypted: row.value,
        iv: row.iv,
        authTag: row.authTag,
      })
    } catch (error: any) {
      this.logger.warn(`Vault secret ${scope}/${name} could not be decrypted: ${error?.message ?? error}`)
      return null
    }
  }

  /** Resolves a secret or throws — for connectors that require it. */
  async require(userId: string, name: string, scope = 'generic'): Promise<string> {
    const value = await this.reveal(userId, name, scope)
    if (value === null) {
      throw new NotFoundException(`Vault secret "${name}" (scope "${scope}") is not set.`)
    }
    return value
  }

  /** True when a secret exists — lets a tool say "connect this first" without leaking. */
  async has(userId: string, name: string, scope = 'generic'): Promise<boolean> {
    const row = await this.prisma.vaultSecret.findUnique({
      where: { userId_scope_name: { userId, scope, name } },
      select: { id: true },
    })
    return Boolean(row)
  }

  private toView(row: {
    id: string
    name: string
    scope: string
    hint: string | null
    lastUsedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }): VaultSecretView {
    return {
      id: row.id,
      name: row.name,
      scope: row.scope,
      hint: row.hint ?? undefined,
      lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}
