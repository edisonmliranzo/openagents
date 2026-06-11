import { Injectable, Logger } from '@nestjs/common'
import { LLMService, LLMMessage } from '../agent/llm.service'
import { PrismaService } from '../prisma/prisma.service'
import { SubAgentConfig, DelegationResult } from './delegation.service'

@Injectable()
export class SubagentService {
  private readonly logger = new Logger(SubagentService.name)

  constructor(
    private readonly llm: LLMService,
    private readonly prisma: PrismaService,
  ) {}

  async executeSubAgent(
    userId: string,
    objective: string,
    config: SubAgentConfig,
  ): Promise<Partial<DelegationResult>> {
    this.logger.log(`Spawning sub-agent "${config.name}" (preset: ${config.preset ?? 'default'}) for objective: ${objective}`)

    // Get user's preferred LLM settings
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    }).catch(() => null)

    const provider = (settings?.preferredProvider as any) ?? 'openai'
    const model = settings?.preferredModel ?? undefined

    // Formulate a specialized system prompt based on sub-agent role
    const roleName = config.name.toLowerCase()
    let specialization = 'general operations'
    if (roleName.includes('frontend') || roleName.includes('ui') || roleName.includes('ux')) {
      specialization = 'Frontend Web Development (React, TypeScript, CSS, visual aesthetics)'
    } else if (roleName.includes('backend') || roleName.includes('server') || roleName.includes('api')) {
      specialization = 'Backend Engineering (Node.js, NestJS, API design, performance, security)'
    } else if (roleName.includes('database') || roleName.includes('db') || roleName.includes('sql')) {
      specialization = 'Database Administration & Architecture (Postgres, Prisma, indexing, query optimization)'
    } else if (roleName.includes('devops') || roleName.includes('infra') || roleName.includes('docker')) {
      specialization = 'DevOps & Systems Engineering (Docker, deployment scripts, CI/CD, environment tuning)'
    } else if (roleName.includes('testing') || roleName.includes('qa') || roleName.includes('test')) {
      specialization = 'Quality Assurance & Software Testing (unit testing, integration testing, e2e validation)'
    } else if (roleName.includes('research') || roleName.includes('search') || roleName.includes('analyst')) {
      specialization = 'Information Research & Data Analysis (gathering facts, analyzing details, structured reports)'
    }

    const systemPrompt = `You are a specialized sub-agent role "${config.name}" expert in ${specialization}.
You are spawned to accomplish a specific objective: "${objective}".
Provide a detailed, complete, and accurate output that solves the objective. Be concise, technical, and directly target the goal. Do not include introductory chatter.`

    const messages: LLMMessage[] = [
      {
        role: 'user',
        content: `Spawn objective: "${objective}". Begin analysis and produce output.`,
      },
    ]

    const startTime = Date.now()
    try {
      const result = await this.llm.complete(
        messages,
        [], // no tools for sub-agents to avoid runaway execution loops
        systemPrompt,
        provider,
        undefined, // user apiKey from env
        undefined, // baseUrl from env
        model,
      )

      const durationMs = Date.now() - startTime

      return {
        subAgentId: config.id,
        subAgentName: config.name,
        status: 'completed',
        output: result.content,
        confidence: 0.9,
        tokensUsed: 100 + Math.round(result.content.length / 4), // rough estimate of tokens
        durationMs,
        completedAt: new Date().toISOString(),
      }
    } catch (error: any) {
      this.logger.error(`Sub-agent "${config.name}" failed: ${error.message}`)
      const durationMs = Date.now() - startTime
      return {
        subAgentId: config.id,
        subAgentName: config.name,
        status: 'failed',
        output: `Error during sub-agent run: ${error.message}`,
        confidence: 0.0,
        tokensUsed: 0,
        durationMs,
        completedAt: new Date().toISOString(),
      }
    }
  }
}
