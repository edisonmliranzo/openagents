import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidHookEvent,
  matchesCondition,
  resolveActionOutcome,
  type HookContext,
  type HookLike,
} from './hook-logic.ts'

function hook(overrides: Partial<HookLike> = {}): HookLike {
  return {
    id: 'hook-1',
    name: 'test hook',
    event: 'pre_tool',
    enabled: true,
    condition: {},
    action: { kind: 'block' },
    order: 1,
    ...overrides,
  }
}

test('only the four known events are valid', () => {
  assert.equal(isValidHookEvent('run_start'), true)
  assert.equal(isValidHookEvent('pre_tool'), true)
  assert.equal(isValidHookEvent('post_tool'), true)
  assert.equal(isValidHookEvent('run_end'), true)
  assert.equal(isValidHookEvent('nope'), false)
  assert.equal(isValidHookEvent(undefined), false)
})

test('a tool-targeted condition only matches that tool', () => {
  const condition = { tools: ['shell_execute'] }
  const ctx = (toolName: string): HookContext => ({ event: 'pre_tool', toolName })
  assert.equal(matchesCondition(condition, ctx('shell_execute')), true)
  assert.equal(matchesCondition(condition, ctx('web_search')), false)
  assert.equal(matchesCondition(condition, ctx('SHELL_EXECUTE')), true)
})

test('a substring condition matches case-insensitively', () => {
  const context: HookContext = { event: 'pre_tool', toolInput: { command: 'rm -rf /' } }
  assert.equal(matchesCondition({ inputContains: 'RM -RF' }, context), true)
  assert.equal(matchesCondition({ inputContains: 'safe' }, context), false)
})

test('onError only matches the right outcome', () => {
  assert.equal(
    matchesCondition({ onError: true }, { event: 'post_tool', toolSuccess: false }),
    true,
  )
  assert.equal(
    matchesCondition({ onError: true }, { event: 'post_tool', toolSuccess: true }),
    false,
  )
  assert.equal(
    matchesCondition({ onError: false }, { event: 'post_tool', toolSuccess: true }),
    true,
  )
})

test('a message condition matches the user message', () => {
  const context: HookContext = { event: 'run_start', userMessage: 'please deploy the app' }
  assert.equal(matchesCondition({ messageContains: 'deploy' }, context), true)
  assert.equal(matchesCondition({ messageContains: 'refund' }, context), false)
})

test('block produces a blocked outcome with a message', () => {
  const outcome = resolveActionOutcome(
    hook({ action: { kind: 'block', message: 'Shell is disabled.' } }),
    { event: 'pre_tool', toolName: 'shell_execute' },
  )
  assert.equal(outcome.blocked, true)
  assert.equal(outcome.blockMessage, 'Shell is disabled.')
})

test('a block without a message still explains itself', () => {
  const outcome = resolveActionOutcome(
    hook({ name: 'guard', action: { kind: 'block' } }),
    { event: 'pre_tool' },
  )
  assert.equal(outcome.blocked, true)
  assert.match(outcome.blockMessage ?? '', /guard/)
})

test('modify_input merges the patch into the tool input', () => {
  const outcome = resolveActionOutcome(
    hook({ action: { kind: 'modify_input', patch: { mode: 'safe' } } }),
    { event: 'pre_tool', toolInput: { url: 'https://example.com', mode: 'full' } },
  )
  assert.equal(outcome.blocked, false)
  assert.deepEqual(outcome.modifiedInput, { url: 'https://example.com', mode: 'safe' })
})

test('annotate collects the note', () => {
  const outcome = resolveActionOutcome(
    hook({ action: { kind: 'annotate', note: 'this failed' } }),
    { event: 'post_tool' },
  )
  assert.deepEqual(outcome.annotations, ['this failed'])
})

test('notify collects a title and body', () => {
  const outcome = resolveActionOutcome(
    hook({ action: { kind: 'notify', title: 'Tool failed', body: 'check the logs' } }),
    { event: 'post_tool' },
  )
  assert.equal(outcome.notifications.length, 1)
  assert.equal(outcome.notifications[0].title, 'Tool failed')
  assert.equal(outcome.notifications[0].body, 'check the logs')
})

test('run_command is surfaced for the caller to execute', () => {
  const outcome = resolveActionOutcome(
    hook({ action: { kind: 'run_command', command: 'echo hi' } }),
    { event: 'run_end' },
  )
  assert.deepEqual(outcome.commands, ['echo hi'])
})
