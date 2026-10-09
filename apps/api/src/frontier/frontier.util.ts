import type { ConfigService } from '@nestjs/config'

export function flag(config: ConfigService, name: string): boolean {
  const raw = (config.get<string>(name) ?? 'false').trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'on'
}

export function clamp(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}
