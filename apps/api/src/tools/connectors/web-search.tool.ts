import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

type WebSearchProvider = 'brave' | 'searxng'

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
      description: 'Search the web for current information via Brave Search or SearXNG.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          count: { type: 'number', description: 'Number of results to return (1-10)' },
          provider: { type: 'string', description: 'Optional provider override: brave or searxng' },
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
    if (provider === 'brave') {
      return this.searchBrave(query, count)
    }
    if (provider === 'searxng') {
      return this.searchSearxng(query, count)
    }

    return {
      success: false,
      output: null,
      error: `Unsupported web search provider: ${provider}. Use brave or searxng.`,
    }
  }

  private getProvider(inputProvider?: string): WebSearchProvider | string {
    const configured = (inputProvider ?? process.env.WEB_SEARCH_PROVIDER ?? 'brave').trim().toLowerCase()
    if (configured === 'brave' || configured === 'searxng') return configured
    return configured
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
