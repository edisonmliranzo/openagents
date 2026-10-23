/**
 * Agent hooks.
 *
 * A hook is a small user-authored rule that observes or changes the agent at
 * well-defined points in the run. They are the extension seam: instead of
 * forking the agent, a user can add a check, a guard, or an annotation without
 * touching the runtime.
 *
 * Four events:
 *  - `run_start`   — before the agent plans
 *  - `pre_tool`    — before a tool runs (can block it)
 *  - `post_tool`   — after a tool ran (can annotate the result)
 *  - `run_end`     — after the answer is delivered
 *
 * Hooks are declarative and sandboxed by design: a hook is a *condition plus an
 * action*, not arbitrary code. That keeps them safe to install from a pack.
 */

export type HookEvent = 'run_start' | 'pre_tool' | 'post_tool' | 'run_end'

export type HookActionKind =
  /** Block the tool call (pre_tool) or the whole run (run_start). */
  | 'block'
  /** Rewrite the tool input before it runs. */
  | 'modify_input'
  /** Attach a note to the tool result / run. */
  | 'annotate'
  /** Send the user a notification. */
  | 'notify'
  /** Run a shell command (sandboxed by the tool policy). */
  | 'run_command'

export interface HookCondition {
  /** Only fire for these tool names (pre_tool / post_tool). Empty = all tools. */
  tools?: string[]
  /** Only fire when the tool input matches this substring (case-insensitive). */
  inputContains?: string
  /** Only fire when the tool output matches this substring (post_tool). */
  outputContains?: string
  /** Only fire when the run's user message matches this substring. */
  messageContains?: string
  /** Only fire when the tool result failed (post_tool). */
  onError?: boolean
}

export interface HookAction {
  kind: HookActionKind
  /** Human-readable explanation shown to the user (and in the audit trail). */
  reason?: string
  /** `block` — the message shown to the agent when the hook blocks. */
  message?: string
  /** `modify_input` — the keys to override on the tool input. */
  patch?: Record<string, unknown>
  /** `notify` — the notification title. */
  title?: string
  /** `notify` — the notification body. */
  body?: string
  /** `run_command` — the command to run. */
  command?: string
  /** `annotate` — the note to attach. */
  note?: string
}

export interface HookDefinition {
  id: string
  name: string
  /** Which event this hook listens to. */
  event: HookEvent
  enabled: boolean
  condition: HookCondition
  action: HookAction
  /** Lower numbers run first. */
  order: number
  createdAt: string
}

export interface HookInvocation {
  hookId: string
  hookName: string
  event: HookEvent
  action: HookActionKind
  outcome: 'applied' | 'skipped' | 'failed'
  reason?: string
  detail?: string
  durationMs: number
}

export interface HookResult {
  /** The tool call must not proceed. */
  blocked: boolean
  /** The message the agent should see when blocked. */
  blockMessage?: string
  /** Rewritten tool input. */
  modifiedInput?: Record<string, unknown>
  /** Notes to attach to the result / run. */
  annotations: string[]
  /** Notifications to deliver. */
  notifications: Array<{ title: string; body: string }>
  /** What actually happened, for the audit trail. */
  invocations: HookInvocation[]
}
