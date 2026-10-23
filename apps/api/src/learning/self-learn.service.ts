import { Injectable, Logger } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'
import { DocumentStore } from '../prisma/document-store.service'
import { LLMService } from '../agent/llm.service'
import { MemoryService } from '../memory/memory.service'
import { LibraryService } from '../library/library.service'
import { WebSearchTool } from '../tools/connectors/web-search.tool'
import { WebFetchTool } from '../tools/connectors/web-fetch.tool'

const LOG_KIND = 'learning-log'
const MAX_LOG_ENTRIES = 50
const MAX_SOURCES = 3
const MAX_SOURCE_CHARS = 8000

export interface SelfLearnResult {
  success: boolean
  error?: string
  topic?: string
  summary?: string
  keyFacts?: Array<{ entity: string; key: string; value: string }>
  studyNotesChars?: number
  sources?: string[]
  libraryDoc?: { id: string; chunks: number } | null
  skill?: { id: string; name: string } | null
  factsSaved?: number
}

export interface LearningLogEntry {
  topic: string
  question?: string
  at: string
  summary: string
  sources: string[]
  libraryDocId?: string
  skillId?: string
  factsSaved: number
}

/** The agent's self-teaching loop: research → synthesize → persist → skill-ify. */
@Injectable()
export class SelfLearnService {
  private readonly logger = new Logger(SelfLearnService.name)

  constructor(
    private readonly llm: LLMService,
    private readonly memory: MemoryService,
    private readonly library: LibraryService,
    private readonly webSearch: WebSearchTool,
    private readonly webFetch: WebFetchTool,
    private readonly prisma: PrismaService,
    private readonly docs: DocumentStore,
  ) {}

  async learn(userId: string, input: { topic: string; question?: string; saveSkill?: boolean }): Promise<SelfLearnResult> {
    const topic = String(input.topic ?? '').trim().slice(0, 300)
    if (!topic) return { success: false, error: 'topic is required.' }
    const question = String(input.question ?? topic).trim().slice(0, 800)
    const saveSkill = input.saveSkill !== false

    try {
      // 1. Research: search, then read the top sources.
      const sources: Array<{ url: string; title: string; content: string }> = []
      try {
        const search = await this.webSearch.search({ query: question, count: 6 }, userId)
        const output = (search.output ?? null) as { results?: Array<{ url?: string; link?: string; title?: string; name?: string }> } | null
        const candidates = (output?.results ?? [])
          .map((r) => ({ url: String(r.url ?? r.link ?? ''), title: String(r.title ?? r.name ?? '') }))
          .filter((r) => r.url.startsWith('https://'))
          .slice(0, MAX_SOURCES)
        for (const candidate of candidates) {
          const fetched = await this.webFetch.fetch({ url: candidate.url, includeLlmsTxt: false }, userId)
          if (!fetched.success) continue
          const content = String((fetched.output as { content?: string } | null)?.content ?? '')
          if (content.length < 200) continue
          sources.push({ url: candidate.url, title: candidate.title || candidate.url, content: content.slice(0, MAX_SOURCE_CHARS) })
        }
        if (sources.length === 0) this.logger.warn(`self_learn: search returned no usable sources for "${topic}"`)
      } catch (searchErr: any) {
        this.logger.warn(`self_learn search failed: ${searchErr?.message ?? searchErr}`)
      }

      // 2. Synthesize study notes as structured JSON.
      const system = `You are a self-teaching study engine for a personal AI assistant. You turn raw research into durable, citable study notes. Respond ONLY with compact JSON.`
      const user = `Topic: ${topic}
Question to answer: ${question}
${sources.length > 0 ? `Research sources (use them as ground truth and cite their URLs):\n${sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.url}\n${s.content}`).join('\n\n')}` : 'No sources were retrieved; answer from your knowledge and mark confidence lower.'}

Produce JSON with exactly these fields:
{"summary": "<=400 chars, plain-English answer to the question", "keyFacts": [{"entity": "<topic noun>", "key": "<short fact name>", "value": "<the fact, <=400 chars>"}] (3-6 facts), "studyNotes": "markdown study notes: ## What it is\\n## How it works\\n## How to DO it (if applicable)\\n## Sources", "procedure": {"name": "<kebab-skill-name>", "description": "<=120 chars what this procedure accomplishes", "steps": ["step 1", "step 2", "..."]} OR null if the topic is purely conceptual with no actionable procedure}`
      const response = await this.llm.complete([{ role: 'user', content: user }], [], system)
      const content = String(response.content ?? '')
      const parsed = this.parseJson(content) ?? this.salvageLearnJson(content)
      if (!parsed?.summary) {
        return { success: false, error: `Synthesis failed: ${content.slice(0, 200)}` }
      }

      // 3. Persist: durable study notes into the library.
      const notesMarkdown = String(parsed.studyNotes ?? parsed.summary)
        + `\n\n## Sources\n${sources.map((s) => `- [${s.title}](${s.url})`).join('\n') || '- model knowledge (no web sources retrieved)'}`
      const libraryDoc = await this.library.addText(userId, {
        title: `Learned: ${topic}`,
        content: notesMarkdown,
        source: 'agent',
      })

      // 4. Persist: key facts into memory (entity/key/value, citable).
      const keyFacts: Array<{ entity: string; key: string; value: string }> = []
      const rawFacts = Array.isArray(parsed.keyFacts) ? parsed.keyFacts.slice(0, 6) : []
      for (const raw of rawFacts) {
        const entity = String(raw?.entity ?? topic).slice(0, 180) || topic
        const key = String(raw?.key ?? '').slice(0, 180)
        const value = String(raw?.value ?? '').slice(0, 4000)
        if (!key || !value) continue
        try {
          await this.memory.upsertFact(userId, {
            entity,
            key,
            value,
            sourceRef: sources[0]?.url ?? 'self_learn',
            confidence: sources.length > 0 ? 0.85 : 0.6,
            conflictGroup: 'self-learned',
          })
          keyFacts.push({ entity, key, value })
        } catch (factErr: any) {
          this.logger.warn(`self_learn fact upsert failed: ${factErr?.message ?? factErr}`)
        }
      }

      // 5. Auto-skill: a learned procedure becomes a reusable skill.
      let skill: { id: string; name: string } | null = null
      const procedure = parsed.procedure as { name?: string; description?: string; steps?: unknown[] } | null
      if (saveSkill && procedure?.name && Array.isArray(procedure.steps) && procedure.steps.length > 0) {
        const name = String(procedure.name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
        const description = String(procedure.description ?? `Self-learned procedure for ${topic}`).slice(0, 400)
        const steps = procedure.steps.map(String).slice(0, 15)
        const existing = await this.prisma.userSkill.findFirst({ where: { userId, name } })
        const data = {
          name,
          description,
          steps: JSON.stringify(steps),
          toolsUsed: JSON.stringify(['web_search', 'web_fetch', 'self_learn']),
          tags: JSON.stringify(['self-learned', topic.toLowerCase().slice(0, 40)]),
          triggerPhrase: topic,
        }
        const row = existing
          ? await this.prisma.userSkill.update({ where: { id: existing.id }, data })
          : await this.prisma.userSkill.create({ data: { ...data, userId } })
        skill = { id: row.id, name: row.name }
      }

      // 6. Log the learning event.
      const entry: LearningLogEntry = {
        topic,
        question: question !== topic ? question : undefined,
        at: new Date().toISOString(),
        summary: String(parsed.summary).slice(0, 1000),
        sources: sources.map((s) => s.url),
        libraryDocId: libraryDoc.id,
        skillId: skill?.id,
        factsSaved: keyFacts.length,
      }
      await this.appendLog(userId, entry)

      this.logger.log(`self_learn "${topic}" for user ${userId}: ${sources.length} sources, ${keyFacts.length} facts${skill ? `, skill "${skill.name}"` : ''}`)

      return {
        success: true,
        topic,
        summary: String(parsed.summary),
        keyFacts,
        studyNotesChars: notesMarkdown.length,
        sources: sources.map((s) => s.url),
        libraryDoc: { id: libraryDoc.id, chunks: libraryDoc.chunkCount },
        skill,
        factsSaved: keyFacts.length,
      }
    } catch (err: any) {
      this.logger.error(`self_learn failed for user ${userId}: ${err?.message}`)
      return { success: false, error: err?.message ?? 'Self-learning failed.' }
    }
  }

  /** What the agent has taught itself, most recent first. */
  async log(userId: string, limit = 25): Promise<LearningLogEntry[]> {
    const entries = await this.docs.read<LearningLogEntry[]>(userId, LOG_KIND, () => [])
    return entries.slice(-Math.max(1, Math.min(limit, MAX_LOG_ENTRIES))).reverse()
  }

  private async appendLog(userId: string, entry: LearningLogEntry) {
    const entries = await this.docs.read<LearningLogEntry[]>(userId, LOG_KIND, () => [])
    const next = [...entries, entry].slice(-MAX_LOG_ENTRIES)
    await this.docs.write(userId, LOG_KIND, next)
  }

  private parseJson(text: string): Record<string, unknown> | null {
    const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) return null
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      return null
    }
  }

  /**
   * Salvage a partially-generated (truncated) synthesis. Small local models
   * regularly hit their token budget mid-JSON; field-wise extraction keeps
   * the learning loop usable instead of failing the whole run.
   */
  private salvageLearnJson(text: string): Record<string, unknown> | null {
    const unquote = (raw: string): string | null => {
      if (!raw) return null
      try {
        return JSON.parse(`"${raw}"`)
      } catch {
        return raw
      }
    }
    const field = (name: string): string | null => {
      const match = new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text)
      return match ? unquote(match[1]) : null
    }

    const summary = field('summary')
    if (!summary) return null

    const keyFacts: Array<{ entity: string; key: string; value: string }> = []
    const factPattern = /\{\s*"entity"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"key"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"value"\s*:\s*"((?:[^"\\]|\\.)*)"/g
    let factMatch: RegExpExecArray | null
    while ((factMatch = factPattern.exec(text)) !== null && keyFacts.length < 6) {
      const entity = unquote(factMatch[1] ?? '')
      const key = unquote(factMatch[2] ?? '')
      const value = unquote(factMatch[3] ?? '')
      if (key && value) keyFacts.push({ entity: entity || '', key, value })
    }

    const steps: string[] = []
    const stepPattern = /"steps"\s*:\s*\[([^\]]*)\]/.exec(text)
    if (stepPattern) {
      const stepMatches = Array.from(stepPattern[1].matchAll(/"((?:[^"\\]|\\.)*)"/g))
      for (const m of stepMatches) {
        const step = unquote(m[1] ?? '')
        if (step) steps.push(step)
      }
    }

    const procedure = steps.length > 0 && field('name')
      ? { name: field('name') ?? '', description: field('description') ?? '', steps }
      : null

    return {
      summary,
      keyFacts,
      studyNotes: field('studyNotes') ?? summary,
      procedure,
    }
  }
}
