import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import type { Request, Response, NextFunction } from 'express'
import { networkInterfaces } from 'node:os'
import { AppModule } from './app.module'

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

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const httpApp = app.getHttpAdapter().getInstance() as { set?: (key: string, value: unknown) => void }
  if (typeof httpApp?.set === 'function') {
    httpApp.set('trust proxy', 1)
  }

  app.setGlobalPrefix('api/v1')

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )

  const isProduction = (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production'
  const defaultWebPort = (process.env.WEB_PORT ?? '3000').trim() || '3000'
  const defaults = [`http://localhost:${defaultWebPort}`, `http://127.0.0.1:${defaultWebPort}`]
  const explicitOrigins = (process.env.FRONTEND_URLS ?? '')
    .split(',')
    .map((value) => toOrigin(value))
    .filter(Boolean)

  const legacyOrigin = toOrigin(process.env.FRONTEND_URL ?? '')
  const publicBaseOrigin = toOrigin(process.env.PUBLIC_BASE_URL ?? '')
  const publicLoginOrigin = toOrigin(process.env.PUBLIC_LOGIN_URL ?? '')
  const devOrigins = isProduction ? [] : [...defaults, ...getLanOrigins(defaultWebPort)]
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
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
    next()
  })

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true)
        return
      }
      if (frontendOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
  })

  const swagger = new DocumentBuilder()
    .setTitle('OpenAgents API')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger))

  const port = process.env.API_PORT ?? process.env.PORT ?? 3001
  await app.listen(port)
  console.log(`API running on http://localhost:${port}`)
  console.log(`Swagger docs: http://localhost:${port}/docs`)
}

bootstrap()
