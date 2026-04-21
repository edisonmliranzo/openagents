import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import { LLMService } from '../../agent/llm.service'
import { UsersService } from '../../users/users.service'
import type { LLMProvider } from '@openagents/shared'

const AGGREGATOR_PROMPT = `You are a synthesis expert. You have received multiple independent responses to the same question from different AI models. Synthesize them into a single, comprehensive, and accurate answer. Highlight points of agreement, resolve conflicts using reasoning, and produce the best possible response. Do not reveal which model said what.`

@Injectable()
export class MixtureOfAgentsTool {
  def: ToolDefinition = {
    name: 'mixture_of_agents',
    displayName: 'Mixture of Agents',
    description: 'Query multiple LLM models in parallel and synthesize their responses into a single high-quality answer. Use for complex questions that benefit from diverse perspectives.',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question or task to send to multiple models' },
        models: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of provider:model pairs to query (e.g. ["anthropic:claude-haiku-4-5-20251001","openai:gpt-4o-mini"]). Defaults to 3 fast models.',
        },
      },
      required: ['question'],
    },
  }

  constructor(
    private llm: LLMService,
    private users: UsersService,
  ) {}

  async run(input: Record<string, unknown>, userId: string): Promise<ToolResult> {
    const question = String(input.question ?? '').trim()
    if (!question) return { success: false, error: 'question is required' }

    const defaultModels: Array<{ provider: LLMProvider; model: string }> = [
      { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    ]

    const rawModels = Array.isArray(input.models) ? input.models as string[] : []
    const modelList: Array<{ provider: LLMProvider; model: string }> = rawModels.length
      ? rawModels.map((m) => {
          const [p, ...rest] = m.split(':')
          return { provider: (p ?? 'anthropic') as LLMProvider, model: rest.join(':') || 'claude-haiku-4-5-20251001' }
        })
      : defaultModels

    const userKeys: Partial<Record<LLMProvider, string | undefined>> = {}
    for (const { provider } of modelList) {
      if (!(provider in userKeys)) {
        const key = await this.users.getRawLlmKey(userId, provider).catch(() => null)
        userKeys[provider] = key?.isActive ? (key.apiKey ?? undefined) : undefined
      }
    }

    const results = await Promise.allSettled(
      modelList.map(({ provider, model }) =>
        this.llm.complete(
          [{ role: 'user', content: question }],
          [],
          'You are a helpful assistant. Answer concisely and accurately.',
          provider,
          userKeys[provider],
          undefined,
          model,
        ),
      ),
    )

    const responses: string[] = []
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status === 'fulfilled' && r.value.content) {
        responses.push(`Model ${i + 1}: ${r.value.content.trim()}`)
      }
    }

    if (responses.length === 0) {
      return { success: false, error: 'All model calls failed' }
    }

    if (responses.length === 1) {
      return { success: true, data: responses[0].replace(/^Model \d+: /, '') }
    }

    // Synthesize with aggregator call
    const aggregatorInput = `Question: ${question}\n\n${responses.join('\n\n---\n\n')}`
    const synthesis = await this.llm.complete(
      [{ role: 'user', content: aggregatorInput }],
      [],
      AGGREGATOR_PROMPT,
      'anthropic',
      userKeys.anthropic,
      undefined,
      'claude-haiku-4-5-20251001',
    )

    return {
      success: true,
      data: synthesis.content.trim(),
    }
  }
}
