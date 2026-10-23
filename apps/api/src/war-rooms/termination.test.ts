import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreConsensus } from './consensus.ts'
import {
  DEFAULT_DEBATE_TERMINATION,
  evaluateTermination,
  estimateTokens,
  normalizeTermination,
  type TerminationState,
} from './termination.ts'

const OPTIONS = { scoreConsensus }

const AGREEING = [
  { name: 'A', text: 'We should ship the feature behind a flag to monitor latency in production' },
  { name: 'B', text: 'Ship the feature behind a flag to monitor latency in production safely' },
]

const DISAGREEING = [
  { name: 'A', text: 'Rewrite the whole parser from scratch in rust for raw performance gains' },
  { name: 'B', text: 'Keep the existing parser in typescript and add caching to reduce latency' },
]

function state(overrides: Partial<TerminationState> = {}): TerminationState {
  return {
    round: 1,
    messageCount: 3,
    tokensUsed: 100,
    elapsedMs: 10_000,
    contributions: AGREEING,
    ...overrides,
  }
}

test('max_rounds stops once the cap is reached', () => {
  const condition = { kind: 'max_rounds' as const, value: 2 }
  assert.equal(evaluateTermination(condition, state({ round: 1 }), OPTIONS).stop, false)
  const done = evaluateTermination(condition, state({ round: 2 }), OPTIONS)
  assert.equal(done.stop, true)
  assert.match(done.reason ?? '', /Round cap/)
})

test('max_messages and token_budget stop at their caps', () => {
  const messages = { kind: 'max_messages' as const, value: 5 }
  assert.equal(evaluateTermination(messages, state({ messageCount: 4 }), OPTIONS).stop, false)
  assert.equal(evaluateTermination(messages, state({ messageCount: 5 }), OPTIONS).stop, true)

  const budget = { kind: 'token_budget' as const, value: 500 }
  assert.equal(evaluateTermination(budget, state({ tokensUsed: 400 }), OPTIONS).stop, false)
  assert.equal(evaluateTermination(budget, state({ tokensUsed: 600 }), OPTIONS).stop, true)
})

test('timeout_ms stops when the clock runs out', () => {
  const condition = { kind: 'timeout_ms' as const, value: 15_000 }
  assert.equal(evaluateTermination(condition, state({ elapsedMs: 14_999 }), OPTIONS).stop, false)
  const done = evaluateTermination(condition, state({ elapsedMs: 15_000 }), OPTIONS)
  assert.equal(done.stop, true)
  assert.match(done.reason ?? '', /Time budget/)
})

test('text_mention stops when a speaker says the keyword', () => {
  const condition = { kind: 'text_mention' as const, value: 'APPROVED' }
  assert.equal(evaluateTermination(condition, state(), OPTIONS).stop, false)
  const done = evaluateTermination(
    condition,
    state({ contributions: [{ name: 'A', text: 'final answer: approved' }] }),
    OPTIONS,
  )
  assert.equal(done.stop, true)
  assert.equal(done.condition, 'text_mention')
})

test('consensus stops when the speakers actually converge', () => {
  const condition = { kind: 'consensus' as const, value: 65 }
  assert.equal(evaluateTermination(condition, state({ contributions: DISAGREEING }), OPTIONS).stop, false)
  const done = evaluateTermination(condition, state({ contributions: AGREEING }), OPTIONS)
  assert.equal(done.stop, true)
  assert.equal(done.condition, 'consensus')
  assert.match(done.reason ?? '', /Consensus reached \(\d+%/)
})

test('consensus needs a scorer and two contributions', () => {
  const condition = { kind: 'consensus' as const, value: 65 }
  // No scorer injected -> never stops on consensus
  assert.equal(evaluateTermination(condition, state()).stop, false)
  // Only one contribution
  assert.equal(
    evaluateTermination(condition, state({ contributions: [{ name: 'A', text: 'anything' }] }), OPTIONS).stop,
    false,
  )
})

test('any_of fires when any child fires', () => {
  const condition = {
    kind: 'any_of' as const,
    conditions: [
      { kind: 'max_rounds' as const, value: 2 },
      { kind: 'consensus' as const, value: 65 },
    ],
  }
  // round 1 + agreement -> the consensus branch should fire and name itself
  const early = evaluateTermination(condition, state({ round: 1, contributions: AGREEING }), OPTIONS)
  assert.equal(early.stop, true)
  assert.equal(early.condition, 'consensus')
  // round 1 + disagreement -> keeps going
  assert.equal(evaluateTermination(condition, state({ round: 1, contributions: DISAGREEING }), OPTIONS).stop, false)
  // round 2 + disagreement -> the round cap fires
  const capped = evaluateTermination(condition, state({ round: 2, contributions: DISAGREEING }), OPTIONS)
  assert.equal(capped.stop, true)
  assert.equal(capped.condition, 'max_rounds')
})

test('all_of requires every child to fire', () => {
  const condition = {
    kind: 'all_of' as const,
    conditions: [
      { kind: 'max_rounds' as const, value: 1 },
      { kind: 'consensus' as const, value: 65 },
    ],
  }
  assert.equal(evaluateTermination(condition, state({ contributions: DISAGREEING }), OPTIONS).stop, false)
  const done = evaluateTermination(condition, state({ contributions: AGREEING }), OPTIONS)
  assert.equal(done.stop, true)
})

test('the default debate termination stops on agreement or the round cap', () => {
  assert.equal(evaluateTermination(DEFAULT_DEBATE_TERMINATION, state({ contributions: AGREEING }), OPTIONS).stop, true)
  assert.equal(
    evaluateTermination(DEFAULT_DEBATE_TERMINATION, state({ round: 2, contributions: DISAGREEING }), OPTIONS).stop,
    true,
  )
  assert.equal(
    evaluateTermination(DEFAULT_DEBATE_TERMINATION, state({ round: 1, contributions: DISAGREEING }), OPTIONS).stop,
    false,
  )
})

test('normalizeTermination coerces garbage into the safe default', () => {
  assert.deepEqual(normalizeTermination(null), DEFAULT_DEBATE_TERMINATION)
  assert.deepEqual(normalizeTermination('nonsense'), DEFAULT_DEBATE_TERMINATION)
  assert.deepEqual(normalizeTermination({ kind: 'unknown' }), DEFAULT_DEBATE_TERMINATION)
  assert.deepEqual(normalizeTermination({ kind: 'max_rounds', value: -1 }), DEFAULT_DEBATE_TERMINATION)
})

test('normalizeTermination accepts and bounds valid input', () => {
  assert.deepEqual(normalizeTermination({ kind: 'max_rounds', value: 4 }), { kind: 'max_rounds', value: 4 })
  assert.deepEqual(normalizeTermination({ kind: 'consensus', value: 999 }), { kind: 'consensus', value: 100 })
  assert.deepEqual(
    normalizeTermination({ kind: 'any_of', conditions: [{ kind: 'text_mention', value: 'STOP' }] }),
    { kind: 'any_of', conditions: [{ kind: 'text_mention', value: 'STOP' }] },
  )
  // children that normalize to the default are dropped
  assert.deepEqual(
    normalizeTermination({ kind: 'all_of', conditions: [{ kind: 'junk' }] }),
    DEFAULT_DEBATE_TERMINATION,
  )
})

test('estimateTokens approximates four characters per token', () => {
  assert.equal(estimateTokens(['abcd', 'ab']), 2)
  assert.equal(estimateTokens([]), 0)
})
