import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { flag } from './frontier.util'
import type { StakesLevel } from './stakes.service'

export interface AutopilotDecision {
  forceFast: boolean
  upgrade: boolean
  reason: string | null
  spentUsd: number
  ceilingUsd: number
}

@Injectable()
export class AutopilotService {
  private readonly logger = new Logger(AutopilotService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  get enabled(): boolean {
    return flag(this.config, 'COST_AUTOPILOT')
  }

  async decide(userId: string, stakes: StakesLevel): Promise<AutopilotDecision> {
    const empty: AutopilotDecision = { forceFast: false, upgrade: false, reason: null, spentUsd: 0, ceilingUsd: 0 }
    if (!this.enabled) return empty

    try {
      const now = new Date()
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const limits = await this.prisma.budgetLimit.findMany({
        where: { userId, enabled: true, OR: [{ budgetType: 'daily' }, { budgetType: 'total' }] },
      })
      const daily = limits.find((l) => l.budgetType === 'daily' && l.periodStart <= now && l.periodEnd >= now)
      const spent = daily ? daily.currentSpentUsd : 0
      const ceilingRaw = Number(this.config.get<string>('TASK_COST_CEILING_USD') ?? '0')
      const ceiling = ceilingRaw > 0 ? ceilingRaw : daily ? daily.limitUsd : 0

      if (ceiling > 0 && spent >= ceiling) {
        return { forceFast: true, upgrade: false, reason: `daily spend $${spent.toFixed(2)} ≥ ceiling $${ceiling.toFixed(2)} — staying on the fast tier`, spentUsd: spent, ceilingUsd: ceiling }
      }
      if (stakes === 'high' && spent < ceiling * 0.7) {
        return { forceFast: false, upgrade: true, reason: 'high-stakes task with budget headroom — worth the powerful model', spentUsd: spent, ceilingUsd: ceiling }
      }
      return { ...empty, spentUsd: spent, ceilingUsd: ceiling }
    } catch (err: any) {
      this.logger.debug(`Autopilot decide skipped: ${err?.message ?? err}`)
      return empty
    }
  }
}
