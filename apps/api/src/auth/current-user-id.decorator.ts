import { createParamDecorator, ExecutionContext } from '@nestjs/common'

/** The authenticated user's id (from the verified JWT), never client input. */
export const CurrentUserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest()
  return req.user?.id
})
