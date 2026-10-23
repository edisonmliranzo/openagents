import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { SpecialistAgent } from '@prisma/client'
import { AGENCY_ROSTER, SPECIALIST_ROLES, type RosterEntry } from './agency-roster'

export interface CreateSpecialistInput {
  name: string
  role?: string
  personaPrompt?: string
  emailAlias?: string
  telegramToken?: string
  monthlyBudgetUsd?: number
}

export interface RosterEntryView extends RosterEntry {
  installed: boolean
}

@Injectable()
export class SpecialistsService {
  private readonly logger = new Logger(SpecialistsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: CreateSpecialistInput): Promise<SpecialistAgent> {
    const name = String(input.name ?? '').trim().slice(0, 60)
    if (!name) throw new BadRequestException('Agent name is required.')
    const role = SPECIALIST_ROLES.includes(String(input.role ?? '').toLowerCase() as never)
      ? (String(input.role).toLowerCase() as (typeof SPECIALIST_ROLES)[number])
      : 'custom'
    const budget = Number(input.monthlyBudgetUsd)
    const monthlyBudgetUsd = Number.isFinite(budget) && budget > 0 ? Math.min(budget, 1000) : 1

    const existing = await this.prisma.specialistAgent.findFirst({ where: { userId, name } })
    if (existing) throw new BadRequestException(`An agent named "${name}" already exists.`)

    const agent = await this.prisma.specialistAgent.create({
      data: {
        userId,
        name,
        role,
        personaPrompt: String(input.personaPrompt ?? '').trim().slice(0, 4000),
        emailAlias: String(input.emailAlias ?? '').trim().slice(0, 120) || null,
        telegramToken: String(input.telegramToken ?? '').trim().slice(0, 200) || null,
        monthlyBudgetUsd,
      },
    })
    this.logger.log(`Created specialist "${name}" (${role}) for user ${userId}`)
    return agent
  }

  list(userId: string) {
    return this.prisma.specialistAgent.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    })
  }

  /** Built-in curated roster, annotated with per-user install state. */
  async listRoster(userId: string): Promise<RosterEntryView[]> {
    const agents = await this.prisma.specialistAgent.findMany({
      where: { userId },
      select: { name: true },
    })
    const names = new Set(agents.map((a) => a.name.toLowerCase()))
    return AGENCY_ROSTER.map((entry) => ({ ...entry, installed: names.has(entry.name.toLowerCase()) }))
  }

  /** One-click install of a roster persona as a live specialist. Idempotent by name. */
  async installFromRoster(userId: string, slug: string): Promise<SpecialistAgent> {
    const entry = AGENCY_ROSTER.find((e) => e.slug === slug)
    if (!entry) throw new BadRequestException(`Unknown roster entry "${slug}".`)
    const existing = await this.prisma.specialistAgent.findFirst({ where: { userId, name: entry.name } })
    if (existing) {
      this.logger.log(`Roster install of "${entry.name}" for user ${userId}: already present`)
      return existing
    }
    const agent = await this.create(userId, {
      name: entry.name,
      role: entry.role,
      personaPrompt: entry.personaPrompt,
      monthlyBudgetUsd: entry.defaultMonthlyBudgetUsd,
    })
    this.logger.log(`Installed roster specialist "${entry.name}" (${entry.division}) for user ${userId}`)
    return agent
  }

  async update(userId: string, id: string, patch: Partial<CreateSpecialistInput> & { enabled?: boolean }) {
    const existing = await this.prisma.specialistAgent.findFirst({ where: { id, userId } })
    if (!existing) throw new BadRequestException('Agent not found.')
    const data: Record<string, unknown> = {}
    if (patch.name !== undefined) data.name = String(patch.name).trim().slice(0, 60)
    if (patch.role !== undefined && SPECIALIST_ROLES.includes(String(patch.role).toLowerCase() as never))
      data.role = String(patch.role).toLowerCase()
    if (patch.personaPrompt !== undefined) data.personaPrompt = String(patch.personaPrompt).trim().slice(0, 4000)
    if (patch.emailAlias !== undefined) data.emailAlias = String(patch.emailAlias).trim().slice(0, 120) || null
    if (patch.telegramToken !== undefined) data.telegramToken = String(patch.telegramToken).trim().slice(0, 200) || null
    if (patch.monthlyBudgetUsd !== undefined) {
      const budget = Number(patch.monthlyBudgetUsd)
      if (Number.isFinite(budget) && budget > 0) data.monthlyBudgetUsd = Math.min(budget, 1000)
    }
    if (typeof patch.enabled === 'boolean') data.enabled = patch.enabled
    return this.prisma.specialistAgent.update({ where: { id: existing.id }, data: data as never })
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.specialistAgent.findFirst({ where: { id, userId } })
    if (!existing) throw new BadRequestException('Agent not found.')
    await this.prisma.specialistAgent.delete({ where: { id: existing.id } })
    return { ok: true }
  }

  /** Budget check before delegating work to a specialist. */
  async canAfford(userId: string, agentId: string): Promise<{ ok: boolean; agent: SpecialistAgent | null; reason?: string }> {
    const agent = await this.prisma.specialistAgent.findFirst({ where: { id: agentId, userId } })
    if (!agent) return { ok: false, agent: null, reason: 'Specialist agent not found.' }
    if (!agent.enabled) return { ok: false, agent, reason: `Agent "${agent.name}" is disabled.` }
    if (agent.spentUsd >= agent.monthlyBudgetUsd) {
      return { ok: false, agent, reason: `Agent "${agent.name}" exhausted its $${agent.monthlyBudgetUsd} monthly budget.` }
    }
    return { ok: true, agent }
  }

  /** Record spend after a specialist run (blended $3/M tokens estimate). */
  async charge(userId: string, agentId: string, totalTokens: number) {
    const costUsd = (Math.max(0, totalTokens) / 1_000_000) * 3
    if (costUsd <= 0) return
    await this.prisma.specialistAgent.update({
      where: { id: agentId },
      data: { spentUsd: { increment: Number(costUsd.toFixed(6)) } },
    })
  }

  /** Optional: reset monthly spend (call from a cron or billing job). */
  async resetMonthlySpend() {
    const result = await this.prisma.specialistAgent.updateMany({ data: { spentUsd: 0 } })
    return { reset: result.count }
  }
}
