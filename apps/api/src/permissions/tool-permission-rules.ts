/**
 * Pure rule matching for opencode-style tool permission rules.
 * Dependency-free so the test suite covers matching, ordering, and
 * normalization without any framework.
 */

export type PermissionEffect = 'allow' | 'deny' | 'ask'
export type ToolScope = 'local' | 'external_read' | 'external_write' | 'system_mutation'

export interface ToolPermissionRule {
  id: string
  /** Exact tool name ('shell_execute') or trailing-glob pattern ('web_*'), '*' matches all. */
  tool: string
  effect: PermissionEffect
  note?: string
}

export interface PermissionResolution {
  effect: 'allow' | 'deny' | 'ask' | 'default'
  ruleId?: string
  reason: string
}

export const MAX_PERMISSION_RULES = 50

/** True when the pattern matches the tool name. Only a trailing '*' is a wildcard. */
export function matchesToolPattern(pattern: string, toolName: string): boolean {
  const p = String(pattern ?? '').trim().toLowerCase()
  const t = String(toolName ?? '').trim().toLowerCase()
  if (!p || !t) return false
  if (p === '*') return true
  if (p.endsWith('*')) {
    const prefix = p.slice(0, -1)
    return t.startsWith(prefix)
  }
  return p === t
}

/** First matching rule wins; rule order is significant. */
export function matchToolPermission(toolName: string, rules: ToolPermissionRule[]): PermissionResolution {
  for (const rule of rules) {
    if (matchesToolPattern(rule.tool, toolName)) {
      return {
        effect: rule.effect,
        ruleId: rule.id,
        reason: rule.note?.trim() ? `rule "${rule.tool}" (${rule.effect}): ${rule.note.trim()}` : `rule "${rule.tool}" (${rule.effect})`,
      }
    }
  }
  return { effect: 'default', reason: 'no rule matches this tool' }
}

/** Plan mode is read-only: mutating scopes are blocked, reads and local analysis are not. */
export function planModeBlocksScope(scope: ToolScope): boolean {
  return scope === 'system_mutation' || scope === 'external_write'
}

/**
 * Validate + normalize arbitrary input (API body, chat tool args) into rules.
 * Garbage rows are dropped, the list is capped, ids are stable slugs.
 */
export function normalizeRules(input: unknown): ToolPermissionRule[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: ToolPermissionRule[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const tool = String(row.tool ?? '').trim().toLowerCase().slice(0, 80)
    const effectRaw = String(row.effect ?? '').trim().toLowerCase()
    if (!tool || (effectRaw !== 'allow' && effectRaw !== 'deny' && effectRaw !== 'ask')) continue
    let id = String(row.id ?? '').trim().slice(0, 60)
    if (!id) id = `${tool.replace(/[^a-z0-9]+/g, '-')}-${effectRaw}`
    if (seen.has(id)) continue
    seen.add(id)
    const note = String(row.note ?? '').trim().slice(0, 200)
    out.push(note ? { id, tool, effect: effectRaw as PermissionEffect, note } : { id, tool, effect: effectRaw as PermissionEffect })
    if (out.length >= MAX_PERMISSION_RULES) break
  }
  return out
}
