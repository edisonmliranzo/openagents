import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value == null) return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function parseNumber(value: string | undefined, fallback: number) {
  if (value == null) return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

@Injectable()
export class NanobotConfigService {
  constructor(private config: ConfigService) {}

  get enabled() {
    return parseBoolean(this.config.get<string>('NANOBOT_ENABLED'), false)
  }

  get maxLoopSteps() {
    return Math.max(1, parseNumber(this.config.get<string>('NANOBOT_MAX_LOOP_STEPS'), 8))
  }

  get shadowMode() {
    return parseBoolean(this.config.get<string>('NANOBOT_SHADOW_MODE'), false)
  }

  get runtimeLabel() {
    return this.config.get<string>('NANOBOT_RUNTIME_LABEL') ?? 'nanobot'
  }

  toJSON() {
    return {
      enabled: this.enabled,
      maxLoopSteps: this.maxLoopSteps,
      shadowMode: this.shadowMode,
      runtimeLabel: this.runtimeLabel,
    }
  }
}

