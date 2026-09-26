import OpenAI from 'openai'

export const HASH_EMBEDDING_DIMS = 256

/** Deterministic bag-of-words hashed embedding — offline fallback for recall. */
export function hashEmbedding(text: string, dims = HASH_EMBEDDING_DIMS): number[] {
  const vec = new Array<number>(dims).fill(0)
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  for (const token of tokens) {
    let h = 2166136261
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }
    vec[h % dims] += 1
    vec[(h >>> 10) % dims] += 0.5
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1
  return vec.map((v) => v / norm)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }
  if (!normA || !normB) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function parseEmbedding(raw: string | null | undefined): number[] | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'number'
      ? (parsed as number[])
      : null
  } catch {
    return null
  }
}

export interface EmbedTextOptions {
  openaiKey?: string
  ollamaBaseUrl?: string
}

export type EmbeddingProvider = 'openai' | 'ollama' | 'hash'

function isUsableKey(key?: string): key is string {
  const normalized = (key ?? '').trim().toLowerCase()
  if (!normalized) return false
  if (normalized === 'sk-...' || normalized.startsWith('your-') || normalized.includes('change-me')) return false
  return true
}

/**
 * Embed text for semantic memory. Tries OpenAI (text-embedding-3-small),
 * then Ollama (nomic-embed-text), then a deterministic hash embedding so
 * semantic recall always works, even fully offline.
 */
export async function embedText(
  text: string,
  options: EmbedTextOptions = {},
): Promise<{ vector: number[]; provider: EmbeddingProvider } | null> {
  const clean = (text ?? '').trim().slice(0, 8000)
  if (!clean) return null

  if (isUsableKey(options.openaiKey)) {
    try {
      const client = new OpenAI({ apiKey: options.openaiKey, timeout: 20_000, maxRetries: 0 })
      const res = await client.embeddings.create({ model: 'text-embedding-3-small', input: clean })
      const vector = res.data?.[0]?.embedding
      if (Array.isArray(vector) && vector.length > 0) return { vector, provider: 'openai' }
    } catch {
      // fall through to the next provider
    }
  }

  const ollamaBase = (options.ollamaBaseUrl ?? '').trim().replace(/\/+$/, '')
  if (ollamaBase) {
    try {
      const res = await fetch(`${ollamaBase}/api/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'nomic-embed-text', prompt: clean }),
      })
      if (res.ok) {
        const json = await res.json() as { embedding?: number[] }
        if (Array.isArray(json.embedding) && json.embedding.length > 0) return { vector: json.embedding, provider: 'ollama' }
      }
    } catch {
      // Ollama not reachable — fall through to hash.
    }
  }

  return { vector: hashEmbedding(clean), provider: 'hash' }
}
