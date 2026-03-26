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

function parseIntInRange(value: string | undefined, fallback: number, min: number, max: number) {
  const n = parseNumber(value, fallback)
  return Math.max(min, Math.min(Math.floor(n), max))
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
    const fallback = 8
    const configured = parseIntInRange(this.config.get<string>('NANOBOT_MAX_LOOP_STEPS'), fallback, 1, 50)
    const manusModeEnabled = parseBoolean(this.config.get<string>('MANUS_MODE'), false)
    if (manusModeEnabled) {
      const shouldApplyPreset = configured === fallback
      if (!shouldApplyPreset) return configured
      return parseIntInRange(this.config.get<string>('MANUS_MODE_NANOBOT_MAX_LOOP_STEPS'), 14, 1, 50)
    }
    const manusLiteEnabled = parseBoolean(this.config.get<string>('MANUS_LITE'), false)
    if (!manusLiteEnabled) return configured
    const shouldApplyPreset = configured === fallback
    if (!shouldApplyPreset) return configured
    return parseIntInRange(this.config.get<string>('MANUS_LITE_NANOBOT_MAX_LOOP_STEPS'), 10, 1, 50)
  }

  get manusModeEnabled() {
    return parseBoolean(this.config.get<string>('MANUS_MODE'), false)
  }

  get shadowMode() {
    if (typeof this.runtimeOverrides.shadowMode === 'boolean') return this.runtimeOverrides.shadowMode
    return parseBoolean(this.config.get<string>('NANOBOT_SHADOW_MODE'), false)
  }

  get runtimeLabel() {
    if (this.runtimeOverrides.runtimeLabel) return this.runtimeOverrides.runtimeLabel
    return this.config.get<string>('NANOBOT_RUNTIME_LABEL') ?? 'nanobot'
  }

  get adaptiveIntentRoutingEnabled() {
    return parseBoolean(this.config.get<string>('NANOBOT_ADAPTIVE_INTENT_ROUTING'), false)
  }

  get parallelDelegationEnabled() {
    if (typeof this.runtimeOverrides.parallelDelegationEnabled === 'boolean') {
      return this.runtimeOverrides.parallelDelegationEnabled
    }
    return parseBoolean(this.config.get<string>('NANOBOT_PARALLEL_DELEGATION_ENABLED'), false)
  }

  get parallelDelegationMaxAgents() {
    if (typeof this.runtimeOverrides.parallelDelegationMaxAgents === 'number') {
      return Math.max(1, Math.min(4, Math.floor(this.runtimeOverrides.parallelDelegationMaxAgents)))
    }
    return parseIntInRange(
      this.config.get<string>('NANOBOT_PARALLEL_DELEGATION_MAX_AGENTS'),
      3,
      1,
      4,
    )
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
    if (typeof patch.parallelDelegationEnabled === 'boolean') {
      next.parallelDelegationEnabled = patch.parallelDelegationEnabled
    }
    if (
      typeof patch.parallelDelegationMaxAgents === 'number'
      && Number.isFinite(patch.parallelDelegationMaxAgents)
    ) {
      next.parallelDelegationMaxAgents = Math.max(1, Math.min(4, Math.floor(patch.parallelDelegationMaxAgents)))
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
      parallelDelegationEnabled: this.parallelDelegationEnabled,
      parallelDelegationMaxAgents: this.parallelDelegationMaxAgents,
    }
  }
}
