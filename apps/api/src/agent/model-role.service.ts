import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LLM_MODELS, type LLMProvider, type ModelRole } from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'

export interface ResolvedModel {
  provider: LLMProvider
  model: string
  role: ModelRole
}

/**
 * Role-based model selection.
 *
 * Muse runs two different models: **Spark** for the conversation you are in
 * right now, and **Wonder** — the bigger sibling — for the heavy unattended
 * work: artifact builds, scheduled runs, subagents and background jobs.
 *
 * A user can override the model per role. Without an override, the role falls
 * back to the provider's tier (`fast` for chat, `powerful` for the rest).
 */
@Injectable()
export class ModelRoleService {
  private readonly logger = new Logger(ModelRoleService.name)

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** The model id to use for a provider + role. */
  modelFor(provider: LLMProvider, role: ModelRole): string {
    if (provider === 'meta') {
      const spark = (this.config.get<string>('MUSE_SPARK_MODEL') ?? '').trim()
      const wonder = (this.config.get<string>('MUSE_WONDER_MODEL') ?? '').trim()
      if (role === 'chat') return spark || LLM_MODELS.meta.fast
      return wonder || LLM_MODELS.meta.powerful
    }

    const tiers = LLM_MODELS[provider] as { fast: string; powerful: string; default: string }
    if (role === 'chat') return tiers.fast
    return tiers.powerful
  }

  /**
   * Resolves the model for a role, honouring the user's per-role overrides.
   */
  async resolve(userId: string, role: ModelRole, fallback: { provider: LLMProvider; model?: string }): Promise<ResolvedModel> {
    const provider = fallback.provider
    const override = await this.userOverride(userId, role)
    return {
      provider,
      model: override?.trim() || fallback.model?.trim() || this.modelFor(provider, role),
      role,
    }
  }

  /** The user's explicit per-role model choices. */
  async userOverrides(userId: string): Promise<Partial<Record<ModelRole, string>>> {
    try {
      const settings = await this.prisma.userSettings.findUnique({ where: { userId } })
      const raw = (settings as any)?.modelRoles
      if (!raw || typeof raw !== 'object') return {}
      return raw as Partial<Record<ModelRole, string>>
    } catch {
      return {}
    }
  }

  /** Stores the user's per-role model choices. */
  async setUserOverrides(userId: string, roles: Partial<Record<ModelRole, string>>) {
    const cleaned: Partial<Record<ModelRole, string>> = {}
    for (const [role, value] of Object.entries(roles)) {
      const model = String(value ?? '').trim()
      if (model) cleaned[role as ModelRole] = model.slice(0, 120)
    }

    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: { modelRoles: JSON.parse(JSON.stringify(cleaned)) } as any,
      create: { userId, modelRoles: JSON.parse(JSON.stringify(cleaned)) } as any,
    })

    return { roles: (settings as any).modelRoles ?? cleaned }
  }

  private async userOverride(userId: string, role: ModelRole): Promise<string | null> {
    const overrides = await this.userOverrides(userId)
    return overrides[role] ?? null
  }
}
