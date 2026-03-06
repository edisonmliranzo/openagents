import { Injectable } from '@nestjs/common'
import { LLM_MODELS } from '@openagents/shared'
import type { LLMProvider } from '@openagents/shared'
import { LLMService } from '../../agent/llm.service'
import { UsersService } from '../../users/users.service'
import type { NanobotChatMessage, NanobotProviderCompletion, NanobotToolDef } from '../types'

interface CompletionInput {
  userId: string
  messages: NanobotChatMessage[]
  tools: NanobotToolDef[]
  systemPrompt: string
  providerOverride?: string
}

@Injectable()
export class NanobotProviderRouterService {
  constructor(
    private llm: LLMService,
    private users: UsersService,
  ) {}

  async complete(input: CompletionInput): Promise<NanobotProviderCompletion> {
    const settings = await this.users.getSettings(input.userId)
    const overrideProvider = this.normalizeProvider(input.providerOverride)
    const routing = overrideProvider
      ? { provider: overrideProvider, model: undefined }
      : this.resolveRoutingPreset(settings.preferredProvider, settings.preferredModel)
    const provider = routing.provider
    const preferredModel = routing.model
    const userKey = await this.users.getRawLlmKey(input.userId, provider)
    const apiKey = userKey?.isActive
      ? (userKey.apiKey ?? userKey.loginPassword ?? undefined)
      : undefined
    const baseUrl = userKey?.isActive ? (userKey.baseUrl ?? undefined) : undefined

    return this.llm.complete(
      input.messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      input.tools,
      input.systemPrompt,
      provider,
      apiKey,
      baseUrl,
      preferredModel,
    )
  }

  private resolveRoutingPreset(rawProvider?: string | null, rawModel?: string | null) {
    const provider = this.normalizeProvider(rawProvider) ?? 'anthropic'
    const model = rawModel?.trim() || undefined

    const manusModeEnabled = this.readBooleanEnv('MANUS_MODE', false)
    const manusLiteEnabled = this.readBooleanEnv('MANUS_LITE', false)
    if (!manusModeEnabled && !manusLiteEnabled) {
      return { provider, model }
    }

    const forceRouting = manusModeEnabled
      ? this.readBooleanEnv('MANUS_MODE_FORCE_ROUTING', false) || this.readBooleanEnv('MANUS_LITE_FORCE_ROUTING', false)
      : this.readBooleanEnv('MANUS_LITE_FORCE_ROUTING', false)
    const onSchemaDefaults = provider === 'anthropic'
      && (!model || model === LLM_MODELS.anthropic.default)
    if (!forceRouting && !onSchemaDefaults) {
      return { provider, model }
    }

    const presetProvider = manusModeEnabled
      ? this.normalizeProvider(process.env.MANUS_MODE_PROVIDER)
        ?? this.normalizeProvider(process.env.MANUS_LITE_PROVIDER)
        ?? 'ollama'
      : this.normalizeProvider(process.env.MANUS_LITE_PROVIDER) ?? 'ollama'
    const presetModel = (manusModeEnabled ? process.env.MANUS_MODE_MODEL?.trim() : '')
      || process.env.MANUS_LITE_MODEL?.trim()
      || LLM_MODELS[presetProvider].fast

    return {
      provider: presetProvider,
      model: presetModel,
    }
  }

  private normalizeProvider(value?: string | null): LLMProvider | null {
    const normalized = (value ?? '').trim().toLowerCase()
    if (
      normalized === 'anthropic'
      || normalized === 'openai'
      || normalized === 'google'
      || normalized === 'ollama'
      || normalized === 'minimax'
    ) {
      return normalized
    }
    return null
  }

  private readBooleanEnv(name: string, fallback: boolean) {
    const raw = process.env[name]
    if (raw == null) return fallback
    const normalized = raw.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
    return fallback
  }
}
