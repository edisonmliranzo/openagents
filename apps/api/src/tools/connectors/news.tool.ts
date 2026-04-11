import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

// ─── helpers ─────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
}

/** Pull text between the first matching open/close XML/HTML tag pair */
function xmlText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'))
  return m ? stripHtml(m[1]) : ''
}

/** Pull a CDATA value: <tag><![CDATA[...]]></tag> or plain text */
function xmlCdata(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\/${tag}>`, 'i'))
  return stripHtml((m?.[1] ?? m?.[2] ?? '').trim())
}

/** Extract all <item> or <entry> blocks from an RSS/Atom feed */
function parseRssItems(xml: string, max: number): Array<{ title: string; url: string; date: string; summary: string }> {
  const itemTag = xml.includes('<entry') ? 'entry' : 'item'
  const blocks = [...xml.matchAll(new RegExp(`<${itemTag}[\\s>][\\s\\S]*?<\/${itemTag}>`, 'gi'))].slice(0, max)
  return blocks.map((m) => {
    const block = m[0]
    const title = xmlCdata(block, 'title') || xmlText(block, 'title')
    // RSS uses <link>, Atom uses <link href="..."/>
    const linkHref = block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ?? ''
    const linkText = xmlCdata(block, 'link') || xmlText(block, 'link')
    const url = linkHref || linkText
    const date = xmlText(block, 'pubDate') || xmlText(block, 'published') || xmlText(block, 'updated') || ''
    const summary = xmlCdata(block, 'description') || xmlCdata(block, 'summary') || xmlText(block, 'description') || xmlText(block, 'summary') || ''
    return { title, url, date, summary: summary.slice(0, 400) }
  }).filter((i) => i.title || i.url)
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ─── Well-known free RSS feeds ───────────────────────────────────────────────

const PRESET_FEEDS: Record<string, { label: string; url: string }> = {
  bbc_top:        { label: 'BBC Top Stories', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
  bbc_world:      { label: 'BBC World News',  url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  bbc_tech:       { label: 'BBC Technology',  url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
  reuters_top:    { label: 'Reuters Top News', url: 'https://feeds.reuters.com/reuters/topNews' },
  reuters_world:  { label: 'Reuters World',    url: 'https://feeds.reuters.com/Reuters/worldNews' },
  reuters_tech:   { label: 'Reuters Technology', url: 'https://feeds.reuters.com/reuters/technologyNews' },
  ap_top:         { label: 'AP Top News',     url: 'https://rsshub.app/ap/topics/apf-topnews' },
  nyt_home:       { label: 'NY Times Home',   url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
  nyt_world:      { label: 'NY Times World',  url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
  nyt_tech:       { label: 'NY Times Tech',   url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml' },
  guardian_top:   { label: 'Guardian Top',    url: 'https://www.theguardian.com/world/rss' },
  guardian_tech:  { label: 'Guardian Tech',   url: 'https://www.theguardian.com/technology/rss' },
  hn_top:         { label: 'Hacker News Top', url: 'https://hnrss.org/frontpage' },
  techcrunch:     { label: 'TechCrunch',      url: 'https://techcrunch.com/feed/' },
  verge:          { label: 'The Verge',        url: 'https://www.theverge.com/rss/index.xml' },
}

// ─── Injectable tool ─────────────────────────────────────────────────────────

@Injectable()
export class NewsTool {

  // ── Guardian News Search ──────────────────────────────────────────────────

  get guardianSearchDef(): ToolDefinition {
    return {
      name: 'news_guardian_search',
      displayName: 'Guardian News Search',
      description: 'Search The Guardian\'s free API for news articles. Free, no rate limit issues. Returns title, url, date, section, and snippet.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          query:    { type: 'string', description: 'Search query (e.g. "climate change 2025")' },
          count:    { type: 'number', description: 'Number of results (1-50, default 10)' },
          section:  { type: 'string', description: 'Optional section filter: world, technology, science, business, sport, culture, etc.' },
          from_date: { type: 'string', description: 'Optional start date YYYY-MM-DD' },
        },
        required: ['query'],
      },
    }
  }

  async guardianSearch(
    input: { query: string; count?: number; section?: string; from_date?: string },
    _userId: string,
  ): Promise<ToolResult> {
    const apiKey = process.env.GUARDIAN_API_KEY?.trim() || 'test'
    const query = input.query?.trim()
    if (!query) return { success: false, output: null, error: 'query is required.' }

    const count = Math.max(1, Math.min(50, Number(input.count ?? 10)))
    const params = new URLSearchParams({
      q: query,
      'page-size': String(count),
      'show-fields': 'trailText,headline',
      'api-key': apiKey,
    })
    if (input.section?.trim()) params.set('section', input.section.trim())
    if (input.from_date?.trim()) params.set('from-date', input.from_date.trim())

    try {
      const res = await fetchWithTimeout(
        `https://content.guardianapis.com/search?${params.toString()}`,
      )
      if (!res.ok) {
        const body = await res.text()
        return { success: false, output: null, error: `Guardian API ${res.status}: ${body.slice(0, 200)}` }
      }
      const json = await res.json() as any
      const results = (json?.response?.results ?? []).map((r: any) => ({
        title:   r.fields?.headline || r.webTitle,
        url:     r.webUrl,
        date:    r.webPublicationDate,
        section: r.sectionName,
        snippet: r.fields?.trailText ? stripHtml(r.fields.trailText) : '',
      }))
      return { success: true, output: { results, total: json?.response?.total ?? results.length, query } }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Guardian search failed.' }
    }
  }

  // ── Guardian Headlines by section ─────────────────────────────────────────

  get guardianHeadlinesDef(): ToolDefinition {
    return {
      name: 'news_guardian_headlines',
      displayName: 'Guardian Headlines',
      description: 'Get latest headlines from The Guardian for a section (world, technology, business, science, sport, culture). Free API, no key required for basic use.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          section: { type: 'string', description: 'Section: world, technology, business, science, sport, culture, politics, environment, etc. Default: world' },
          count:   { type: 'number', description: 'Number of results (1-20, default 10)' },
        },
      },
    }
  }

  async guardianHeadlines(
    input: { section?: string; count?: number },
    userId: string,
  ): Promise<ToolResult> {
    return this.guardianSearch(
      { query: '*', count: input.count, section: input.section || 'world' },
      userId,
    )
  }

  // ── RSS Feed Fetch ─────────────────────────────────────────────────────────

  get rssFetchDef(): ToolDefinition {
    return {
      name: 'rss_fetch',
      displayName: 'RSS Feed Fetch',
      description: 'Fetch and parse any RSS or Atom feed. Works with BBC, Reuters, NY Times, Guardian, TechCrunch, Hacker News, and any custom URL. No API key needed.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          url:   { type: 'string', description: 'RSS/Atom feed URL, OR a preset key: bbc_top, bbc_world, bbc_tech, reuters_top, reuters_world, reuters_tech, ap_top, nyt_home, nyt_world, nyt_tech, guardian_top, guardian_tech, hn_top, techcrunch, verge' },
          count: { type: 'number', description: 'Max items to return (1-30, default 10)' },
        },
        required: ['url'],
      },
    }
  }

  async rssFetch(
    input: { url: string; count?: number },
    _userId: string,
  ): Promise<ToolResult> {
    const key = input.url?.trim().toLowerCase()
    const preset = PRESET_FEEDS[key]
    const feedUrl = preset?.url ?? input.url?.trim()

    if (!feedUrl) return { success: false, output: null, error: 'url is required.' }

    const count = Math.max(1, Math.min(30, Number(input.count ?? 10)))

    try {
      const res = await fetchWithTimeout(feedUrl, {
        headers: { 'User-Agent': 'OpenAgents/1.0 RSS reader', Accept: 'application/rss+xml, application/atom+xml, text/xml, */*' },
      })
      if (!res.ok) return { success: false, output: null, error: `Feed returned HTTP ${res.status}` }

      const xml = await res.text()
      const items = parseRssItems(xml, count)
      const feedTitle = xmlCdata(xml, 'title') || xmlText(xml, 'title') || preset?.label || feedUrl

      return {
        success: true,
        output: {
          feed: feedTitle,
          url: feedUrl,
          items,
          count: items.length,
        },
      }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Failed to fetch RSS feed.' }
    }
  }

  // ── List preset feeds ──────────────────────────────────────────────────────

  get rssListFeedsDef(): ToolDefinition {
    return {
      name: 'rss_list_feeds',
      displayName: 'RSS Preset Feeds',
      description: 'List all built-in preset RSS feeds available (BBC, Reuters, NY Times, Guardian, HN, TechCrunch, Verge). Use the key with rss_fetch.',
      requiresApproval: false,
      hidden: true,
      inputSchema: { type: 'object', properties: {} },
    }
  }

  async rssListFeeds(_input: Record<string, unknown>, _userId: string): Promise<ToolResult> {
    const feeds = Object.entries(PRESET_FEEDS).map(([key, { label, url }]) => ({ key, label, url }))
    return { success: true, output: { feeds } }
  }
}
