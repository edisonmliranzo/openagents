import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildJanitorPlan,
  categoryFor,
  cleanFileName,
  globMatches,
  decideByRules,
  findRecurringPrompts,
  jaccard,
  tokenize,
  hashToken,
  scopeAllows,
  type JanitorFileEntry,
} from './life-logic.ts'

const NOW = new Date('2026-10-12T12:00:00Z')
const old = (name: string, size: number): JanitorFileEntry => ({ name, sizeBytes: size, modifiedAt: new Date('2026-09-01T00:00:00Z') })
const fresh = (name: string, size: number): JanitorFileEntry => ({ name, sizeBytes: size, modifiedAt: new Date('2026-10-12T11:00:00Z') })

test('janitor sorts old files into category folders', () => {
  const plan = buildJanitorPlan('C:/Downloads', [old('report final.pdf', 100), old('IMG_1234.jpg', 200)], NOW)
  assert.ok(plan.some((m) => m.to === 'C:/Downloads/documents/report final.pdf'))
  assert.ok(plan.some((m) => m.to === 'C:/Downloads/images/IMG_1234.jpg'))
})

test('janitor skips fresh files', () => {
  const plan = buildJanitorPlan('C:/Downloads', [fresh('new photo.png', 1)], NOW)
  assert.equal(plan.length, 0)
})

test('janitor flags older duplicates keeping newest', () => {
  const plan = buildJanitorPlan('C:/Downloads', [
    { name: 'photo (1).png', sizeBytes: 500, modifiedAt: new Date('2026-08-01T00:00:00Z') },
    { name: 'photo.png', sizeBytes: 500, modifiedAt: new Date('2026-09-01T00:00:00Z') },
    old('other.png', 9),
  ], NOW)
  const dupes = plan.filter((m) => m.reason.includes('duplicate'))
  assert.equal(dupes.length, 1)
  assert.ok(dupes[0].from.endsWith('photo (1).png'))
})

test('janitor renames messy names in place for other category', () => {
  const plan = buildJanitorPlan('C:/Downloads', [old('weird   file<>name.xyz', 10)], NOW)
  assert.equal(plan.length, 1)
  assert.equal(plan[0].action, 'rename')
  assert.ok(!plan[0].to.includes('<'))
})

test('category and name cleaning', () => {
  assert.equal(categoryFor('a.MP4'), 'video')
  assert.equal(categoryFor('mystery.qqq'), 'other')
  assert.equal(cleanFileName('my   report: final?.pdf'), 'my report- final.pdf')
})

test('glob matching for approval rules', () => {
  assert.equal(globMatches('gmail_*', 'gmail_send'), true)
  assert.equal(globMatches('calendar_*', 'gmail_send'), false)
  assert.equal(globMatches('notes_create', 'notes_create'), true)
})

test('first matching rule wins', () => {
  const rules = [
    { toolPattern: 'gmail_send', decision: 'deny', enabled: true },
    { toolPattern: 'gmail_*', decision: 'allow', enabled: true },
  ]
  assert.equal(decideByRules(rules, 'gmail_send'), 'deny')
  assert.equal(decideByRules(rules, 'gmail_read'), 'allow')
  assert.equal(decideByRules(rules, 'shell_run'), null)
  assert.equal(decideByRules([{ toolPattern: '*', decision: 'deny', enabled: false }], 'anything'), null)
})

test('recurring prompt detection groups similar asks', () => {
  const base = 'summarize my open github issues and rank by urgency'
  const occ = [
    { text: base, at: new Date('2026-09-01T10:00:00Z') },
    { text: 'summarize my open github issues ranked by urgency please', at: new Date('2026-09-08T10:00:00Z') },
    { text: 'summarize open github issues by urgency', at: new Date('2026-09-15T10:00:00Z') },
    { text: 'what is the weather', at: new Date('2026-09-20T10:00:00Z') },
  ]
  const found = findRecurringPrompts(occ)
  assert.equal(found.length, 1)
  assert.equal(found[0].exampleCount, 3)
  assert.ok(found[0].cadenceDays >= 3 && found[0].cadenceDays <= 10)
})

test('recurring detection ignores one-offs and tight bursts', () => {
  const occ = [
    { text: 'deploy the api', at: new Date('2026-09-01T10:00:00Z') },
    { text: 'deploy the api', at: new Date('2026-09-01T11:00:00Z') },
    { text: 'deploy the api', at: new Date('2026-09-01T12:00:00Z') },
  ]
  assert.equal(findRecurringPrompts(occ).length, 0)
})

test('jaccard and tokenize basics', () => {
  const a = tokenize('Summarize my GitHub issues')
  assert.ok(a.has('summarize'))
  assert.ok(!a.has('my'))
  assert.equal(jaccard(new Set(['a', 'b']), new Set(['a', 'b'])), 1)
  assert.equal(jaccard(new Set(), new Set(['a'])), 0)
})

test('token hashing and scope checks', () => {
  const h = hashToken('secret-token-1')
  assert.equal(h, hashToken('secret-token-1'))
  assert.notEqual(h, hashToken('secret-token-2'))
  const scopes = '["tasks:write"]'
  assert.equal(scopeAllows(scopes, 'tasks:write'), true)
  assert.equal(scopeAllows(scopes, 'tasks:read'), false)
  assert.equal(scopeAllows('not json', 'tasks:write'), false)
})
