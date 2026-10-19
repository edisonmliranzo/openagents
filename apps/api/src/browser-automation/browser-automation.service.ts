import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export type BrowserActionType = 'navigate' | 'click' | 'type' | 'scroll' | 'extract' | 'upload' | 'press'

export interface BrowserAction {
  type: BrowserActionType
  selector?: string
  value?: string
  url?: string
}

export interface BrowserActionLogEntry {
  id: string
  at: string
  action: BrowserAction
  status: 'executed' | 'failed' | 'needs_approval' | 'approved' | 'denied'
  detail?: string
}

export interface PendingBrowserAction {
  id: string
  action: BrowserAction
  reason: string
  createdAt: string
}

export interface BrowserSession {
  id: string
  userId: string
  url: string
  status: 'initializing' | 'active' | 'closed' | 'error'
  lastScreenshot?: string // data URL
  domSnapshot?: string
  createdAt: string
}

export interface BrowserFrame {
  sessionId: string
  url: string
  status: BrowserSession['status']
  screenshot: string | null
  log: BrowserActionLogEntry[]
  pending: PendingBrowserAction[]
  at: string
}

export type BrowserActionResult =
  | { status: 'ok'; success: true; result?: unknown }
  | { status: 'error'; success: false; result?: unknown }
  | { status: 'needs_approval'; success: false; pendingActionId: string; reason: string }

interface LiveSession {
  state: BrowserSession
  context: any
  page: any
  log: BrowserActionLogEntry[]
  pending: Map<string, PendingBrowserAction>
}

const RISKY_KEYWORDS = /\b(buy|purchase|checkout|check out|pay|payment|place order|order now|subscribe|confirm order|submit)\b/i
const MAX_LOG = 200

/**
 * Real headless-browser sessions backed by Playwright. Sessions keep a live
 * page so the UI can stream frames and watch the agent work. Risky actions
 * are parked as pending until a human approves them.
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

  // ── SSRF protection ────────────────────────────────────────────────────
  private isPrivateAddress(ip: string): boolean {
    const v = ip.toLowerCase().replace(/^\[|\]$/g, '')
    if (v.startsWith('::ffff:')) return this.isPrivateAddress(v.slice(7))
    if (isIP(v) === 4) {
      const [a, b] = v.split('.').map(Number)
      return (
        a === 0 || a === 10 || a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)) ||
        a >= 224
      )
    }
    if (isIP(v) === 6) {
      return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('ff')
    }
    return true
  }

  async assertSafeUrl(raw: string): Promise<string> {
    let parsed: URL
    try {
      parsed = new URL(String(raw ?? '').trim())
    } catch {
      throw new BadRequestException('Invalid URL')
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new BadRequestException('Only http(s) URLs are allowed')
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (
      !host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.endsWith('.internal') || host === 'metadata.google.internal' || host === 'metadata'
    ) {
      throw new ForbiddenException('Navigation to internal hosts is blocked')
    }
    if (isIP(host)) {
      if (this.isPrivateAddress(host)) throw new ForbiddenException('Navigation to private addresses is blocked')
      return parsed.toString()
    }
    let addrs: { address: string }[] = []
    try {
      addrs = await lookup(host, { all: true })
    } catch {
      throw new BadRequestException(`Could not resolve host ${host}`)
    }
    if (!addrs.length || addrs.some((a) => this.isPrivateAddress(a.address))) {
      throw new ForbiddenException('Navigation to private addresses is blocked')
    }
    return parsed.toString()
  }

  /** Block sub-requests (redirects, iframes, fetches) to private hosts too. */
  private async installRequestGuard(context: any) {
    await context.route('**/*', async (route: any) => {
      try {
        const url = route.request().url()
        if (/^(data|blob|about):/i.test(url)) return route.continue()
        await this.assertSafeUrl(url)
        return route.continue()
      } catch {
        return route.abort('blockedbyclient')
      }
    })
  }

  // ── Sessions ───────────────────────────────────────────────────────────
  async startSession(url: string, userId = ''): Promise<BrowserSession> {
    const safeUrl = await this.assertSafeUrl(url)
    const session: BrowserSession = {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId,
      url: safeUrl,
      status: 'initializing',
      createdAt: new Date().toISOString(),
    }
    const live: LiveSession = { state: session, context: null, page: null, log: [], pending: new Map() }
    this.sessions.set(session.id, live)

    const browser = await this.ensureBrowser()
    if (!browser) {
      session.status = 'error'
      throw new Error('Playwright is not installed on this server. Run: npx playwright install chromium')
    }

    try {
      live.context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
      await this.installRequestGuard(live.context)
      live.page = await live.context.newPage()
      await live.page.goto(safeUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      session.status = 'active'
      this.pushLog(live, { type: 'navigate', url: safeUrl }, 'executed')
      this.logger.log(`Browser session ${session.id} opened ${safeUrl}`)
      await this.captureState(session.id).catch(() => undefined)
    } catch (error: any) {
      session.status = 'error'
      throw new Error(`Failed to open ${safeUrl}: ${error?.message ?? error}`)
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

  /** Throws unless the session exists and belongs to the user (when userId is given). */
  assertOwner(id: string, userId?: string): void {
    const live = this.sessions.get(id)
    if (!live) throw new NotFoundException('Browser session not found')
    if (userId && live.state.userId && live.state.userId !== userId) throw new NotFoundException('Browser session not found')
  }

  private pushLog(live: LiveSession, action: BrowserAction, status: BrowserActionLogEntry['status'], detail?: string, id?: string) {
    live.log.push({
      id: id ?? `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      action,
      status,
      detail,
    })
    if (live.log.length > MAX_LOG) live.log.splice(0, live.log.length - MAX_LOG)
  }

  /** Decide whether an action needs human approval. Returns a reason or null. */
  private async riskReason(live: LiveSession, action: BrowserAction): Promise<string | null> {
    if (action.type === 'upload') return 'File upload'
    if (action.type === 'press' && /enter/i.test(action.value ?? '')) return 'Pressing Enter may submit a form'
    if (!action.selector || !live.page) {
      if (action.selector && RISKY_KEYWORDS.test(action.selector)) return 'Selector looks like a purchase/submit control'
      return null
    }
    if (RISKY_KEYWORDS.test(action.selector)) return 'Selector looks like a purchase/submit control'
    try {
      const info = await live.page.$eval(
        action.selector,
        (el: any) => ({
          tag: String(el.tagName || '').toLowerCase(),
          type: String(el.getAttribute('type') || '').toLowerCase(),
          text: String(el.innerText || el.value || el.getAttribute('aria-label') || '').slice(0, 200),
          inForm: !!el.closest('form'),
          autocomplete: String(el.getAttribute('autocomplete') || '').toLowerCase(),
        }),
      )
      if (action.type === 'type') {
        if (info.type === 'password' || info.autocomplete.includes('password')) return 'Typing into a password field'
        if (/cc-|card/.test(info.autocomplete)) return 'Typing payment card details'
        if (info.type === 'file') return 'File upload'
      }
      if (action.type === 'click') {
        if (info.type === 'file') return 'File upload'
        if (info.type === 'submit' || (info.tag === 'button' && info.inForm && info.type !== 'button' && info.type !== 'reset')) {
          return 'Form submission'
        }
        if (RISKY_KEYWORDS.test(info.text)) return `Risky control: "${info.text.trim().slice(0, 60)}"`
      }
    } catch {
      // element not resolvable — let the action fail naturally
    }
    return null
  }

  async executeAction(sessionId: string, action: BrowserAction, opts: { approved?: boolean } = {}): Promise<BrowserActionResult> {
    const live = this.sessions.get(sessionId)
    if (!live || live.state.status !== 'active') throw new Error('Session not active')
    if (!action || typeof action.type !== 'string') throw new BadRequestException('Action type is required')

    if (!opts.approved) {
      const reason = await this.riskReason(live, action)
      if (reason) {
        const pending: PendingBrowserAction = {
          id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          action,
          reason,
          createdAt: new Date().toISOString(),
        }
        live.pending.set(pending.id, pending)
        this.pushLog(live, action, 'needs_approval', reason, pending.id)
        return { status: 'needs_approval', success: false, pendingActionId: pending.id, reason }
      }
    }

    try {
      let result: unknown
      if (action.type === 'navigate') {
        const safe = await this.assertSafeUrl(action.url ?? action.value ?? '')
        await live.page.goto(safe, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      } else if (action.type === 'click' && action.selector) {
        await live.page.click(action.selector, { timeout: 10_000 })
      } else if (action.type === 'type' && action.selector) {
        await live.page.fill(action.selector, action.value ?? '', { timeout: 10_000 })
      } else if (action.type === 'press') {
        await live.page.keyboard.press(action.value || 'Enter')
      } else if (action.type === 'scroll') {
        await live.page.mouse.wheel(0, Number(action.value ?? 600))
      } else if (action.type === 'upload') {
        throw new Error('File uploads are not supported from the server sandbox')
      } else if (action.type === 'extract') {
        const text = action.selector
          ? await live.page.$eval(action.selector, (el: any) => el.textContent ?? '')
          : await live.page.content()
        result = String(text).slice(0, 8000)
      } else {
        this.pushLog(live, action, 'failed', 'Unsupported action')
        return { status: 'error', success: false, result: `Unsupported action "${action.type}"` }
      }
      const redacted = action.type === 'type' && opts.approved ? { ...action, value: '••••' } : action
      this.pushLog(live, redacted, 'executed')
      await this.captureState(sessionId).catch(() => undefined)
      return {
        status: 'ok',
        success: true,
        result: result ?? `${action.type} executed${action.selector ? ` on ${action.selector}` : ''}`,
      }
    } catch (error: any) {
      const message = error?.message ?? 'Action failed'
      this.pushLog(live, action, 'failed', message)
      return { status: 'error', success: false, result: message }
    }
  }

  async resolvePending(sessionId: string, pendingId: string, decision: 'approve' | 'deny'): Promise<BrowserActionResult | { status: 'denied' }> {
    const live = this.sessions.get(sessionId)
    if (!live) throw new NotFoundException('Browser session not found')
    const pending = live.pending.get(pendingId)
    if (!pending) throw new NotFoundException('Pending action not found')
    live.pending.delete(pendingId)
    if (decision === 'deny') {
      this.pushLog(live, pending.action, 'denied', pending.reason)
      return { status: 'denied' }
    }
    this.pushLog(live, pending.action.type === 'type' ? { ...pending.action, value: '••••' } : pending.action, 'approved', pending.reason)
    return this.executeAction(sessionId, pending.action, { approved: true })
  }

  listPending(sessionId: string): PendingBrowserAction[] {
    return [...(this.sessions.get(sessionId)?.pending.values() ?? [])]
  }

  getLog(sessionId: string): BrowserActionLogEntry[] {
    return (this.sessions.get(sessionId)?.log ?? []).map((entry) =>
      entry.action.type === 'type' && /password/i.test(entry.detail ?? '') ? { ...entry, action: { ...entry.action, value: '••••' } } : entry,
    )
  }

  /** Snapshot used by the SSE stream. Captures a fresh screenshot when active. */
  async frame(sessionId: string): Promise<BrowserFrame | null> {
    const live = this.sessions.get(sessionId)
    if (!live) return null
    const shot = live.state.status === 'active' ? await this.captureState(sessionId) : null
    return {
      sessionId,
      url: live.state.url,
      status: live.state.status,
      screenshot: shot?.screenshot ?? live.state.lastScreenshot ?? null,
      log: this.getLog(sessionId).slice(-50),
      pending: this.listPending(sessionId),
      at: new Date().toISOString(),
    }
  }

  /** Capture the current screenshot + URL so the UI can watch live. */
  async captureState(sessionId: string): Promise<{ screenshot: string | null; dom: string; url: string }> {
    const live = this.sessions.get(sessionId)
    if (!live?.page) return { screenshot: null, dom: '', url: live?.state.url ?? '' }

    try {
      const screenshot = await live.page.screenshot({ type: 'jpeg', quality: 50 }) as Buffer
      const dataUrl = `data:image/jpeg;base64,${screenshot.toString('base64')}`
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
