import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

type WebSearchProvider = 'auto' | 'brave' | 'searxng' | 'duckduckgo'

interface BraveSearchResult {
  title?: string
  url?: string
  description?: string
}

interface SearxngSearchResult {
  title?: string
  url?: string
  content?: string
}

@Injectable()
export class WebSearchTool {
  get def(): ToolDefinition {
    return {
      name: 'web_search',
      displayName: 'Web Search',
      description: 'Search the web for current information via auto provider fallback (Brave, SearXNG, DuckDuckGo).',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          count: { type: 'number', description: 'Number of results to return (1-10)' },
          provider: { type: 'string', description: 'Optional provider override: auto, brave, searxng, or duckduckgo' },
        },
        required: ['query'],
      },
    }
  }

  async search(input: { query: string; count?: number; provider?: string }, _userId: string): Promise<ToolResult> {
    const query = input.query?.trim()
    if (!query) {
      return { success: false, output: null, error: 'Query is required.' }
    }

    const count = Math.max(1, Math.min(10, Number(input.count ?? 5)))
    const provider = this.getProvider(input.provider)
    if (provider === 'auto') {
      return this.searchAuto(query, count)
    }
    if (provider === 'brave') {
      return this.searchBrave(query, count)
    }
    if (provider === 'searxng') {
      return this.searchSearxng(query, count)
    }
    if (provider === 'duckduckgo') {
      return this.searchDuckDuckGo(query, count)
    }

    return {
      success: false,
      output: null,
      error: `Unsupported web search provider: ${provider}. Use auto, brave, searxng, or duckduckgo.`,
    }
  }

  private getProvider(inputProvider?: string): WebSearchProvider | string {
    const configured = (inputProvider ?? process.env.WEB_SEARCH_PROVIDER ?? 'auto').trim().toLowerCase()
    if (configured === 'auto' || configured === 'brave' || configured === 'searxng' || configured === 'duckduckgo') {
      return configured
    }
    return configured
  }

  private async searchAuto(query: string, count: number): Promise<ToolResult> {
    const attempted: string[] = []
    const failures: string[] = []

    if (this.hasBraveConfig()) {
      attempted.push('brave')
      const brave = await this.searchBrave(query, count)
      if (brave.success) return brave
      failures.push(`brave: ${brave.error ?? 'unknown error'}`)
    }

    if (this.hasSearxngConfig()) {
      attempted.push('searxng')
      const searxng = await this.searchSearxng(query, count)
      if (searxng.success) return searxng
      failures.push(`searxng: ${searxng.error ?? 'unknown error'}`)
    }

    attempted.push('duckduckgo')
    const duckduckgo = await this.searchDuckDuckGo(query, count)
    if (duckduckgo.success) return duckduckgo
    failures.push(`duckduckgo: ${duckduckgo.error ?? 'unknown error'}`)

    return {
      success: false,
      output: null,
      error: `All web search providers failed (${attempted.join(' -> ')}). ${failures.join(' | ')}`,
    }
  }

  private hasBraveConfig() {
    return Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim())
  }

  private hasSearxngConfig() {
    return Boolean(process.env.SEARXNG_BASE_URL?.trim())
  }

  private async searchBrave(query: string, count: number): Promise<ToolResult> {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim()
    if (!apiKey) {
      return {
        success: false,
        output: null,
        error: 'BRAVE_SEARCH_API_KEY is not configured.',
      }
    }

    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`

    try {
      const response = await fetch(url, {
        headers: {
          'X-Subscription-Token': apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        return { success: false, output: null, error: `Brave API request failed with status ${response.status}` }
      }

      const payload = await response.json() as { web?: { results?: BraveSearchResult[] } }
      const results = (payload.web?.results ?? [])
        .slice(0, count)
        .map((result) => ({
          title: result.title ?? '',
          url: result.url ?? '',
          snippet: result.description ?? '',
        }))

      return {
        success: true,
        output: {
          provider: 'brave',
          query,
          count: results.length,
          results,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        output: null,
        error: error?.message ?? 'Web search failed',
      }
    }
  }

  private async searchDuckDuckGo(query: string, count: number): Promise<ToolResult> {
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/html',
          'User-Agent': 'OpenAgents/1.0 (+https://github.com/edisonmliranzo/openagents)',
        },
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        return { success: false, output: null, error: `DuckDuckGo request failed with status ${response.status}` }
      }

      const html = await response.text()
      const results = this.parseDuckDuckGoHtml(html, count)

      return {
        success: true,
        output: {
          provider: 'duckduckgo',
          query,
          count: results.length,
          results,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        output: null,
        error: error?.message ?? 'Web search failed',
      }
    }
  }

  private parseDuckDuckGoHtml(html: string, count: number) {
    const results: Array<{ title: string; url: string; snippet: string }> = []
    const seenUrls = new Set<string>()
    const anchorRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    let match: RegExpExecArray | null

    while ((match = anchorRegex.exec(html)) && results.length < count) {
      const rawHref = this.decodeHtmlEntities(match[1] ?? '')
      const title = this.cleanHtmlText(match[2] ?? '')
      const normalizedUrl = this.normalizeDuckDuckGoResultUrl(rawHref)
      if (!normalizedUrl || !title) continue
      if (seenUrls.has(normalizedUrl)) continue
      seenUrls.add(normalizedUrl)

      const windowHtml = html.slice(match.index, Math.min(html.length, match.index + 1500))
      const snippetMatch = windowHtml.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      const snippet = this.cleanHtmlText(snippetMatch?.[1] ?? '')

      results.push({
        title,
        url: normalizedUrl,
        snippet,
      })
    }

    return results
  }

  private normalizeDuckDuckGoResultUrl(rawHref: string) {
    if (!rawHref) return null
    try {
      const candidate = rawHref.startsWith('//')
        ? `https:${rawHref}`
        : rawHref
      const parsed = new URL(candidate, 'https://duckduckgo.com')
      if ((parsed.hostname === 'duckduckgo.com' || parsed.hostname === 'www.duckduckgo.com') && parsed.pathname === '/l/') {
        const embedded = parsed.searchParams.get('uddg')
        if (!embedded) return null
        const decoded = decodeURIComponent(embedded)
        const embeddedUrl = new URL(decoded)
        if (embeddedUrl.protocol === 'http:' || embeddedUrl.protocol === 'https:') {
          return embeddedUrl.toString()
        }
        return null
      }
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.toString()
      }
      return null
    } catch {
      return null
    }
  }

  private cleanHtmlText(value: string) {
    const noTags = value.replace(/<[^>]+>/g, ' ')
    const decoded = this.decodeHtmlEntities(noTags)
    return decoded.replace(/\s+/g, ' ').trim().slice(0, 800)
  }

  private decodeHtmlEntities(value: string) {
    if (!value) return ''
    const named: Record<string, string> = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: ' ',
      '#39': "'",
      '#x27': "'",
      '#x2F': '/',
    }
    return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_full, entity) => {
      const lower = String(entity).toLowerCase()
      if (named[lower]) return named[lower]
      if (lower.startsWith('#x')) {
        const parsed = Number.parseInt(lower.slice(2), 16)
        return Number.isFinite(parsed) ? String.fromCharCode(parsed) : `&${entity};`
      }
      if (lower.startsWith('#')) {
        const parsed = Number.parseInt(lower.slice(1), 10)
        return Number.isFinite(parsed) ? String.fromCharCode(parsed) : `&${entity};`
      }
      return `&${entity};`
    })
  }

  private async searchSearxng(query: string, count: number): Promise<ToolResult> {
    const baseUrl = process.env.SEARXNG_BASE_URL?.trim()
    if (!baseUrl) {
      return {
        success: false,
        output: null,
        error: 'SEARXNG_BASE_URL is not configured.',
      }
    }

    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      safesearch: '0',
      language: 'en-US',
    })
    const url = `${normalizedBaseUrl}/search?${params.toString()}`
    const apiKey = process.env.SEARXNG_API_KEY?.trim()

    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`
        headers['X-API-Key'] = apiKey
      }
      return await this.fetchSearxng(url, headers, query, count)
    } catch (error: any) {
      return {
        success: false,
        output: null,
        error: error?.message ?? 'Web search failed',
      }
    }
  }

  private async fetchSearxng(url: string, headers: Record<string, string>, query: string, count: number): Promise<ToolResult> {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      return { success: false, output: null, error: `SearXNG request failed with status ${response.status}` }
    }

    const payload = await response.json() as { results?: SearxngSearchResult[] }
    const results = (payload.results ?? [])
      .slice(0, count)
      .map((result) => ({
        title: result.title ?? '',
        url: result.url ?? '',
        snippet: result.content ?? '',
      }))

    return {
      success: true,
      output: {
        provider: 'searxng',
        query,
        count: results.length,
        results,
      },
    }
  }
}
