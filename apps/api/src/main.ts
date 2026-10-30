import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import type { Request, Response, NextFunction } from 'express'
import { networkInterfaces } from 'node:os'
import { AppModule } from './app.module'
import { NormalizeNaNPipe } from './common/normalize-nan.pipe'

function toOrigin(value: string) {
  const normalized = value.trim()
  if (!normalized) return ''

  try {
    return new URL(normalized).origin
  } catch {
    return ''
  }
}

function getLanOrigins(port: string) {
  const origins = new Set<string>()
  const interfaces = networkInterfaces()

  for (const entries of Object.values(interfaces)) {
    if (!entries) continue
    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      origins.add(`http://${entry.address}:${port}`)
    }
  }

  return [...origins]
}

const BLOCKED_SCANNER_UA = /(sqlmap|nikto|acunetix|nuclei|masscan|zgrab|dirbuster|gobuster|havij|nessus|openvas|wpscan)/i
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function sanitizeObjectInPlace(value: unknown, depth = 0): void {
  if (depth > 8 || !value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) sanitizeObjectInPlace(item, depth + 1)
    return
  }
  const obj = value as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      delete obj[key]
      continue
    }
    sanitizeObjectInPlace(obj[key], depth + 1)
  }
}

async function bootstrap() {
  // rawBody is required so providers can verify webhook signatures over the exact
  // bytes we received (Stripe, Slack, Discord). Without it req.rawBody is undefined
  // and every signature check rejects the request.
  const app = await NestFactory.create(AppModule, { rawBody: true })
  const httpApp = app.getHttpAdapter().getInstance() as {
    set?: (key: string, value: unknown) => void
    disable?: (key: string) => void
  }
  if (typeof httpApp?.set === 'function') {
    httpApp.set('trust proxy', 1)
  }
  if (typeof httpApp?.disable === 'function') {
    httpApp.disable('x-powered-by')
  }

  // The OpenAI-compatible API lives at /v1/chat/completions (outside the
  // /api/v1 prefix) so stock OpenAI clients can point at OpenAgents unchanged.
  app.setGlobalPrefix('api/v1', {
    exclude: ['v1/models', 'v1/chat/completions'],
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
    // Must run after the ValidationPipe: it turns the NaN that Nest produces
    // for absent numeric query params back into undefined.
    new NormalizeNaNPipe(),
  )

  const isProduction = (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production'
  const defaultWebPort = (process.env.WEB_PORT ?? '3000').trim() || '3000'
  const defaults = [
    `http://localhost:${defaultWebPort}`,
    `http://127.0.0.1:${defaultWebPort}`,
    'https://openagents.us',
    'https://www.openagents.us',
  ]
  const explicitOrigins = (process.env.FRONTEND_URLS ?? '')
    .split(',')
    .map((value) => toOrigin(value))
    .filter(Boolean)

  const legacyOrigin = toOrigin(process.env.FRONTEND_URL ?? '')
  const publicBaseOrigin = toOrigin(process.env.PUBLIC_BASE_URL ?? '')
  const publicLoginOrigin = toOrigin(process.env.PUBLIC_LOGIN_URL ?? '')
  const devOrigins = isProduction ? [] : [...defaults, ...getLanOrigins(defaultWebPort)]
  // In development, allow any loopback port (web may run on 3000, 3002, …).
  const isDevLoopbackOrigin = (origin: string) => {
    if (isProduction) return false
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)
  }
  const isCloudPortalOrigin = (origin: string) => {
    return (
      /^https:\/\/([a-z0-9-]+\.)?openagents\.us$/i.test(origin) ||
      /^https:\/\/openagents\.[a-z0-9-]+\.workers\.dev$/i.test(origin)
    )
  }
  const fallbackOrigins = [
    ...(legacyOrigin ? [legacyOrigin] : []),
    ...(publicBaseOrigin ? [publicBaseOrigin] : []),
    ...(publicLoginOrigin ? [publicLoginOrigin] : []),
    ...devOrigins,
  ]
  const frontendOrigins = explicitOrigins.length > 0
    ? [...new Set([...explicitOrigins, ...fallbackOrigins])]
    : [...new Set(fallbackOrigins)]

  if (isProduction && frontendOrigins.length === 0) {
    throw new Error('CORS is not configured. Set FRONTEND_URLS (or FRONTEND_URL) in production.')
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    const rawUrl = String(req.originalUrl || req.url || '')
    const ua = String(req.headers['user-agent'] ?? '')

    // Block automated exploit/vulnerability scanners
    if (ua && BLOCKED_SCANNER_UA.test(ua)) {
      res.status(403).json({ statusCode: 403, message: 'Forbidden' })
      return
    }

    // Block null-byte injection and URL path traversal attempts
    if (
      rawUrl.includes('\0') ||
      /%00/i.test(rawUrl) ||
      /(^|\/)\.\.(\/|\\|%2f|%5c)/i.test(rawUrl) ||
      /%2e%2e(%2f|%5c|\/|\\)/i.test(rawUrl)
    ) {
      res.status(400).json({ statusCode: 400, message: 'Bad Request' })
      return
    }

    // Strip prototype-pollution keys from body, query, and params
    sanitizeObjectInPlace(req.body)
    sanitizeObjectInPlace(req.query)
    sanitizeObjectInPlace(req.params)

    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none')
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
    next()
  })

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true)
        return
      }
      if (frontendOrigins.includes(origin) || isDevLoopbackOrigin(origin) || isCloudPortalOrigin(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
  })

  const enableSwagger = !isProduction && (process.env.ENABLE_SWAGGER ?? '').trim().toLowerCase() === 'true'
  if (enableSwagger) {
    const swagger = new DocumentBuilder()
      .setTitle('OpenAgents API')
      .setVersion('1.0')
      .addBearerAuth()
      .build()
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger))
  }

  const port = process.env.API_PORT ?? process.env.PORT ?? 3001
  await app.listen(port)
  console.log(`API running on http://localhost:${port}`)
}

bootstrap()
