import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { LLMProvider } from '@openagents/shared'
import { LLM_MODELS, LLM_MODEL_OPTIONS } from '@openagents/shared'
import { embedText } from './embeddings'

const SUPPORTED_PROVIDERS: LLMProvider[] = ['anthropic', 'openai', 'google', 'ollama', 'minimax', 'perplexity', 'nvidia', 'atlascloud', 'groq', 'mistral', 'deepseek', 'xai', 'openrouter', 'together', 'custom', 'meta']

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google Gemini',
  ollama: 'Ollama',
  minimax: 'MiniMax',
  perplexity: 'Perplexity',
  nvidia: 'NVIDIA NIM',
  atlascloud: 'AtlasCloud',
  groq: 'Groq',
  mistral: 'Mistral',
  deepseek: 'DeepSeek',
  xai: 'xAI Grok',
  openrouter: 'OpenRouter',
  together: 'Together AI',
  custom: 'Custom endpoint',
  meta: 'Meta Muse Spark',
}

const PROVIDER_ENV_VARS: Record<Exclude<LLMProvider, 'ollama'>, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  minimax: ['MINIMAX_API_KEY'],
  perplexity: ['PERPLEXITY_API_KEY'],
  nvidia: ['NVIDIA_API_KEY'],
  atlascloud: ['ATLASCLOUD_API_KEY'],
  groq: ['GROQ_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  xai: ['XAI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  together: ['TOGETHER_API_KEY'],
  custom: ['CUSTOM_LLM_API_KEY'],
  meta: ['MODEL_API_KEY', 'META_API_KEY'],
}

const OPENAI_COMPATIBLE_BASE_URLS: Partial<Record<LLMProvider, string>> = {
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  minimax: 'https://api.minimaxi.chat/v1',
  perplexity: 'https://api.perplexity.ai',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  atlascloud: 'https://api.atlascloud.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  xai: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  together: 'https://api.together.xyz/v1',
  // NOTE: `custom` intentionally has no default — the user must supply a base URL.
  meta: 'https://api.meta.ai/v1',
}
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'
const DEFAULT_OLLAMA_ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
  'gateway.docker.internal',
  'host.containers.internal',
]

export interface LLMMessage {
  role: 'user' | 'assistant'
  content: string | any[]
}

export interface LLMTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface LLMResponse {
  content: string
  toolCalls?: Array<{
    id: string
    name: string
    input: Record<string, unknown>
  }>
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
}

export interface TestConnectionResult {
  ok: boolean
  model?: string
  warning?: string
  error?: string
}

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name)
  private envApiKeys: Partial<Record<Exclude<LLMProvider, 'ollama'>, string>> = {}
  private defaultProvider: LLMProvider
  private readonly allowCustomOpenAIBaseUrls: boolean
  private readonly defaultOllamaBaseUrl: string
  private readonly allowedOllamaHosts: Set<string>

  constructor(private config: ConfigService) {
    this.allowCustomOpenAIBaseUrls = this.readBooleanEnv('ALLOW_CUSTOM_LLM_BASE_URLS', false)
    this.defaultOllamaBaseUrl = this.readDefaultOllamaBaseUrl()
    this.allowedOllamaHosts = this.readAllowedOllamaHosts()

    this.envApiKeys = {
      anthropic: this.readFirstEnv(PROVIDER_ENV_VARS.anthropic),
      openai: this.readFirstEnv(PROVIDER_ENV_VARS.openai),
      google: this.readFirstEnv(PROVIDER_ENV_VARS.google),
      minimax: this.readFirstEnv(PROVIDER_ENV_VARS.minimax),
      perplexity: this.readFirstEnv(PROVIDER_ENV_VARS.perplexity),
      nvidia: this.readFirstEnv(PROVIDER_ENV_VARS.nvidia),
      atlascloud: this.readFirstEnv(PROVIDER_ENV_VARS.atlascloud),
      groq: this.readFirstEnv(PROVIDER_ENV_VARS.groq),
      mistral: this.readFirstEnv(PROVIDER_ENV_VARS.mistral),
      deepseek: this.readFirstEnv(PROVIDER_ENV_VARS.deepseek),
      xai: this.readFirstEnv(PROVIDER_ENV_VARS.xai),
      openrouter: this.readFirstEnv(PROVIDER_ENV_VARS.openrouter),
      together: this.readFirstEnv(PROVIDER_ENV_VARS.together),
      custom: this.readFirstEnv(PROVIDER_ENV_VARS.custom),
      meta: this.readFirstEnv(PROVIDER_ENV_VARS.meta),
    }

    const configured = (config.get<string>('DEFAULT_LLM_PROVIDER') ?? 'anthropic').trim().toLowerCase()
    this.defaultProvider = this.isSupportedProvider(configured)
      ? (configured as LLMProvider)
      : 'anthropic'
  }

  async complete(
    messages: LLMMessage[],
    tools: LLMTool[],
    systemPrompt: string,
    provider?: LLMProvider,
    userApiKey?: string,
    userBaseUrl?: string,
    model?: string,
    fallbackApiKeys?: string[],
  ): Promise<LLMResponse> {
    const requestedProvider = String(provider ?? this.defaultProvider).trim().toLowerCase()
    const p = this.isSupportedProvider(requestedProvider)
      ? requestedProvider
      : this.defaultProvider

    if (p === 'anthropic') {
      return this.completeWithKeyRotation(
        (key) => {
          const client = new Anthropic({ apiKey: this.resolveApiKey('anthropic', key), timeout: 120_000, maxRetries: 1 })
          return this.completeAnthropic(messages, tools, systemPrompt, client, model)
        },
        p,
        userApiKey,
        fallbackApiKeys,
      )
    }

    if (p === 'ollama') {
      const ollamaClient = this.createOllamaClient(userBaseUrl)
      return this.completeWithOllamaFallback(messages, tools, systemPrompt, ollamaClient, model, userBaseUrl)
    }

    // openai-compatible providers (openai plus every OpenAI-compatible cloud/local endpoint)
    return this.completeWithKeyRotation(
      async (key) => {
        const client = this.createOpenAICompatibleClient(p, key, userBaseUrl)
        const requestedModel = model ?? LLM_MODELS[p].default
        try {
          const response = await this.completeOpenAI(messages, tools, systemPrompt, client, model, LLM_MODELS[p].default)

          // Some NVIDIA NIM models return empty content with no tool calls when tools are passed
          // (e.g. nemotron, mixtral, qwen-coder). Retry without tools to get a usable response.
          if (
            p === 'nvidia' &&
            tools.length > 0 &&
            !response.content?.trim() &&
            !response.toolCalls?.length
          ) {
            this.logger.warn(`NVIDIA model "${requestedModel}" returned empty content with tools — retrying without tools`)
            return this.completeOpenAI(messages, [], systemPrompt, client, model, LLM_MODELS[p].default)
          }

          return response
        } catch (err: any) {
          if (!this.isGoneError(err)) throw err
          // 410 Gone = retired model (or, on NVIDIA, a key without the Public
          // API Endpoints entitlement). Self-heal by switching to the first
          // model in the provider's live catalog instead of failing the run.
          const live = await this.fetchLiveModels(p, key, userBaseUrl).catch(() => [] as string[])
          const replacement = live.map((id) => id.trim()).filter(Boolean)
            .find((id) => id !== requestedModel)
          if (!replacement) throw this.friendlyProviderError(p, err, requestedModel)
          this.logger.warn(`${PROVIDER_LABELS[p]} model "${requestedModel}" is gone (410) — retrying with live model "${replacement}"`)
          try {
            return await this.completeOpenAI(messages, tools, systemPrompt, client, replacement, replacement)
          } catch (retryErr: any) {
            throw this.friendlyProviderError(p, retryErr, replacement)
          }
        }
      },
      p,
      userApiKey,
      fallbackApiKeys,
    )
  }

  private async completeWithKeyRotation(
    fn: (key: string | undefined) => Promise<LLMResponse>,
    provider: Exclude<LLMProvider, 'ollama'>,
    primaryKey?: string,
    fallbackKeys?: string[],
  ): Promise<LLMResponse> {
    // Build candidate list: primary key first, then fallbacks, then env key
    const candidates: Array<string | undefined> = [primaryKey, ...(fallbackKeys ?? [])]
    const dedupedCandidates = [...new Set(candidates)]

    let lastError: unknown
    for (const key of dedupedCandidates) {
      try {
        return await fn(key)
      } catch (err: any) {
        const isKeyError = this.isApiKeyError(err)
        const isRateLimitError = this.isRateLimitError(err)
        if (!isKeyError && !isRateLimitError) throw err // non-auth/rate errors bubble up immediately
        lastError = err
        const keyLabel = key ? `key ...${key.slice(-4)}` : 'env key'
        const reason = isRateLimitError ? 'rate-limited' : 'auth error'
        this.logger.warn(`${PROVIDER_LABELS[provider]} ${keyLabel} failed (${reason}), trying next key if available.`)
      }
    }
    throw lastError
  }

  private isApiKeyError(err: unknown): boolean {
    const msg = (err as any)?.message ?? ''
    const status = (err as any)?.status ?? (err as any)?.statusCode ?? 0
    return status === 401 || status === 403
      || msg.toLowerCase().includes('api key')
      || msg.toLowerCase().includes('authentication')
      || msg.toLowerCase().includes('unauthorized')
  }

  private isRateLimitError(err: unknown): boolean {
    const status = (err as any)?.status ?? (err as any)?.statusCode ?? 0
    return status === 429
  }

  private isGoneError(err: unknown): boolean {
    const status = (err as any)?.status ?? (err as any)?.statusCode ?? 0
    if (status === 410) return true
    return /status code.*410|410 gone/i.test((err as any)?.message ?? '')
  }

  // Translates raw provider errors into actionable messages. NVIDIA returns
  // 410 both for retired models and for keys missing the "Public API
  // Endpoints" entitlement; the live catalog is the way to tell them apart.
  private friendlyProviderError(provider: string, err: unknown, model?: string): Error {
    const raw = err instanceof Error && err.message ? err.message : 'Request failed'
    if (this.isGoneError(err)) {
      const where = model ? `Model "${model}"` : 'The requested model'
      const hint = provider === 'nvidia'
        ? `${where} is retired (410 Gone) or your key lacks Public API Endpoints. Refresh models to see what your nvapi- key can use, pick a live one, or enable the entitlement at build.nvidia.com.`
        : `${where} is no longer served by ${PROVIDER_LABELS[provider as LLMProvider] ?? provider} (410 Gone). Refresh models and pick a live one.`
      const error = new Error(hint)
      ;(error as any).status = 410
      return error
    }
    return err instanceof Error ? err : new Error(raw)
  }

  async listOllamaModels(baseUrl?: string): Promise<string[]> {
    return this.listLocalOllamaModels(baseUrl, true)
  }

  /**
   * Embed text for semantic memory. Tries OpenAI (text-embedding-3-small),
   * then Ollama (nomic-embed-text), then a deterministic hash embedding so
   * semantic recall always works, even fully offline.
   */
  async embed(text: string): Promise<{ vector: number[]; provider: 'openai' | 'ollama' | 'hash' } | null> {
    return embedText(text, {
      openaiKey: this.envApiKeys.openai,
      ollamaBaseUrl: this.resolveOllamaHttpBaseUrl(),
    })
  }

  /**
   * Live model discovery per provider. Returns the provider's own model
   * catalog (Ollama /api/tags, Anthropic Models API, or OpenAI-compatible
   * /v1/models) merged after the curated list. Never throws for lookup
   * failures — those come back as `{ source: 'curated', error }` so the UI
   * can tell the user exactly why the live list is missing.
   */
  async listProviderModels(
    provider: LLMProvider,
    apiKey?: string,
    baseUrl?: string,
  ): Promise<{ models: string[]; source: 'live' | 'curated'; error?: string }> {
    const requested = String(provider ?? '').trim().toLowerCase()
    if (!this.isSupportedProvider(requested)) {
      throw new Error(`Unsupported provider "${provider}".`)
    }
    const curated = [...(LLM_MODEL_OPTIONS[requested] as unknown as string[])]

    try {
      const live = await this.fetchLiveModels(requested, apiKey, baseUrl)
      if (live.length === 0) return { models: curated, source: 'curated' }
      const seen = new Set(curated)
      const extras = live.map((id) => id.trim()).filter((id) => id && !seen.has(id))
      return { models: [...curated, ...extras].slice(0, 200), source: 'live' }
    } catch (err: any) {
      return { models: curated, source: 'curated', error: this.friendlyCatalogError(requested, err) }
    }
  }

  private friendlyCatalogError(provider: string, err: any): string {
    const status = err?.status ?? err?.statusCode ?? 0
    if (status === 401 || status === 403) {
      return 'Provider rejected the key (401/403). Save a valid key first, then refresh.'
    }
    if (this.isGoneError(err)) {
      return this.friendlyProviderError(provider, err).message
    }
    const msg = err instanceof Error && err.message ? err.message : 'Lookup failed'
    if (/not configured/i.test(msg)) {
      return 'No key saved for this provider yet. Save a key first, then refresh.'
    }
    return `Live catalog unavailable (${msg}). Showing curated list.`
  }

  // Raw live catalog. Throws on any failure — callers decide how to degrade.
  private async fetchLiveModels(
    provider: Exclude<LLMProvider, 'anthropic' | 'ollama'> | 'anthropic' | 'ollama',
    apiKey?: string,
    baseUrl?: string,
  ): Promise<string[]> {
    if (provider === 'ollama') {
      return this.listLocalOllamaModels(baseUrl, true)
    }

    if (provider === 'anthropic') {
      const key = this.resolveApiKey('anthropic', apiKey)
      const response = await fetch('https://api.anthropic.com/v1/models?limit=100', {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      })
      if (!response.ok) {
        const error = new Error(`Anthropic models lookup failed (HTTP ${response.status}).`)
        ;(error as any).status = response.status
        throw error
      }
      const json = await response.json() as { data?: Array<{ id?: string }> }
      return (json.data ?? []).map((m) => m.id ?? '').filter(Boolean)
    }

    const client = this.createOpenAICompatibleClient(provider, apiKey, baseUrl)
    return this.listModelIds(client)
  }

  async runOllamaPrompt(baseUrl: string | undefined, model: string, prompt: string, maxTokens = 200) {
    const client = this.createOllamaClient(baseUrl)
    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    })

    return {
      model: response.model,
      content: response.choices[0]?.message?.content ?? '',
    }
  }

  async testConnection(
    provider: LLMProvider,
    apiKey?: string,
    baseUrl?: string,
    model?: string,
  ): Promise<TestConnectionResult> {
    const requestedProvider = String(provider ?? '').trim().toLowerCase()
    if (!this.isSupportedProvider(requestedProvider)) {
      return { ok: false, error: `Unsupported provider "${provider}".` }
    }

    try {
      if (requestedProvider === 'anthropic') {
        const client = new Anthropic({ apiKey: this.resolveApiKey('anthropic', apiKey), timeout: 120_000, maxRetries: 1 })
        const res = await client.messages.create({
          model: model ?? LLM_MODELS.anthropic.default,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'hi' }],
        })
        return { ok: true, model: res.model }
      }

      if (requestedProvider === 'ollama') {
        const client = this.createOllamaClient(baseUrl)
        const requestedModel = model ?? LLM_MODELS.ollama.default
        const targetModel = await this.resolveRequestedOllamaModel(requestedModel, baseUrl)

        try {
          const res = await client.chat.completions.create({
            model: targetModel,
            max_tokens: 5,
            messages: [{ role: 'user', content: 'hi' }],
          })
          return { ok: true, model: res.model }
        } catch (error: any) {
          if (model || !this.isOllamaModelMissingError(error)) throw error

          const fallbackModel = await this.resolveFirstOllamaModel(client, baseUrl)
          if (!fallbackModel) throw new Error(this.noLocalOllamaModelsMessage(baseUrl))

          const res = await client.chat.completions.create({
            model: fallbackModel,
            max_tokens: 5,
            messages: [{ role: 'user', content: 'hi' }],
          })
          return { ok: true, model: res.model }
        }
      }

      // openai-compatible providers (openai plus every OpenAI-compatible cloud/local endpoint)
      const requestedModel = model ?? LLM_MODELS[requestedProvider].default
      const client = this.createOpenAICompatibleClient(requestedProvider, apiKey, baseUrl)
      try {
        const res = await client.chat.completions.create({
          model: requestedModel,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'hi' }],
        })
        return { ok: true, model: res.model }
      } catch (err: any) {
        if (!this.isGoneError(err) || requestedModel === LLM_MODELS[requestedProvider].default) {
          throw this.friendlyProviderError(requestedProvider, err, requestedModel)
        }
        // Requested model is gone — retry once with the provider default so a
        // stale pin doesn't fail the whole connectivity check.
        try {
          const res = await client.chat.completions.create({
            model: LLM_MODELS[requestedProvider].default,
            max_tokens: 5,
            messages: [{ role: 'user', content: 'hi' }],
          })
          return {
            ok: true,
            model: res.model,
            warning: `Model "${requestedModel}" is retired (410 Gone) — test passed with default "${LLM_MODELS[requestedProvider].default}". Refresh models and pick a live one.`,
          }
        } catch (retryErr: any) {
          throw this.friendlyProviderError(requestedProvider, retryErr, LLM_MODELS[requestedProvider].default)
        }
      }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Connection failed' }
    }
  }

  private resolveApiKey(provider: Exclude<LLMProvider, 'ollama'>, userApiKey?: string) {
    const fromUser = userApiKey?.trim()
    const fromEnv = this.envApiKeys[provider]?.trim()
    const key = fromUser || fromEnv

    if (!key || this.isPlaceholderKey(key)) {
      const envName = PROVIDER_ENV_VARS[provider][0]
      const providerLabel = PROVIDER_LABELS[provider]
      throw new Error(`${providerLabel} API key is not configured. Add a key in Settings > Config or set ${envName} in apps/api/.env.`)
    }

    return key
  }

  private isPlaceholderKey(value: string) {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return true
    if (normalized === 'not-set') return true
    if (normalized === 'changeme' || normalized === 'change-me') return true
    if (normalized.includes('...')) return true
    return false
  }

  private async completeWithOllamaFallback(
    messages: LLMMessage[],
    tools: LLMTool[],
    systemPrompt: string,
    client: OpenAI,
    modelOverride?: string,
    baseUrl?: string,
  ): Promise<LLMResponse> {
    const requestedModel = modelOverride ?? LLM_MODELS.ollama.default
    const defaultModel = await this.resolveRequestedOllamaModel(requestedModel, baseUrl)

    try {
      return await this.completeOpenAI(messages, tools, systemPrompt, client, defaultModel)
    } catch (error: any) {
      if (this.isOllamaToolsNotSupportedError(error)) {
        this.logger.warn(`Ollama model "${defaultModel}" does not support tools — retrying without tools`)
        return this.completeOpenAI(messages, [], systemPrompt, client, defaultModel)
      }

      if (!this.isOllamaModelMissingError(error)) throw error

      const fallbackModel = await this.resolveFirstOllamaModel(client, baseUrl)
      if (!fallbackModel) throw new Error(this.noLocalOllamaModelsMessage(baseUrl))
      if (fallbackModel === defaultModel) throw error

      this.logger.warn(`Ollama model "${defaultModel}" unavailable, retrying with "${fallbackModel}"`)
      return this.completeOpenAI(messages, tools, systemPrompt, client, fallbackModel)
    }
  }

  private isOllamaToolsNotSupportedError(error: unknown) {
    const message = (error as any)?.message
    if (typeof message !== 'string') return false
    const lower = message.toLowerCase()
    return lower.includes('does not support tools') || lower.includes('tool') && lower.includes('not supported')
  }

  private async resolveFirstOllamaModel(client: OpenAI, baseUrl?: string) {
    const localModels = await this.listLocalOllamaModels(baseUrl)
    if (localModels.length > 0) return localModels[0] ?? null
    return null
  }

  private async resolveRequestedOllamaModel(requestedModel: string, baseUrl?: string) {
    const requested = requestedModel.trim()
    if (!requested) return requestedModel

    const models = await this.listLocalOllamaModels(baseUrl)
    if (models.length === 0) return requested

    const normalizedRequested = requested.toLowerCase()

    const exact = models.find((id) => id.toLowerCase() === normalizedRequested)
    if (exact) return exact

    // Ollama Cloud models are often exposed as "<id>:cloud".
    const cloudAlias = models.find((id) => id.toLowerCase() === `${normalizedRequested}:cloud`)
    if (cloudAlias) return cloudAlias

    const prefix = models.find((id) => id.toLowerCase().startsWith(normalizedRequested))
    if (prefix) return prefix

    const includes = models.find((id) => id.toLowerCase().includes(normalizedRequested))
    if (includes) return includes

    return requested
  }

  private isOllamaModelMissingError(error: unknown) {
    const message = (error as any)?.message
    if (typeof message !== 'string') return false

    const lower = message.toLowerCase()
    return lower.includes('model') && (
      lower.includes('not found')
      || lower.includes('does not exist')
      || lower.includes('unknown')
    )
  }

  private async completeAnthropic(
    messages: LLMMessage[],
    tools: LLMTool[],
    systemPrompt: string,
    client: Anthropic,
    modelOverride?: string,
  ): Promise<LLMResponse> {
    const parsedMessages = messages.map((m) => ({
      role: m.role,
      content: m.role === 'user' && typeof m.content === 'string'
        ? this.parseMultimodalContent(m.content, 'anthropic')
        : m.content,
    }))
    const anthropicMessages = this.normalizeAnthropicMessages(parsedMessages)

    const response = await client.messages.create({
      model: modelOverride ?? LLM_MODELS.anthropic.default,
      max_tokens: 8192,
      system: systemPrompt,
      messages: anthropicMessages as any,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
      })),
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const toolBlocks = response.content.filter((b) => b.type === 'tool_use')

    return {
      content: textBlock?.type === 'text' ? textBlock.text : '',
      toolCalls: toolBlocks.map((b) => ({
        id: b.type === 'tool_use' ? b.id : '',
        name: b.type === 'tool_use' ? b.name : '',
        input: b.type === 'tool_use' ? (b.input as Record<string, unknown>) : {},
      })),
      stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
    }
  }

  // Some Anthropic models reject assistant-prefill payloads; enforce a user-final turn.
  private normalizeAnthropicMessages(messages: LLMMessage[]): LLMMessage[] {
    const normalized = messages.filter((message) => {
      if (typeof message.content === 'string') {
        return message.content.trim().length > 0
      }
      return Array.isArray(message.content) && message.content.length > 0
    })

    if (normalized.length === 0) {
      return [{ role: 'user', content: 'Continue.' }]
    }

    if (normalized[normalized.length - 1]?.role === 'assistant') {
      normalized.push({
        role: 'user',
        content: 'Continue based on the latest context.',
      })
    }

    return normalized
  }

  private async completeOpenAI(
    messages: LLMMessage[],
    tools: LLMTool[],
    systemPrompt: string,
    client: OpenAI,
    modelOverride?: string,
    defaultModel?: string,
  ): Promise<LLMResponse> {
    const parsedMessages = messages.map((m) => ({
      role: m.role,
      content: m.role === 'user' && typeof m.content === 'string'
        ? this.parseMultimodalContent(m.content, 'openai')
        : m.content,
    }))
    const response = await client.chat.completions.create({
      model: modelOverride ?? defaultModel ?? LLM_MODELS.openai.default,
      messages: [{ role: 'system', content: systemPrompt }, ...parsedMessages] as any,
      ...(tools.length > 0 ? {
        tools: tools.map((t) => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        })),
      } : {}),
    })

    const msg = response.choices[0].message
    const toolCalls = msg.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }))

    return {
      content: msg.content ?? '',
      toolCalls,
      stopReason: msg.tool_calls?.length ? 'tool_use' : 'end_turn',
    }
  }

  private createOllamaClient(baseUrl?: string) {
    return new OpenAI({
      baseURL: this.resolveOllamaBaseUrl(baseUrl),
      apiKey: 'ollama',
      // Fail fast instead of hanging the chat on "thinking" forever.
      timeout: 300_000,
      maxRetries: 1,
    })
  }

  private createOpenAICompatibleClient(
    provider: Exclude<LLMProvider, 'anthropic' | 'ollama'>,
    userApiKey?: string,
    userBaseUrl?: string,
  ) {
    const baseURL = this.resolveOpenAICompatibleBaseUrl(provider, userBaseUrl)
    // Local OpenAI-compatible servers (LM Studio, llama.cpp, …) usually need
    // no key — send a dummy value instead of failing the "not configured" check.
    const apiKey = provider === 'custom'
      && !userApiKey?.trim()
      && !this.envApiKeys.custom?.trim()
      ? 'not-needed'
      : this.resolveApiKey(provider, userApiKey)
    return new OpenAI({
      ...(baseURL ? { baseURL } : {}),
      apiKey,
      // Fail fast instead of hanging the chat on "thinking" forever.
      timeout: 300_000,
      maxRetries: 1,
    })
  }

  private resolveOllamaBaseUrl(baseUrl?: string) {
    return `${this.resolveOllamaHttpBaseUrl(baseUrl)}/v1`
  }

  private resolveOllamaHttpBaseUrl(baseUrl?: string) {
    const raw = (baseUrl ?? this.defaultOllamaBaseUrl).trim()
    const candidate = raw.match(/^[a-z]+:\/\//i) ? raw : `http://${raw}`
    let parsed: URL
    try {
      parsed = new URL(candidate)
    } catch {
      throw new Error('Invalid Ollama server URL.')
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Ollama server URL must use http or https.')
    }

    parsed = this.rewriteLoopbackToDefaultOllamaUrl(parsed)

    const host = this.normalizeHost(parsed.hostname)
    if (!this.isAllowedOllamaHost(host)) {
      throw new Error(`Blocked Ollama host "${host}". Add it to OLLAMA_ALLOWED_HOSTS to allow it.`)
    }

    parsed.pathname = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.origin
  }

  private noLocalOllamaModelsMessage(baseUrl?: string) {
    const endpoint = this.resolveOllamaHttpBaseUrl(baseUrl)
    return `No Ollama models found at ${endpoint}. Run "ollama pull <model>" and refresh models.`
  }

  private async listLocalOllamaModels(baseUrl?: string, strict = false) {
    let endpoint = ''
    try {
      endpoint = `${this.resolveOllamaHttpBaseUrl(baseUrl)}/api/tags`
      const response = await fetch(endpoint)
      if (!response.ok) {
        if (!strict) return []
        throw new Error(`Failed to load Ollama models from ${endpoint} (HTTP ${response.status}).`)
      }
      const json = await response.json() as {
        models?: Array<{ name?: string; model?: string }>
      }

      const ids: string[] = []
      const seen = new Set<string>()
      for (const model of json.models ?? []) {
        const id = (model.name ?? model.model ?? '').trim()
        if (!id || seen.has(id)) continue
        seen.add(id)
        ids.push(id)
      }

      // Keep all models, but rank local models before cloud-tagged entries.
      const local: string[] = []
      const cloud: string[] = []
      for (const id of ids) {
        const normalized = id.toLowerCase()
        if (normalized.includes(':cloud') || normalized.includes('/cloud') || normalized.endsWith('-cloud')) {
          cloud.push(id)
        } else {
          local.push(id)
        }
      }

      return [...local, ...cloud]
    } catch (error) {
      if (strict) {
        const message = error instanceof Error && error.message ? error.message : 'Failed to load Ollama models.'
        if (message.toLowerCase().includes('failed to load ollama models')) {
          throw new Error(message)
        }
        if (endpoint) {
          throw new Error(`Failed to load Ollama models from ${endpoint}: ${message}`)
        }
        throw new Error(message)
      }
      return []
    }
  }

  private resolveOpenAICompatibleBaseUrl(
    provider: Exclude<LLMProvider, 'anthropic' | 'ollama'>,
    baseUrl?: string,
  ) {
    const override = baseUrl?.trim().replace(/\/+$/, '')
    if (override) {
      // Loopback endpoints (LM Studio, llama.cpp, vLLM on the user's own
      // machine) are always allowed. Remote overrides need the explicit flag.
      if (!this.allowCustomOpenAIBaseUrls && !this.isLoopbackUrl(override)) {
        throw new Error('Custom LLM base URLs are disabled. Set ALLOW_CUSTOM_LLM_BASE_URLS=true to enable.')
      }
      return override
    }
    const fallback = OPENAI_COMPATIBLE_BASE_URLS[provider]
    if (!fallback) {
      throw new Error(
        'This provider needs a Base URL (Settings → Config). Enter your OpenAI-compatible endpoint, e.g. http://localhost:1234/v1.',
      )
    }
    return fallback
  }

  private isLoopbackUrl(raw: string) {
    try {
      const candidate = raw.match(/^[a-z]+:\/\//i) ? raw : `http://${raw}`
      const host = this.normalizeHost(new URL(candidate).hostname)
      return this.isLoopbackHost(host)
    } catch {
      return false
    }
  }

  private async listModelIds(client: OpenAI) {
    const models = await client.models.list()
    const ids: string[] = []
    const seen = new Set<string>()

    for (const entry of models.data) {
      const id = typeof entry.id === 'string' ? entry.id.trim() : ''
      if (!id || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }

    return ids
  }

  private isSupportedProvider(value: string): value is LLMProvider {
    return SUPPORTED_PROVIDERS.includes(value as LLMProvider)
  }

  private readFirstEnv(names: string[]) {
    for (const name of names) {
      const value = this.config.get<string>(name)?.trim()
      if (value) return value
    }
    return undefined
  }

  private readBooleanEnv(name: string, fallback: boolean) {
    const raw = this.config.get<string>(name)
    if (raw == null) return fallback
    const normalized = raw.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
    return fallback
  }

  private readDefaultOllamaBaseUrl() {
    const fromEnv = this.config.get<string>('OLLAMA_BASE_URL')?.trim()
    return fromEnv || DEFAULT_OLLAMA_BASE_URL
  }

  private rewriteLoopbackToDefaultOllamaUrl(parsed: URL) {
    const requestedHost = this.normalizeHost(parsed.hostname)
    if (!this.isLoopbackHost(requestedHost)) return parsed

    const fallbackRaw = this.defaultOllamaBaseUrl.trim()
    const fallbackCandidate = fallbackRaw.match(/^[a-z]+:\/\//i) ? fallbackRaw : `http://${fallbackRaw}`
    let fallbackParsed: URL
    try {
      fallbackParsed = new URL(fallbackCandidate)
    } catch {
      return parsed
    }

    if (fallbackParsed.protocol !== 'http:' && fallbackParsed.protocol !== 'https:') return parsed

    const fallbackHost = this.normalizeHost(fallbackParsed.hostname)
    if (this.isLoopbackHost(fallbackHost)) return parsed

    fallbackParsed.pathname = ''
    fallbackParsed.search = ''
    fallbackParsed.hash = ''
    return fallbackParsed
  }

  private normalizeHost(hostname: string) {
    return hostname.toLowerCase().replace(/^\[|\]$/g, '')
  }

  private isLoopbackHost(host: string) {
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  }

  private isAllowedOllamaHost(host: string) {
    return this.allowedOllamaHosts.has('*') || this.allowedOllamaHosts.has(host)
  }

  private readAllowedOllamaHosts() {
    const fromEnv = (this.config.get<string>('OLLAMA_ALLOWED_HOSTS') ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase().replace(/^\[|\]$/g, ''))
      .filter(Boolean)

    const hosts = fromEnv.length > 0 ? fromEnv : DEFAULT_OLLAMA_ALLOWED_HOSTS
    return new Set(hosts)
  }

  private parseMultimodalContent(content: string, provider: LLMProvider): any {
    const base64Regex = /data:(image\/[a-zA-Z+.-]+);base64,([a-zA-Z0-9+/=]+)/g
    const matches = [...content.matchAll(base64Regex)]

    if (matches.length === 0) {
      return content
    }

    let cleanText = content.replace(base64Regex, '').replace(/\[Attached image:[^\]]*\]/g, '').trim()
    if (!cleanText) cleanText = 'Analyze this image.'

    if (provider === 'anthropic') {
      const parts: any[] = [{ type: 'text', text: cleanText }]
      for (const match of matches) {
        const mimeType = match[1]
        const base64Data = match[2]
        parts.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: base64Data,
          },
        })
      }
      return parts
    } else {
      const parts: any[] = [{ type: 'text', text: cleanText }]
      for (const match of matches) {
        parts.push({
          type: 'image_url',
          image_url: {
            url: match[0],
          },
        })
      }
      return parts
    }
  }
}
