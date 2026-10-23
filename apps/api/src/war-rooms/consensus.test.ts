import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jaccard, scoreConsensus, tokenize } from './consensus.ts'

test('tokenize drops stopwords and short tokens', () => {
  const tokens = tokenize('The quick brown fox is over there')
  assert.ok(tokens.has('quick'))
  assert.ok(tokens.has('brown'))
  assert.ok(tokens.has('fox'))
  assert.ok(!tokens.has('the'))
  assert.ok(!tokens.has('is'))
  assert.ok(!tokens.has('over'))
})

test('jaccard measures overlap', () => {
  const a = new Set(['alpha', 'beta', 'gamma'])
  const b = new Set(['beta', 'gamma', 'delta'])
  assert.equal(jaccard(a, b).toFixed(4), '0.5000')
  assert.equal(jaccard(a, a), 1)
  assert.equal(jaccard(a, new Set()), 0)
})

test('agreeing contributions score as consensus', () => {
  const result = scoreConsensus([
    { name: 'A', text: 'We should migrate the database to postgres because it improves reliability and performance' },
    { name: 'B', text: 'Migrating the database to postgres improves reliability and performance for the team' },
  ])
  assert.equal(result.label, 'consensus')
  assert.ok(result.score >= 55, `expected >= 55, got ${result.score}`)
  assert.equal(result.pairs.length, 1)
})

test('disagreeing contributions score as disagreement', () => {
  const result = scoreConsensus([
    { name: 'A', text: 'Rewrite the whole parser from scratch in rust for raw performance gains' },
    { name: 'B', text: 'Keep the existing parser in typescript and add caching to reduce latency' },
  ])
  assert.equal(result.label, 'disagreement')
  assert.ok(result.score < 30, `expected < 30, got ${result.score}`)
})

test('very short contributions are skipped rather than scored', () => {
  const result = scoreConsensus([
    { name: 'A', text: 'yes' },
    { name: 'B', text: 'ok' },
  ])
  assert.equal(result.pairs.length, 0)
  assert.equal(result.skipped, 2)
  assert.equal(result.label, 'disagreement')
})

test('a single usable contribution is partial, not consensus', () => {
  const result = scoreConsensus([
    { name: 'A', text: 'We should migrate the database to postgres because it improves reliability' },
    { name: 'B', text: 'ok' },
  ])
  assert.equal(result.label, 'partial')
  assert.equal(result.score, 100)
  assert.equal(result.skipped, 1)
})

test('three contributions produce three pairs', () => {
  const result = scoreConsensus([
    { name: 'A', text: 'Ship the feature behind a flag so we can monitor latency in production' },
    { name: 'B', text: 'Shipping behind a feature flag lets us monitor latency safely in production' },
    { name: 'C', text: 'A feature flag for shipping is the safest way to monitor production latency' },
  ])
  assert.equal(result.pairs.length, 3)
  assert.equal(result.label, 'consensus')
})
