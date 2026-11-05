import type { LLMProvider } from '@openagents/shared'
import type { LLMService } from '../agent/llm.service'
import type { UsersService } from '../users/users.service'

/** Rough token estimate (≈4 chars/token) – the LLM layer does not report usage. */
export function approxTokens(text: string): number {
  return Math.max(1, Math.ceil((text ?? '').length / 4))
}

export interface AskOptions {
  provider: string
  model?: string
  system: string
  prompt: string
}

/** Single-shot completion using the user's own stored key for that provider. */
export async function askAs(llm: LLMService, users: UsersService, userId: string, opts: AskOptions): Promise<string> {
  const key = opts.provider === 'ollama' ? null : await users.getRawLlmKey(userId, opts.provider as LLMProvider).catch(() => null)
  const res = await llm.complete(
    [{ role: 'user', content: opts.prompt }],
    [],
    opts.system,
    opts.provider as LLMProvider,
    key?.isActive === false ? undefined : (key?.apiKey ?? key?.loginPassword ?? undefined),
    key?.baseUrl ?? undefined,
    opts.model || undefined,
  )
  return String(res.content ?? '').trim()
}

/** Resolve the user's preferred provider/model (fallback ollama). */
export async function preferredTarget(users: UsersService, userId: string): Promise<{ provider: string; model?: string }> {
  const s: any = await users.getSettings(userId).catch(() => null)
  return { provider: String(s?.preferredProvider ?? 'ollama'), model: s?.preferredModel ?? undefined }
}

/** Parse "provider:model" strings. */
export function parseModelRef(ref: string | undefined | null): { provider: string; model?: string } | null {
  const raw = String(ref ?? '').trim()
  if (!raw) return null
  const [provider, ...rest] = raw.split(':')
  const p = provider.trim().toLowerCase()
  if (!/^[a-z0-9_-]{2,40}$/.test(p)) return null
  return { provider: p, model: rest.join(':').trim() || undefined }
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
