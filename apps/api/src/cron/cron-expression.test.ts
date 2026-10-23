import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  describeSchedule,
  isValidCron,
  matchesCron,
  nextCronRun,
  nextRunAt,
  parseEveryInterval,
} from './cron-expression.ts'

test('parseEveryInterval understands the shorthand units', () => {
  assert.equal(parseEveryInterval('30s'), 30_000)
  assert.equal(parseEveryInterval('5m'), 300_000)
  assert.equal(parseEveryInterval('2h'), 7_200_000)
  assert.equal(parseEveryInterval('1d'), 86_400_000)
  assert.equal(parseEveryInterval('every 5m'), null)
  assert.equal(parseEveryInterval('nonsense'), null)
})

test('matchesCron handles the standard fields', () => {
  const date = new Date(Date.UTC(2026, 0, 5, 9, 30, 0)) // Mon 5 Jan 2026 09:30 UTC
  assert.equal(matchesCron('30 9 * * *', date), true)
  assert.equal(matchesCron('* * * * *', date), true)
  assert.equal(matchesCron('0 9 * * *', date), false)
  assert.equal(matchesCron('*/15 * * * *', date), true)
  assert.equal(matchesCron('30 9 * * 1-5', date), true)
  assert.equal(matchesCron('30 9 * * 6', date), false)
  assert.equal(matchesCron('0,30 * * * *', date), true)
  assert.equal(matchesCron('too short', date), false)
})

test('isValidCron rejects malformed expressions', () => {
  assert.equal(isValidCron('* * * * *'), true)
  assert.equal(isValidCron('*/5 9-17 * * 1-5'), true)
  assert.equal(isValidCron('* * * *'), false)
  assert.equal(isValidCron('60 * * * *'), false)
  assert.equal(isValidCron('* 25 * * *'), false)
  assert.equal(isValidCron('nope * * * *'), false)
})

test('nextCronRun finds the upcoming matching minute', () => {
  const from = new Date(Date.UTC(2026, 0, 5, 9, 30, 30))
  const next = nextCronRun('0 * * * *', from)
  assert.ok(next)
  assert.equal(next!.toISOString(), '2026-01-05T10:00:00.000Z')

  const later = nextCronRun('*/15 * * * *', from)
  assert.equal(later!.toISOString(), '2026-01-05T09:45:00.000Z')
})

test('nextCronRun returns null for an impossible expression', () => {
  const from = new Date(Date.UTC(2026, 0, 5, 9, 0, 0))
  assert.equal(nextCronRun('0 0 30 2 *', from), null)
  assert.equal(nextCronRun('not a cron', from), null)
})

test('nextRunAt handles one-shot, interval and cron schedules', () => {
  const from = new Date(Date.UTC(2026, 0, 5, 9, 0, 0))

  const oneShot = nextRunAt('at', '2026-01-06T10:00:00.000Z', from)
  assert.equal(oneShot!.toISOString(), '2026-01-06T10:00:00.000Z')

  // A one-shot in the past never runs again.
  assert.equal(nextRunAt('at', '2026-01-01T10:00:00.000Z', from), null)

  const interval = nextRunAt('every', '30m', from)
  assert.equal(interval!.toISOString(), '2026-01-05T09:30:00.000Z')

  const cron = nextRunAt('cron', '0 10 * * *', from)
  assert.equal(cron!.toISOString(), '2026-01-05T10:00:00.000Z')
})

test('describeSchedule renders a readable label', () => {
  assert.equal(describeSchedule('every', '30m'), 'Every 30 minute(s)')
  assert.equal(describeSchedule('every', '2h'), 'Every 2 hour(s)')
  assert.equal(describeSchedule('every', '1d'), 'Every 1 day(s)')
  assert.equal(describeSchedule('cron', '0 9 * * *'), 'Cron: 0 9 * * * (UTC)')
  assert.match(describeSchedule('at', '2026-01-06T10:00:00.000Z'), /^Once at /)
})
