import type { AuthTokens } from '@openagents/shared'

export interface SDKConfig {
  baseUrl: string
  onTokenRefresh?: (tokens: AuthTokens) => void
  onUnauthorized?: () => void
}

export class OpenAgentsClient {
  private baseUrl: string
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private config: SDKConfig

  constructor(config: SDKConfig) {
    this.config = config
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
  }

  setTokens(tokens: AuthTokens) {
    this.accessToken = tokens.accessToken
    this.refreshToken = tokens.refreshToken
  }

  clearTokens() {
    this.accessToken = null
    this.refreshToken = null
  }

  private buildNetworkError(url: string, error: unknown) {
    const detail = error instanceof Error && error.message ? error.message : 'Network request failed.'
    return `Failed to reach API at ${url}. ${detail} Check API server and base URL configuration.`
  }

  private async fetchWithNetworkGuard(url: string, options: RequestInit) {
    try {
      return await fetch(url, options)
    } catch (error) {
      throw new APIError(0, this.buildNetworkError(url, error))
    }
  }

  private isJsonResponse(res: Response) {
    const contentType = res.headers.get('content-type')?.toLowerCase() ?? ''
    return contentType.includes('application/json') || contentType.includes('+json')
  }

  private async parseSuccessBody<T>(res: Response): Promise<T> {
    if (res.status === 204 || res.status === 205) {
      return undefined as T
    }

    const contentLength = res.headers.get('content-length')
    if (contentLength === '0') {
      return undefined as T
    }

    const raw = await res.text()
    if (!raw.trim()) {
      return undefined as T
    }

    if (this.isJsonResponse(res)) {
      try {
        return JSON.parse(raw) as T
      } catch {
        throw new APIError(res.status, `Invalid JSON response from ${res.url}`)
      }
    }

    return raw as T
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`
    }

    const res = await this.fetchWithNetworkGuard(url, { ...options, headers })

    if (res.status === 401 && this.refreshToken) {
      const refreshed = await this.tryRefresh()
      if (refreshed) {
        headers.Authorization = `Bearer ${this.accessToken}`
        const retried = await this.fetchWithNetworkGuard(url, { ...options, headers })
        if (!retried.ok) throw new APIError(retried.status, await retried.text())
        return this.parseSuccessBody<T>(retried)
      }

      this.config.onUnauthorized?.()
      throw new APIError(401, 'Unauthorized')
    }

    if (!res.ok) throw new APIError(res.status, await res.text())
    return this.parseSuccessBody<T>(res)
  }

  private async tryRefresh(): Promise<boolean> {
    try {
      const refreshUrl = `${this.baseUrl}/api/v1/auth/refresh`
      const res = await this.fetchWithNetworkGuard(refreshUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      })
      if (!res.ok) return false
      const tokens = await this.parseSuccessBody<Partial<AuthTokens>>(res)
      if (
        !tokens ||
        typeof tokens.accessToken !== 'string' ||
        typeof tokens.refreshToken !== 'string'
      ) {
        return false
      }
      const normalizedTokens: AuthTokens = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: typeof tokens.expiresIn === 'number' ? tokens.expiresIn : 0,
      }
      this.setTokens(normalizedTokens)
      this.config.onTokenRefresh?.(normalizedTokens)
      return true
    } catch {
      return false
    }
  }

  get<T>(path: string) {
    return this.request<T>(path, { method: 'GET' })
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' })
  }

  /** Stream SSE from the agent endpoint */
  stream(path: string, body: unknown, onChunk: (chunk: string) => void): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const startStreamRequest = () => {
          const url = `${this.baseUrl}${path}`
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          }
          if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`

          return this.fetchWithNetworkGuard(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          })
        }

        let res = await startStreamRequest()

        if (res.status === 401 && this.refreshToken) {
          const refreshed = await this.tryRefresh()
          if (refreshed) {
            res = await startStreamRequest()
          } else {
            this.config.onUnauthorized?.()
            reject(new APIError(401, 'Unauthorized'))
            return
          }
        }

        if (!res.ok || !res.body) {
          reject(new APIError(res.status, await res.text()))
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        let buffer = ''
        let currentEvent = 'message'
        let dataLines: string[] = []

        const emitChunk = () => {
          if (dataLines.length === 0) return

          const raw = dataLines.join('\n')
          dataLines = []

          if (raw === '[DONE]') {
            currentEvent = 'message'
            return
          }

          try {
            onChunk(JSON.stringify({ event: currentEvent, data: JSON.parse(raw) }))
          } catch {
            onChunk(JSON.stringify({ event: currentEvent, data: raw }))
          }

          currentEvent = 'message'
        }

        const processLine = (line: string) => {
          if (line === '') {
            emitChunk()
            return
          }

          if (line.startsWith(':')) return

          if (line.startsWith('event:')) {
            currentEvent = line.slice('event:'.length).trim() || 'message'
            return
          }

          if (line.startsWith('data:')) {
            dataLines.push(line.slice('data:'.length).trimStart())
          }
        }

        const flushBuffer = (flushRemainder: boolean) => {
          let newlineIndex = buffer.indexOf('\n')
          while (newlineIndex !== -1) {
            const rawLine = buffer.slice(0, newlineIndex)
            const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
            processLine(line)
            buffer = buffer.slice(newlineIndex + 1)
            newlineIndex = buffer.indexOf('\n')
          }

          if (flushRemainder && buffer.length > 0) {
            const line = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer
            processLine(line)
            buffer = ''
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          flushBuffer(false)
        }

        buffer += decoder.decode()
        flushBuffer(true)
        emitChunk()
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  }
}

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'APIError'
  }
}
