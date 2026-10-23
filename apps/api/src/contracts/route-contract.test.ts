import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {
  extractApiRoutes,
  extractSdkCalls,
  extractWebFetches,
  findRepoRoot,
  routeMatches,
  routeMatchesStrictly,
  type ClientCall,
} from './route-contract.ts'

const repoRoot = findRepoRoot(process.cwd())
assert.ok(repoRoot, 'Could not locate the repository root from ' + process.cwd())

const apiSrcDir = path.join(repoRoot, 'apps', 'api', 'src')
const sdkApiDir = path.join(repoRoot, 'packages', 'sdk', 'src', 'api')
const webSrcDir = path.join(repoRoot, 'apps', 'web', 'src')

const globalPrefix = 'api/v1'

const apiRoutes = extractApiRoutes(apiSrcDir, globalPrefix)
const sdkCalls = extractSdkCalls(sdkApiDir)
const webFetches = extractWebFetches(webSrcDir)

function describeMismatch(call: ClientCall): string {
  const method = call.method
  const sameMethod = apiRoutes.filter((route) => route.method === method)
  const candidates = sameMethod
    .filter((route) => route.path.split('/').filter(Boolean).length === call.path.split('/').filter(Boolean).length)
    .map((route) => route.path)

  const hint = candidates.length > 0
    ? `\n  closest ${method} routes with the same depth: ${candidates.slice(0, 6).join(', ')}`
    : `\n  no ${method} route exists with that depth (${apiRoutes.filter((r) => r.method === method).length} ${method} routes total)`

  return `SDK/web calls ${method} ${call.path} (${call.source}) but no API route matches.${hint}`
}

function describeShadowed(call: ClientCall): string {
  const swallowed = apiRoutes
    .filter((route) => routeMatches(route, call))
    .map((route) => route.path)
    .slice(0, 6)

  return (
    `SDK/web calls ${method} ${call.path} (${call.source}) but the only matching route(s) ` +
    `use a path parameter, so the request is served by the wrong handler: ${swallowed.join(', ')}`
  )
}

test('the route parser finds a sane number of API routes', () => {
  assert.ok(apiRoutes.length > 200, `expected >200 API routes, found ${apiRoutes.length}`)
  assert.ok(
    apiRoutes.some((route) => route.method === 'GET' && route.path === '/api/v1/health'),
    'expected the health route to be discovered',
  )
})

test('the SDK parser finds the client calls', () => {
  assert.ok(sdkCalls.length > 150, `expected >150 SDK calls, found ${sdkCalls.length}`)
  assert.ok(
    sdkCalls.some((call) => call.method === 'GET' && call.path === '/api/v1/auth/me'),
    'expected GET /api/v1/auth/me to be discovered',
  )
})

test('every SDK client call maps to a real API route', () => {
  const broken = sdkCalls.filter(
    (call) => !apiRoutes.some((route) => routeMatches(route, call)),
  )

  assert.equal(
    broken.length,
    0,
    `${broken.length} SDK call(s) point at routes that do not exist:\n` +
      broken.map((call) => `  - ${describeMismatch(call)}`).join('\n'),
  )
})

test('no SDK client call is silently swallowed by a path parameter', () => {
  const shadowed = sdkCalls.filter(
    (call) =>
      !apiRoutes.some((route) => routeMatchesStrictly(route, call)) &&
      apiRoutes.some((route) => routeMatches(route, call)),
  )

  assert.equal(
    shadowed.length,
    0,
    `${shadowed.length} SDK call(s) are served by the wrong handler because the URL collides with a path parameter:\n` +
      shadowed.map((call) => `  - ${describeShadowed(call)}`).join('\n'),
  )
})

test('every raw web fetch maps to a real API route', () => {
  const broken = webFetches.filter(
    (call) => !apiRoutes.some((route) => routeMatches(route, call)),
  )

  assert.equal(
    broken.length,
    0,
    `${broken.length} web fetch call(s) point at routes that do not exist:\n` +
      broken.map((call) => `  - ${describeMismatch(call)}`).join('\n'),
  )
})

test('no raw web fetch is silently swallowed by a path parameter', () => {
  const shadowed = webFetches.filter(
    (call) =>
      !apiRoutes.some((route) => routeMatchesStrictly(route, call)) &&
      apiRoutes.some((route) => routeMatches(route, call)),
  )

  assert.equal(
    shadowed.length,
    0,
    `${shadowed.length} web fetch call(s) are served by the wrong handler because the URL collides with a path parameter:\n` +
      shadowed.map((call) => `  - ${describeShadowed(call)}`).join('\n'),
  )
})

test('the conversation search route is registered exactly once', () => {
  const matches = apiRoutes.filter((route) => route.path === '/api/v1/conversations/search')
  assert.equal(
    matches.length,
    1,
    `expected one /api/v1/conversations/search route, found ${matches.length}: ${matches.map((m) => m.source).join(', ')}`,
  )
})

test('agent version routes cover every verb the SDK uses', () => {
  const expected = [
    { method: 'GET', path: '/api/v1/agent-versions' },
    { method: 'POST', path: '/api/v1/agent-versions' },
    { method: 'GET', path: '/api/v1/agent-versions/id/:param' },
    { method: 'GET', path: '/api/v1/agent-versions/compare/:param/:param' },
    { method: 'POST', path: '/api/v1/agent-versions/:param/rollback' },
  ]

  for (const route of expected) {
    assert.ok(
      apiRoutes.some((candidate) => routeMatches(candidate, { method: route.method, path: route.path } as any)),
      `missing ${route.method} ${route.path}`,
    )
  }
})
