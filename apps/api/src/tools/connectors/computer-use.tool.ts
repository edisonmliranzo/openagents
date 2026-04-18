import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import { OutboundGuardService } from '../outbound-guard.service'

type ComputerMode = 'http' | 'playwright'
type ComputerModeInput = ComputerMode | 'auto'
type PlaywrightWaitUntil = 'domcontentloaded' | 'load' | 'networkidle' | 'commit'

interface PlaywrightNavigateOptions {
  waitForSelector?: string
  waitForSelectorTimeoutMs?: number
}

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
  networkWarning: string | null
}

const MAX_SESSIONS = 120
const MAX_LINKS = 120
const MAX_TEXT_CHARS = 16_000
const HTTP_RENDER_MIN_TEXT_CHARS = 220
const HTTP_RENDER_MIN_LINKS = 3
const DEFAULT_PLAYWRIGHT_WAIT_UNTIL: PlaywrightWaitUntil = 'domcontentloaded'
const DEFAULT_PLAYWRIGHT_NAV_TIMEOUT_MS = 25_000
const DEFAULT_PLAYWRIGHT_NETWORK_IDLE_TIMEOUT_MS = 1_500
const DEFAULT_PLAYWRIGHT_SELECTOR_RETRY_COUNT = 3
const DEFAULT_PLAYWRIGHT_SELECTOR_RETRY_DELAY_MS = 350
const DEFAULT_PLAYWRIGHT_SELECTOR_TIMEOUT_MS = 3_500
const DEFAULT_PLAYWRIGHT_SETTLE_TIMEOUT_MS = 4_500
const DEFAULT_PLAYWRIGHT_SETTLE_STABLE_MS = 700
const DEFAULT_PLAYWRIGHT_SETTLE_POLL_MS = 140

@Injectable()
export class ComputerUseTool implements OnModuleDestroy {
  private readonly logger = new Logger(ComputerUseTool.name)
  private sessions = new Map<string, ComputerSessionState>()
  private playwrightRuntime: any | null = null
  private playwrightLoadAttempted = false
  private browser: any | null = null

  constructor(private outboundGuard: OutboundGuardService) {}

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
          waitForSelector: {
            type: 'string',
            description: 'Optional CSS selector to wait for after navigation (playwright mode).',
          },
          waitForSelectorTimeoutMs: {
            type: 'number',
            description: 'Optional selector wait timeout in ms (playwright mode).',
          },
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
          waitForSelector: {
            type: 'string',
            description: 'Optional CSS selector to wait for after click navigation (playwright mode).',
          },
          waitForSelectorTimeoutMs: {
            type: 'number',
            description: 'Optional selector wait timeout in ms (playwright mode).',
          },
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
      return { success: false, output: null, error: (resolvedMode as { ok: false; error: string }).error }
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
      networkWarning: null,
    }

    if (resolvedMode.mode === 'playwright') {
      const runtime = await this.createPlaywrightSessionRuntime(session)
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
    input: {
      sessionId: string
      url: string
      waitForSelector?: string
      waitForSelectorTimeoutMs?: number
      captureScreenshot?: boolean
    },
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
      const safeUrl = await this.outboundGuard.assertSafeUrl(resolved, {
        allowHttp: true,
        context: 'Computer navigation',
      })
      const captureScreenshot = Boolean(input.captureScreenshot)
      const warning = session.mode === 'playwright'
        ? await this.navigatePlaywright(session, safeUrl, {
          waitForSelector: input.waitForSelector,
          waitForSelectorTimeoutMs: input.waitForSelectorTimeoutMs,
        })
        : await this.navigateHttp(session, safeUrl)

      const output: Record<string, unknown> = {
        sessionId: session.id,
        mode: session.mode,
        page: this.buildSnapshot(session),
      }
      if (warning) output.warning = warning
      const networkWarning = this.takeNetworkWarning(session)
      if (networkWarning) {
        output.warning = [output.warning, networkWarning].filter(Boolean).join(' | ')
      }

      if (captureScreenshot && session.mode === 'playwright') {
        const screenshot = await this.capturePlaywrightScreenshot(session)
        if (screenshot.warning) output.warning = [output.warning, screenshot.warning].filter(Boolean).join(' | ')
        if (screenshot.dataUrl) output.screenshotDataUrl = screenshot.dataUrl
      }

      return { success: true, output }
    } catch (error: any) {
      const networkWarning = this.takeNetworkWarning(session)
      return {
        success: false,
        output: null,
        error: [error?.message ?? 'Navigation failed.', networkWarning].filter(Boolean).join(' | '),
      }
    }
  }

  async click(
    input: {
      sessionId: string
      index?: number
      text?: string
      url?: string
      waitForSelector?: string
      waitForSelectorTimeoutMs?: number
      captureScreenshot?: boolean
    },
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
      waitForSelector: input.waitForSelector,
      waitForSelectorTimeoutMs: input.waitForSelectorTimeoutMs,
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
    const networkWarning = this.takeNetworkWarning(session)
    if (networkWarning) {
      output.warning = [output.warning, networkWarning].filter(Boolean).join(' | ')
    }

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
    const { response, finalUrl } = await this.outboundGuard.fetchWithRedirectProtection(url, {
      headers: { 'User-Agent': 'OpenAgents-Computer/1.0' },
    }, {
      allowHttp: true,
      context: 'Computer navigation',
      maxRedirects: 5,
      timeoutMs: 15_000,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while opening ${url}`)
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    const html = await response.text()
    const textContent = this.extractTextContent(html)
    const links = this.extractLinksFromHtml(html, finalUrl)
    const title = this.extractTitle(html) || finalUrl

    session.currentUrl = finalUrl
    session.title = this.clip(title, 240)
    session.textContent = this.clip(textContent, MAX_TEXT_CHARS)
    session.links = links
    session.updatedAt = new Date().toISOString()
    this.pushHistory(session, session.currentUrl)
    this.touch(session)

    const renderFallbackWarning = await this.tryUpgradeHttpSessionToPlaywright({
      session,
      targetUrl: session.currentUrl || url,
      contentType,
      html,
    })
    if (renderFallbackWarning) return renderFallbackWarning

    return 'HTTP mode parses static HTML and may miss client-rendered UI.'
  }

  private async tryUpgradeHttpSessionToPlaywright(input: {
    session: ComputerSessionState
    targetUrl: string
    contentType: string
    html: string
  }) {
    if (!this.shouldAttemptRenderedFallback(
      input.contentType,
      input.html,
      input.session.textContent,
      input.session.links.length,
    )) {
      return null
    }

    const runtime = await this.createPlaywrightSessionRuntime(input.session)
    if (!runtime) {
      return 'Detected likely client-rendered UI, but Playwright runtime is unavailable. Install playwright or start with mode="playwright".'
    }

    const previousMode = input.session.mode
    input.session.mode = 'playwright'
    input.session.runtime = runtime

    try {
      const warning = await this.navigatePlaywright(input.session, input.targetUrl)
      return ['Detected likely client-rendered UI and auto-switched from HTTP to Playwright mode.', warning]
        .filter(Boolean)
        .join(' | ')
    } catch (error: any) {
      await this.closeSessionRuntime(input.session).catch(() => {})
      input.session.mode = previousMode
      return `Detected likely client-rendered UI, but Playwright render failed (${error?.message ?? 'unknown error'}). Using static HTTP snapshot.`
    }
  }

  private shouldAttemptRenderedFallback(
    contentType: string,
    html: string,
    textContent: string,
    linkCount: number,
  ) {
    if (!this.readBooleanEnv('COMPUTER_USE_HTTP_RENDER_FALLBACK', true)) return false
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return false

    const hasJsRequirement = /enable javascript|turn on javascript|javascript is required|requires javascript/i.test(html)
    const hasSpaShellHints = /id\s*=\s*["']?(?:root|app|__next|__nuxt|svelte|astro)/i.test(html)
      || /data-reactroot|ng-version|window\.__next_data__|__nuxt/i.test(html)
      || /<script[^>]+(?:type\s*=\s*["']module["']|src=)/i.test(html)

    const sparseStaticSnapshot = textContent.length < HTTP_RENDER_MIN_TEXT_CHARS
      || linkCount < HTTP_RENDER_MIN_LINKS
    return hasJsRequirement || (hasSpaShellHints && sparseStaticSnapshot)
  }

  private async navigatePlaywright(
    session: ComputerSessionState,
    url: string,
    options: PlaywrightNavigateOptions = {},
  ) {
    const page = session.runtime?.page
    if (!page) {
      throw new Error('Playwright session runtime is missing.')
    }

    const warnings: string[] = []
    const navTimeoutMs = this.readNumberEnv(
      'COMPUTER_USE_PLAYWRIGHT_NAV_TIMEOUT_MS',
      DEFAULT_PLAYWRIGHT_NAV_TIMEOUT_MS,
      2_000,
      120_000,
    )
    const waitUntil = this.readPlaywrightWaitUntilEnv()
    await page.goto(url, {
      waitUntil,
      timeout: navTimeoutMs,
    })

    const networkIdleTimeoutMs = this.readNumberEnv(
      'COMPUTER_USE_PLAYWRIGHT_NETWORK_IDLE_TIMEOUT_MS',
      DEFAULT_PLAYWRIGHT_NETWORK_IDLE_TIMEOUT_MS,
      0,
      30_000,
    )
    if (networkIdleTimeoutMs > 0) {
      try {
        await page.waitForLoadState('networkidle', { timeout: networkIdleTimeoutMs })
      } catch {
        warnings.push(`Network idle not reached within ${networkIdleTimeoutMs}ms.`)
      }
    }

    const waitForSelector = options.waitForSelector?.trim()
      || this.readStringEnv('COMPUTER_USE_PLAYWRIGHT_WAIT_FOR_SELECTOR')
    const selectorTimeoutMs = this.normalizeTimeoutMs(
      options.waitForSelectorTimeoutMs,
      'COMPUTER_USE_PLAYWRIGHT_WAIT_FOR_SELECTOR_TIMEOUT_MS',
      DEFAULT_PLAYWRIGHT_SELECTOR_TIMEOUT_MS,
      250,
      60_000,
    )
    const selectorWarning = waitForSelector
      ? await this.waitForSelectorWithRetry(page, waitForSelector, selectorTimeoutMs)
      : await this.autoWaitForVisibleContent(page)
    if (selectorWarning) warnings.push(selectorWarning)

    const settleWarning = await this.waitForPageSettled(page)
    if (settleWarning) warnings.push(settleWarning)

    const stateWarning = await this.refreshPlaywrightState(session)
    if (stateWarning) warnings.push(stateWarning)

    return warnings.length ? warnings.join(' | ') : null
  }

  private async waitForSelectorWithRetry(page: any, selector: string, totalTimeoutMs: number) {
    const retries = this.readNumberEnv(
      'COMPUTER_USE_PLAYWRIGHT_SELECTOR_RETRY_COUNT',
      DEFAULT_PLAYWRIGHT_SELECTOR_RETRY_COUNT,
      1,
      10,
    )
    const retryDelayMs = this.readNumberEnv(
      'COMPUTER_USE_PLAYWRIGHT_SELECTOR_RETRY_DELAY_MS',
      DEFAULT_PLAYWRIGHT_SELECTOR_RETRY_DELAY_MS,
      25,
      5_000,
    )
    const perAttemptTimeoutMs = Math.max(150, Math.floor(totalTimeoutMs / retries))

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        await page.waitForSelector(selector, {
          state: 'visible',
          timeout: perAttemptTimeoutMs,
        })
        return null
      } catch {
        if (attempt < retries) {
          await page.waitForTimeout(retryDelayMs)
        }
      }
    }

    return `Selector retry exhausted: "${this.clip(selector, 120)}" was not visible within ${totalTimeoutMs}ms.`
  }

  private async autoWaitForVisibleContent(page: any) {
    const retries = this.readNumberEnv(
      'COMPUTER_USE_PLAYWRIGHT_SELECTOR_RETRY_COUNT',
      DEFAULT_PLAYWRIGHT_SELECTOR_RETRY_COUNT,
      1,
      10,
    )
    const retryDelayMs = this.readNumberEnv(
      'COMPUTER_USE_PLAYWRIGHT_SELECTOR_RETRY_DELAY_MS',
      DEFAULT_PLAYWRIGHT_SELECTOR_RETRY_DELAY_MS,
      25,
      5_000,
    )
    const selectors = [
      'main',
      '[role="main"]',
      'article',
      'form',
      'button',
      'a[href]',
      'input',
      '[data-testid]',
    ]

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const found = await page.evaluate((candidateSelectors: string[]) => {
          const doc = (globalThis as any).document as any
          return candidateSelectors.some((selector) => Boolean(doc?.querySelector?.(selector)))
        }, selectors)
        if (found) return null
      } catch {
        return 'Auto-wait selector probe failed; proceeding with current DOM.'
      }

      if (attempt < retries) {
        await page.waitForTimeout(retryDelayMs)
      }
    }

    return 'Auto-wait did not detect common interactive content selectors; proceeding with best-effort snapshot.'
  }

  private async waitForPageSettled(page: any) {
    const timeoutMs = this.readNumberEnv(
      'COMPUTER_USE_PLAYWRIGHT_SETTLE_TIMEOUT_MS',
      DEFAULT_PLAYWRIGHT_SETTLE_TIMEOUT_MS,
      300,
      60_000,
    )
    const stableWindowMs = this.readNumberEnv(
      'COMPUTER_USE_PLAYWRIGHT_SETTLE_STABLE_MS',
      DEFAULT_PLAYWRIGHT_SETTLE_STABLE_MS,
      150,
      20_000,
    )
    const pollMs = this.readNumberEnv(
      'COMPUTER_USE_PLAYWRIGHT_SETTLE_POLL_MS',
      DEFAULT_PLAYWRIGHT_SETTLE_POLL_MS,
      40,
      2_000,
    )

    const deadline = Date.now() + timeoutMs
    let stableSince = 0
    let lastFingerprint = ''

    while (Date.now() <= deadline) {
      let snapshot: {
        readyState: string
        textLen: number
        linkCount: number
        nodeCount: number
        busy: boolean
      }
      try {
        snapshot = await page.evaluate(() => {
          const doc = (globalThis as any).document as any
          const text = typeof doc?.body?.innerText === 'string'
            ? doc.body.innerText
            : typeof doc?.documentElement?.innerText === 'string'
              ? doc.documentElement.innerText
              : ''
          return {
            readyState: typeof doc?.readyState === 'string' ? doc.readyState : 'unknown',
            textLen: text.length,
            linkCount: Number(doc?.querySelectorAll?.('a[href]')?.length ?? 0),
            nodeCount: Number(doc?.getElementsByTagName?.('*')?.length ?? 0),
            busy: Boolean(doc?.querySelector?.('[aria-busy="true"], [data-loading="true"], [data-busy="true"]')),
          }
        })
      } catch {
        return 'Page settle check failed while probing DOM; continuing with best-effort snapshot.'
      }

      const fingerprint = [
        snapshot.readyState,
        Math.round(snapshot.textLen / 30),
        Math.round(snapshot.linkCount / 2),
        Math.round(snapshot.nodeCount / 20),
        snapshot.busy ? 'busy' : 'idle',
      ].join('|')

      const ready = snapshot.readyState === 'interactive' || snapshot.readyState === 'complete'
      const stable = fingerprint === lastFingerprint && ready && !snapshot.busy
      if (stable) {
        if (!stableSince) stableSince = Date.now()
        if (Date.now() - stableSince >= stableWindowMs) {
          return null
        }
      } else {
        stableSince = 0
      }

      lastFingerprint = fingerprint
      await page.waitForTimeout(pollMs)
    }

    return `Page settle check timed out after ${timeoutMs}ms; snapshot may still be mid-render.`
  }

  private normalizeTimeoutMs(
    raw: number | undefined,
    envName: string,
    fallback: number,
    min: number,
    max: number,
  ) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return Math.max(min, Math.min(Math.floor(raw), max))
    }
    return this.readNumberEnv(envName, fallback, min, max)
  }

  private readPlaywrightWaitUntilEnv(): PlaywrightWaitUntil {
    const raw = this.readStringEnv('COMPUTER_USE_PLAYWRIGHT_WAIT_UNTIL')
    if (raw === 'load' || raw === 'networkidle' || raw === 'commit' || raw === 'domcontentloaded') {
      return raw
    }
    return DEFAULT_PLAYWRIGHT_WAIT_UNTIL
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

  private noteNetworkWarning(session: ComputerSessionState, warning: string) {
    const normalized = warning.trim()
    if (!normalized) return
    session.networkWarning = session.networkWarning && session.networkWarning !== normalized
      ? `${session.networkWarning} | ${normalized}`
      : normalized
  }

  private takeNetworkWarning(session: ComputerSessionState) {
    const warning = session.networkWarning
    session.networkWarning = null
    return warning
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
    return this.readBooleanEnv('COMPUTER_USE_PLAYWRIGHT_HEADLESS', true)
  }

  private async createPlaywrightSessionRuntime(session: ComputerSessionState): Promise<PlaywrightSessionRuntime | null> {
    const browser = await this.ensurePlaywrightBrowser()
    if (!browser) return null
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: 'OpenAgents-Computer/1.0',
    })
    const page = await context.newPage()
    await page.route('**/*', async (route: any) => {
      const requestUrl = typeof route.request === 'function'
        ? route.request()?.url?.() ?? ''
        : ''
      const blockReason = await this.outboundGuard.getBrowserRequestBlockReason(requestUrl)
      if (blockReason) {
        this.noteNetworkWarning(session, blockReason)
        try {
          await route.abort('blockedbyclient')
        } catch {
          await route.abort().catch(() => {})
        }
        return
      }

      await route.continue()
    })
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

  private readStringEnv(name: string) {
    const raw = process.env[name]
    if (typeof raw !== 'string') return ''
    return raw.trim()
  }

  private readBooleanEnv(name: string, fallback: boolean) {
    const raw = process.env[name]
    if (raw == null) return fallback
    const normalized = raw.trim().toLowerCase()
    return normalized !== 'false' && normalized !== '0' && normalized !== 'no'
  }
}
