import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { DocumentStore } from '../prisma/document-store.service'
import {
  isValidHookEvent,
  matchesCondition,
  resolveActionOutcome,
  type HookContext,
  type HookEventName,
} from './hook-logic'
import type {
  HookAction,
  HookCondition,
  HookDefinition,
  HookInvocation,
  HookResult,
} from '@openagents/shared'

const KIND = 'hooks'
const MAX_HOOKS = 100
const DEFAULT_TIMEOUT_MS = 5_000

/**
 * The hook engine.
 *
 * Hooks are declarative rules (condition + action) rather than arbitrary code,
 * so they can be installed from a pack without opening a code-execution hole.
 * Every hook is isolated: a failing hook is recorded and skipped, it never
 * breaks the run.
 */
@Injectable()
export class HooksService {
  private readonly logger = new Logger(HooksService.name)
  private documents: DocumentStore

  constructor(documents: DocumentStore) {
    this.documents = documents
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async list(userId: string): Promise<HookDefinition[]> {
    const hooks = await this.documents.read<HookDefinition[]>(userId, KIND, () => [])
    return Array.isArray(hooks) ? hooks : []
  }

  async create(
    userId: string,
    input: {
      name: string
      event: HookEventName
      condition?: HookCondition
      action: HookAction
      enabled?: boolean
      order?: number
    },
  ): Promise<HookDefinition> {
    const name = String(input.name ?? '').trim()
    if (!name) throw new Error('Hook name is required.')
    if (!isValidHookEvent(input.event)) throw new Error(`Unknown hook event "${input.event}".`)
    if (!input.action?.kind) throw new Error('Hook action.kind is required.')

    const hooks = await this.list(userId)
    if (hooks.length >= MAX_HOOKS) throw new Error(`Hook limit reached (${MAX_HOOKS}).`)

    const hook: HookDefinition = {
      id: `hook-${randomUUID()}`,
      name,
      event: input.event,
      enabled: input.enabled ?? true,
      condition: input.condition ?? {},
      action: input.action,
      order: input.order ?? hooks.length,
      createdAt: new Date().toISOString(),
    }

    await this.save(userId, [...hooks, hook])
    this.logger.log(`Created ${hook.event} hook "${hook.name}" for user ${userId}`)
    return hook
  }

  async update(
    userId: string,
    hookId: string,
    patch: Partial<Pick<HookDefinition, 'name' | 'enabled' | 'condition' | 'action' | 'order'>>,
  ): Promise<HookDefinition | null> {
    const hooks = await this.list(userId)
    const index = hooks.findIndex((h) => h.id === hookId)
    if (index === -1) return null

    const next = { ...hooks[index], ...patch, id: hooks[index].id }
    if (next.action && !next.action.kind) throw new Error('Hook action.kind is required.')
    hooks[index] = next
    await this.save(userId, hooks)
    return next
  }

  async delete(userId: string, hookId: string): Promise<boolean> {
    const hooks = await this.list(userId)
    const next = hooks.filter((h) => h.id !== hookId)
    if (next.length === hooks.length) return false
    await this.save(userId, next)
    return true
  }

  private async save(userId: string, hooks: HookDefinition[]) {
    await this.documents.write(userId, KIND, hooks)
  }

  // ── Execution ────────────────────────────────────────────────────────────

  /**
   * Runs every enabled hook registered for the event, in order, and folds the
   * results into a single outcome.
   */
  async run(userId: string, context: HookContext): Promise<HookResult> {
    const result: HookResult = {
      blocked: false,
      annotations: [],
      notifications: [],
      invocations: [],
    }

    let hooks: HookDefinition[]
    try {
      hooks = await this.list(userId)
    } catch (error: any) {
      this.logger.warn(`Could not load hooks for ${userId}: ${error?.message ?? error}`)
      return result
    }

    const matching = hooks
      .filter((hook) => hook.enabled && hook.event === context.event)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

    for (const hook of matching) {
      const startedAt = Date.now()

      if (!matchesCondition(hook.condition, context)) {
        result.invocations.push({
          hookId: hook.id,
          hookName: hook.name,
          event: hook.event,
          action: hook.action.kind,
          outcome: 'skipped',
          reason: 'condition did not match',
          durationMs: Date.now() - startedAt,
        })
        continue
      }

      try {
        const outcome = resolveActionOutcome(hook, context)

        if (outcome.blocked) {
          result.blocked = true
          result.blockMessage = outcome.blockMessage
        }
        if (outcome.modifiedInput) {
          result.modifiedInput = outcome.modifiedInput
          context.toolInput = outcome.modifiedInput
        }
        result.annotations.push(...outcome.annotations)
        result.notifications.push(...outcome.notifications)

        for (const command of outcome.commands) {
          await this.runCommand(command)
        }

        result.invocations.push({
          hookId: hook.id,
          hookName: hook.name,
          event: hook.event,
          action: hook.action.kind,
          outcome: 'applied',
          reason: hook.action.reason,
          detail: hook.action.note ?? hook.action.message,
          durationMs: Date.now() - startedAt,
        })
      } catch (error: any) {
        // A broken hook must never break the run.
        result.invocations.push({
          hookId: hook.id,
          hookName: hook.name,
          event: hook.event,
          action: hook.action.kind,
          outcome: 'failed',
          reason: error?.message ?? 'hook failed',
          durationMs: Date.now() - startedAt,
        })
        this.logger.warn(`Hook "${hook.name}" failed: ${error?.message ?? error}`)
      }
    }

    return result
  }

  private async runCommand(command: string) {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const run = promisify(execFile)

    const [bin, ...args] = command.trim().split(/\s+/)
    if (!bin) return

    await run(bin, args, { timeout: DEFAULT_TIMEOUT_MS, windowsHide: true }).catch((error: any) => {
      this.logger.warn(`Hook command failed: ${error?.message ?? error}`)
    })
  }
}
