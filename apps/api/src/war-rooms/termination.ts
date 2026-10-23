/**
 * Declarative termination conditions for multi-agent conversations.
 *
 * AutoGen's core insight: a team's run should stop when a *condition* is met —
 * a round cap, a message cap, a token budget, a timeout, a keyword, or
 * agreement between the speakers — not after a fixed number of rounds.
 *
 * Conditions compose with `any_of` (stop when any fires) and `all_of`.
 *
 * This module is dependency-free by design (see `consensus.ts`,
 * `hook-logic.ts`): callers inject the consensus scorer so it can run under
 * the repo's `node --experimental-strip-types` test runner.
 */

export interface TerminationState {
  /** Number of completed rounds (1 after the first round of replies). */
  round: number
  /** Total messages produced so far. */
  messageCount: number
  /** Estimated tokens produced so far. */
  tokensUsed: number
  /** Wall-clock time since the conversation started. */
  elapsedMs: number
  /** Each speaker's latest contribution, for consensus and keyword checks. */
  contributions: Array<{ name: string; text: string }>
}

export type TerminationCondition =
  | { kind: 'max_rounds'; value: number }
  | { kind: 'max_messages'; value: number }
  | { kind: 'token_budget'; value: number }
  | { kind: 'timeout_ms'; value: number }
  | { kind: 'text_mention'; value: string }
  /** Stop when the speakers' contributions overlap by at least this score (0-100). */
  | { kind: 'consensus'; value: number }
  | { kind: 'any_of'; conditions: TerminationCondition[] }
  | { kind: 'all_of'; conditions: TerminationCondition[] }

export interface TerminationResult {
  stop: boolean
  /** Which condition fired (the leaf kind, or the combinator). */
  condition: string | null
  /** Human-readable explanation for the minutes/trace. */
  reason: string | null
}

/** The default for debates: at most 2 rounds, or early-stop on real agreement. */
export const DEFAULT_DEBATE_TERMINATION: TerminationCondition = {
  kind: 'any_of',
  conditions: [
    { kind: 'max_rounds', value: 2 },
    { kind: 'consensus', value: 65 },
  ],
}

export interface TerminationOptions {
  /** Scores how much the speakers' contributions overlap (0-100). */
  scoreConsensus?: (contributions: Array<{ name: string; text: string }>) => { score: number }
}

const MIN_CONSENSUS = 0
const MAX_CONSENSUS = 100

export function evaluateTermination(
  condition: TerminationCondition,
  state: TerminationState,
  options: TerminationOptions = {},
): TerminationResult {
  switch (condition.kind) {
    case 'max_rounds': {
      const met = state.round >= condition.value
      return {
        stop: met,
        condition: met ? 'max_rounds' : null,
        reason: met ? `Round cap reached (${state.round}/${condition.value}).` : null,
      }
    }
    case 'max_messages': {
      const met = state.messageCount >= condition.value
      return {
        stop: met,
        condition: met ? 'max_messages' : null,
        reason: met ? `Message cap reached (${state.messageCount}).` : null,
      }
    }
    case 'token_budget': {
      const met = state.tokensUsed >= condition.value
      return {
        stop: met,
        condition: met ? 'token_budget' : null,
        reason: met ? `Token budget reached (~${state.tokensUsed}).` : null,
      }
    }
    case 'timeout_ms': {
      const met = state.elapsedMs >= condition.value
      return {
        stop: met,
        condition: met ? 'timeout_ms' : null,
        reason: met ? `Time budget reached (${Math.round(state.elapsedMs / 1000)}s).` : null,
      }
    }
    case 'text_mention': {
      const needle = condition.value.trim().toLowerCase()
      if (!needle) return { stop: false, condition: null, reason: null }
      const hit = state.contributions.some((c) => c.text.toLowerCase().includes(needle))
      return {
        stop: hit,
        condition: hit ? 'text_mention' : null,
        reason: hit ? `A speaker mentioned "${condition.value.trim()}".` : null,
      }
    }
    case 'consensus': {
      const threshold = clamp(condition.value, MIN_CONSENSUS, MAX_CONSENSUS)
      const scorer = options.scoreConsensus
      if (!scorer || state.contributions.length < 2) {
        return { stop: false, condition: null, reason: null }
      }
      const result = scorer(state.contributions)
      const met = result.score >= threshold
      return {
        stop: met,
        condition: met ? 'consensus' : null,
        reason: met
          ? `Consensus reached (${result.score}% >= ${threshold}% threshold).`
          : null,
      }
    }
    case 'any_of': {
      for (const child of condition.conditions ?? []) {
        const result = evaluateTermination(child, state, options)
        if (result.stop) return result
      }
      return { stop: false, condition: null, reason: null }
    }
    case 'all_of': {
      let fired: TerminationResult | null = null
      for (const child of condition.conditions ?? []) {
        const result = evaluateTermination(child, state, options)
        if (!result.stop) return { stop: false, condition: null, reason: null }
        fired = result
      }
      return fired ?? { stop: condition.conditions?.length ? false : true, condition: null, reason: null }
    }
    default:
      return { stop: false, condition: null, reason: null }
  }
}

/** Rough token estimate the engines use for budget conditions. */
export function estimateTokens(texts: string[]): number {
  return texts.reduce((sum, text) => sum + Math.ceil(String(text ?? '').length / 4), 0)
}

/** Coerces arbitrary API input into a safe condition tree. */
export function normalizeTermination(raw: unknown): TerminationCondition {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_DEBATE_TERMINATION
  }

  const record = raw as Record<string, unknown>
  const kind = String(record.kind ?? '')

  switch (kind) {
    case 'max_rounds':
    case 'max_messages':
    case 'token_budget':
    case 'timeout_ms': {
      const value = Number(record.value)
      return Number.isFinite(value) && value > 0
        ? ({ kind, value: Math.round(value) } as TerminationCondition)
        : DEFAULT_DEBATE_TERMINATION
    }
    case 'text_mention': {
      const value = String(record.value ?? '').trim().slice(0, 60)
      return value ? { kind: 'text_mention', value } : DEFAULT_DEBATE_TERMINATION
    }
    case 'consensus': {
      const value = Number(record.value)
      return Number.isFinite(value)
        ? { kind: 'consensus', value: clamp(value, MIN_CONSENSUS, MAX_CONSENSUS) }
        : DEFAULT_DEBATE_TERMINATION
    }
    case 'any_of':
    case 'all_of': {
      const children = Array.isArray(record.conditions) ? record.conditions : []
      const conditions = children
        .slice(0, 10)
        .map(normalizeTermination)
        .filter((c) => c !== DEFAULT_DEBATE_TERMINATION)
      if (!conditions.length) return DEFAULT_DEBATE_TERMINATION
      return { kind, conditions } as TerminationCondition
    }
    default:
      return DEFAULT_DEBATE_TERMINATION
  }
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(value, max))
}
