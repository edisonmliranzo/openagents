import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from './prisma.service'

/**
 * A small key/value store for per-user JSON documents.
 *
 * Several features used to keep their state in a JSON file under
 * `apps/api/data/<feature>/<userId>.json`. That meant: state lost on restart,
 * no transactions, no multi-instance safety, and nothing in the backups.
 *
 * This service gives them the same API but backed by Postgres.
 */
@Injectable()
export class DocumentStore {
  private readonly logger = new Logger(DocumentStore.name)

  constructor(private prisma: PrismaService) {}

  /** Reads a document, falling back to `fallback()` when it does not exist. */
  async read<T>(userId: string, kind: string, fallback: () => T, key = ''): Promise<T> {
    try {
      const row = await this.prisma.userDocument.findUnique({
        where: { userId_kind_key: { userId, kind, key } },
      })
      if (!row) return fallback()
      return this.parse<T>(row.data, fallback)
    } catch (error: any) {
      this.logger.warn(`Failed to read document ${kind}/${userId}: ${error?.message ?? error}`)
      return fallback()
    }
  }

  /** Writes (upserts) a document. */
  async write(userId: string, kind: string, data: unknown, key = ''): Promise<void> {
    try {
      await this.prisma.userDocument.upsert({
        where: { userId_kind_key: { userId, kind, key } },
        create: { userId, kind, key, data: JSON.parse(JSON.stringify(data ?? null)) },
        update: { data: JSON.parse(JSON.stringify(data ?? null)) },
      })
    } catch (error: any) {
      this.logger.warn(`Failed to write document ${kind}/${userId}: ${error?.message ?? error}`)
      throw error
    }
  }

  async remove(userId: string, kind: string, key = ''): Promise<void> {
    await this.prisma.userDocument
      .deleteMany({ where: { userId, kind, key } })
      .catch((error: any) => {
        this.logger.warn(`Failed to delete document ${kind}/${userId}: ${error?.message ?? error}`)
      })
  }

  /** Every user that owns at least one document of this kind. */
  async listUserIds(kind: string): Promise<string[]> {
    try {
      const rows = await this.prisma.userDocument.findMany({
        where: { kind },
        select: { userId: true },
        distinct: ['userId'],
      })
      return rows.map((row) => row.userId)
    } catch (error: any) {
      this.logger.warn(`Failed to list users for ${kind}: ${error?.message ?? error}`)
      return []
    }
  }

  /** Every document key for a user + kind. */
  async listKeys(userId: string, kind: string): Promise<string[]> {
    try {
      const rows = await this.prisma.userDocument.findMany({
        where: { userId, kind },
        select: { key: true },
      })
      return rows.map((row) => row.key)
    } catch (error: any) {
      this.logger.warn(`Failed to list keys for ${kind}/${userId}: ${error?.message ?? error}`)
      return []
    }
  }

  private parse<T>(value: unknown, fallback: () => T): T {
    if (value === null || value === undefined) return fallback()
    if (typeof value === 'object') return value as T
    if (typeof value !== 'string') return fallback()
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback()
    }
  }

  // ── Global documents ──────────────────────────────────────────────────────
  // These are not owned by a user (e.g. slug -> owner), so they live in their
  // own table rather than borrowing a user id.

  async readGlobal<T>(kind: string, fallback: () => T, key = ''): Promise<T> {
    try {
      const row = await this.prisma.globalDocument.findUnique({
        where: { kind_key: { kind, key } },
      })
      if (!row) return fallback()
      return this.parse<T>(row.data, fallback)
    } catch (error: any) {
      this.logger.warn(`Failed to read global document ${kind}/${key}: ${error?.message ?? error}`)
      return fallback()
    }
  }

  async writeGlobal(kind: string, data: unknown, key = ''): Promise<void> {
    try {
      await this.prisma.globalDocument.upsert({
        where: { kind_key: { kind, key } },
        create: { kind, key, data: JSON.parse(JSON.stringify(data ?? null)) },
        update: { data: JSON.parse(JSON.stringify(data ?? null)) },
      })
    } catch (error: any) {
      this.logger.warn(`Failed to write global document ${kind}/${key}: ${error?.message ?? error}`)
      throw error
    }
  }

  async removeGlobal(kind: string, key = ''): Promise<void> {
    await this.prisma.globalDocument.deleteMany({ where: { kind, key } }).catch(() => undefined)
  }
}
