// Pure helpers for skill learning. No framework imports so they can be unit
// tested directly with `node --experimental-strip-types --test`.

const STOPWORDS = new Set([
  'the', 'and', 'for', 'you', 'your', 'with', 'that', 'this', 'what', 'when', 'from', 'into', 'about',
  'can', 'could', 'would', 'should', 'please', 'help', 'need', 'want', 'just', 'like', 'make', 'have',
  'are', 'was', 'were', 'will', 'how', 'why', 'who', 'where', 'there', 'their', 'them', 'they', 'its',
  'not', 'all', 'any', 'some', 'out', 'get', 'got', 'let', 'lets', 'also', 'then', 'than', 'one',
])

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t)),
  )
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter += 1
  return inter / (a.size + b.size - inter)
}

export interface PromptCluster {
  members: string[]
  tokenCounts: Map<string, number>
}

/**
 * Greedy single-pass clustering of user prompts by shared vocabulary.
 * A prompt joins the first cluster whose centroid it resembles; the centroid is
 * the set of tokens that appear in at least half the cluster's members.
 */
export function clusterPrompts(prompts: string[], threshold = 0.3): PromptCluster[] {
  const clusters: PromptCluster[] = []
  for (const prompt of prompts) {
    const tokens = tokenize(prompt)
    if (tokens.size < 3) continue
    let best: PromptCluster | null = null
    let bestScore = 0
    for (const cluster of clusters) {
      const centroid = centroidOf(cluster)
      const score = jaccard(tokens, centroid)
      if (score >= threshold && score > bestScore) {
        best = cluster
        bestScore = score
      }
    }
    if (!best) {
      best = { members: [], tokenCounts: new Map() }
      clusters.push(best)
    }
    best.members.push(prompt)
    for (const t of tokens) best.tokenCounts.set(t, (best.tokenCounts.get(t) ?? 0) + 1)
  }
  return clusters
}

function centroidOf(cluster: PromptCluster): Set<string> {
  const half = Math.max(1, Math.ceil(cluster.members.length / 2))
  const out = new Set<string>()
  for (const [t, n] of cluster.tokenCounts) if (n >= half) out.add(t)
  return out
}

/** Stable signature for a cluster: its three most frequent tokens. */
export function clusterKey(cluster: PromptCluster): string {
  return [...cluster.tokenCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([t]) => t)
    .sort()
    .join('+')
}

export interface SkillLike {
  id: string
  name: string
  triggerPhrase: string | null
  tags: string[]
}

/** How well a stored skill matches a new message, 0..1. */
export function scoreSkill(message: string, skill: SkillLike): number {
  const msg = tokenize(message)
  if (msg.size === 0) return 0
  const trigger = tokenize(skill.triggerPhrase ?? '')
  const name = tokenize(skill.name)
  const tags = tokenize(skill.tags.join(' '))
  const triggerScore = trigger.size ? jaccard(msg, trigger) : 0
  const nameScore = jaccard(msg, name)
  const tagScore = jaccard(msg, tags)
  // Trigger phrases are the strongest signal; name and tags support it.
  return Math.min(1, triggerScore * 0.6 + nameScore * 0.3 + tagScore * 0.1 + (triggerScore >= 0.5 ? 0.2 : 0))
}

export const MATCH_THRESHOLD = 0.3
