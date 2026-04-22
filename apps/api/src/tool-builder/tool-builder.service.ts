import { Injectable, Logger } from '@nestjs/common'

export interface CustomTool {
  id: string
  userId: string
  name: string
  description: string
  parameters: Array<{
    name: string
    type: 'string' | 'number' | 'boolean' | 'object'
    description: string
    required: boolean
    default?: unknown
  }>
  implementation: {
    type: 'http' | 'script' | 'chain'
    // HTTP: call an external endpoint
    url?: string
    method?: string
    headers?: Record<string, string>
    bodyTemplate?: string
    // Script: run JavaScript/TypeScript code
    code?: string
    // Chain: run a sequence of existing tools
    toolChain?: Array<{ toolName: string; inputMap: Record<string, string> }>
  }
  requiresApproval: boolean
  isPublic: boolean
  version: number
  testInput?: Record<string, unknown>
  testOutput?: unknown
  createdAt: string
  updatedAt: string
}

@Injectable()
export class ToolBuilderService {
  private readonly logger = new Logger(ToolBuilderService.name)
  private customTools = new Map<string, CustomTool>()

  async create(input: {
    userId: string
    name: string
    description: string
    parameters?: CustomTool['parameters']
    implementation: CustomTool['implementation']
    requiresApproval?: boolean
    isPublic?: boolean
  }): Promise<CustomTool> {
    const normalizedName = input.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (!normalizedName) throw new Error('Tool name must contain alphanumeric characters')

    const tool: CustomTool = {
      id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: input.userId,
      name: `custom_${normalizedName}`,
      description: input.description,
      parameters: input.parameters ?? [],
      implementation: input.implementation,
      requiresApproval: input.requiresApproval ?? true,
      isPublic: input.isPublic ?? false,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    this.customTools.set(tool.id, tool)
    this.logger.log(`Created custom tool "${tool.name}" for user ${input.userId}`)
    return tool
  }

  async update(toolId: string, patch: Partial<Pick<CustomTool, 'description' | 'parameters' | 'implementation' | 'requiresApproval' | 'isPublic'>>): Promise<CustomTool | null> {
    const tool = this.customTools.get(toolId)
    if (!tool) return null

    Object.assign(tool, patch, {
      version: tool.version + 1,
      updatedAt: new Date().toISOString(),
    })
    return tool
  }

  async execute(toolId: string, input: Record<string, unknown>): Promise<{ success: boolean; output: unknown; error?: string }> {
    const tool = this.customTools.get(toolId)
    if (!tool) return { success: false, output: null, error: 'Tool not found' }

    try {
      if (tool.implementation.type === 'http' && tool.implementation.url) {
        const response = await fetch(tool.implementation.url, {
          method: tool.implementation.method ?? 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(tool.implementation.headers ?? {}),
          },
          body: JSON.stringify(input),
        })
        const data = await response.json()
        return { success: response.ok, output: data }
      }

      if (tool.implementation.type === 'script' && tool.implementation.code) {
        // Sandboxed execution would go here — for safety, return the code for review
        return {
          success: true,
          output: { message: 'Script execution requires sandbox setup', code: tool.implementation.code, input },
        }
      }

      if (tool.implementation.type === 'chain' && tool.implementation.toolChain) {
        return {
          success: true,
          output: { message: 'Tool chain execution', steps: tool.implementation.toolChain.length },
        }
      }

      return { success: false, output: null, error: 'Unknown implementation type' }
    } catch (error: any) {
      return { success: false, output: null, error: error?.message ?? 'Execution failed' }
    }
  }

  async list(userId: string): Promise<CustomTool[]> {
    return Array.from(this.customTools.values())
      .filter((t) => t.userId === userId || t.isPublic)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }

  async get(toolId: string): Promise<CustomTool | null> {
    return this.customTools.get(toolId) ?? null
  }

  async delete(toolId: string): Promise<boolean> {
    return this.customTools.delete(toolId)
  }

  async getToolDefinitions(userId: string): Promise<Array<{ name: string; description: string; parameters: Record<string, unknown> }>> {
    const tools = await this.list(userId)
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          tool.parameters.map((p) => [
            p.name,
            { type: p.type, description: p.description, ...(p.default !== undefined ? { default: p.default } : {}) },
          ]),
        ),
        required: tool.parameters.filter((p) => p.required).map((p) => p.name),
      },
    }))
  }
}
