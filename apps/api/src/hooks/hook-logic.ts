/**
 * Pure hook logic.
 *
 * Kept separate from the service (and free of decorators) so it can be unit
 * tested with the repo's `node --experimental-strip-types` runner.
 */

export type HookEventName = 'run_start' | 'pre_tool' | 'post_tool' | 'run_end'

export type HookActionKind =
  | 'block'
  | 'modify_input'
  | 'annotate'
  | 'notify'
  | 'run_command'

export interface HookCondition {
  tools?: string[]
  inputContains?: string
  outputContains?: string
  messageContains?: string
  onError?: boolean
}

export interface HookAction {
  kind: HookActionKind
  reason?: string
  message?: string
  patch?: Record<string, unknown>
  title?: string
  body?: string
  command?: string
  note?: string
}

export interface HookLike {
  id: string
  name: string
  event: HookEventName
  enabled: boolean
  condition: HookCondition
  action: HookAction
  order: number
}

export interface HookContext {
  event: HookEventName
  toolName?: string
  toolInput?: Record<string, unknown>
  toolOutput?: unknown
  toolSuccess?: boolean
  userMessage?: string
  conversationId?: string
}

export interface HookActionOutcome {
  blocked: boolean
  blockMessage?: string
  modifiedInput?: Record<string, unknown>
  annotations: string[]
  notifications: Array<{ title: string; body: string }>
  /** Commands the caller should execute (they may have side effects). */
  commands: string[]
}

export function isValidHookEvent(event: unknown): event is HookEventName {
  return (
    event === 'run_start' ||
    event === 'pre_tool' ||
    event === 'post_tool' ||
    event === 'run_end'
  )
}

/** Does the hook's condition match this context? */
export function matchesCondition(
  condition: HookCondition | undefined,
  context: HookContext,
): boolean {
  if (!condition) return true

  if (condition.tools?.length) {
    const tool = (context.toolName ?? '').toLowerCase()
    const wanted = condition.tools.map((t) => t.toLowerCase())
    if (!wanted.includes(tool)) return false
  }

  if (condition.inputContains) {
    const haystack = JSON.stringify(context.toolInput ?? '').toLowerCase()
    if (!haystack.includes(condition.inputContains.toLowerCase())) return false
  }

  if (condition.outputContains) {
    const haystack = JSON.stringify(context.toolOutput ?? '').toLowerCase()
    if (!haystack.includes(condition.outputContains.toLowerCase())) return false
  }

  if (condition.messageContains) {
    const haystack = (context.userMessage ?? '').toLowerCase()
    if (!haystack.includes(condition.messageContains.toLowerCase())) return false
  }

  if (typeof condition.onError === 'boolean' && context.toolSuccess !== undefined) {
    if (condition.onError !== !context.toolSuccess) return false
  }

  return true
}

/**
 * Works out what a hook wants to do, without performing any side effect.
 * The caller performs the resulting notifications / commands.
 */
export function resolveActionOutcome(
  hook: HookLike,
  context: HookContext,
): HookActionOutcome {
  const outcome: HookActionOutcome = {
    blocked: false,
    annotations: [],
    notifications: [],
    commands: [],
  }

  const action = hook.action

  switch (action.kind) {
    case 'block':
      outcome.blocked = true
      outcome.blockMessage =
        action.message ?? `Blocked by hook "${hook.name}".${action.reason ? ` ${action.reason}` : ''}`
      break
    case 'modify_input':
      if (context.toolInput && action.patch) {
        outcome.modifiedInput = { ...context.toolInput, ...action.patch }
      }
      break
    case 'annotate': {
      const note = action.note ?? action.reason
      if (note) outcome.annotations.push(note)
      break
    }
    case 'notify':
      outcome.notifications.push({
        title: action.title ?? `Hook: ${hook.name}`,
        body: action.body ?? action.reason ?? '',
      })
      break
    case 'run_command':
      if (action.command) outcome.commands.push(action.command)
      break
    default:
      break
  }

  return outcome
}
