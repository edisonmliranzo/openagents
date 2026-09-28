import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

export interface BrowserSession {
  id: string
  userId: string
  url: string
  status: 'initializing' | 'active' | 'closed' | 'error'
  lastScreenshot?: string // data URL
  domSnapshot?: string
  createdAt: string
}

interface LiveSession {
  state: BrowserSession
  context: any
  page: any
}

/**
 * Real headless-browser sessions backed by Playwright. Sessions keep a live
 * page so the UI can poll captureState() and watch the agent work.
 */
@Injectable()
export class BrowserAutomationService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserAutomationService.name)
  private readonly sessions = new Map<string, LiveSession>()
  private browserPromise: Promise<any> | null = null

  constructor(private readonly config: ConfigService) {}

  private get headless(): boolean {
    const raw = (this.config.get<string>('COMPUTER_USE_PLAYWRIGHT_HEADLESS') ?? 'true').trim().toLowerCase()
    return !['0', 'false', 'no', 'off'].includes(raw)
  }

  private async ensureBrowser(): Promise<any | null> {
    if (!this.browserPromise) {
      this.browserPromise = (async () => {
        try {
          const { chromium } = await import('playwright')
          return await chromium.launch({ headless: this.headless })
        } catch (error: any) {
          this.logger.warn(`Playwright unavailable: ${error?.message ?? error}`)
          return null
        }
      })()
    }
    return this.browserPromise
  }

  async startSession(url: string, userId = ''): Promise<BrowserSession> {
    const session: BrowserSession = {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId,
      url,
      status: 'initializing',
      createdAt: new Date().toISOString(),
    }
    const live: LiveSession = { state: session, context: null, page: null }
    this.sessions.set(session.id, live)

    const browser = await this.ensureBrowser()
    if (!browser) {
      session.status = 'error'
      throw new Error('Playwright is not installed on this server. Run: npx playwright install chromium')
    }

    try {
      live.context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
      live.page = await live.context.newPage()
      await live.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      session.status = 'active'
      this.logger.log(`Browser session ${session.id} opened ${url}`)
      await this.captureState(session.id).catch(() => undefined)
    } catch (error: any) {
      session.status = 'error'
      throw new Error(`Failed to open ${url}: ${error?.message ?? error}`)
    }
    return session
  }

  listSessions(userId?: string): BrowserSession[] {
    return [...this.sessions.values()]
      .map((live) => live.state)
      .filter((state) => (!userId || state.userId === userId) && state.status !== 'closed')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  getSession(id: string): BrowserSession | null {
    return this.sessions.get(id)?.state ?? null
  }

  async executeAction(
    sessionId: string,
    action: { type: 'click' | 'type' | 'scroll' | 'extract'; selector?: string; value?: string },
  ): Promise<{ success: boolean; result?: unknown }> {
    const live = this.sessions.get(sessionId)
    if (!live || live.state.status !== 'active') throw new Error('Session not active')

    try {
      if (action.type === 'click' && action.selector) {
        await live.page.click(action.selector, { timeout: 10_000 })
      } else if (action.type === 'type' && action.selector) {
        await live.page.fill(action.selector, action.value ?? '', { timeout: 10_000 })
      } else if (action.type === 'scroll') {
        await live.page.mouse.wheel(0, Number(action.value ?? 600))
      } else if (action.type === 'extract') {
        const text = action.selector
          ? await live.page.$eval(action.selector, (el: any) => el.textContent ?? '')
          : await live.page.content()
        return { success: true, result: String(text).slice(0, 8000) }
      } else {
        return { success: false, result: `Unsupported action "${action.type}"` }
      }
      await this.captureState(sessionId).catch(() => undefined)
      return { success: true, result: `${action.type} executed${action.selector ? ` on ${action.selector}` : ''}` }
    } catch (error: any) {
      return { success: false, result: error?.message ?? 'Action failed' }
    }
  }

  /** Capture the current screenshot + URL so the UI can watch live. */
  async captureState(sessionId: string): Promise<{ screenshot: string | null; dom: string; url: string }> {
    const live = this.sessions.get(sessionId)
    if (!live?.page) return { screenshot: null, dom: '', url: live?.state.url ?? '' }

    try {
      const screenshot = await live.page.screenshot({ type: 'jpeg', quality: 50 }) as Buffer
      const dataUrl = `data:image/jpeg;base64:${screenshot.toString('base64')}`
      const url = live.page.url()
      live.state.lastScreenshot = dataUrl
      live.state.url = url
      live.state.domSnapshot = undefined
      return { screenshot: dataUrl, dom: '', url }
    } catch (error: any) {
      this.logger.warn(`Screenshot capture failed for ${sessionId}: ${error?.message ?? error}`)
      return { screenshot: live.state.lastScreenshot ?? null, dom: '', url: live.state.url }
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const live = this.sessions.get(sessionId)
    if (!live) return
    await live.context?.close().catch(() => undefined)
    live.state.status = 'closed'
    this.sessions.delete(sessionId)
  }

  async onModuleDestroy() {
    await Promise.allSettled([...this.sessions.keys()].map((id) => this.closeSession(id)))
    const browser = await this.browserPromise?.catch(() => null)
    await browser?.close().catch(() => undefined)
  }
}
