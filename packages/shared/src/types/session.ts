export type SessionKind = 'direct' | 'group' | 'global' | 'unknown'

export interface SessionDefaults {
  model: string | null
  contextTokens: number | null
}

export interface SessionRow {
  id: string
  key: string
  kind: SessionKind
  label?: string | null
  displayName?: string | null
  updatedAt: number | null
  sessionId?: string
  thinkingLevel?: string | null
  verboseLevel?: string | null
  reasoningLevel?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  model?: string | null
  modelProvider?: string | null
  contextTokens?: number | null
}

export interface SessionsListResult {
  ts: number
  path: string
  count: number
  defaults: SessionDefaults
  sessions: SessionRow[]
}

export interface SessionPatchInput {
  label?: string | null
  thinkingLevel?: string | null
  verboseLevel?: string | null
  reasoningLevel?: string | null
}

export interface SessionPatchResult {
  ok: true
  session: SessionRow
}
