import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

type ComputerMode = 'http' | 'playwright'
type ComputerModeInput = ComputerMode | 'auto'

interface ComputerLink {
  text: string
  url: string
}

interface PlaywrightSessionRuntime {
  context: any
  page: any
}

interface ComputerSessionState {
  id: string
  userId: string
  mode: ComputerMode
  currentUrl: string | null
  title: string
  textContent: string
  links: ComputerLink[]
  history: string[]
  updatedAt: string
  runtime: PlaywrightSessionRuntime | null
}

const MAX_SESSIONS = 120
const MAX_LINKS = 120
const MAX_TEXT_CHARS = 16_000

@Injectable()
export class ComputerUseTool implements OnModuleDestroy {
  private readonly logger = new Logger(ComputerUseTool.name)
  private sessions = new Map<string, ComputerSessionState>()
  private playwrightRuntime: any | null = null
  private playwrightLoadAttempted = false
  private browser: any | null = null

  get sessionStartDef(): ToolDefinition {
    return {
      name: 'computer_session_start',
      displayName: 'Computer Session Start',
      description: 'Start a browser-like session for website navigation tasks.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Optional URL to open immediately.' },
          mode: {
            type: 'string',
            description: 'Optional session mode: auto (default), playwright, or http.',
          },
        },
      },
    }
  }

  get navigateDef(): ToolDefinition {
    return {
      name: 'computer_navigate',
      displayName: 'Computer Navigate',
      description: 'Open a URL inside a computer session and parse page text + links.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session id from computer_session_start.' },
          url: { type: 'string', description: 'Target URL (http/https or relative path).' },
          captureScreenshot: {
            type: 'boolean',
            description: 'Capture a small screenshot data URL (playwright mode only).',
          },
        },
        required: ['sessionId', 'url'],
      },
    }
  }

  get clickDef(): ToolDefinition {
    return {
      name: 'computer_click_link',
      displayName: 'Computer Click Link',
      description: 'Click a parsed link by index, text match, or URL and navigate to it.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session id from computer_session_start.' },
          index: { type: 'number', description: '1-based link index from latest snapshot.' },
          text: { type: 'string', description: 'Case-insensitive link text contains match.' },
          url: { type: 'string', description: 'Exact or partial URL match from available links.' },
          captureScreenshot: {
            type: 'boolean',
            description: 'Capture a small screenshot data URL after navigation (playwright mode only).',
          },
        },
        required: ['sessionId'],
      },
    }
  }

  get snapshotDef(): ToolDefinition {
    return {
      name: 'computer_snapshot',
      displayName: 'Computer Snapshot',
      description: 'Return current page summary, text preview, links, and history for a session.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session id from computer_session_start.' },
          maxLinks: { type: 'number', description: 'Max links in snapshot (1-50).' },
          maxTextChars: { type: 'number', description: 'Max text chars in snapshot (200-4000).' },
          captureScreenshot: {
            type: 'boolean',
            description: 'Capture a small screenshot data URL (playwright mode only).',
          },
        },
        required: ['sessionId'],
      },
    }
  }

  get endSessionDef(): ToolDefinition {
    return {
      name: 'computer_session_end',
      displayName: 'Computer Session End',
      description: 'Close a computer session and clear its in-memory state.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session id to close.' },
        },
        required: ['sessionId'],
      },
    }
  }

  async start(input: { url?: string; mode?: string }, userId: string): Promise<ToolResult> {
    const modeRequest = this.resolveModeInput(input.mode)
    const resolvedMode = await this.resolveSessionMode(modeRequest)
    if (!resolvedMode.ok) {
      return { success: false, output: null, error: resolvedMode.error }
    }

    const session: ComputerSessionState = {
      id: randomUUID(),
      userId,
      mode: resolvedMode.mode,
      currentUrl: null,
      title: '',
      textContent: '',
      links: [],
      history: [],
      updatedAt: new Date().toISOString(),
      runtime: null,
    }

    if (resolvedMode.mode === 'playwright') {
      const runtime = await this.createPlaywrightSessionRuntime()
      if (!runtime) {
        if (modeRequest === 'playwright') {
          return {
            success: false,
            output: null,
            error: 'Playwright mode requested but browser runtime is unavailable. Install playwright and retry.',
          }
        }
        session.mode = 'http'
      } else {
        session.runtime = runtime
      }
    }

    this.sessions.set(session.id, session)
    this.pruneSessions()

    const url = input.url?.trim()
    if (!url) {
      return {
        success: true,
        output: {
          sessionId: session.id,
          mode: session.mode,
          startedAt: session.updatedAt,
          ...(resolvedMode.warning ? { warning: resolvedMode.warning } : {}),
          message: 'Session started. Use computer_navigate to open a page.',
        },
      }
    }

    const navigation = await this.navigate(
      { sessionId: session.id, url },
      userId,
    )
    if (!navigation.success) {
      return {
        success: true,
        output: {
          sessionId: session.id,
          mode: session.mode,
          startedAt: session.updatedAt,
          ...(resolvedMode.warning ? { warning: resolvedMode.warning } : {}),
          warning: `Session started, but initial navigation failed: ${navigation.error}`,
        },
      }
    }
    if (
      resolvedMode.warning
      && navigation.success
      && navigation.output
      && typeof navigation.output === 'object'
    ) {
      const output = navigation.output as Record<string, unknown>
      output.warning = [output.warning, resolvedMode.warning].filter(Boolean).join(' | ')
      return { ...navigation, output }
    }
    return navigation
  }

  async navigate(
    input: { sessionId: string; url: string; captureScreenshot?: boolean },
    userId: string,
  ): Promise<ToolResult> {
    const session = this.getSession(input.sessionId, userId)
    if (!session) {
      return { success: false, output: null, error: 'Computer session not found.' }
    }
    const url = input.url?.trim()
    if (!url) {
      return { success: false, output: null, error: 'URL is required.' }
    }

    try {
      const resolved = this.resolveUrl(url, session.currentUrl ?? undefined)
      const captureScreenshot = Boolean(input.captureScreenshot)
      const warning = session.mode === 'playwright'
        ? await this.navigatePlaywright(session, resolved)
        : await this.navigateHttp(session, resolved)

      const output: Record<string, unknown> = {
        sessionId: session.id,
        mode: session.mode,
        page: this.buildSnapshot(session),
      }
      if (warning) output.warning = warning

      if (captureScreenshot && session.mode === 'playwright') {
        const screenshot = await this.capturePlaywrightScreenshot(session)
        if (screenshot.warning) output.warning = [output.warning, screenshot.warning].filter(Boolean).join(' | ')
        if (screenshot.dataUrl) output.screenshotDataUrl = screenshot.dataUrl
      }

      return { success: true, output }
    } catch (error: any) {
      return {
        success: false,
        output: null,
        error: error?.message ?? 'Navigation failed.',
      }
    }
  }

  async click(
    input: { sessionId: string; index?: number; text?: string; url?: string; captureScreenshot?: boolean },
    userId: string,
  ): Promise<ToolResult> {
    const session = this.getSession(input.sessionId, userId)
    if (!session) {
      return { success: false, output: null, error: 'Computer session not found.' }
    }
    if (!session.currentUrl) {
      return { success: false, output: null, error: 'No page loaded yet. Run computer_navigate first.' }
    }

    const link = this.pickLink(session.links, input)
    if (!link) {
      const preview = session.links
        .slice(0, 6)
        .map((item, idx) => `${idx + 1}. ${item.text || '(no text)'} -> ${item.url}`)
        .join('\n')
      return {
        success: false,
        output: null,
        error: preview
          ? `No matching link found. Available links:\n${preview}`
          : 'No matching link found and current page has no links.',
      }
    }

    return this.navigate({
      sessionId: session.id,
      url: link.url,
      captureScreenshot: input.captureScreenshot,
    }, userId)
  }

  async snapshot(
    input: { sessionId: string; maxLinks?: number; maxTextChars?: number; captureScreenshot?: boolean },
    userId: string,
  ): Promise<ToolResult> {
    const session = this.getSession(input.sessionId, userId)
    if (!session) {
      return { success: false, output: null, error: 'Computer session not found.' }
    }

    let warning: string | null = null
    if (session.mode === 'playwright') {
      warning = await this.refreshPlaywrightState(session)
    }

    const output: Record<string, unknown> = {
      sessionId: session.id,
      mode: session.mode,
      page: this.buildSnapshot(session, input.maxLinks, input.maxTextChars),
    }
    if (warning) output.warning = warning

    if (Boolean(input.captureScreenshot) && session.mode === 'playwright') {
      const screenshot = await this.capturePlaywrightScreenshot(session)
      if (screenshot.warning) output.warning = [output.warning, screenshot.warning].filter(Boolean).join(' | ')
      if (screenshot.dataUrl) output.screenshotDataUrl = screenshot.dataUrl
    }

    return { success: true, output }
  }

  async end(input: { sessionId: string }, userId: string): Promise<ToolResult> {
    const session = this.getSession(input.sessionId, userId)
    if (!session) {
      return { success: false, output: null, error: 'Computer session not found.' }
    }

    await this.closeSessionRuntime(session).catch(() => {})
    this.sessions.delete(session.id)
    return {
      success: true,
      output: {
        sessionId: session.id,
        mode: session.mode,
        closedAt: new Date().toISOString(),
      },
    }
  }

  async onModuleDestroy() {
    for (const session of this.sessions.values()) {
      await this.closeSessionRuntime(session).catch(() => {})
    }
    this.sessions.clear()
    if (this.browser) {
      await this.browser.close().catch(() => {})
      this.browser = null
    }
  }

  private resolveModeInput(rawMode?: string): ComputerModeInput {
    const value = (rawMode ?? process.env.COMPUTER_USE_PROVIDER ?? 'auto').trim().toLowerCase()
    if (value === 'http' || value === 'playwright' || value === 'auto') return value
    return 'auto'
  }

  private async resolveSessionMode(mode: ComputerModeInput): Promise<
    { ok: true; mode: ComputerMode; warning: string | null }
    | { ok: false; error: string }
  > {
    if (mode === 'http') return { ok: true, mode: 'http', warning: null }

    const browser = await this.ensurePlaywrightBrowser()
    if (!browser) {
      if (mode === 'playwright') {
        return { ok: false, error: 'Playwright runtime is unavailable.' }
      }
      return {
        ok: true,
        mode: 'http',
        warning: 'Playwright runtime unavailable. Falling back to static HTTP mode.',
      }
    }

    return { ok: true, mode: 'playwright', warning: null }
  }

  private getSession(sessionId: string, userId: string) {
    const id = sessionId?.trim()
    if (!id) return null
    const session = this.sessions.get(id)
    if (!session || session.userId !== userId) return null
    return session
  }

  private pickLink(
    links: ComputerLink[],
    input: { index?: number; text?: string; url?: string },
  ) {
    const byIndex = Number.isFinite(input.index) ? Number(input.index) : null
    if (byIndex && byIndex >= 1 && byIndex <= links.length) {
      return links[byIndex - 1]
    }

    const urlNeedle = input.url?.trim().toLowerCase()
    if (urlNeedle) {
      const byUrl = links.find((link) => link.url.toLowerCase() === urlNeedle)
        ?? links.find((link) => link.url.toLowerCase().includes(urlNeedle))
      if (byUrl) return byUrl
    }

    const textNeedle = input.text?.trim().toLowerCase()
    if (textNeedle) {
      return links.find((link) => link.text.toLowerCase().includes(textNeedle)) ?? null
    }

    return null
  }

  private async navigateHttp(session: ComputerSessionState, url: string) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'OpenAgents-Computer/1.0' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while opening ${url}`)
    }

    const html = await response.text()
    const textContent = this.extractTextContent(html)
    const links = this.extractLinksFromHtml(html, response.url || url)
    const title = this.extractTitle(html) || response.url || url

    session.currentUrl = response.url || url
    session.title = this.clip(title, 240)
    session.textContent = this.clip(textContent, MAX_TEXT_CHARS)
    session.links = links
    session.updatedAt = new Date().toISOString()
    this.pushHistory(session, session.currentUrl)
    this.touch(session)

    return 'HTTP mode parses static HTML and may miss client-rendered UI.'
  }

  private async navigatePlaywright(session: ComputerSessionState, url: string) {
    const page = session.runtime?.page
    if (!page) {
      throw new Error('Playwright session runtime is missing.')
    }

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    })
    await page.waitForTimeout(200)
    return this.refreshPlaywrightState(session)
  }

  private async refreshPlaywrightState(session: ComputerSessionState) {
    const page = session.runtime?.page
    if (!page) return 'Playwright runtime missing; snapshot may be stale.'

    const payload = await page.evaluate(() => {
      const doc = (globalThis as any).document as any
      const title = typeof doc?.title === 'string' ? doc.title : ''
      const bodyText = typeof doc?.body?.innerText === 'string'
        ? doc.body.innerText
        : typeof doc?.documentElement?.innerText === 'string'
          ? doc.documentElement.innerText
          : ''
      const rawAnchors = Array.from(doc?.querySelectorAll?.('a[href]') ?? [])
      const links = rawAnchors.map((anchor: any) => ({
        text: typeof anchor?.innerText === 'string'
          ? anchor.innerText
          : typeof anchor?.textContent === 'string'
            ? anchor.textContent
            : '',
        href: typeof anchor?.href === 'string'
          ? anchor.href
          : typeof anchor?.getAttribute?.('href') === 'string'
            ? anchor.getAttribute('href')
            : '',
      }))

      return {
        title,
        textContent: bodyText,
        links,
      }
    }) as { title?: unknown; textContent?: unknown; links?: unknown }

    const currentUrl = typeof page.url === 'function' ? page.url() : ''
    session.currentUrl = currentUrl || session.currentUrl
    session.title = this.clip(typeof payload?.title === 'string' ? payload.title : session.title, 240)
    session.textContent = this.clip(
      typeof payload?.textContent === 'string' ? payload.textContent : session.textContent,
      MAX_TEXT_CHARS,
    )
    session.links = this.normalizeLinks(
      Array.isArray(payload?.links) ? payload.links : [],
      session.currentUrl ?? undefined,
    )
    session.updatedAt = new Date().toISOString()
    if (session.currentUrl) {
      this.pushHistory(session, session.currentUrl)
    }
    this.touch(session)
    return null
  }

  private extractTitle(html: string) {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (!match?.[1]) return ''
    return this.decodeHtml(match[1]).replace(/\s+/g, ' ').trim()
  }

  private extractTextContent(html: string) {
    const sanitized = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
    return this.decodeHtml(sanitized).replace(/\s+/g, ' ').trim()
  }

  private extractLinksFromHtml(html: string, baseUrl: string) {
    const out: ComputerLink[] = []
    const seen = new Set<string>()
    const pattern = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi
    let match: RegExpExecArray | null = null

    while ((match = pattern.exec(html)) !== null) {
      const href = (match[1] ?? match[2] ?? match[3] ?? '').trim()
      if (!href) continue
      const resolved = this.resolveUrlOrNull(href, baseUrl)
      if (!resolved || seen.has(resolved)) continue
      seen.add(resolved)
      const linkTextRaw = this.decodeHtml(match[4] ?? '').replace(/<[^>]+>/g, ' ')
      const linkText = linkTextRaw.replace(/\s+/g, ' ').trim()
      out.push({
        text: this.clip(linkText || '(link)', 180),
        url: resolved,
      })
      if (out.length >= MAX_LINKS) break
    }

    return out
  }

  private normalizeLinks(raw: unknown[], baseUrl?: string) {
    const out: ComputerLink[] = []
    const seen = new Set<string>()
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue
      const row = entry as Record<string, unknown>
      const href = typeof row.href === 'string' ? row.href.trim() : ''
      const textRaw = typeof row.text === 'string' ? row.text : ''
      if (!href) continue
      const resolved = this.resolveUrlOrNull(href, baseUrl)
      if (!resolved || seen.has(resolved)) continue
      seen.add(resolved)
      out.push({
        text: this.clip(textRaw.replace(/\s+/g, ' ').trim() || '(link)', 180),
        url: resolved,
      })
      if (out.length >= MAX_LINKS) break
    }
    return out
  }

  private resolveUrl(input: string, baseUrl?: string) {
    const parsed = baseUrl ? new URL(input, baseUrl) : new URL(input)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http/https URLs are supported in computer mode.')
    }
    return parsed.toString()
  }

  private resolveUrlOrNull(input: string, baseUrl?: string) {
    try {
      return this.resolveUrl(input, baseUrl)
    } catch {
      return null
    }
  }

  private decodeHtml(input: string) {
    return input
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
  }

  private buildSnapshot(session: ComputerSessionState, rawMaxLinks?: number, rawMaxTextChars?: number) {
    const maxLinks = Math.max(1, Math.min(50, Number(rawMaxLinks ?? 20)))
    const maxTextChars = Math.max(200, Math.min(4000, Number(rawMaxTextChars ?? 1200)))

    return {
      currentUrl: session.currentUrl,
      title: session.title,
      textPreview: this.clip(session.textContent, maxTextChars),
      linkCount: session.links.length,
      links: session.links.slice(0, maxLinks).map((link, idx) => ({
        index: idx + 1,
        text: link.text,
        url: link.url,
      })),
      history: session.history.slice(-10),
      updatedAt: session.updatedAt,
      note: session.mode === 'playwright'
        ? 'Playwright mode executes client-side JavaScript and reflects rendered DOM state.'
        : 'HTTP mode parses static HTML and may not execute client-side JavaScript.',
    }
  }

  private pushHistory(session: ComputerSessionState, url: string) {
    if (session.history[session.history.length - 1] !== url) {
      session.history.push(url)
    }
    if (session.history.length > 20) {
      session.history = session.history.slice(-20)
    }
  }

  private touch(session: ComputerSessionState) {
    this.sessions.delete(session.id)
    this.sessions.set(session.id, session)
  }

  private pruneSessions() {
    if (this.sessions.size <= MAX_SESSIONS) return
    const overflow = this.sessions.size - MAX_SESSIONS
    const keys = [...this.sessions.keys()].slice(0, overflow)
    for (const key of keys) {
      const session = this.sessions.get(key)
      if (!session) continue
      this.closeSessionRuntime(session).catch(() => {})
      this.sessions.delete(key)
    }
  }

  private clip(value: string, max: number) {
    return value.length > max ? `${value.slice(0, max)}...` : value
  }

  private async closeSessionRuntime(session: ComputerSessionState) {
    if (!session.runtime) return
    try {
      await session.runtime.context?.close?.()
    } catch {}
    session.runtime = null
  }

  private loadPlaywrightRuntime() {
    if (this.playwrightLoadAttempted) return this.playwrightRuntime
    this.playwrightLoadAttempted = true
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.playwrightRuntime = require('playwright')
      return this.playwrightRuntime
    } catch (error: any) {
      this.logger.warn(`Playwright module is not installed: ${error?.message ?? 'unknown error'}`)
      this.playwrightRuntime = null
      return null
    }
  }

  private async ensurePlaywrightBrowser() {
    if (this.browser) {
      return this.browser
    }

    const runtime = this.loadPlaywrightRuntime()
    if (!runtime) return null

    const requested = (process.env.COMPUTER_USE_PLAYWRIGHT_BROWSER ?? 'chromium').trim().toLowerCase()
    const browserType = requested === 'firefox'
      ? runtime.firefox
      : requested === 'webkit'
        ? runtime.webkit
        : runtime.chromium

    if (!browserType?.launch) {
      this.logger.warn(`Playwright browser launcher "${requested}" is unavailable. Falling back to HTTP mode.`)
      return null
    }

    try {
      this.browser = await browserType.launch({
        headless: this.resolveHeadless(),
      })
      return this.browser
    } catch (error: any) {
      this.logger.warn(`Failed to launch Playwright browser "${requested}": ${error?.message ?? 'unknown error'}`)
      this.browser = null
      return null
    }
  }

  private resolveHeadless() {
    const raw = (process.env.COMPUTER_USE_PLAYWRIGHT_HEADLESS ?? 'true').trim().toLowerCase()
    return raw !== 'false' && raw !== '0' && raw !== 'no'
  }

  private async createPlaywrightSessionRuntime(): Promise<PlaywrightSessionRuntime | null> {
    const browser = await this.ensurePlaywrightBrowser()
    if (!browser) return null
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: 'OpenAgents-Computer/1.0',
    })
    const page = await context.newPage()
    return { context, page }
  }

  private async capturePlaywrightScreenshot(session: ComputerSessionState) {
    const page = session.runtime?.page
    if (!page) return { dataUrl: null, warning: 'Screenshot unavailable: session is not running in playwright mode.' }

    try {
      const screenshot = await page.screenshot({
        type: 'jpeg',
        quality: 55,
        fullPage: false,
      }) as Buffer

      const maxBytes = this.readNumberEnv('COMPUTER_USE_MAX_SCREENSHOT_BYTES', 120_000, 20_000, 1_000_000)
      if (screenshot.length > maxBytes) {
        return {
          dataUrl: null,
          warning: `Screenshot skipped because ${screenshot.length} bytes exceeded limit ${maxBytes}.`,
        }
      }

      return {
        dataUrl: `data:image/jpeg;base64,${screenshot.toString('base64')}`,
        warning: null,
      }
    } catch (error: any) {
      return {
        dataUrl: null,
        warning: `Screenshot failed: ${error?.message ?? 'unknown error'}`,
      }
    }
  }

  private readNumberEnv(name: string, fallback: number, min: number, max: number) {
    const raw = Number.parseInt(process.env[name] ?? `${fallback}`, 10)
    if (!Number.isFinite(raw)) return fallback
    return Math.max(min, Math.min(raw, max))
  }
}
