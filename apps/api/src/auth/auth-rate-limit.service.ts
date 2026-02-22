import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

interface AttemptState {
  attempts: number[]
  lockUntil: number
}

@Injectable()
export class AuthRateLimitService {
  private readonly windowMs: number
  private readonly lockoutMs: number
  private readonly maxFailuresPerIdentity: number
  private readonly maxFailuresPerIp: number
  private readonly byIdentity = new Map<string, AttemptState>()
  private readonly byIp = new Map<string, AttemptState>()

  constructor(config: ConfigService) {
    this.windowMs = this.readInt(config, 'AUTH_RATE_WINDOW_MS', 15 * 60 * 1000)
    this.lockoutMs = this.readInt(config, 'AUTH_LOCKOUT_MS', 30 * 60 * 1000)
    this.maxFailuresPerIdentity = this.readInt(config, 'AUTH_MAX_FAILED_ATTEMPTS_PER_IDENTITY', 10)
    this.maxFailuresPerIp = this.readInt(config, 'AUTH_MAX_FAILED_ATTEMPTS_PER_IP', 30)
  }

  assertLoginAllowed(email: string, clientIp: string) {
    const now = Date.now()
    const identity = this.normalizeIdentity(email)
    const ip = this.normalizeIp(clientIp)

    const identityState = this.getState(this.byIdentity, identity, now)
    const ipState = this.getState(this.byIp, ip, now)

    const lockedUntil = Math.max(identityState.lockUntil, ipState.lockUntil)
    if (lockedUntil > now) {
      throw new HttpException(this.lockoutMessage(lockedUntil - now), HttpStatus.TOO_MANY_REQUESTS)
    }
  }

  recordLoginFailure(email: string, clientIp: string) {
    const now = Date.now()
    const identity = this.normalizeIdentity(email)
    const ip = this.normalizeIp(clientIp)

    const identityState = this.getState(this.byIdentity, identity, now)
    const ipState = this.getState(this.byIp, ip, now)

    identityState.attempts.push(now)
    ipState.attempts.push(now)

    if (identityState.attempts.length >= this.maxFailuresPerIdentity) {
      identityState.lockUntil = now + this.lockoutMs
      identityState.attempts = []
    }

    if (ipState.attempts.length >= this.maxFailuresPerIp) {
      ipState.lockUntil = now + this.lockoutMs
      ipState.attempts = []
    }

    this.byIdentity.set(identity, identityState)
    this.byIp.set(ip, ipState)
  }

  clearLoginFailures(email: string) {
    this.byIdentity.delete(this.normalizeIdentity(email))
  }

  private getState(bucket: Map<string, AttemptState>, key: string, now: number): AttemptState {
    const current = bucket.get(key) ?? { attempts: [], lockUntil: 0 }
    const attempts = current.attempts.filter((ts) => now - ts <= this.windowMs)
    const lockUntil = current.lockUntil > now ? current.lockUntil : 0
    const next = { attempts, lockUntil }
    bucket.set(key, next)
    return next
  }

  private lockoutMessage(msRemaining: number) {
    const seconds = Math.max(1, Math.ceil(msRemaining / 1000))
    const minutes = Math.ceil(seconds / 60)
    return `Too many login attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
  }

  private normalizeIdentity(email: string) {
    const normalized = email.trim().toLowerCase()
    return normalized || 'unknown'
  }

  private normalizeIp(clientIp: string) {
    const normalized = clientIp.trim()
    return normalized || 'unknown'
  }

  private readInt(config: ConfigService, key: string, fallback: number) {
    const raw = config.get<string>(key)
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) return fallback
    return Math.floor(value)
  }
}
