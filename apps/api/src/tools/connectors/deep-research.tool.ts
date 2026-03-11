import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import { WebFetchTool } from './web-fetch.tool'
import { WebSearchTool } from './web-search.tool'

interface WebResult {
  title: string
  url: string
  snippet: string
}

interface ResearchSource {
  title: string
  url: string
  snippet: string
  status: 'fetched' | 'error'
  contentPreview: string | null
  error: string | null
  guarded?: boolean
  guardFindings?: Array<{ id: string; label: string; excerpt: string }>
}

const MAX_RESULTS = 12
const MAX_PAGES = 8

@Injectable()
export class DeepResearchTool {
  constructor(
    private webSearch: WebSearchTool,
    private webFetch: WebFetchTool,
  ) {}

  get def(): ToolDefinition {
    return {
      name: 'deep_research',
      displayName: 'Deep Research',
      description:
        'Research a topic by combining web search + multi-page fetch with citation-ready sources and prompt-guard sanitization.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Research query or question' },
          maxResults: {
            type: 'number',
            description: `Max search results to scan (1-${MAX_RESULTS})`,
          },
          maxPages: {
            type: 'number',
            description: `Max pages to fetch from results (1-${MAX_PAGES})`,
          },
          provider: {
            type: 'string',
            description: 'Optional search provider override: auto, brave, searxng, or duckduckgo',
          },
          includePageContent: {
            type: 'boolean',
            description: 'Include larger content excerpts from fetched pages (default: false)',
          },
        },
        required: ['query'],
      },
    }
  }

  async run(
    input: {
      query: string
      maxResults?: number
      maxPages?: number
      provider?: string
      includePageContent?: boolean
    },
    userId: string,
  ): Promise<ToolResult> {
    const query = input.query?.trim()
    if (!query) {
      return { success: false, output: null, error: 'Query is required.' }
    }

    const maxResults = this.normalizeCount(input.maxResults, 6, MAX_RESULTS)
    const maxPages = this.normalizeCount(input.maxPages, 4, MAX_PAGES)
    const includePageContent = Boolean(input.includePageContent)

    const search = await this.webSearch.search(
      { query, count: maxResults, provider: input.provider },
      userId,
    )
    if (!search.success) return search

    const parsed = this.parseSearchOutput(search.output)
    if (parsed.results.length === 0) {
      return {
        success: true,
        output: {
          query,
          provider: parsed.provider ?? 'unknown',
          searchedResults: 0,
          fetchedPages: 0,
          guardedSources: 0,
          summary: `No search results were returned for "${query}".`,
          keyFindings: [],
          citations: [],
          sources: [],
        },
      }
    }

    const selected = parsed.results.slice(0, maxPages)
    const sources = await Promise.all(
      selected.map((result) => this.fetchSource(result, includePageContent, userId)),
    )
    const fetched = sources.filter((source) => source.status === 'fetched')
    const synthesis = this.synthesize(query, fetched)
    const guardedSources = fetched.filter((source) => source.guarded).length

    return {
      success: true,
      output: {
        query,
        provider: parsed.provider ?? 'unknown',
        searchedResults: parsed.results.length,
        fetchedPages: fetched.length,
        guardedSources,
        summary: synthesis.summary,
        keyFindings: synthesis.keyFindings,
        citations: sources.map((source, idx) => ({
          id: idx + 1,
          title: source.title,
          url: source.url,
          status: source.status,
        })),
        sources,
      },
    }
  }

  private normalizeCount(value: number | undefined, fallback: number, max: number) {
    return Math.max(1, Math.min(max, Number(value ?? fallback)))
  }

  private parseSearchOutput(output: unknown): { provider: string | null; results: WebResult[] } {
    if (!output || typeof output !== 'object') {
      return { provider: null, results: [] }
    }

    const raw = output as Record<string, unknown>
    const provider = typeof raw.provider === 'string' ? raw.provider : null
    const entries = Array.isArray(raw.results) ? raw.results : []
    const deduped = new Set<string>()
    const results: WebResult[] = []

    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue
      const row = entry as Record<string, unknown>
      const title = this.clip(typeof row.title === 'string' ? row.title : '', 240)
      const url = typeof row.url === 'string' ? row.url.trim() : ''
      const snippet = this.clip(typeof row.snippet === 'string' ? row.snippet : '', 900)
      if (!url || !title) continue
      if (!this.isHttpUrl(url)) continue
      if (deduped.has(url)) continue
      deduped.add(url)
      results.push({ title, url, snippet })
      if (results.length >= MAX_RESULTS) break
    }

    return { provider, results }
  }

  private async fetchSource(
    result: WebResult,
    includePageContent: boolean,
    userId: string,
  ): Promise<ResearchSource> {
    const fetched = await this.webFetch.fetch({ url: result.url }, userId)
    if (!fetched.success) {
      return {
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        status: 'error',
        contentPreview: null,
        error: fetched.error ?? 'Failed to fetch source content.',
      }
    }

    const content = this.extractFetchContent(fetched.output)
    const promptGuard = this.extractPromptGuard(fetched.output)
    const fallback = result.snippet || `Fetched source: ${result.url}`
    const previewLimit = includePageContent ? 2200 : 650
    return {
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      status: 'fetched',
      contentPreview: this.clip(content || fallback, previewLimit),
      error: null,
      guarded: promptGuard.flagged,
      ...(promptGuard.findings.length > 0 ? { guardFindings: promptGuard.findings } : {}),
    }
  }

  private extractFetchContent(output: unknown) {
    if (!output || typeof output !== 'object') return ''
    const raw = output as Record<string, unknown>
    if (typeof raw.content !== 'string') return ''
    return raw.content
  }

  private extractPromptGuard(output: unknown) {
    if (!output || typeof output !== 'object') {
      return {
        flagged: false,
        findings: [] as Array<{ id: string; label: string; excerpt: string }>,
      }
    }

    const raw = output as Record<string, unknown>
    const promptGuard = raw.promptGuard
    if (!promptGuard || typeof promptGuard !== 'object') {
      return {
        flagged: false,
        findings: [] as Array<{ id: string; label: string; excerpt: string }>,
      }
    }

    const guard = promptGuard as Record<string, unknown>
    const findings = Array.isArray(guard.findings)
      ? guard.findings
          .filter(
            (finding): finding is { id: string; label: string; excerpt: string } =>
              Boolean(finding) &&
              typeof finding === 'object' &&
              typeof (finding as Record<string, unknown>).id === 'string' &&
              typeof (finding as Record<string, unknown>).label === 'string' &&
              typeof (finding as Record<string, unknown>).excerpt === 'string',
          )
          .slice(0, 6)
      : []

    return {
      flagged: Boolean(guard.flagged),
      findings,
    }
  }

  private synthesize(query: string, sources: ResearchSource[]) {
    if (!sources.length) {
      return {
        summary: `Searched for "${query}" but all selected pages failed to fetch. Try a narrower query or switch provider.`,
        keyFindings: [] as string[],
      }
    }

    const sentences: string[] = []
    for (const source of sources) {
      const text = source.contentPreview ?? source.snippet
      const next = this.toSentences(text, 2)
      for (const sentence of next) {
        sentences.push(sentence)
        if (sentences.length >= 8) break
      }
      if (sentences.length >= 8) break
    }

    const keyFindings = sentences
      .filter((value, idx, arr) => arr.findIndex((candidate) => candidate === value) === idx)
      .slice(0, 5)

    const summary = keyFindings.length
      ? `Research summary for "${query}": ${keyFindings.join(' ')}`
      : `Research completed for "${query}" across ${sources.length} fetched sources.`

    return {
      summary: this.clip(summary, 1500),
      keyFindings,
    }
  }

  private toSentences(input: string, limit: number) {
    const normalized = this.clip(input.replace(/\s+/g, ' ').trim(), 1600)
    if (!normalized) return []
    const parts = normalized
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 20)
    return parts.slice(0, limit).map((part) => this.clip(part, 320))
  }

  private isHttpUrl(value: string) {
    try {
      const parsed = new URL(value)
      return parsed.protocol === 'https:'
    } catch {
      return false
    }
  }

  private clip(value: string, max: number) {
    return value.length > max ? `${value.slice(0, max)}...` : value
  }
}
