export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  keyPrefix?: string
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
}

export class RateLimiter {
  private requests: Map<string, number[]> = new Map()
  private config: RateLimitConfig

  constructor(config: RateLimitConfig) {
    this.config = {
      keyPrefix: 'ratelimit',
      ...config,
    }
  }

  check(key: string): RateLimitResult {
    const now = Date.now()
    const windowStart = now - this.config.windowMs
    const fullKey = `${this.config.keyPrefix}:${key}`

    let timestamps = this.requests.get(fullKey) || []
    timestamps = timestamps.filter((ts) => ts > windowStart)

    const remaining = this.config.maxRequests - timestamps.length

    if (remaining > 0) {
      timestamps.push(now)
      this.requests.set(fullKey, timestamps)

      return {
        allowed: true,
        remaining,
        resetAt: now + this.config.windowMs,
      }
    }

    const oldestInWindow = Math.min(...timestamps)
    const retryAfter = Math.ceil((oldestInWindow + this.config.windowMs - now) / 1000)

    return {
      allowed: false,
      remaining: 0,
      resetAt: oldestInWindow + this.config.windowMs,
      retryAfter,
    }
  }

  reset(key: string): void {
    const fullKey = `${this.config.keyPrefix}:${key}`
    this.requests.delete(fullKey)
  }

  getUsage(key: string): number {
    const now = Date.now()
    const windowStart = now - this.config.windowMs
    const fullKey = `${this.config.keyPrefix}:${key}`

    const timestamps = this.requests.get(fullKey) || []
    return timestamps.filter((ts) => ts > windowStart).length
  }
}

export interface TokenBucketConfig {
  capacity: number
  refillRate: number
}

export class TokenBucket {
  private buckets: Map<string, { tokens: number; lastRefill: number }> = new Map()

  constructor(private config: TokenBucketConfig) {}

  check(key: string, cost: number = 1): boolean {
    const now = Date.now()
    const bucket = this.buckets.get(key)

    if (!bucket) {
      this.buckets.set(key, { tokens: this.config.capacity - cost, lastRefill: now })
      return true
    }

    const timePassed = (now - bucket.lastRefill) / 1000
    const tokensToAdd = timePassed * this.config.refillRate
    const tokens = Math.min(this.config.capacity, bucket.tokens + tokensToAdd)

    if (tokens >= cost) {
      this.buckets.set(key, { tokens: tokens - cost, lastRefill: now })
      return true
    }

    return false
  }

  getTokens(key: string): number {
    const bucket = this.buckets.get(key)
    return bucket?.tokens || 0
  }
}

export class SlidingWindowLimiter {
  private requests: Map<string, { key: string; timestamp: number }[]> = new Map()

  constructor(
    private windowMs: number,
    private maxRequests: number,
  ) {}

  check(key: string): RateLimitResult {
    const now = Date.now()
    const windowStart = now - this.windowMs

    let timestamps = this.requests.get(key) || []
    timestamps = timestamps.filter((r) => r.timestamp > windowStart)

    if (timestamps.length < this.maxRequests) {
      timestamps.push({ key, timestamp: now })
      this.requests.set(key, timestamps)

      return {
        allowed: true,
        remaining: this.maxRequests - timestamps.length,
        resetAt: now + this.windowMs,
      }
    }

    const oldest = Math.min(...timestamps.map((r) => r.timestamp))
    const retryAfter = Math.ceil((oldest + this.windowMs - now) / 1000)

    return {
      allowed: false,
      remaining: 0,
      resetAt: oldest + this.windowMs,
      retryAfter,
    }
  }
}

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  return new RateLimiter(config)
}
