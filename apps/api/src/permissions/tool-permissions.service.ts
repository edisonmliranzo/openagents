import { Injectable, Logger } from '@nestjs/common'
import { DocumentStore } from '../prisma/document-store.service'
import {
  matchToolPermission,
  normalizeRules,
  type PermissionResolution,
  type ToolPermissionRule,
} from './tool-permission-rules'

const RULES_KIND = 'tool-permissions'
const CACHE_TTL_MS = 15_000

export interface StoredPermissionState {
  rules: ToolPermissionRule[]
  updatedAt: string
}

@Injectable()
export class ToolPermissionsService {
  private readonly logger = new Logger(ToolPermissionsService.name)
  private readonly cache = new Map<string, { state: StoredPermissionState; expiresAt: number }>()

  constructor(private readonly docs: DocumentStore) {}

  async get(userId: string): Promise<StoredPermissionState> {
    const cached = this.cache.get(userId)
    if (cached && cached.expiresAt > Date.now()) return cached.state
    const state = await this.docs.read<StoredPermissionState>(userId, RULES_KIND, () => ({
      rules: [],
      updatedAt: new Date(0).toISOString(),
    }))
    const merged: StoredPermissionState = {
      rules: Array.isArray(state?.rules) ? normalizeRules(state.rules) : [],
      updatedAt: state?.updatedAt ?? new Date(0).toISOString(),
    }
    this.cache.set(userId, { state: merged, expiresAt: Date.now() + CACHE_TTL_MS })
    return merged
  }

  /** Replace the full ordered rule list (first-match-wins order is significant). */
  async set(userId: string, input: unknown): Promise<StoredPermissionState> {
    const rules = normalizeRules(input)
    const state: StoredPermissionState = { rules, updatedAt: new Date().toISOString() }
    await this.docs.write(userId, RULES_KIND, state)
    this.cache.set(userId, { state, expiresAt: Date.now() + CACHE_TTL_MS })
    this.logger.log(`Set ${rules.length} permission rule(s) for user ${userId}`)
    return state
  }

  /** Resolve the permission effect for one tool call. */
  async resolutionFor(userId: string, toolName: string): Promise<PermissionResolution> {
    const { rules } = await this.get(userId)
    return matchToolPermission(toolName, rules)
  }

  /** Preview how a tool call would be resolved (for the test endpoint and the agent tool). */
  async preview(userId: string, toolName: string): Promise<PermissionResolution & { planModeBlocked?: boolean }> {
    const resolution = await this.resolutionFor(userId, toolName)
    return { ...resolution }
  }
}
