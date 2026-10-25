import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_PERMISSION_RULES,
  matchesToolPattern,
  matchToolPermission,
  normalizeRules,
  planModeBlocksScope,
} from './tool-permission-rules.ts'

test('matchesToolPattern: exact, trailing glob, star, and negative cases', () => {
  assert.ok(matchesToolPattern('shell_execute', 'shell_execute'))
  assert.ok(matchesToolPattern('SHELL_EXECUTE', 'shell_execute'))
  assert.ok(matchesToolPattern('web_*', 'web_search'))
  assert.ok(matchesToolPattern('web_*', 'web_crawl'))
  assert.ok(matchesToolPattern('*', 'anything_at_all'))
  assert.ok(!matchesToolPattern('web_*', 'gmail_send'))
  assert.ok(!matchesToolPattern('shell', 'shell_execute'))
  assert.ok(!matchesToolPattern('*_mid', 'web_search'), 'only trailing glob is supported')
  assert.ok(!matchesToolPattern('', 'web_search'))
})

test('matchToolPermission: first matching rule wins', () => {
  const rules = [
    { id: '1', tool: 'shell_execute', effect: 'deny' as const },
    { id: '2', tool: '*', effect: 'allow' as const },
  ]
  assert.equal(matchToolPermission('shell_execute', rules).effect, 'deny')
  assert.equal(matchToolPermission('web_search', rules).effect, 'allow')
  assert.equal(matchToolPermission('web_search', rules).ruleId, '2')
  const none = matchToolPermission('notes_create', [])
  assert.equal(none.effect, 'default')
  assert.ok(none.reason.includes('no rule'))
})

test('planModeBlocksScope: mutations blocked, reads allowed', () => {
  assert.ok(planModeBlocksScope('system_mutation'))
  assert.ok(planModeBlocksScope('external_write'))
  assert.ok(!planModeBlocksScope('external_read'))
  assert.ok(!planModeBlocksScope('local'))
})

test('normalizeRules: validates, caps, dedupes, keeps note only when present', () => {
  const rules = normalizeRules([
    { tool: 'Shell_Execute ', effect: 'DENY', note: 'never on this machine' },
    { tool: 'web_*', effect: 'allow' },
    { tool: 'bad', effect: 'sometimes' },
    { tool: '', effect: 'deny' },
    'garbage',
    null,
    { tool: 'web_*', effect: 'allow' },
  ])
  assert.equal(rules.length, 2)
  assert.equal(rules[0].tool, 'shell_execute')
  assert.equal(rules[0].effect, 'deny')
  assert.equal(rules[0].note, 'never on this machine')
  assert.ok(!('note' in rules[1]))
  assert.equal(rules[1].id, 'web--allow')
  const capped = normalizeRules(Array.from({ length: 200 }, (_, i) => ({ tool: `t${i}`, effect: 'deny' })))
  assert.equal(capped.length, MAX_PERMISSION_RULES)
})
