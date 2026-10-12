import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { hashToken, parseScopes } from './life-logic'

export const AVAILABLE_SCOPES = ['tasks:write', 'tasks:read', 'clips:write'] as const

@Injectable()
export class TokensService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.agentApiToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, tokenPrefix: true, scopes: true, budgetUsd: true,
        spentUsd: true, callCount: true, lastUsedAt: true, revokedAt: true, createdAt: true,
      },
    })
  }

  /** Returns the raw token ONCE — only its hash is stored. */
  async create(userId: string, input: { name: string; scopes?: string[]; budgetUsd?: number }) {
    const name = String(input.name ?? '').trim()
    if (!name) throw new BadRequestException('Name the token.')
    const scopes = (input.scopes ?? ['tasks:write', 'tasks:read']).filter((s) =>
      (AVAILABLE_SCOPES as readonly string[]).includes(s),
    )
    if (scopes.length === 0) throw new BadRequestException(`Scopes must be from: ${AVAILABLE_SCOPES.join(', ')}`)

    const raw = `oat_${randomBytes(24).toString('base64url')}`
    await this.prisma.agentApiToken.create({
      data: {
        userId,
        name: name.slice(0, 80),
        tokenHash: hashToken(raw),
        tokenPrefix: raw.slice(0, 10),
        scopes: JSON.stringify(scopes),
        budgetUsd: Math.max(1, Math.min(Number(input.budgetUsd) || 5, 1000)),
      },
    })
    return { token: raw, scopes, name }
  }

  async revoke(userId: string, id: string) {
    const row = await this.prisma.agentApiToken.findFirst({ where: { id, userId } })
    if (!row) throw new NotFoundException('Token not found')
    await this.prisma.agentApiToken.update({ where: { id }, data: { revokedAt: new Date() } })
    return { ok: true }
  }

  /** Verify an incoming token; returns the row or throws. Also enforces budget. */
  async verify(rawToken: string) {
    const trimmed = String(rawToken ?? '').trim()
    if (!trimmed.startsWith('oat_')) throw new BadRequestException('Bad token format')
    const row = await this.prisma.agentApiToken.findUnique({ where: { tokenHash: hashToken(trimmed) } })
    if (!row || row.revokedAt) throw new NotFoundException('Token invalid or revoked')
    if (row.spentUsd >= row.budgetUsd) throw new BadRequestException('Token budget exhausted')
    return row
  }

  async recordUsage(id: string, estUsd: number) {
    await this.prisma.agentApiToken.update({
      where: { id },
      data: { callCount: { increment: 1 }, spentUsd: { increment: estUsd }, lastUsedAt: new Date() },
    }).catch(() => undefined)
  }

  scopesOf(row: { scopes: string }): string[] {
    return parseScopes(row.scopes)
  }
}
