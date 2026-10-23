/**
 * Deterministic consensus scoring for multi-agent rounds.
 *
 * Pure functions with no framework dependencies so the maths can be unit
 * tested. The metric is a mean pairwise Jaccard similarity over the content
 * words of each contribution: if the agents keep saying the same thing, they
 * agree; if they talk past each other, they do not.
 */

const STOPWORDS = new Set([
  'a', 'about', 'after', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been', 'before',
  'being', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'he',
  'her', 'here', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just', 'me', 'more',
  'most', 'my', 'no', 'not', 'of', 'on', 'one', 'or', 'our', 'out', 'over', 'she', 'should', 'so',
  'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this',
  'those', 'to', 'too', 'up', 'us', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while',
  'who', 'why', 'will', 'with', 'would', 'you', 'your',
])

export type ConsensusLabel = 'consensus' | 'partial' | 'disagreement'

export interface ConsensusPair {
  a: string
  b: string
  similarity: number
}

export interface ConsensusResult {
  /** 0-100, higher means the contributions overlap more. */
  score: number
  label: ConsensusLabel
  /** Pairwise similarities that fed into the score. */
  pairs: ConsensusPair[]
  /** Contributions that were too short or empty to be scored. */
  skipped: number
}

/** Lower-cased content words with stopwords and short tokens removed. */
export function tokenize(text: string): Set<string> {
  const words = String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))
  return new Set(words)
}

/** Jaccard similarity of two token sets (0 when either is empty). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection += 1
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Scores how much the contributions agree.
 *
 * `minWords` guards against scoring a one-word reply as a strong position.
 */
export function scoreConsensus(
  contributions: Array<{ name: string; text: string }>,
  minWords = 5,
): ConsensusResult {
  const usable = contributions.filter(
    (c) => c && typeof c.text === 'string' && tokenize(c.text).size >= minWords,
  )
  const skipped = contributions.length - usable.length

  if (usable.length < 2) {
    return {
      score: usable.length === 1 ? 100 : 0,
      label: usable.length === 1 ? 'partial' : 'disagreement',
      pairs: [],
      skipped,
    }
  }

  const tokenSets = usable.map((c) => tokenize(c.text))
  const pairs: ConsensusPair[] = []

  for (let i = 0; i < usable.length; i += 1) {
    for (let j = i + 1; j < usable.length; j += 1) {
      pairs.push({
        a: usable[i].name,
        b: usable[j].name,
        similarity: Number(jaccard(tokenSets[i], tokenSets[j]).toFixed(4)),
      })
    }
  }

  const average = pairs.reduce((sum, pair) => sum + pair.similarity, 0) / pairs.length
  const score = Math.round(average * 100)

  return {
    score,
    label: score >= 55 ? 'consensus' : score >= 30 ? 'partial' : 'disagreement',
    pairs,
    skipped,
  }
}
