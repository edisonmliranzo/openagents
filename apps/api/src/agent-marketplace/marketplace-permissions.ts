import { createHash } from 'node:crypto'

export const DATA_SCOPES = [
  'memory:read',
  'memory:write',
  'conversations:read',
  'files:read',
  'files:write',
  'calendar:read',
  'email:read',
  'contacts:read',
] as const

export interface PermissionManifest {
  tools: string[]
  networkDomains: string[]
  dataScopes: string[]
}

const DOMAIN_RE = /^(\*\.)?([a-z0-9-]+\.)+[a-z]{2,}$/

export function validateAndNormalizeManifest(input: Partial<PermissionManifest> | undefined): PermissionManifest {
  const uniq = (xs: unknown, map: (s: string) => string) =>
    [...new Set((Array.isArray(xs) ? xs : []).filter((x): x is string => typeof x === 'string').map((s) => map(s.trim())).filter(Boolean))].sort()
  const tools = uniq(input?.tools, (s) => s)
  const networkDomains = uniq(input?.networkDomains, (s) => s.toLowerCase())
  const dataScopes = uniq(input?.dataScopes, (s) => s)
  for (const t of tools) if (t === '*' || t.length > 64) throw new Error(`Invalid tool name: ${t.slice(0, 40)}`)
  for (const d of networkDomains) if (!DOMAIN_RE.test(d)) throw new Error(`Invalid network domain: ${d.slice(0, 80)}`)
  for (const s of dataScopes) if (!(DATA_SCOPES as readonly string[]).includes(s)) throw new Error(`Unknown data scope: ${s.slice(0, 40)}`)
  return { tools, networkDomains, dataScopes }
}

export function manifestHash(version: string, manifest: PermissionManifest): string {
  return createHash('sha256').update(JSON.stringify({ version, ...validateAndNormalizeManifest(manifest) })).digest('hex')
}

export function isSubset(sub: string[], sup: string[]) {
  const set = new Set(sup)
  return sub.every((x) => set.has(x))
}

export function domainAllowed(host: string, domains: string[]) {
  const h = host.toLowerCase()
  return domains.some((d) => (d.startsWith('*.') ? h.endsWith(d.slice(1)) && h.length > d.length - 1 : h === d))
}

export function inferToolDataScope(toolName: string): (typeof DATA_SCOPES)[number] | null {
  const lower = toolName.trim().toLowerCase()
  if (lower.startsWith('gmail_')) return 'email:read'
  if (lower.startsWith('calendar_')) return 'calendar:read'
  if (lower === 'memory_search' || lower === 'memory_get_profile') return 'memory:read'
  if (lower.startsWith('memory_')) return 'memory:write'
  if (lower === 'notes_list' || lower === 'library_search' || lower === 'document_qa') return 'files:read'
  if (lower === 'notes_create' || lower === 'library_save') return 'files:write'
  if (lower === 'hubspot_search') return 'contacts:read'
  return null
}

const INPUT_URL_RE = /\bhttps?:\/\/[^\s"'<>)]+/gi

export function extractUrlsFromInput(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 4 || out.length >= 25) return out
  if (typeof value === 'string') {
    for (const m of value.match(INPUT_URL_RE) ?? []) {
      if (out.length < 25) out.push(m)
    }
  } else if (Array.isArray(value)) {
    for (const item of value.slice(0, 40)) extractUrlsFromInput(item, out, depth + 1)
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>).slice(0, 40)) {
      extractUrlsFromInput(v, out, depth + 1)
    }
  }
  return [...new Set(out)]
}
