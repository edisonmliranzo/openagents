import type { PipeTransform } from '@nestjs/common'

/**
 * Nest's ValidationPipe coerces an absent numeric query/path parameter with
 * `+value`, which turns `undefined` into `NaN`:
 *
 *   @Query('limit') limit?: number   // -> NaN when the param is absent
 *
 * Prisma then rejects `take: NaN` with an "Invalid prisma.* invocation" error,
 * so any route that forwards an optional numeric query param straight into a
 * Prisma call blows up with a 500.
 *
 * This pipe runs right after the ValidationPipe and turns NaN back into
 * `undefined`, restoring the intended "not provided" semantics.
 */
export class NormalizeNaNPipe implements PipeTransform<unknown, unknown> {
  transform(value: unknown): unknown {
    if (typeof value === 'number' && Number.isNaN(value)) return undefined
    return value
  }
}
