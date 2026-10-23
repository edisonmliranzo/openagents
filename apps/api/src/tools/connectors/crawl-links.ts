/**
 * Pure helpers for the web_crawl tool: same-origin link extraction, URL
 * normalization, and HTML text extraction. Dependency-free on purpose so the
 * test suite can cover the crawler's routing decisions directly.
 */

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp',
  '.pdf', '.zip', '.gz', '.tgz', '.tar', '.rar', '.7z', '.exe', '.dmg', '.msi',
  '.mp3', '.mp4', '.avi', '.mov', '.mkv', '.wav', '.flac',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.css', '.js', '.json', '.xml', '.rss', '.csv', '.zipx',
])

const HREF_PATTERN = /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi

/** Resolve + normalize a URL for crawling. Returns null when not crawlable. */
export function normalizeCrawlUrl(raw: string, base?: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(String(raw).trim(), base)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  parsed.hash = ''
  return parsed.toString()
}

function hasSkippedExtension(pathname: string): boolean {
  const dot = pathname.lastIndexOf('.')
  if (dot === -1) return false
  return SKIP_EXTENSIONS.has(pathname.slice(dot).toLowerCase())
}

/**
 * Extract same-origin crawlable links from raw HTML, resolved against
 * baseUrl, deduped, order preserved.
 */
export function extractLinks(html: string, baseUrl: string, maxLinks = 200): string[] {
  let origin: string
  try {
    origin = new URL(baseUrl).origin
  } catch {
    return []
  }

  const seen = new Set<string>()
  const links: string[] = []
  const bounded = html.slice(0, 120_000)
  let match: RegExpExecArray | null
  while ((match = HREF_PATTERN.exec(bounded)) !== null && links.length < maxLinks) {
    const href = match[1] ?? match[2] ?? match[3]
    if (!href) continue
    const normalized = normalizeCrawlUrl(href, baseUrl)
    if (!normalized) continue
    let candidate: URL
    try {
      candidate = new URL(normalized)
    } catch {
      continue
    }
    if (candidate.origin !== origin) continue
    if (hasSkippedExtension(candidate.pathname)) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    links.push(normalized)
  }
  return links
}

/** Best-effort <title> extraction for crawl reports. */
export function extractPageTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html.slice(0, 20_000))
  if (!match) return ''
  return match[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

/** Crude HTML -> text extraction, consistent with web_fetch's sanitizer. */
export function extractTextFromHtml(html: string): string {
  const bounded = html.slice(0, 120_000)
  const withoutScripts = bounded
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  return withoutScripts
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
