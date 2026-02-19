import { Injectable } from '@nestjs/common'
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
    const provider = (input.providerOverride ?? settings.preferredProvider) as LLMProvider
    const preferredModel = provider === settings.preferredProvider
      ? (settings.preferredModel?.trim() || undefined)
      : undefined
    const userKey = await this.users.getRawLlmKey(input.userId, provider)
    const apiKey = userKey?.isActive ? (userKey.apiKey ?? undefined) : undefined
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
}
