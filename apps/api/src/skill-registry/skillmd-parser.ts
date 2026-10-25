/**
 * Pure parser for the external SKILL.md ecosystem format (opencode skills,
 * agentic-awesome-skills, coreyhaines31/marketingskills all use it):
 * YAML-ish frontmatter (name, description) + a markdown body. Dependency-free
 * so the test suite can cover parsing without any framework.
 */

export interface ParsedSkillMd {
  name: string
  description: string
  body: string
  steps: string[]
}

/** Parse "key: value" frontmatter lines tolerantly (no YAML lib needed). */
export function parseSkillMd(markdown: string): ParsedSkillMd | null {
  const text = String(markdown ?? '').trim()
  if (!text) return null

  let rest = text
  let name = ''
  let description = ''

  // Optional frontmatter: --- ... --- or no fence at all.
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3)
    if (end !== -1) {
      const frontmatter = text.slice(4, end)
      rest = text.slice(end + 4).trim()
      for (const line of frontmatter.split('\n')) {
        const match = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line.trim())
        if (!match) continue
        const key = match[1].toLowerCase()
        const value = match[2].trim().replace(/^["']|["']$/g, '')
        if (key === 'name' && !name) name = value
        if ((key === 'description' || key === 'summary') && !description) description = value
      }
    }
  }

  // Heading fallback: "# Name" then a paragraph.
  if (!name) {
    const heading = /^#\s+(.+)$/m.exec(rest)
    if (heading) name = heading[1].trim()
  }
  if (!description) {
    // First non-heading, non-list line of the body.
    for (const line of rest.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      description = t
      break
    }
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  if (!slug) return null

  // Steps: bullet/numbered lines from the body (procedure-ish content).
  const steps: string[] = []
  for (const line of rest.split('\n')) {
    const t = line.trim()
    const match = /^(?:[-*+]\s+|\d+[.)]\s+)(.{4,400})$/.exec(t)
    if (!match) continue
    const step = match[1].trim().replace(/\*\*/g, '').replace(/`/g, '')
    if (steps.length === 0 || steps[steps.length - 1] !== step) steps.push(step)
    if (steps.length >= 15) break
  }

  return {
    name: slug,
    description: description.slice(0, 400) || slug.replace(/-/g, ' '),
    body: rest.slice(0, 20_000),
    steps: steps.length >= 2 ? steps : [],
  }
}

/** Build a compact machine-readable manifest entry from raw catalog rows. */
export interface CatalogIndexEntry {
  catalogId: string
  title: string
  description: string
  tools: string[]
  tags: string[]
  version: string
  sourceUrl?: string
  updatedAt?: string
}

export function toIndexEntry(row: {
  catalogId: string
  tags: string[]
  version: string
  sourceUrl?: string
  publishedAt: string
  manifest: { title?: string; description?: string; tools?: string[] }
}): CatalogIndexEntry {
  return {
    catalogId: row.catalogId,
    title: String(row.manifest?.title ?? row.catalogId),
    description: String(row.manifest?.description ?? ''),
    tools: Array.isArray(row.manifest?.tools) ? row.manifest.tools.map(String) : [],
    tags: row.tags.map(String),
    version: row.version,
    ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
    updatedAt: row.publishedAt,
  }
}
