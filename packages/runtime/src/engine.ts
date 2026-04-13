import type {
  AgentConfig,
  AgentRun,
  AgentStatus,
  LLMProvider,
} from '@openagents/shared/types/agent'
import type {
  Message,
  MessageRole,
  ToolCall,
  ToolResult,
} from '@openagents/shared/types/conversation'
import type { Tool } from '@openagents/shared/types/tool'
import type { PolicyEvaluationInput, PolicyDecision } from '@openagents/shared/types/policy'

export interface LLMClient {
  provider: LLMProvider
  model: string
  complete(messages: Message[], options?: LLMOptions): Promise<LLMResponse>
}

export interface LLMOptions {
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  tools?: ToolDefinition[]
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
}

export interface LLMResponse {
  content: string
  toolCalls?: ToolCall[]
  finishReason: 'stop' | 'length' | 'tool_use' | 'content_filter' | 'error'
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ExecutionContext {
  run: AgentRun
  messages: Message[]
  tools: Map<string, Tool>
  toolResults: Map<string, ToolResult>
  state: ExecutionState
}

export interface ExecutionState {
  status: AgentStatus
  stepCount: number
  totalTokens: number
  totalCostUsd: number
  approvalIds: string[]
  errors: string[]
}

export interface ToolExecutor {
  execute(tool: Tool, input: Record<string, unknown>): Promise<ToolResult>
}

export interface PolicyEvaluator {
  evaluate(input: PolicyEvaluationInput): Promise<PolicyDecision>
}

export type ReasoningMode = 'direct' | 'chain_of_thought' | 'tree_of_thought' | 'graph_of_thought'

export interface ReasoningOptions {
  mode: ReasoningMode
  maxBranches?: number
  maxDepth?: number
  confidenceThreshold?: number
}

export interface ThoughtStep {
  id: string
  content: string
  confidence: number
  parentId: string | null
  children: string[]
  工具?: string
  result?: string
}

export class AgentEngine {
  private llm: LLMClient
  private executor: ToolExecutor
  private evaluator: PolicyEvaluator

  constructor(config: { llm: LLMClient; executor: ToolExecutor; evaluator: PolicyEvaluator }) {
    this.llm = config.llm
    this.executor = config.executor
    this.evaluator = config.evaluator
  }

  async run(input: {
    config: AgentConfig
    messages: Message[]
    tools: Tool[]
    context?: Record<string, unknown>
  }): Promise<{ run: AgentRun; finalMessage: Message }> {
    const run: AgentRun = {
      id: this.generateId(),
      conversationId: input.messages[0]?.conversationId || this.generateId(),
      status: 'thinking',
      startedAt: new Date().toISOString(),
      finishedAt: null,
    }

    const toolDefs = input.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    }))

    const systemPrompt = input.config.systemPrompt || this.getDefaultSystemPrompt()

    const allMessages: Message[] = [
      {
        id: this.generateId(),
        conversationId: run.conversationId,
        role: 'system',
        content: systemPrompt,
        status: 'done',
        createdAt: new Date().toISOString(),
      },
      ...input.messages,
    ]

    let context: ExecutionState = {
      status: 'thinking',
      stepCount: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      approvalIds: [],
      errors: [],
    }

    let lastMessage = allMessages[allMessages.length - 1]

    while (context.status === 'thinking') {
      context.stepCount++

      const response = await this.llm.complete(allMessages, {
        temperature: input.config.temperature,
        maxTokens: input.config.maxTokens,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
      })

      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const tc of response.toolCalls) {
          const tool = input.tools.find((t) => t.name === tc.toolName)
          if (!tool) {
            const errorResult: ToolResult = {
              success: false,
              output: null,
              error: `Tool not found: ${tc.toolName}`,
            }
            allMessages.push(this.createToolResultMessage(run.conversationId, tc, errorResult))
            continue
          }

          context.status = 'running_tool'

          const policyInput: PolicyEvaluationInput = {
            action: 'tool_call',
            toolName: tool.name,
            scope: tool.name.includes('write') ? 'external_write' : 'external_read',
          }

          const policyDecision = await this.evaluator.evaluate(policyInput)

          if (policyDecision === 'block') {
            const blockedResult: ToolResult = {
              success: false,
              output: null,
              error: 'Tool call blocked by policy',
            }
            allMessages.push(this.createToolResultMessage(run.conversationId, tc, blockedResult))
            context.status = 'thinking'
            continue
          }

          if (policyDecision === 'confirm') {
            context.status = 'waiting_approval'
            run.status = 'waiting_approval'
            break
          }

          const toolResult = await this.executor.execute(tool, tc.input)
          allMessages.push(this.createToolResultMessage(run.conversationId, tc, toolResult))

          context.status = 'thinking'
        }
      } else {
        run.status = 'done'
        run.finishedAt = new Date().toISOString()
        context.status = 'done'

        lastMessage = {
          id: this.generateId(),
          conversationId: run.conversationId,
          role: 'agent',
          content: response.content,
          status: 'done',
          createdAt: new Date().toISOString(),
        }
        allMessages.push(lastMessage)
      }

      if (response.usage) {
        context.totalTokens += response.usage.totalTokens
      }
    }

    if (context.status === 'done') {
      run.status = 'done'
      run.finishedAt = new Date().toISOString()
    } else if (context.status === 'error') {
      run.status = 'error'
      run.finishedAt = new Date().toISOString()
      run.error = context.errors[context.errors.length - 1]
    }

    return { run, finalMessage: lastMessage }
  }

  async runChainOfThought(input: {
    config: AgentConfig
    messages: Message[]
    tools: Tool[]
    maxDepth?: number
  }): Promise<{ thinking: ThoughtStep[]; finalMessage: Message }> {
    const maxDepth = input.maxDepth || 5
    const thinking: ThoughtStep[] = []
    const rootId = this.generateId()

    thinking.push({
      id: rootId,
      content: input.messages[input.messages.length - 1]?.content || '',
      confidence: 1.0,
      parentId: null,
      children: [],
    })

    let currentDepth = 0

    while (currentDepth < maxDepth) {
      const parentStep = thinking[thinking.length - 1]

      const response = await this.llm.complete(input.messages, {
        systemPrompt: `Think step by step about this problem. Be concise and explicit about your reasoning.`,
        temperature: 0.7,
      })

      const stepId = this.generateId()
      const step: ThoughtStep = {
        id: stepId,
        content: response.content,
        confidence: 0.8,
        parentId: parentStep.id,
        children: [],
      }

      parentStep.children.push(stepId)
      thinking.push(step)

      if (response.finishReason === 'stop') {
        break
      }

      currentDepth++
    }

    const finalMessage: Message = {
      id: this.generateId(),
      conversationId: input.messages[0]?.conversationId || this.generateId(),
      role: 'agent',
      content: thinking[thinking.length - 1]?.content || '',
      status: 'done',
      createdAt: new Date().toISOString(),
    }

    return { thinking, finalMessage }
  }

  async runTreeOfThought(input: {
    config: AgentConfig
    messages: Message[]
    tools: Tool[]
    maxBranches?: number
  }): Promise<{ branches: ThoughtStep[][]; finalMessage: Message }> {
    const maxBranches = input.maxBranches || 3

    const branches: ThoughtStep[][] = []

    for (let i = 0; i < maxBranches; i++) {
      const branch = await this.runChainOfThought({
        config: { ...input.config, temperature: (input.config.temperature || 0.7) + i * 0.1 },
        messages: input.messages,
        tools: input.tools,
        maxDepth: 3,
      })
      branches.push(branch.thinking)
    }

    const scores = await Promise.all(
      branches.map(async (branch) => {
        const lastStep = branch[branch.length - 1]
        const evalResponse = await this.llm.complete(
          [
            {
              id: this.generateId(),
              conversationId: input.messages[0]?.conversationId || this.generateId(),
              role: 'user',
              content: `Evaluate this solution for quality and correctness: ${lastStep?.content}`,
              status: 'done',
              createdAt: new Date().toISOString(),
            },
          ],
          { temperature: 0.1 },
        )
        return parseFloat(evalResponse.content) || 0.5
      }),
    )

    const bestBranchIndex = scores.indexOf(Math.max(...scores))
    const bestBranch = branches[bestBranchIndex]

    const finalMessage: Message = {
      id: this.generateId(),
      conversationId: input.messages[0]?.conversationId || this.generateId(),
      role: 'agent',
      content: bestBranch[bestBranch.length - 1]?.content || '',
      status: 'done',
      createdAt: new Date().toISOString(),
    }

    return { branches, finalMessage }
  }

  private getDefaultSystemPrompt(): string {
    return `You are an expert AI assistant. You have access to various tools to help accomplish tasks.
Think step by step and use the available tools when needed.
Always explain your reasoning and confirm important actions before executing them.`
  }

  private createToolResultMessage(
    conversationId: string,
    toolCall: ToolCall,
    result: ToolResult,
  ): Message {
    return {
      id: this.generateId(),
      conversationId,
      role: 'tool',
      content: result.success
        ? JSON.stringify(result.output)
        : result.error || 'Tool execution failed',
      status: 'done',
      toolCall,
      toolResult: result,
      createdAt: new Date().toISOString(),
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }
}

export function createToolExecutor(): ToolExecutor {
  return {
    async execute(tool: Tool, input: Record<string, unknown>): Promise<ToolResult> {
      await new Promise((resolve) => setTimeout(resolve, 100))

      return {
        success: true,
        output: { executed: true, tool: tool.name, input },
      }
    },
  }
}

export function createPolicyEvaluator(): PolicyEvaluator {
  return {
    async evaluate(input: PolicyEvaluationInput): Promise<PolicyDecision> {
      const criticalTools = ['delete', 'remove', 'drop', 'exec', 'shell']
      const toolName = input.toolName?.toLowerCase() || ''

      for (const critical of criticalTools) {
        if (toolName.includes(critical)) {
          return 'confirm'
        }
      }

      if (input.scope === 'system_mutation') {
        return 'confirm'
      }

      if ((input.estimatedCostUsd || 0) > 1.0) {
        return 'confirm'
      }

      return 'auto'
    },
  }
}
