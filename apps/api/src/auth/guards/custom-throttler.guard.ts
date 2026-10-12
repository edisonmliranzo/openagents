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
    return (
      url.startsWith('/api/v1/health') ||
      url.includes('/internal') ||
      url.includes('/webhook')
    )
  }

  protected async getTracker(req: { ip?: string; headers?: Record<string, string | string[] | undefined> }): Promise<string> {
    const forwarded = req?.headers?.['x-forwarded-for']
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
    if (first) return first
    return req?.ip ?? 'unknown'
  }
}
