import { Injectable, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtAuthGuard } from './jwt.guard'
import { IS_PUBLIC_KEY } from '../../common/public.decorator'

/**
 * Applied globally (APP_GUARD). Every route requires a valid JWT unless it is
 * explicitly marked @Public(). Fail-closed by default.
 */
@Injectable()
export class GlobalAuthGuard extends JwtAuthGuard {
  constructor(private readonly reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true
    return super.canActivate(context)
  }
}
