/**
 * Cron expression helpers.
 *
 * Kept in a standalone module (no Nest decorators) so the schedule maths can be
 * unit tested without booting the framework.
 *
 * Supported syntax: standard 5-field cron (`min hour dom mon dow`) in UTC,
 * with `*`, `,`, `-` and `/step`.
 */

export type CronScheduleKind = 'every' | 'at' | 'cron'

const MINUTE_MS = 60_000
const MAX_LOOKAHEAD_MINUTES = 366 * 24 * 60 // one year

/** Parse "10m", "2h", "30s", "1d" → milliseconds */
export function parseEveryInterval(value: string): number | null {
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|d|day)s?$/i)
  if (!m) return null
  const n = parseFloat(m[1])
  switch (m[2].toLowerCase()) {
    case 's': case 'sec': return n * 1_000
    case 'm': case 'min': return n * 60_000
    case 'h': case 'hr': return n * 3_600_000
    case 'd': case 'day': return n * 86_400_000
    default: return null
  }
}

function checkField(field: string, value: number, min: number, max: number): boolean {
  if (field === '*') return true
  if (field.includes('/')) {
    const [range, step] = field.split('/')
    const stepN = parseInt(step, 10)
    if (!Number.isFinite(stepN) || stepN <= 0) return false
    const start = range === '*' ? min : parseInt(range, 10)
    if (!Number.isFinite(start)) return false
    return value >= start && (value - start) % stepN === 0
  }
  if (field.includes(',')) return field.split(',').some((f) => checkField(f.trim(), value, min, max))
  if (field.includes('-')) {
    const [lo, hi] = field.split('-').map(Number)
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return false
    return value >= lo && value <= hi
  }
  const parsed = parseInt(field, 10)
  return Number.isFinite(parsed) && parsed === value
}

/** Evaluate a 5-field cron expression against a given Date (UTC). */
export function matchesCron(expr: string, date: Date): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return false
  const [minE, hourE, domE, monE, dowE] = parts

  return (
    checkField(minE, date.getUTCMinutes(), 0, 59) &&
    checkField(hourE, date.getUTCHours(), 0, 23) &&
    checkField(domE, date.getUTCDate(), 1, 31) &&
    checkField(monE, date.getUTCMonth() + 1, 1, 12) &&
    checkField(dowE, date.getUTCDay(), 0, 6)
  )
}

/** True when the expression has 5 fields and every field is syntactically valid. */
export function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false

  const ranges: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]]
  return parts.every((field, index) => {
    const [min, max] = ranges[index]
    if (field === '*') return true
    if (field.includes('/')) {
      const [range, step] = field.split('/')
      const stepN = parseInt(step, 10)
      if (!Number.isFinite(stepN) || stepN <= 0) return false
      if (range === '*') return true
      const start = parseInt(range, 10)
      return Number.isFinite(start) && start >= min && start <= max
    }
    if (field.includes(',')) {
      return field.split(',').every((f) => isValidCronField(f.trim(), min, max))
    }
    if (field.includes('-')) {
      const [lo, hi] = field.split('-').map(Number)
      return Number.isFinite(lo) && Number.isFinite(hi) && lo >= min && hi <= max && lo <= hi
    }
    return isValidCronField(field, min, max)
  })
}

function isValidCronField(field: string, min: number, max: number): boolean {
  const parsed = parseInt(field, 10)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
}

/**
 * The next minute at which the expression matches, or null when it never
 * matches within the lookahead window.
 */
export function nextCronRun(expr: string, from: Date = new Date()): Date | null {
  if (!isValidCron(expr)) return null

  const start = new Date(from.getTime())
  start.setUTCSeconds(0, 0)
  start.setTime(start.getTime() + MINUTE_MS)

  for (let i = 0; i < MAX_LOOKAHEAD_MINUTES; i += 1) {
    const candidate = new Date(start.getTime() + i * MINUTE_MS)
    if (matchesCron(expr, candidate)) return candidate
  }

  return null
}

/**
 * The next time a job of this kind should run, or null when the schedule can
 * never fire again (a one-shot in the past).
 */
export function nextRunAt(
  kind: CronScheduleKind,
  value: string,
  from: Date = new Date(),
): Date | null {
  if (kind === 'at') {
    const target = new Date(value)
    if (Number.isNaN(target.getTime())) return null
    return target.getTime() > from.getTime() ? target : null
  }

  if (kind === 'every') {
    const interval = parseEveryInterval(value)
    if (!interval) return null
    return new Date(from.getTime() + interval)
  }

  return nextCronRun(value, from)
}

/** Human-readable description of a schedule, used by the UI. */
export function describeSchedule(kind: CronScheduleKind, value: string): string {
  if (kind === 'at') {
    const target = new Date(value)
    if (Number.isNaN(target.getTime())) return 'One-off (invalid date)'
    return `Once at ${target.toISOString()}`
  }
  if (kind === 'every') {
    const interval = parseEveryInterval(value)
    if (!interval) return `Every ${value}`
    if (interval % 86_400_000 === 0) return `Every ${interval / 86_400_000} day(s)`
    if (interval % 3_600_000 === 0) return `Every ${interval / 3_600_000} hour(s)`
    if (interval % 60_000 === 0) return `Every ${interval / 60_000} minute(s)`
    return `Every ${interval / 1000} second(s)`
  }
  return `Cron: ${value} (UTC)`
}
