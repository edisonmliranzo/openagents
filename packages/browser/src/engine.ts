export interface BrowserConfig {
  headless?: boolean
  viewport?: { width: number; height: number }
  userAgent?: string
}

export interface NavigateInput {
  url: string
  waitFor?: string
  timeout?: number
}

export interface ClickInput {
  selector: string
  waitFor?: string
}

export interface TypeInput {
  selector: string
  text: string
  delay?: number
}

export interface ExtractInput {
  selector: string
  attribute?: string
}

export interface ScreenshotInput {
  fullPage?: boolean
  format?: 'png' | 'jpeg'
  quality?: number
}

export type ElementHandle = unknown

export class BrowserAutomation {
  private browser: unknown | null = null
  private page: unknown | null = null
  private config: BrowserConfig

  constructor(config: BrowserConfig = {}) {
    this.config = {
      headless: true,
      viewport: { width: 1280, height: 720 },
      ...config,
    }
  }

  async initialize(): Promise<void> {
    const playwright = await import('playwright')
    this.browser = await playwright.chromium.launch({
      headless: this.config.headless,
    })
    const context = await this.browser.newContext({
      viewport: this.config.viewport,
      userAgent: this.config.userAgent,
    })
    this.page = await context.newPage()
  }

  async navigate(input: NavigateInput): Promise<{ success: boolean; error?: string }> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' }
    }

    try {
      await (this.page as { goto: (url: string) => Promise<void> }).goto(input.url)

      if (input.waitFor) {
        await (this.page as { waitForSelector: (s: string) => Promise<void> }).waitForSelector(
          input.waitFor,
          { timeout: input.timeout || 30000 },
        )
      }

      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Navigation failed',
      }
    }
  }

  async click(input: ClickInput): Promise<{ success: boolean; error?: string }> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' }
    }

    try {
      await (this.page as { click: (s: string) => Promise<void> }).click(input.selector)

      if (input.waitFor) {
        await (this.page as { waitForSelector: (s: string) => Promise<void> }).waitForSelector(
          input.waitFor,
        )
      }

      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Click failed',
      }
    }
  }

  async type(input: TypeInput): Promise<{ success: boolean; error?: string }> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' }
    }

    try {
      await (this.page as { fill: (s: string, t: string) => Promise<void> }).fill(
        input.selector,
        input.text,
      )
      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Type failed',
      }
    }
  }

  async extract(
    input: ExtractInput,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' }
    }

    try {
      const element = await (
        this.page as { waitForSelector: (s: string) => Promise<unknown> }
      ).waitForSelector(input.selector)

      let data: unknown

      if (input.attribute) {
        data = await (element as { getAttribute: (a: string) => Promise<string> }).getAttribute(
          input.attribute,
        )
      } else {
        data = await (element as { textContent: () => Promise<string> }).textContent()
      }

      return { success: true, data }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Extract failed',
      }
    }
  }

  async screenshot(
    input: ScreenshotInput,
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' }
    }

    try {
      const data = await (
        this.page as { screenshot: (options: unknown) => Promise<string> }
      ).screenshot({
        fullPage: input.fullPage,
        type: input.format || 'png',
        quality: input.quality,
      })

      return { success: true, data }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Screenshot failed',
      }
    }
  }

  async evaluate<T>(fn: () => T): Promise<{ success: boolean; result?: T; error?: string }> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' }
    }

    try {
      const result = await (this.page as { evaluate: (fn: () => T) => Promise<T> }).evaluate(fn)
      return { success: true, result }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Evaluate failed',
      }
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await (this.browser as { close: () => Promise<void> }).close()
    }
    this.browser = null
    this.page = null
  }
}

export function createBrowser(config?: BrowserConfig): BrowserAutomation {
  return new BrowserAutomation(config)
}
