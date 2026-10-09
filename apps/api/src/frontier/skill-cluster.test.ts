import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clusterPrompts, clusterKey, scoreSkill, tokenize, MATCH_THRESHOLD } from './skill-cluster.ts'

test('tokenize drops stopwords, short tokens and urls', () => {
  const t = tokenize('Please summarize the invoice from https://x.com/a for ACME 2026')
  assert.ok(t.has('summarize'))
  assert.ok(t.has('invoice'))
  assert.ok(!t.has('the'))
  assert.ok(!t.has('https'))
  assert.ok(!t.has('2026'))
})

test('repeated similar requests form one cluster; unrelated ones do not', () => {
  const prompts = [
    'Summarize this weekly sales report for the team',
    'Can you summarize the weekly sales report and email it',
    'summarize my weekly sales report please',
    'What is the capital of France',
    'Plan a trip to Lisbon next spring',
  ]
  const clusters = clusterPrompts(prompts)
  const big = clusters.filter((c) => c.members.length >= 3)
  assert.equal(big.length, 1)
  assert.equal(big[0].members.length, 3)
  assert.ok(clusterKey(big[0]).includes('summarize') || clusterKey(big[0]).includes('weekly'))
})

test('clusterKey is stable regardless of member order', () => {
  const a = clusterPrompts(['check flight prices to tokyo', 'flight prices tokyo check', 'tokyo flight prices check'])
  const b = clusterPrompts(['tokyo flight prices check', 'check flight prices to tokyo', 'flight prices tokyo check'])
  assert.equal(clusterKey(a[0]), clusterKey(b[0]))
})

test('scoreSkill matches a paraphrase above threshold and rejects unrelated text', () => {
  const skill = { id: '1', name: 'Weekly sales summary', triggerPhrase: 'summarize weekly sales report', tags: ['reporting'] }
  assert.ok(scoreSkill('can you summarize the weekly sales report', skill) >= MATCH_THRESHOLD)
  assert.ok(scoreSkill('book me a flight to paris', skill) < MATCH_THRESHOLD)
})
