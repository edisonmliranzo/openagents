import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { flag } from './frontier.util'

interface Redaction {
  map: Record<string, string>
  counter: number
}

const PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: 'key', re: /\b(?:nvapi|sk|gsk|xai|pk|ak)-[A-Za-z0-9_\-]{16,}\b/g },
  { kind: 'email', re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g },
  { kind: 'phone', re: /(?:\+?\d[\s.\-()]{0,3}){7,12}\d\b/g },
  { kind: 'card', re: /\b(?:\d[ \-]?){13,19}\b/g },
  { kind: 'id', re: /\b\d{3}-\d{2}-\d{4}\b/g },
]

@Injectable()
export class PiiRouterService {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return flag(this.config, 'PRIVACY_ROUTER')
  }

  redact(text: string, state: Redaction = { map: {}, counter: 0 }): { text: string; state: Redaction } {
    if (!this.enabled) return { text, state }
    let out = text
    for (const { kind, re } of PATTERNS) {
      out = out.replace(re, (match) => {
        if (kind === 'card' && !this.looksLikeCard(match)) return match
        const existing = Object.entries(state.map).find(([, v]) => v === match)
        if (existing) return existing[0]
        state.counter += 1
        const token = `<${kind.toUpperCase()}-${state.counter}>`
        state.map[token] = match
        return token
      })
    }
    return { text: out, state }
  }

  restore(text: string, state: Redaction): string {
    if (!this.enabled || !text) return text
    let out = text
    for (const [token, value] of Object.entries(state.map)) {
      out = out.split(token).join(value)
    }
    return out
  }

  private looksLikeCard(raw: string): boolean {
    const digits = raw.replace(/\D/g, '')
    if (digits.length < 13 || digits.length > 19) return false
    let sum = 0
    let dbl = false
    for (let i = digits.length - 1; i >= 0; i -= 1) {
      let d = Number(digits[i])
      if (dbl) {
        d *= 2
        if (d > 9) d -= 9
      }
      sum += d
      dbl = !dbl
    }
    return sum % 10 === 0
  }
}
