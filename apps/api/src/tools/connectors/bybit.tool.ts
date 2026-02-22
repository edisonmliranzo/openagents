import { Injectable } from '@nestjs/common'
import { createHmac } from 'node:crypto'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

type BybitCategory = 'linear' | 'inverse' | 'spot' | 'option'
type BybitOrderSide = 'Buy' | 'Sell'
type BybitOrderType = 'Market' | 'Limit'

interface BybitEnvelope<T = unknown> {
  retCode?: number
  retMsg?: string
  result?: T
  time?: number
}

@Injectable()
export class BybitTool {
  get tickerDef(): ToolDefinition {
    return {
      name: 'bybit_get_ticker',
      displayName: 'Bybit Ticker',
      description: 'Fetch current Bybit market ticker data for a symbol.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Market symbol, e.g. BTCUSDT' },
          category: { type: 'string', description: 'Market category: linear, inverse, spot, option' },
        },
        required: ['symbol'],
      },
    }
  }

  get positionsDef(): ToolDefinition {
    return {
      name: 'bybit_get_positions',
      displayName: 'Bybit Positions',
      description: 'Fetch account positions from Bybit (private API).',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Category: linear, inverse, option (default linear)' },
          symbol: { type: 'string', description: 'Optional symbol filter, e.g. BTCUSDT' },
          settleCoin: { type: 'string', description: 'Optional settle coin, e.g. USDT' },
        },
      },
    }
  }

  get walletBalanceDef(): ToolDefinition {
    return {
      name: 'bybit_get_wallet_balance',
      displayName: 'Bybit Wallet Balance',
      description: 'Fetch Bybit wallet balance for unified account (private API).',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          accountType: { type: 'string', description: 'Account type (default UNIFIED)' },
          coin: { type: 'string', description: 'Optional coin filter, e.g. USDT' },
        },
      },
    }
  }

  get placeDemoOrderDef(): ToolDefinition {
    return {
      name: 'bybit_place_demo_order',
      displayName: 'Bybit Place Demo Order',
      description: 'Place an order through Bybit private API. Requires demo/testnet endpoint when BYBIT_DEMO_ONLY=true.',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Market symbol, e.g. BTCUSDT' },
          side: { type: 'string', description: 'Order side: Buy or Sell' },
          qty: { type: 'string', description: 'Order quantity' },
          orderType: { type: 'string', description: 'Order type: Market or Limit (default Market)' },
          price: { type: 'string', description: 'Limit price (required when orderType=Limit)' },
          category: { type: 'string', description: 'Category: linear, inverse, spot, option (default linear)' },
          timeInForce: { type: 'string', description: 'Optional TIF, e.g. GTC, IOC, FOK' },
          reduceOnly: { type: 'boolean', description: 'Optional reduce-only flag' },
          takeProfit: { type: 'string', description: 'Optional take-profit price' },
          stopLoss: { type: 'string', description: 'Optional stop-loss price' },
        },
        required: ['symbol', 'side', 'qty'],
      },
    }
  }

  async getTicker(input: { symbol: string; category?: string }, _userId: string): Promise<ToolResult> {
    const symbol = this.normalizeSymbol(input.symbol)
    if (!symbol) return { success: false, output: null, error: 'symbol is required.' }
    const category = this.normalizeCategory(input.category)

    const query = this.buildQuery({
      category,
      symbol,
    })

    const endpoint = `${this.resolvePublicBaseUrl()}/v5/market/tickers?${query}`
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) {
        return { success: false, output: null, error: `Bybit ticker request failed with status ${response.status}.` }
      }

      const payload = await response.json() as BybitEnvelope<{ category?: string; list?: Array<Record<string, unknown>> }>
      if ((payload.retCode ?? -1) !== 0) {
        return {
          success: false,
          output: null,
          error: `Bybit ticker error ${payload.retCode}: ${payload.retMsg ?? 'unknown error'}`,
        }
      }

      const list = Array.isArray(payload.result?.list) ? payload.result?.list : []
      const ticker = list[0] ?? null
      if (!ticker) {
        return {
          success: false,
          output: null,
          error: `No ticker data returned for ${symbol} (${category}).`,
        }
      }

      return {
        success: true,
        output: {
          exchange: 'bybit',
          symbol,
          category,
          baseUrl: this.resolvePublicBaseUrl(),
          ticker,
          serverTime: payload.time ?? null,
        },
      }
    } catch (error: any) {
      return { success: false, output: null, error: error?.message ?? 'Bybit ticker request failed.' }
    }
  }

  async getPositions(
    input: { category?: string; symbol?: string; settleCoin?: string },
    _userId: string,
  ): Promise<ToolResult> {
    const category = this.normalizeCategory(input.category)
    const symbol = this.normalizeOptionalSymbol(input.symbol)
    const settleCoin = this.normalizeOptionalToken(input.settleCoin)
    return this.privateGet('/v5/position/list', {
      category,
      ...(symbol ? { symbol } : {}),
      ...(settleCoin ? { settleCoin } : {}),
    })
  }

  async getWalletBalance(input: { accountType?: string; coin?: string }, _userId: string): Promise<ToolResult> {
    const accountType = this.normalizeAccountType(input.accountType)
    const coin = this.normalizeOptionalToken(input.coin)
    return this.privateGet('/v5/account/wallet-balance', {
      accountType,
      ...(coin ? { coin } : {}),
    })
  }

  async placeDemoOrder(
    input: {
      symbol: string
      side: string
      qty: string
      orderType?: string
      price?: string
      category?: string
      timeInForce?: string
      reduceOnly?: boolean
      takeProfit?: string
      stopLoss?: string
    },
    _userId: string,
  ): Promise<ToolResult> {
    const symbol = this.normalizeSymbol(input.symbol)
    if (!symbol) return { success: false, output: null, error: 'symbol is required.' }

    const side = this.normalizeOrderSide(input.side)
    if (!side) return { success: false, output: null, error: 'side must be Buy or Sell.' }

    const qty = this.normalizeRequiredNumberString(input.qty)
    if (!qty) return { success: false, output: null, error: 'qty must be a positive number.' }

    const category = this.normalizeCategory(input.category)
    const orderType = this.normalizeOrderType(input.orderType)
    const price = this.normalizeOptionalNumberString(input.price)
    const reduceOnly = Boolean(input.reduceOnly)
    const timeInForce = this.normalizeOptionalToken(input.timeInForce, true)
    const takeProfit = this.normalizeOptionalNumberString(input.takeProfit)
    const stopLoss = this.normalizeOptionalNumberString(input.stopLoss)

    if (orderType === 'Limit' && !price) {
      return { success: false, output: null, error: 'price is required when orderType is Limit.' }
    }

    const body: Record<string, unknown> = {
      category,
      symbol,
      side,
      orderType,
      qty,
      reduceOnly,
    }
    if (price) body.price = price
    if (timeInForce) body.timeInForce = timeInForce
    if (takeProfit) body.takeProfit = takeProfit
    if (stopLoss) body.stopLoss = stopLoss

    return this.privatePost('/v5/order/create', body)
  }

  private async privateGet(path: string, query: Record<string, unknown>): Promise<ToolResult> {
    const config = this.getPrivateConfig()
    if (config.demoOnly && !this.isDemoLikeHost(config.baseUrl)) {
      return {
        success: false,
        output: null,
        error: `BYBIT_DEMO_ONLY is enabled, but BYBIT_BASE_URL is not a demo/testnet host (${config.baseUrl}).`,
      }
    }

    const queryString = this.buildQuery(query)
    const url = `${config.baseUrl}${path}?${queryString}`
    const timestamp = Date.now().toString()
    const prehash = `${timestamp}${config.apiKey}${config.recvWindow}${queryString}`
    const signature = this.sign(prehash, config.apiSecret)

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-BAPI-API-KEY': config.apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': config.recvWindow,
          'X-BAPI-SIGN': signature,
          'X-BAPI-SIGN-TYPE': '2',
        },
        signal: AbortSignal.timeout(15_000),
      })

      return this.parsePrivateResponse(response, {
        endpoint: path,
        baseUrl: config.baseUrl,
      })
    } catch (error: any) {
      return { success: false, output: null, error: error?.message ?? 'Bybit private request failed.' }
    }
  }

  private async privatePost(path: string, body: Record<string, unknown>): Promise<ToolResult> {
    const config = this.getPrivateConfig()
    if (config.demoOnly && !this.isDemoLikeHost(config.baseUrl)) {
      return {
        success: false,
        output: null,
        error: `BYBIT_DEMO_ONLY is enabled, but BYBIT_BASE_URL is not a demo/testnet host (${config.baseUrl}).`,
      }
    }

    const timestamp = Date.now().toString()
    const bodyString = JSON.stringify(body)
    const prehash = `${timestamp}${config.apiKey}${config.recvWindow}${bodyString}`
    const signature = this.sign(prehash, config.apiSecret)
    const url = `${config.baseUrl}${path}`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-BAPI-API-KEY': config.apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': config.recvWindow,
          'X-BAPI-SIGN': signature,
          'X-BAPI-SIGN-TYPE': '2',
        },
        body: bodyString,
        signal: AbortSignal.timeout(15_000),
      })

      return this.parsePrivateResponse(response, {
        endpoint: path,
        baseUrl: config.baseUrl,
      })
    } catch (error: any) {
      return { success: false, output: null, error: error?.message ?? 'Bybit private request failed.' }
    }
  }

  private async parsePrivateResponse(
    response: Response,
    metadata: { endpoint: string; baseUrl: string },
  ): Promise<ToolResult> {
    if (!response.ok) {
      return {
        success: false,
        output: null,
        error: `Bybit request failed with status ${response.status}.`,
      }
    }

    const payload = await response.json() as BybitEnvelope
    if ((payload.retCode ?? -1) !== 0) {
      return {
        success: false,
        output: null,
        error: `Bybit error ${payload.retCode}: ${payload.retMsg ?? 'unknown error'}`,
      }
    }

    return {
      success: true,
      output: {
        exchange: 'bybit',
        endpoint: metadata.endpoint,
        baseUrl: metadata.baseUrl,
        mode: this.isDemoLikeHost(metadata.baseUrl) ? 'demo-or-testnet' : 'mainnet',
        result: payload.result ?? null,
        serverTime: payload.time ?? null,
      },
    }
  }

  private getPrivateConfig() {
    const baseUrl = this.resolvePrivateBaseUrl()
    const apiKey = (process.env.BYBIT_API_KEY ?? '').trim()
    const apiSecret = (process.env.BYBIT_API_SECRET ?? '').trim()
    const recvWindow = `${this.readPositiveInt(process.env.BYBIT_RECV_WINDOW, 5000)}`
    const demoOnly = this.readBoolean(process.env.BYBIT_DEMO_ONLY, true)

    if (!apiKey) {
      throw new Error('BYBIT_API_KEY is not configured.')
    }
    if (!apiSecret) {
      throw new Error('BYBIT_API_SECRET is not configured.')
    }

    return { baseUrl, apiKey, apiSecret, recvWindow, demoOnly }
  }

  private resolvePrivateBaseUrl() {
    const raw = (process.env.BYBIT_BASE_URL ?? 'https://api-demo.bybit.com').trim()
    return raw.replace(/\/+$/, '')
  }

  private resolvePublicBaseUrl() {
    const raw = (
      process.env.BYBIT_PUBLIC_BASE_URL
      ?? process.env.BYBIT_BASE_URL
      ?? 'https://api.bybit.com'
    ).trim()
    return raw.replace(/\/+$/, '')
  }

  private isDemoLikeHost(baseUrl: string) {
    try {
      const host = new URL(baseUrl).hostname.toLowerCase()
      return host === 'api-demo.bybit.com' || host === 'api-testnet.bybit.com'
    } catch {
      return false
    }
  }

  private sign(payload: string, secret: string) {
    return createHmac('sha256', secret).update(payload).digest('hex')
  }

  private buildQuery(input: Record<string, unknown>) {
    const pairs = Object.entries(input)
      .filter((entry) => {
        const value = entry[1]
        return value !== undefined && value !== null && `${value}`.trim() !== ''
      })
      .map(([key, value]) => [key, `${value}`] as [string, string])
      .sort((a, b) => a[0].localeCompare(b[0]))
    return new URLSearchParams(pairs).toString()
  }

  private normalizeCategory(value: unknown): BybitCategory {
    const normalized = `${value ?? ''}`.trim().toLowerCase()
    if (normalized === 'linear' || normalized === 'inverse' || normalized === 'spot' || normalized === 'option') {
      return normalized
    }
    return 'linear'
  }

  private normalizeOrderSide(value: unknown): BybitOrderSide | null {
    const normalized = `${value ?? ''}`.trim().toLowerCase()
    if (normalized === 'buy') return 'Buy'
    if (normalized === 'sell') return 'Sell'
    return null
  }

  private normalizeOrderType(value: unknown): BybitOrderType {
    const normalized = `${value ?? ''}`.trim().toLowerCase()
    if (normalized === 'limit') return 'Limit'
    return 'Market'
  }

  private normalizeSymbol(value: unknown) {
    const symbol = `${value ?? ''}`.trim().toUpperCase()
    return symbol || null
  }

  private normalizeOptionalSymbol(value: unknown) {
    const symbol = `${value ?? ''}`.trim().toUpperCase()
    return symbol || null
  }

  private normalizeOptionalToken(value: unknown, keepCase = false) {
    const token = `${value ?? ''}`.trim()
    if (!token) return null
    return keepCase ? token : token.toUpperCase()
  }

  private normalizeAccountType(value: unknown) {
    const accountType = `${value ?? ''}`.trim().toUpperCase()
    return accountType || 'UNIFIED'
  }

  private normalizeOptionalNumberString(value: unknown) {
    if (value === undefined || value === null) return null
    const raw = `${value}`.trim()
    if (!raw) return null
    const num = Number(raw)
    if (!Number.isFinite(num) || num <= 0) return null
    return raw
  }

  private normalizeRequiredNumberString(value: unknown) {
    if (value === undefined || value === null) return null
    const raw = `${value}`.trim()
    const num = Number(raw)
    if (!Number.isFinite(num) || num <= 0) return null
    return raw
  }

  private readPositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt((value ?? '').trim(), 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return parsed
  }

  private readBoolean(value: string | undefined, fallback: boolean) {
    const raw = (value ?? '').trim().toLowerCase()
    if (!raw) return fallback
    if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true
    if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false
    return fallback
  }
}
