import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { NanobotConfigPatch, NanobotRuntimeConfig } from '../types'

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
  private runtimeOverrides: NanobotConfigPatch = {}

  constructor(private config: ConfigService) {}

  get enabled() {
    if (typeof this.runtimeOverrides.enabled === 'boolean') return this.runtimeOverrides.enabled
    return parseBoolean(this.config.get<string>('NANOBOT_ENABLED'), false)
  }

  get maxLoopSteps() {
    if (typeof this.runtimeOverrides.maxLoopSteps === 'number') {
      return Math.max(1, Math.floor(this.runtimeOverrides.maxLoopSteps))
    }
    return Math.max(1, parseNumber(this.config.get<string>('NANOBOT_MAX_LOOP_STEPS'), 8))
  }

  get shadowMode() {
    if (typeof this.runtimeOverrides.shadowMode === 'boolean') return this.runtimeOverrides.shadowMode
    return parseBoolean(this.config.get<string>('NANOBOT_SHADOW_MODE'), false)
  }

  get runtimeLabel() {
    if (this.runtimeOverrides.runtimeLabel) return this.runtimeOverrides.runtimeLabel
    return this.config.get<string>('NANOBOT_RUNTIME_LABEL') ?? 'nanobot'
  }

  updateRuntime(patch: NanobotConfigPatch): NanobotRuntimeConfig {
    const next: NanobotConfigPatch = { ...this.runtimeOverrides }

    if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled
    if (typeof patch.shadowMode === 'boolean') next.shadowMode = patch.shadowMode
    if (typeof patch.maxLoopSteps === 'number' && Number.isFinite(patch.maxLoopSteps)) {
      next.maxLoopSteps = Math.max(1, Math.floor(patch.maxLoopSteps))
    }
    if (typeof patch.runtimeLabel === 'string') {
      const normalized = patch.runtimeLabel.trim()
      if (normalized) next.runtimeLabel = normalized
    }

    this.runtimeOverrides = next
    return this.toJSON()
  }

  toJSON(): NanobotRuntimeConfig {
    return {
      enabled: this.enabled,
      maxLoopSteps: this.maxLoopSteps,
      shadowMode: this.shadowMode,
      runtimeLabel: this.runtimeLabel,
    }
  }
}
