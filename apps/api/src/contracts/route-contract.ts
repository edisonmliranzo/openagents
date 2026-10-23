/**
 * Static route extraction used by the SDK↔API contract test.
 *
 * It parses the Nest controllers under `apps/api/src` and the SDK client calls
 * under `packages/sdk/src/api` (plus raw `fetch()` calls in `apps/web/src`) so
 * the test can assert that every URL the client asks for actually exists on
 * the server. The whole "the web calls a 404" class of bug becomes impossible
 * to reintroduce without failing CI.
 *
 * This module is intentionally dependency-free and decorator-free so it can run
 * under `node --experimental-strip-types` without booting Nest.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface ApiRoute {
  method: string
  path: string
  source: string
}

export interface ClientCall {
  method: string
  path: string
  source: string
  line: number
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all'] as const

/** Words that mean "this interpolation is a query string, not a path segment". */
const QUERY_INTERPOLATION = /^(qs|suffix|query|rendered|params|searchParams)$/i

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue
      walk(full, out)
    } else if (
      (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) ||
      entry.name.endsWith('.tsx')
    ) {
      out.push(full)
    }
  }
  return out
}

function lineOf(source: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1
  }
  return line
}

/** Reads a quoted or template literal starting at `start`. Returns null if there is none. */
function readLiteral(source: string, start: number): { value: string; end: number } | null {
  const quote = source[start]
  if (quote !== "'" && quote !== '"' && quote !== '`') return null

  if (quote !== '`') {
    const end = source.indexOf(quote, start + 1)
    if (end === -1) return null
    return { value: source.slice(start + 1, end), end: end + 1 }
  }

  // Template literal — needs to understand `${ ... }` so nested templates and
  // quotes inside interpolations do not terminate the literal early.
  let i = start + 1
  let depth = 0
  while (i < source.length) {
    const ch = source[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (depth === 0 && ch === '`') {
      return { value: source.slice(start + 1, i), end: i + 1 }
    }
    if (ch === '$' && source[i + 1] === '{') {
      i = readInterpolationEnd(source, i + 2)
      continue
    }
    i += 1
  }
  return null
}

/** Given the index just after `${`, returns the index just after the matching `}`. */
function readInterpolationEnd(source: string, start: number): number {
  let i = start
  let depth = 1
  while (i < source.length) {
    const ch = source[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const literal = readLiteral(source, i)
      if (literal) {
        i = literal.end
        continue
      }
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return i + 1
    }
    i += 1
  }
  return i
}

/** Splits a template body into literal chunks and interpolation expressions. */
function splitTemplate(body: string): Array<{ literal: string } | { expr: string }> {
  const parts: Array<{ literal: string } | { expr: string }> = []
  let literal = ''
  let i = 0

  while (i < body.length) {
    if (body[i] === '\\') {
      literal += body.slice(i, i + 2)
      i += 2
      continue
    }
    if (body[i] === '$' && body[i + 1] === '{') {
      if (literal) {
        parts.push({ literal })
        literal = ''
      }
      const end = readInterpolationEnd(body, i + 2)
      parts.push({ expr: body.slice(i + 2, end - 1) })
      i = end
      continue
    }
    literal += body[i]
    i += 1
  }

  if (literal) parts.push({ literal })
  return parts
}

/** Collects `const NAME = 'literal'` declarations so `${BASE}` can be resolved. */
function collectStringConstants(source: string): Record<string, string> {
  const constants: Record<string, string> = {}
  const re = /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*(['"`])/g
  let match: RegExpExecArray | null

  while ((match = re.exec(source))) {
    const literal = readLiteral(source, match.index + match[0].length - 1)
    if (!literal) continue
    if (literal.value.includes('${')) continue
    constants[match[1]] = literal.value
  }

  return constants
}

function classifyInterpolation(expr: string): 'query' | 'param' {
  const trimmed = expr.trim()
  if (QUERY_INTERPOLATION.test(trimmed)) return 'query'
  if (trimmed.includes('?') || trimmed.includes('&')) return 'query'
  if (/toString|URLSearchParams|Query\(/.test(trimmed)) return 'query'
  return 'param'
}

/**
 * Turns a raw template/string into a comparable route pattern.
 * Query strings are removed and path interpolations become `:param`.
 */
export function toRoutePattern(raw: string, constants: Record<string, string> = {}): string | null {
  const parts = splitTemplate(raw)
  let pattern = ''
  let stopped = false

  for (const part of parts) {
    if (stopped) break
    if ('literal' in part) {
      const text = part.literal
      const queryIndex = text.indexOf('?')
      if (queryIndex >= 0) {
        pattern += text.slice(0, queryIndex)
        stopped = true
        continue
      }
      pattern += text
      continue
    }

    const expr = part.expr.trim()
    const resolved = constants[expr]
    if (resolved !== undefined) {
      const queryIndex = resolved.indexOf('?')
      if (queryIndex >= 0) {
        pattern += resolved.slice(0, queryIndex)
        stopped = true
        continue
      }
      pattern += resolved
      continue
    }

    if (classifyInterpolation(expr) === 'query') {
      stopped = true
      continue
    }

    pattern += ':param'
  }

  const cleaned = pattern.replace(/\/+$/, '')
  if (!cleaned.startsWith('/')) return null
  return cleaned
}

/** Extracts every route declared by the Nest controllers under `apiSrcDir`. */
export function extractApiRoutes(apiSrcDir: string, globalPrefix = 'api/v1'): ApiRoute[] {
  const routes: ApiRoute[] = []

  for (const file of walk(apiSrcDir)) {
    if (!file.endsWith('.controller.ts')) continue
    const source = fs.readFileSync(file, 'utf8')
    const relative = path.relative(apiSrcDir, file)

    let prefix = ''
    const controllerRe = /@Controller\(\s*(['"`])([^'"`]*)\1\s*\)/g
    let controllerMatch: RegExpExecArray | null
    let lastControllerEnd = -1

    while ((controllerMatch = controllerRe.exec(source))) {
      prefix = controllerMatch[2]
      lastControllerEnd = controllerRe.lastIndex

      const methodRe = /@(Get|Post|Put|Patch|Delete|Options|Head|All)\b(\(\s*(['"`])?([^'"`)]*)\3?\s*\))?/g
      methodRe.lastIndex = controllerRe.lastIndex
      let methodMatch: RegExpExecArray | null

      while ((methodMatch = methodRe.exec(source))) {
        // A route decorator only belongs to this controller if it appears before
        // the next @Controller() declaration.
        const nextController = source.indexOf('@Controller(', methodRe.lastIndex)
        if (nextController !== -1 && nextController < methodMatch.index) break

        const method = methodMatch[1].toUpperCase()
        const routePath = (methodMatch[4] ?? '').trim()
        const full = [globalPrefix, prefix, routePath]
          .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
          .filter(Boolean)
          .join('/')

        routes.push({
          method,
          path: `/${full}`,
          source: `${relative}:${lineOf(source, methodMatch.index)}`,
        })
      }

      controllerRe.lastIndex = lastControllerEnd
    }
  }

  return routes
}

/** Extracts every `client.<verb>('<path>')` call from the SDK api modules. */
export function extractSdkCalls(sdkApiDir: string): ClientCall[] {
  const calls: ClientCall[] = []

  for (const file of walk(sdkApiDir)) {
    const source = fs.readFileSync(file, 'utf8')
    const relative = path.relative(sdkApiDir, file)
    const constants = collectStringConstants(source)

    const re = /\bclient\.(get|post|put|patch|delete|stream|streamGet)\b/g
    let match: RegExpExecArray | null

    while ((match = re.exec(source))) {
      const verb = match[1]
      let i = re.lastIndex

      while (i < source.length && /\s/.test(source[i])) i += 1

      // Optional generic argument: client.get<T>(...)
      if (source[i] === '<') {
        const end = skipGenerics(source, i)
        if (end === -1) continue
        i = end
        while (i < source.length && /\s/.test(source[i])) i += 1
      }

      if (source[i] !== '(') continue
      i += 1
      while (i < source.length && /\s/.test(source[i])) i += 1

      const literal = readLiteral(source, i)
      if (!literal) continue

      const method = verb === 'stream' ? 'POST' : verb === 'streamGet' ? 'GET' : verb.toUpperCase()
      const pattern = toRoutePattern(literal.value, constants)
      if (!pattern) continue

      calls.push({
        method,
        path: pattern,
        source: `${relative}:${lineOf(source, match.index)}`,
        line: lineOf(source, match.index),
      })
    }
  }

  return calls
}

/** Extracts raw `fetch('/api/...')` calls from the web app. */
export function extractWebFetches(webSrcDir: string): ClientCall[] {
  const calls: ClientCall[] = []

  for (const file of walk(webSrcDir)) {
    if (!file.endsWith('.tsx') && !file.endsWith('.ts')) continue
    const source = fs.readFileSync(file, 'utf8')
    const relative = path.relative(webSrcDir, file)

    // 1. Direct fetch('/api/...') calls.
    const fetchRe = /\bfetch\(\s*(['"`])/g
    let match: RegExpExecArray | null

    while ((match = fetchRe.exec(source))) {
      const literal = readLiteral(source, match.index + match[0].length - 1)
      if (!literal) continue

      const pattern = toRoutePattern(literal.value)
      if (!pattern || !pattern.startsWith('/api/')) continue

      // Look for `method: 'POST'` in the options object that follows.
      const tail = source.slice(match.index, match.index + 400)
      const methodMatch = tail.match(/method\s*:\s*['"`]([A-Za-z]+)['"`]/)
      const method = (methodMatch?.[1] ?? 'GET').toUpperCase()

      calls.push({
        method,
        path: pattern,
        source: `${relative}:${lineOf(source, match.index)}`,
        line: lineOf(source, match.index),
      })
    }

    // 2. URLs parked in a `url:` property and fetched later (e.g. export menus).
    const urlRe = /\burl\s*:\s*(['"`])/g
    while ((match = urlRe.exec(source))) {
      const literal = readLiteral(source, match.index + match[0].length - 1)
      if (!literal) continue

      const pattern = toRoutePattern(literal.value)
      if (!pattern || !pattern.startsWith('/api/')) continue

      calls.push({
        method: 'GET',
        path: pattern,
        source: `${relative}:${lineOf(source, match.index)}`,
        line: lineOf(source, match.index),
      })
    }
  }

  return calls
}

/** Skips a balanced `<...>` generic argument. */
function skipGenerics(source: string, start: number): number {
  let depth = 0
  let i = start
  while (i < source.length) {
    const ch = source[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      const literal = readLiteral(source, i)
      if (literal) {
        i = literal.end
        continue
      }
    }
    // `=>` inside a generic type must not be counted as a closing angle bracket.
    if (ch === '=' && source[i + 1] === '>') {
      i += 2
      continue
    }
    if (ch === '<') depth += 1
    else if (ch === '>') {
      depth -= 1
      if (depth === 0) return i + 1
    }
    i += 1
  }
  return -1
}

/**
 * Structural match, loose form: an API param segment absorbs a client literal.
 *
 * This mirrors what Express/Nest actually does — `GET /agent-versions/:agentId`
 * happily serves `GET /agent-versions/diff` — which is exactly why a wrong
 * client URL can return `200` with the wrong payload instead of a 404.
 */
export function routeMatches(apiRoute: ApiRoute, clientPath: { method: string; path: string }): boolean {
  return matchSegments(apiRoute, clientPath, false)
}

/**
 * Structural match, strict form: every literal segment the client uses must
 * line up with a literal segment on the server. A server param cannot stand in
 * for a client literal, because that means the request is being swallowed by
 * the wrong handler.
 */
export function routeMatchesStrictly(apiRoute: ApiRoute, clientPath: { method: string; path: string }): boolean {
  return matchSegments(apiRoute, clientPath, true)
}

function matchSegments(
  apiRoute: ApiRoute,
  clientPath: { method: string; path: string },
  strict: boolean,
): boolean {
  if (apiRoute.method !== clientPath.method) return false

  const apiSegments = apiRoute.path.split('/').filter(Boolean)
  const clientSegments = clientPath.path.split('/').filter(Boolean)
  if (apiSegments.length !== clientSegments.length) return false

  for (let i = 0; i < apiSegments.length; i += 1) {
    const apiSegment = apiSegments[i]
    const clientSegment = clientSegments[i]

    if (clientSegment.startsWith(':')) continue
    if (apiSegment.startsWith(':')) {
      // A server param absorbing a client literal is only tolerated in loose mode.
      if (strict) return false
      continue
    }
    if (apiSegment !== clientSegment) return false
  }

  return true
}

/** Finds the repository root by walking up from `startDir`. */
export function findRepoRoot(startDir: string): string | null {
  let current = path.resolve(startDir)
  for (let i = 0; i < 8; i += 1) {
    if (
      fs.existsSync(path.join(current, 'apps', 'api', 'src')) &&
      fs.existsSync(path.join(current, 'packages', 'sdk', 'src', 'api'))
    ) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}
