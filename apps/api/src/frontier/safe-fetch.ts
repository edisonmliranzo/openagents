import dns from 'node:dns/promises'
import net from 'node:net'

const MAX_REDIRECTS = 3

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

function isPrivateAddress(ip: string): boolean {
  const family = net.isIP(ip)
  if (family === 4) return isPrivateIPv4(ip)
  if (family === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIPv4(mapped[1])
    return false
  }
  return true
}

/** Throws unless the URL is http(s) and every resolved address is public. */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs can be watched')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new Error('Local hostnames are not allowed')
  }
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true })
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error('Target resolves to a private or local address')
  }
  return url
}

/** fetch() that re-validates every redirect hop against the public-address rule. */
export async function safeFetchText(raw: string, timeoutMs = 15000): Promise<string> {
  let current = raw
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = await assertPublicHttpUrl(current)
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'OpenAgents-Watch/1.0' },
    })
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) throw new Error('Redirect without location')
      current = new URL(location, url).toString()
      continue
    }
    return (await res.text()).slice(0, 500_000)
  }
  throw new Error('Too many redirects')
}
