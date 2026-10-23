import { Injectable, Inject, forwardRef } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import type { SelfLearnResult } from '../../learning/self-learn.service'

/**
 * Backend contract for the self-teaching loop. The tool file holds NO value
 * import of the service (tools.service sits in a module cycle with
 * LearningModule; a value import here poisoned type inference for unrelated
 * modules once already — see the content-pipeline build notes in TODO.md).
 */
export interface SelfLearnBackend {
  learn(userId: string, input: { topic: string; question?: string; saveSkill?: boolean }): Promise<SelfLearnResult>
}

export const SELF_LEARN_BACKEND = Symbol('SELF_LEARN_BACKEND')

/**
 * The agent's "teach yourself" tool. Called when the agent doesn't know
 * something or the user asks for a capability it lacks: it researches the
 * web, writes durable study notes to the library, records key facts, and
 * auto-saves a reusable skill when the topic has an actionable procedure.
 */
@Injectable()
export class SelfLearnTool {
  constructor(
    @Inject(forwardRef(() => SELF_LEARN_BACKEND))
    private readonly selfLearn: SelfLearnBackend,
  ) {}

  get def(): ToolDefinition {
    return {
      name: 'self_learn',
      displayName: 'Self-Learn (Teach Yourself)',
      description:
        'Teach yourself a topic or capability you do not know, in one call: research the web, write durable study notes into the user\'s knowledge library, record key facts to memory, and (for how-to topics) auto-save a reusable skill to the user\'s skill library. Call this BEFORE ever saying you don\'t know something, when the user asks for anything outside your knowledge, or when you want a repeatable procedure captured. Return includes the summary you can use immediately.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'The topic or capability to learn (e.g. "how to deploy Next.js on Cloudflare")' },
          question: { type: 'string', description: 'The specific question to answer. Defaults to the topic.' },
          saveSkill: { type: 'boolean', description: 'Auto-save the learned procedure as a reusable skill (default true)' },
        },
        required: ['topic'],
      },
    }
  }

  async run(input: { topic?: string; question?: string; saveSkill?: boolean }, userId: string): Promise<ToolResult> {
    const topic = String(input?.topic ?? '').trim()
    if (!topic) return { success: false, output: null, error: 'topic is required.' }
    try {
      const result = await this.selfLearn.learn(userId, {
        topic: topic.slice(0, 300),
        question: input?.question?.trim() ? input.question.trim().slice(0, 800) : topic,
        saveSkill: input?.saveSkill !== false,
      })
      if (!result.success) {
        return { success: false, output: null, error: result.error ?? 'Self-learning failed.' }
      }
      return { success: true, output: result }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Self-learning failed.' }
    }
  }
}
