import { Injectable } from '@nestjs/common'
import { LLMService } from '../../agent/llm.service'
import { UsersService } from '../../users/users.service'
import { NanobotBusService } from '../bus/nanobot-bus.service'
import type { NanobotDomainAgent, NanobotDomainCrewResult, NanobotDomainRole } from '../types'
import type { LLMProvider } from '@openagents/shared'

// Keywords that signal each domain is involved in a task
const DOMAIN_SIGNALS: Record<NanobotDomainRole, string[]> = {
  frontend: [
    'ui', 'ux', 'component', 'page', 'layout', 'css', 'style', 'react', 'next',
    'tailwind', 'html', 'button', 'form', 'modal', 'animation', 'responsive',
    'mobile', 'design', 'theme', 'dark mode', 'accessibility', 'a11y', 'view',
    'screen', 'display', 'render', 'client', 'browser',
  ],
  backend: [
    'api', 'endpoint', 'service', 'controller', 'route', 'server', 'nest',
    'express', 'node', 'handler', 'middleware', 'auth', 'jwt', 'session',
    'queue', 'worker', 'job', 'cron', 'event', 'webhook', 'socket',
  ],
  api: [
    'rest', 'graphql', 'openapi', 'swagger', 'dto', 'payload', 'request',
    'response', 'http', 'status code', 'endpoint', 'rate limit', 'versioning',
    'integration', 'third-party', 'external api', 'sdk', 'client library',
  ],
  database: [
    'database', 'db', 'schema', 'migration', 'model', 'table', 'column',
    'query', 'index', 'prisma', 'postgres', 'sql', 'redis', 'cache',
    'relation', 'foreign key', 'transaction', 'seed', 'data', 'store',
  ],
  devops: [
    'deploy', 'docker', 'container', 'ci', 'cd', 'pipeline', 'github actions',
    'kubernetes', 'vps', 'server', 'nginx', 'env', 'environment', 'build',
    'production', 'staging', 'monitoring', 'logs', 'infra', 'ssl', 'domain',
  ],
  testing: [
    'test', 'spec', 'unit test', 'integration test', 'e2e', 'playwright',
    'jest', 'mock', 'fixture', 'coverage', 'assertion', 'expect', 'describe',
    'it should', 'regression', 'qa', 'quality', 'bug', 'fix',
  ],
  security: [
    'security', 'auth', 'oauth', 'permission', 'role', 'rbac', 'xss', 'csrf',
    'injection', 'sanitize', 'validate', 'encrypt', 'hash', 'token', 'secret',
    'vulnerability', 'audit', 'owasp', 'rate limit', 'firewall', 'ssl', 'tls',
  ],
}

const DOMAIN_SYSTEM_PROMPTS: Record<NanobotDomainRole, string> = {
  frontend: [
    'You are the Frontend specialist in a parallel development crew.',
    'You own everything the user sees and touches: UI components, layouts, styles, responsiveness, accessibility, and client-side logic.',
    'Produce a focused implementation plan for your domain only.',
    'Return markdown with sections: Changes Needed, Implementation Steps, Edge Cases, Handoff Notes.',
    'Be concrete — name files, components, props, and Tailwind classes where relevant.',
  ].join('\n'),

  backend: [
    'You are the Backend specialist in a parallel development crew.',
    'You own server-side logic: services, controllers, middleware, queues, workers, and authentication.',
    'Produce a focused implementation plan for your domain only.',
    'Return markdown with sections: Changes Needed, Implementation Steps, Edge Cases, Handoff Notes.',
    'Be concrete — name files, services, methods, and data flows.',
  ].join('\n'),

  api: [
    'You are the API specialist in a parallel development crew.',
    'You own the contract layer: REST endpoints, DTOs, request/response shapes, error codes, versioning, and external integrations.',
    'Produce a focused implementation plan for your domain only.',
    'Return markdown with sections: Endpoints Affected, Schema Changes, Validation Rules, Handoff Notes.',
    'Be concrete — include HTTP methods, paths, status codes, and payload examples.',
  ].join('\n'),

  database: [
    'You are the Database specialist in a parallel development crew.',
    'You own data persistence: schema design, migrations, queries, indexes, relations, and caching strategy.',
    'Produce a focused implementation plan for your domain only.',
    'Return markdown with sections: Schema Changes, Migrations, Query Plan, Handoff Notes.',
    'Be concrete — include table names, column types, index rationale, and Prisma model changes.',
  ].join('\n'),

  devops: [
    'You are the DevOps specialist in a parallel development crew.',
    'You own deployment, infrastructure, CI/CD, environment config, monitoring, and reliability.',
    'Produce a focused implementation plan for your domain only.',
    'Return markdown with sections: Deployment Steps, Env Vars Needed, CI/CD Changes, Rollback Plan.',
    'Be concrete — include commands, file names, and environment-specific notes.',
  ].join('\n'),

  testing: [
    'You are the Testing specialist in a parallel development crew.',
    'You own test strategy: unit tests, integration tests, E2E tests, mocks, fixtures, and coverage targets.',
    'Produce a focused implementation plan for your domain only.',
    'Return markdown with sections: Tests to Write, Mocks Needed, Edge Cases, Coverage Goals.',
    'Be concrete — name test files, describe blocks, and critical assertions.',
  ].join('\n'),

  security: [
    'You are the Security specialist in a parallel development crew.',
    'You own security posture: auth checks, input validation, rate limiting, secrets management, and vulnerability surface.',
    'Produce a focused implementation plan for your domain only.',
    'Return markdown with sections: Risks Identified, Controls Needed, Validation Rules, Handoff Notes.',
    'Be concrete — reference OWASP categories, auth patterns, and specific code-level mitigations.',
  ].join('\n'),
}

interface LlmContext {
  provider: LLMProvider
  model?: string
  apiKey?: string
  baseUrl?: string
}

@Injectable()
export class NanobotDomainCrewService {
  constructor(
    private llm: LLMService,
    private users: UsersService,
    private bus: NanobotBusService,
  ) {}

  /**
   * Detect which domains a task touches based on keyword signals.
   * Returns at least one domain, defaults to ['backend'] if nothing matches.
   */
  detectDomains(task: string): NanobotDomainRole[] {
    const lower = task.toLowerCase()
    const detected: NanobotDomainRole[] = []

    for (const [domain, signals] of Object.entries(DOMAIN_SIGNALS) as [NanobotDomainRole, string[]][]) {
      const score = signals.filter((signal) => lower.includes(signal)).length
      if (score > 0) detected.push(domain)
    }

    // Default if nothing matched
    if (detected.length === 0) detected.push('backend')

    // Cap at 5 domains to keep output focused
    return detected.slice(0, 5)
  }

  /**
   * Run domain-specific agents in parallel for a given task.
   * Domains can be auto-detected or explicitly provided.
   */
  async run(input: {
    userId: string
    task: string
    domains?: NanobotDomainRole[]
    conversationId?: string
  }): Promise<NanobotDomainCrewResult> {
    const startedAt = Date.now()
    const domains = input.domains?.length
      ? input.domains
      : this.detectDomains(input.task)

    const llmContext = await this.resolveLlmContext(input.userId)

    // Publish start event so UI can show agents spawning
    this.bus.publish('subagent.spawned', {
      taskId: `domain-crew-${Date.now()}`,
      userId: input.userId,
      label: `Domain crew: ${domains.join(', ')}`,
      role: 'planner',
    })

    // Run all domain agents in parallel
    const agentDefs = domains.map((domain) => ({
      domain,
      label: `${domain} specialist`,
      objective: this.buildDomainObjective(domain, input.task),
    }))

    const results = await Promise.allSettled(
      agentDefs.map(async (def) => {
        const agentStart = Date.now()
        this.bus.publish('subagent.spawned', {
          taskId: `${def.domain}-${Date.now()}`,
          userId: input.userId,
          label: def.label,
          role: 'executor',
        })

        try {
          const output = await this.runDomainAgent({
            userId: input.userId,
            domain: def.domain,
            task: input.task,
            llmContext,
          })

          this.bus.publish('subagent.completed', {
            taskId: `${def.domain}-done`,
            userId: input.userId,
            label: def.label,
            role: 'executor',
          })

          return {
            domain: def.domain,
            label: def.label,
            objective: def.objective,
            output,
            status: 'done' as const,
            durationMs: Date.now() - agentStart,
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Domain agent failed'
          return {
            domain: def.domain,
            label: def.label,
            objective: def.objective,
            output: null,
            status: 'error' as const,
            durationMs: Date.now() - agentStart,
          } satisfies NanobotDomainAgent
        }
      }),
    )

    const agents: NanobotDomainAgent[] = results.map((result, index) => {
      if (result.status === 'fulfilled') return result.value
      return {
        domain: agentDefs[index].domain,
        label: agentDefs[index].label,
        objective: agentDefs[index].objective,
        output: null,
        status: 'error' as const,
        durationMs: null,
      }
    })

    const successful = agents.filter((a) => a.status === 'done' && a.output)
    const synthesis = this.synthesize(input.task, domains, successful)

    this.bus.publish('subagent.completed', {
      taskId: `domain-crew-done-${Date.now()}`,
      userId: input.userId,
      label: `Domain crew complete: ${successful.length}/${domains.length} agents succeeded`,
      role: 'planner',
    })

    return {
      task: input.task,
      domains,
      agents,
      synthesis,
      parallelized: domains.length > 1,
      durationMs: Date.now() - startedAt,
    }
  }

  private async runDomainAgent(input: {
    userId: string
    domain: NanobotDomainRole
    task: string
    llmContext: LlmContext
  }): Promise<string> {
    const systemPrompt = DOMAIN_SYSTEM_PROMPTS[input.domain]
    const userPrompt = [
      `Task: ${input.task}`,
      '',
      `Your role is ${input.domain} specialist. Focus only on your domain.`,
      'Another specialist is handling the other domains in parallel.',
      'Be specific, actionable, and hand off clearly what the next domain needs from you.',
    ].join('\n')

    try {
      const response = await this.llm.complete(
        [{ role: 'user', content: userPrompt }],
        [],
        systemPrompt,
        input.llmContext.provider,
        input.llmContext.apiKey,
        input.llmContext.baseUrl,
        input.llmContext.model,
      )
      const content = response.content.trim()
      if (content) return content.slice(0, 4_000)
    } catch (error: any) {
      // Fallback to Ollama if main provider key is missing
      if (
        input.llmContext.provider !== 'ollama'
        && typeof error?.message === 'string'
        && error.message.toLowerCase().includes('api key is not configured')
      ) {
        const ollama = await this.users.getRawLlmKey(input.userId, 'ollama')
        const response = await this.llm.complete(
          [{ role: 'user', content: userPrompt }],
          [],
          systemPrompt,
          'ollama',
          undefined,
          ollama?.isActive ? (ollama.baseUrl ?? undefined) : undefined,
          undefined,
        )
        const content = response.content.trim()
        if (content) return content.slice(0, 4_000)
      }
      throw error
    }

    return this.buildFallbackOutput(input.domain, input.task)
  }

  private buildDomainObjective(domain: NanobotDomainRole, task: string): string {
    const headline = task.replace(/\s+/g, ' ').trim().slice(0, 160)
    const scopes: Record<NanobotDomainRole, string> = {
      frontend: `Design and implement UI/UX changes for: ${headline}`,
      backend:  `Implement server-side logic and services for: ${headline}`,
      api:      `Define API contracts and integration points for: ${headline}`,
      database: `Design schema, migrations, and queries for: ${headline}`,
      devops:   `Plan deployment, infrastructure, and CI/CD for: ${headline}`,
      testing:  `Write test strategy and test cases for: ${headline}`,
      security: `Audit security posture and controls for: ${headline}`,
    }
    return scopes[domain]
  }

  private buildFallbackOutput(domain: NanobotDomainRole, task: string): string {
    const headline = task.replace(/\s+/g, ' ').trim().slice(0, 160)
    return [
      `## ${domain} specialist output`,
      `Task: ${headline}`,
      '',
      '**Changes Needed:** Review the task and identify what this domain owns.',
      '**Implementation Steps:** Break into small, testable increments.',
      '**Edge Cases:** Consider failure modes and boundary conditions.',
      '**Handoff Notes:** Document what adjacent domains need from this work.',
    ].join('\n')
  }

  private synthesize(
    task: string,
    domains: NanobotDomainRole[],
    successful: NanobotDomainAgent[],
  ): string {
    if (successful.length === 0) {
      return `All domain agents failed for task: ${task}`
    }

    const sections = successful.map((agent) => [
      `## ${agent.domain.toUpperCase()} (${agent.durationMs != null ? `${agent.durationMs}ms` : 'n/a'})`,
      agent.output ?? '',
    ].join('\n'))

    return [
      `# Domain Crew Output`,
      `**Task:** ${task}`,
      `**Domains covered:** ${domains.join(', ')}`,
      `**Agents succeeded:** ${successful.length}/${domains.length}`,
      '',
      ...sections,
      '',
      '---',
      '**Next steps:** Review each domain output, resolve cross-domain dependencies, then implement in parallel.',
    ].join('\n')
  }

  private async resolveLlmContext(userId: string): Promise<LlmContext> {
    const settings = await this.users.getSettings(userId)
    const provider = this.normalizeProvider(settings.preferredProvider) ?? 'anthropic'
    const model = settings.preferredModel?.trim() || undefined
    const key = await this.users.getRawLlmKey(userId, provider)
    return {
      provider,
      model,
      apiKey: key?.isActive ? (key.apiKey ?? undefined) : undefined,
      baseUrl: key?.isActive ? (key.baseUrl ?? undefined) : undefined,
    }
  }

  private normalizeProvider(value?: string | null): LLMProvider | null {
    const v = (value ?? '').trim().toLowerCase()
    if (
      v === 'anthropic' || v === 'openai' || v === 'google'
      || v === 'ollama' || v === 'minimax' || v === 'perplexity'
    ) return v as LLMProvider
    return null
  }
}
