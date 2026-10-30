import { ExecutionContext, Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

/**
 * Rate limiter for the API.
 *
 * - Health, internal worker and webhook routes are exempt: they are
 *   machine-to-machine, token-guarded, and can exceed human request rates.
 * - Tracker falls back to X-Forwarded-For when behind the web rewrite proxy,
 *   since main.ts sets `trust proxy` to 1 hop only.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (await super.shouldSkip(context)) return true
    const req = context.switchToHttp().getRequest<{ url?: string; originalUrl?: string }>()
    const url = req?.url ?? req?.originalUrl ?? ''
    return url.startsWith('/api/v1/health')
  }

  protected async getTracker(req: { ip?: string; headers?: Record<string, string | string[] | undefined> }): Promise<string> {
    const cfIp = req?.headers?.['cf-connecting-ip']
    const cfFirst = (Array.isArray(cfIp) ? cfIp[0] : cfIp)?.trim()
    if (cfFirst) return cfFirst

    const realIp = req?.headers?.['x-real-ip']
    const realFirst = (Array.isArray(realIp) ? realIp[0] : realIp)?.trim()
    if (realFirst) return realFirst

    const forwarded = req?.headers?.['x-forwarded-for']
    const parts = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',').map((s) => s.trim()).filter(Boolean)
    // Use the last hop added by the trusted reverse proxy rather than the client-supplied first hop
    if (parts && parts.length > 0) return parts[parts.length - 1]!
    return req?.ip ?? 'unknown'
  }
}
