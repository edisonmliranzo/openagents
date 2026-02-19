import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { LLMProvider } from '@openagents/shared'
import { LLM_MODELS } from '@openagents/shared'

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
  private envAnthropicKey?: string
  private envOpenaiKey?: string
  private defaultProvider: LLMProvider

  constructor(private config: ConfigService) {
    this.envAnthropicKey = config.get<string>('ANTHROPIC_API_KEY') ?? undefined
    this.envOpenaiKey = config.get<string>('OPENAI_API_KEY') ?? undefined
    this.defaultProvider = (config.get('DEFAULT_LLM_PROVIDER') ?? 'anthropic') as LLMProvider
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
    const p = provider ?? this.defaultProvider

    if (p === 'anthropic') {
      const client = new Anthropic({ apiKey: this.resolveApiKey('anthropic', userApiKey) })
      return this.completeAnthropic(messages, tools, systemPrompt, client, model)
    }

    if (p === 'ollama') {
      const ollamaClient = this.createOllamaClient(userBaseUrl)
      return this.completeWithOllamaFallback(messages, tools, systemPrompt, ollamaClient, model)
    }

    // openai
    const client = new OpenAI({ apiKey: this.resolveApiKey('openai', userApiKey) })
    return this.completeOpenAI(messages, tools, systemPrompt, client, model)
  }

  async listOllamaModels(baseUrl?: string): Promise<string[]> {
    const client = this.createOllamaClient(baseUrl)
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
    try {
      if (provider === 'anthropic') {
        const client = new Anthropic({ apiKey: this.resolveApiKey('anthropic', apiKey) })
        const res = await client.messages.create({
          model: model ?? LLM_MODELS.anthropic.default,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'hi' }],
        })
        return { ok: true, model: res.model }
      }

      if (provider === 'ollama') {
        const client = this.createOllamaClient(baseUrl)
        const targetModel = model ?? LLM_MODELS.ollama.default

        try {
          const res = await client.chat.completions.create({
            model: targetModel,
            max_tokens: 5,
            messages: [{ role: 'user', content: 'hi' }],
          })
          return { ok: true, model: res.model }
        } catch (error: any) {
          if (model || !this.isOllamaModelMissingError(error)) throw error

          const fallbackModel = await this.resolveFirstOllamaModel(client)
          if (!fallbackModel) throw error

          const res = await client.chat.completions.create({
            model: fallbackModel,
            max_tokens: 5,
            messages: [{ role: 'user', content: 'hi' }],
          })
          return { ok: true, model: res.model }
        }
      }

      // openai
      const client = new OpenAI({ apiKey: this.resolveApiKey('openai', apiKey) })
      const res = await client.chat.completions.create({
        model: model ?? LLM_MODELS.openai.default,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }],
      })
      return { ok: true, model: res.model }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Connection failed' }
    }
  }

  private resolveApiKey(provider: 'anthropic' | 'openai', userApiKey?: string) {
    const fromUser = userApiKey?.trim()
    const fromEnv = provider === 'anthropic' ? this.envAnthropicKey?.trim() : this.envOpenaiKey?.trim()
    const key = fromUser || fromEnv

    if (!key || this.isPlaceholderKey(key)) {
      const envName = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
      const providerLabel = provider === 'anthropic' ? 'Anthropic' : 'OpenAI'
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
  ): Promise<LLMResponse> {
    const defaultModel = modelOverride ?? LLM_MODELS.ollama.default

    try {
      return await this.completeOpenAI(messages, tools, systemPrompt, client, defaultModel)
    } catch (error: any) {
      if (!this.isOllamaModelMissingError(error)) throw error

      const fallbackModel = await this.resolveFirstOllamaModel(client)
      if (!fallbackModel || fallbackModel === defaultModel) throw error

      this.logger.warn(`Ollama model "${defaultModel}" unavailable, retrying with "${fallbackModel}"`)
      return this.completeOpenAI(messages, tools, systemPrompt, client, fallbackModel)
    }
  }

  private async resolveFirstOllamaModel(client: OpenAI) {
    const models = await this.listModelIds(client)
    return models[0] ?? null
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
  ): Promise<LLMResponse> {
    const response = await client.chat.completions.create({
      model: modelOverride ?? LLM_MODELS.openai.default,
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

  private resolveOllamaBaseUrl(baseUrl?: string) {
    const raw = (baseUrl ?? 'http://localhost:11434').trim().replace(/\/+$/, '')
    return raw.endsWith('/v1') ? raw : `${raw}/v1`
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
}
