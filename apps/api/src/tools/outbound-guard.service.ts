import { Injectable } from '@nestjs/common'
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

const SAFE_BROWSER_PROTOCOLS = new Set(['about:', 'blob:', 'data:'])
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const DEFAULT_FETCH_REDIRECTS = 5
const DEFAULT_FETCH_TIMEOUT_MS = 10_000
const KNOWN_BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.google.internal.',
])

const BLOCKED_NETWORKS = new BlockList()
BLOCKED_NETWORKS.addSubnet('0.0.0.0', 8, 'ipv4')
BLOCKED_NETWORKS.addSubnet('10.0.0.0', 8, 'ipv4')
BLOCKED_NETWORKS.addSubnet('100.64.0.0', 10, 'ipv4')
BLOCKED_NETWORKS.addSubnet('127.0.0.0', 8, 'ipv4')
BLOCKED_NETWORKS.addSubnet('169.254.0.0', 16, 'ipv4')
BLOCKED_NETWORKS.addSubnet('172.16.0.0', 12, 'ipv4')
BLOCKED_NETWORKS.addSubnet('192.0.0.0', 24, 'ipv4')
BLOCKED_NETWORKS.addSubnet('192.0.2.0', 24, 'ipv4')
BLOCKED_NETWORKS.addSubnet('192.88.99.0', 24, 'ipv4')
BLOCKED_NETWORKS.addSubnet('192.168.0.0', 16, 'ipv4')
BLOCKED_NETWORKS.addSubnet('198.18.0.0', 15, 'ipv4')
BLOCKED_NETWORKS.addSubnet('198.51.100.0', 24, 'ipv4')
BLOCKED_NETWORKS.addSubnet('203.0.113.0', 24, 'ipv4')
BLOCKED_NETWORKS.addSubnet('224.0.0.0', 4, 'ipv4')
BLOCKED_NETWORKS.addSubnet('240.0.0.0', 4, 'ipv4')
BLOCKED_NETWORKS.addSubnet('255.255.255.255', 32, 'ipv4')
BLOCKED_NETWORKS.addSubnet('::', 128, 'ipv6')
BLOCKED_NETWORKS.addSubnet('::1', 128, 'ipv6')
BLOCKED_NETWORKS.addSubnet('fc00::', 7, 'ipv6')
BLOCKED_NETWORKS.addSubnet('fe80::', 10, 'ipv6')
BLOCKED_NETWORKS.addSubnet('fec0::', 10, 'ipv6')
BLOCKED_NETWORKS.addSubnet('ff00::', 8, 'ipv6')
BLOCKED_NETWORKS.addSubnet('2001:db8::', 32, 'ipv6')

interface SafeUrlOptions {
  allowHttp?: boolean
  context?: string
}

interface FetchGuardOptions extends SafeUrlOptions {
  maxRedirects?: number
  timeoutMs?: number
}

interface HostCheckResult {
  blocked: boolean
  reason?: string
}

@Injectable()
export class OutboundGuardService {
  private readonly allowHosts = this.parseAllowHosts(process.env.OUTBOUND_ALLOW_HOSTS)
  private readonly hostCheckCache = new Map<string, Promise<HostCheckResult>>()

  async assertSafeUrl(rawUrl: string, options: SafeUrlOptions = {}): Promise<string> {
    const context = this.describeContext(options.context)

    let parsed: URL
    try {
      parsed = new URL(rawUrl)
    } catch {
      throw new Error(`${context} requires a valid URL.`)
    }

    if (!this.isAllowedProtocol(parsed.protocol, Boolean(options.allowHttp))) {
      throw new Error(
        options.allowHttp
          ? `${context} only allows HTTP or HTTPS URLs.`
          : `${context} only allows HTTPS URLs.`,
      )
    }

    if (parsed.username || parsed.password) {
      throw new Error(`${context} does not allow credentials in URLs.`)
    }

    const hostname = this.normalizeHostname(parsed.hostname)
    if (!hostname) {
      throw new Error(`${context} requires a URL hostname.`)
    }
    if (this.isAllowlistedHost(hostname)) {
      return parsed.toString()
    }
    if (this.isDirectlyBlockedHostname(hostname)) {
      throw new Error(`${context} blocked private or metadata host "${hostname}".`)
    }

    const ipType = isIP(hostname)
    if (ipType > 0) {
      if (this.isBlockedAddress(hostname)) {
        throw new Error(`${context} blocked private or special-use address "${hostname}".`)
      }
      return parsed.toString()
    }

    const resolution = await this.checkHostname(hostname, context)
    if (resolution.blocked) {
      throw new Error(resolution.reason ?? `${context} blocked host "${hostname}".`)
    }

    return parsed.toString()
  }

  async getBrowserRequestBlockReason(rawUrl: string, context = 'Computer browser request') {
    let parsed: URL
    try {
      parsed = new URL(rawUrl)
    } catch {
      return `${context} blocked an invalid URL.`
    }

    if (SAFE_BROWSER_PROTOCOLS.has(parsed.protocol)) {
      return null
    }

    try {
      await this.assertSafeUrl(parsed.toString(), {
        allowHttp: true,
        context,
      })
      return null
    } catch (error: any) {
      return error?.message ?? `${context} was blocked.`
    }
  }

  async fetchWithRedirectProtection(
    rawUrl: string,
    init: RequestInit = {},
    options: FetchGuardOptions = {},
  ) {
    const maxRedirects = this.normalizeRedirectCount(options.maxRedirects)
    const signal = init.signal ?? AbortSignal.timeout(options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS)
    let nextUrl = await this.assertSafeUrl(rawUrl, options)
    let redirectCount = 0

    while (true) {
      const response = await fetch(nextUrl, {
        ...init,
        redirect: 'manual',
        signal,
      })

      if (!REDIRECT_STATUSES.has(response.status)) {
        return {
          response,
          finalUrl: nextUrl,
          redirectCount,
        }
      }

      if (redirectCount >= maxRedirects) {
        throw new Error(`${this.describeContext(options.context)} exceeded ${maxRedirects} redirects.`)
      }

      const location = response.headers.get('location')
      if (!location) {
        throw new Error(`${this.describeContext(options.context)} received a redirect without a Location header.`)
      }

      nextUrl = await this.assertSafeUrl(new URL(location, nextUrl).toString(), options)
      redirectCount += 1
    }
  }

  private async checkHostname(hostname: string, context: string) {
    const normalized = this.normalizeHostname(hostname)
    const cached = this.hostCheckCache.get(normalized)
    if (cached) return cached

    const pending = (async (): Promise<HostCheckResult> => {
      let records: Array<{ address: string }> = []
      try {
        records = await lookup(normalized, { all: true, verbatim: true })
      } catch {
        return {
          blocked: true,
          reason: `${context} could not resolve host "${normalized}".`,
        }
      }

      if (!records.length) {
        return {
          blocked: true,
          reason: `${context} could not resolve host "${normalized}".`,
        }
      }

      for (const record of records) {
        if (this.isBlockedAddress(record.address)) {
          return {
            blocked: true,
            reason: `${context} blocked host "${normalized}" because it resolves to a private or special-use address.`,
          }
        }
      }

      return { blocked: false }
    })()

    this.hostCheckCache.set(normalized, pending)
    return pending
  }

  private isAllowedProtocol(protocol: string, allowHttp: boolean) {
    return protocol === 'https:' || (allowHttp && protocol === 'http:')
  }

  private isBlockedAddress(address: string): boolean {
    const normalized = address.trim().toLowerCase()
    const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1]
    if (mappedIpv4) {
      return this.isBlockedAddress(mappedIpv4)
    }

    const ipType = isIP(normalized)
    if (ipType === 0) return false
    return BLOCKED_NETWORKS.check(normalized, ipType === 6 ? 'ipv6' : 'ipv4')
  }

  private isDirectlyBlockedHostname(hostname: string) {
    return KNOWN_BLOCKED_HOSTS.has(hostname) || hostname.endsWith('.localhost')
  }

  private parseAllowHosts(raw: string | undefined) {
    return (raw ?? '')
      .split(',')
      .map((entry) => this.normalizeHostname(entry))
      .filter(Boolean)
  }

  private isAllowlistedHost(hostname: string) {
    const normalized = this.normalizeHostname(hostname)
    return this.allowHosts.some((pattern) => {
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(2)
        return normalized === suffix || normalized.endsWith(`.${suffix}`)
      }
      if (pattern.startsWith('.')) {
        const suffix = pattern.slice(1)
        return normalized === suffix || normalized.endsWith(`.${suffix}`)
      }
      return normalized === pattern
    })
  }

  private normalizeHostname(value: string) {
    return value.trim().toLowerCase().replace(/\.+$/, '')
  }

  private normalizeRedirectCount(raw: number | undefined) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_FETCH_REDIRECTS
    return Math.max(0, Math.min(Math.trunc(raw), 10))
  }

  private describeContext(context?: string) {
    return context?.trim() || 'Outbound request'
  }
}
