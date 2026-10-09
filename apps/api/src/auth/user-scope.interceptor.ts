import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Observable } from 'rxjs'

/**
 * Tenant isolation: rejects any request whose userId (path, query or body)
 * differs from the authenticated user. Never rewrites input, so DTO validation
 * (forbidNonWhitelisted) is unaffected. Handlers that need the caller's id
 * should read it from req.user / @CurrentUserId().
 */
@Injectable()
export class UserScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest()
    const me: string | undefined = req.user?.id
    if (!me) return next.handle()

    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : undefined
    const supplied = [req.params?.userId, req.query?.userId, body?.userId]
    for (const value of supplied) {
      if (typeof value === 'string' && value.length > 0 && value !== me) {
        throw new ForbiddenException('userId does not match the authenticated user')
      }
    }
    return next.handle()
  }
}
