import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { LLMProvider } from '@openagents/shared'
import { LLM_MODELS } from '@openagents/shared'

const SUPPORTED_PROVIDERS: LLMProvider[] = ['anthropic', 'openai', 'google', 'ollama', 'minimax']

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google Gemini',
  ollama: 'Ollama',
  minimax: 'MiniMax',
}

const PROVIDER_ENV_VARS: Record<Exclude<LLMProvider, 'ollama'>, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  minimax: ['MINIMAX_API_KEY'],
}

const OPENAI_COMPATIBLE_BASE_URLS: Partial<Record<LLMProvider, string>> = {
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  minimax: 'https://api.minimaxi.chat/v1',
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
  content: string
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
  ): Promise<LLMResponse> {
    const requestedProvider = String(provider ?? this.defaultProvider).trim().toLowerCase()
    const p = this.isSupportedProvider(requestedProvider)
      ? requestedProvider
      : this.defaultProvider

    if (p === 'anthropic') {
      const client = new Anthropic({ apiKey: this.resolveApiKey('anthropic', userApiKey) })
      return this.completeAnthropic(messages, tools, systemPrompt, client, model)
    }

    if (p === 'ollama') {
      const ollamaClient = this.createOllamaClient(userBaseUrl)
      return this.completeWithOllamaFallback(messages, tools, systemPrompt, ollamaClient, model, userBaseUrl)
    }

    // openai-compatible providers (openai, google gemini)
    const client = this.createOpenAICompatibleClient(p, userApiKey, userBaseUrl)
    return this.completeOpenAI(messages, tools, systemPrompt, client, model, LLM_MODELS[p].default)
  }

  async listOllamaModels(baseUrl?: string): Promise<string[]> {
    return this.listLocalOllamaModels(baseUrl, true)
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
        const client = new Anthropic({ apiKey: this.resolveApiKey('anthropic', apiKey) })
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

      // openai-compatible providers (openai, google gemini)
      const client = this.createOpenAICompatibleClient(requestedProvider, apiKey, baseUrl)
      const res = await client.chat.completions.create({
        model: model ?? LLM_MODELS[requestedProvider].default,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }],
      })
      return { ok: true, model: res.model }
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
    const response = await client.messages.create({
      model: modelOverride ?? LLM_MODELS.anthropic.default,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
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

  private async completeOpenAI(
    messages: LLMMessage[],
    tools: LLMTool[],
    systemPrompt: string,
    client: OpenAI,
    modelOverride?: string,
    defaultModel?: string,
  ): Promise<LLMResponse> {
    const response = await client.chat.completions.create({
      model: modelOverride ?? defaultModel ?? LLM_MODELS.openai.default,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
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
    })
  }

  private createOpenAICompatibleClient(
    provider: Exclude<LLMProvider, 'anthropic' | 'ollama'>,
    userApiKey?: string,
    userBaseUrl?: string,
  ) {
    const baseURL = this.resolveOpenAICompatibleBaseUrl(provider, userBaseUrl)
    const apiKey = this.resolveApiKey(provider, userApiKey)
    return new OpenAI({
      ...(baseURL ? { baseURL } : {}),
      apiKey,
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

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
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
      if (!this.allowCustomOpenAIBaseUrls) {
        throw new Error('Custom LLM base URLs are disabled. Set ALLOW_CUSTOM_LLM_BASE_URLS=true to enable.')
      }
      return override
    }
    return OPENAI_COMPATIBLE_BASE_URLS[provider]
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
}
