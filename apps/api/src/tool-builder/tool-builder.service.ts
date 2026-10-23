import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ToolsService } from '../tools/tools.service'
import { CodeExecutionTool, type CodeLanguage } from '../tools/connectors/code-execution.tool'
import { assertPublicHttpUrl } from '../frontier/safe-fetch'
import type { ToolResult } from '@openagents/shared'

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
    language?: CodeLanguage
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

const HTTP_TIMEOUT_MS = 20_000
const MAX_HTTP_BODY_CHARS = 200_000
const MAX_CHAIN_STEPS = 10

/**
 * Resolves `{{step0.output.foo}}` references against earlier chain steps.
 *
 * A value that is *exactly* one reference keeps the referenced value's type
 * (so a number stays a number). A reference embedded in a larger string is
 * interpolated into it.
 */
function resolveReference(expression: string, steps: Array<{ output: unknown }>): unknown {
  const whole = expression.match(/^\{\{step(\d+)\.([\w.]+)\}\}$/)
  if (whole) {
    return readStepValue(steps, Number(whole[1]), whole[2].split('.'))
  }

  return expression.replace(/\{\{step(\d+)\.([\w.]+)\}\}/g, (match, stepIndex: string, path: string) => {
    const value = readStepValue(steps, Number(stepIndex), path.split('.'))
    if (value === undefined || value === null) return ''
    return typeof value === 'string' ? value : JSON.stringify(value)
  })
}

function readStepValue(steps: Array<{ output: unknown }>, stepIndex: number, path: string[]): unknown {
  const step = steps[stepIndex]
  if (!step) return undefined

  // The path is resolved against the whole step, so `output.foo` reaches into
  // the step's result object.
  let current: any = step
  for (const key of path) {
    if (current === null || current === undefined) return undefined
    current = current[key]
  }
  return current
}

@Injectable()
export class ToolBuilderService implements OnModuleInit {
  private readonly logger = new Logger(ToolBuilderService.name)

  constructor(
    private prisma: PrismaService,
    private tools: ToolsService,
    private codeExecution: CodeExecutionTool,
  ) {}

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
    if (!normalizedName) throw new BadRequestException('Tool name must contain alphanumeric characters')

    this.assertImplementation(input.implementation)

    const name = `custom_${normalizedName}`
    const existing = await this.prisma.customTool.findFirst({ where: { userId: input.userId, name } })
    if (existing) {
      throw new BadRequestException(`You already have a tool called "${name}".`)
    }

    const row = await this.prisma.customTool.create({
      data: {
        userId: input.userId,
        name,
        description: input.description,
        parameters: JSON.parse(JSON.stringify(input.parameters ?? [])),
        implementation: JSON.parse(JSON.stringify(input.implementation)),
        requiresApproval: input.requiresApproval ?? true,
        isPublic: input.isPublic ?? false,
      },
    })

    const tool = this.toCustomTool(row)
    this.registerWithAgent(tool)
    this.logger.log(`Created custom tool "${tool.name}" for user ${input.userId}`)
    return tool
  }

  async update(toolId: string, userId: string, patch: Partial<Pick<CustomTool, 'description' | 'parameters' | 'implementation' | 'requiresApproval' | 'isPublic'>>): Promise<CustomTool | null> {
    const row = await this.prisma.customTool.findFirst({ where: { id: toolId, userId } })
    if (!row) return null

    if (patch.implementation) this.assertImplementation(patch.implementation)

    const updated = await this.prisma.customTool.update({
      where: { id: toolId },
      data: {
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.parameters !== undefined ? { parameters: JSON.parse(JSON.stringify(patch.parameters)) } : {}),
        ...(patch.implementation !== undefined ? { implementation: JSON.parse(JSON.stringify(patch.implementation)) } : {}),
        ...(patch.requiresApproval !== undefined ? { requiresApproval: patch.requiresApproval } : {}),
        ...(patch.isPublic !== undefined ? { isPublic: patch.isPublic } : {}),
        version: { increment: 1 },
      },
    })

    const tool = this.toCustomTool(updated)
    this.registerWithAgent(tool)
    return tool
  }

  async execute(toolId: string, input: Record<string, unknown>): Promise<{ success: boolean; output: unknown; error?: string }> {
    const tool = await this.get(toolId)
    if (!tool) return { success: false, output: null, error: 'Tool not found' }

    try {
      if (tool.implementation.type === 'http') {
        return await this.executeHttp(tool, input)
      }
      if (tool.implementation.type === 'script') {
        return await this.executeScript(tool, input)
      }
      if (tool.implementation.type === 'chain') {
        return await this.executeChain(tool, input)
      }
      return { success: false, output: null, error: 'Unknown implementation type' }
    } catch (error: any) {
      return { success: false, output: null, error: error?.message ?? 'Execution failed' }
    }
  }

  // ── Implementations ───────────────────────────────────────────────────────

  private async executeHttp(
    tool: CustomTool,
    input: Record<string, unknown>,
  ): Promise<{ success: boolean; output: unknown; error?: string }> {
    const rawUrl = tool.implementation.url?.trim()
    if (!rawUrl) return { success: false, output: null, error: 'This tool has no url configured.' }

    let url: URL
    try {
      // Custom tools are user-authored — block requests to private addresses.
      url = await assertPublicHttpUrl(rawUrl)
    } catch (error: any) {
      return { success: false, output: null, error: `Blocked target: ${error?.message ?? error}` }
    }

    const method = (tool.implementation.method ?? 'POST').toUpperCase()
    const body = tool.implementation.bodyTemplate
      ? this.renderTemplate(tool.implementation.bodyTemplate, input)
      : JSON.stringify(input)

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(tool.implementation.headers ?? {}),
        },
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      })

      const text = (await response.text()).slice(0, MAX_HTTP_BODY_CHARS)
      let parsed: unknown = text
      try {
        parsed = JSON.parse(text)
      } catch {
        // keep the raw text
      }

      return {
        success: response.ok,
        output: { status: response.status, body: parsed },
        error: response.ok ? undefined : `Endpoint returned ${response.status}`,
      }
    } catch (error: any) {
      return { success: false, output: null, error: error?.message ?? 'Request failed' }
    }
  }

  /**
   * Runs the script in the shared code-execution sandbox (child process, scrubbed
   * environment, timeout, output cap). The script receives `input` and its
   * stdout is the tool output.
   */
  private async executeScript(
    tool: CustomTool,
    input: Record<string, unknown>,
  ): Promise<{ success: boolean; output: unknown; error?: string }> {
    const code = tool.implementation.code?.trim()
    if (!code) return { success: false, output: null, error: 'This tool has no script configured.' }

    const language = tool.implementation.language ?? 'node'
    const payload = JSON.stringify(input ?? {})

    const wrapped = language === 'python' || language === 'bash'
      ? code
      : `const input = ${payload};\n${code}\n`

    const result: ToolResult = await this.codeExecution.execute(
      { language, code: wrapped },
      tool.userId,
    )

    if (!result.success) {
      const details = result.output as { stdout?: string; stderr?: string; exit_code?: number } | null
      return {
        success: false,
        output: result.output,
        error: result.error ?? details?.stderr?.slice(0, 500) ?? 'Script failed',
      }
    }

    const details = result.output as { stdout?: string; stderr?: string; exit_code?: number } | null
    const stdout = (details?.stdout ?? '').trim()
    let output: unknown = stdout
    try {
      output = stdout ? JSON.parse(stdout) : null
    } catch {
      // stdout is plain text — keep it as-is
    }

    return { success: true, output }
  }

  /**
   * Runs the configured tools in order. Each step's input map may reference an
   * earlier step with `{{step0.output.path}}`; anything else is a literal.
   */
  private async executeChain(
    tool: CustomTool,
    input: Record<string, unknown>,
  ): Promise<{ success: boolean; output: unknown; error?: string }> {
    const chain = tool.implementation.toolChain ?? []
    if (chain.length === 0) return { success: false, output: null, error: 'This tool has an empty chain.' }
    if (chain.length > MAX_CHAIN_STEPS) {
      return { success: false, output: null, error: `A chain may have at most ${MAX_CHAIN_STEPS} steps.` }
    }

    const steps: Array<{ toolName: string; input: Record<string, unknown>; output: unknown; success: boolean; error?: string }> = []

    for (const step of chain) {
      const stepInput: Record<string, unknown> = {}
      for (const [key, expression] of Object.entries(step.inputMap ?? {})) {
        stepInput[key] = resolveReference(expression, steps)
      }
      // Unmapped params fall through from the tool's own input.
      for (const [key, value] of Object.entries(input)) {
        if (!(key in stepInput)) stepInput[key] = value
      }

      const result = await this.tools.execute(step.toolName, stepInput, tool.userId)
      steps.push({
        toolName: step.toolName,
        input: stepInput,
        output: result.output,
        success: result.success,
        error: result.error,
      })

      if (!result.success) {
        return {
          success: false,
          output: { steps },
          error: `Step "${step.toolName}" failed: ${result.error ?? 'unknown error'}`,
        }
      }
    }

    return {
      success: true,
      output: { steps, result: steps[steps.length - 1]?.output ?? null },
    }
  }

  /** Replaces `{{param}}` placeholders in a body template. */
  private renderTemplate(template: string, input: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
      const value = path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), input)
      if (value === undefined || value === null) return ''
      return typeof value === 'string' ? value : JSON.stringify(value)
    })
  }

  // ── Agent registration ────────────────────────────────────────────────────

  /** Makes the custom tool callable by the agent. */
  private registerWithAgent(tool: CustomTool) {
    this.tools.registerDynamicTool(
      tool.name,
      {
        name: tool.name,
        displayName: tool.name,
        description: tool.description,
        requiresApproval: tool.requiresApproval,
        inputSchema: this.buildInputSchema(tool),
        source: 'mcp',
      },
      async (input: Record<string, unknown>) => {
        const outcome = await this.execute(tool.id, input ?? {})
        return {
          success: outcome.success,
          output: outcome.output,
          error: outcome.error,
        }
      },
      tool.userId,
      tool.isPublic,
    )
  }

  /**
   * Re-registers the persisted custom tools with the agent's tool registry so
   * they survive an API restart.
   */
  async onModuleInit() {
    try {
      const rows = await this.prisma.customTool.findMany()
      for (const row of rows) {
        this.registerWithAgent(this.toCustomTool(row))
      }
      if (rows.length) {
        this.logger.log(`Re-registered ${rows.length} persisted custom tool(s) with the agent`)
      }
    } catch (error: any) {
      this.logger.warn(`Could not re-register custom tools: ${error?.message ?? error}`)
    }
  }

  private buildInputSchema(tool: CustomTool): Record<string, unknown> {
    return {
      type: 'object',
      properties: Object.fromEntries(
        tool.parameters.map((p) => [
          p.name,
          { type: p.type, description: p.description, ...(p.default !== undefined ? { default: p.default } : {}) },
        ]),
      ),
      required: tool.parameters.filter((p) => p.required).map((p) => p.name),
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async list(userId: string): Promise<CustomTool[]> {
    const rows = await this.prisma.customTool.findMany({
      where: { OR: [{ userId }, { isPublic: true }] },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map((row) => this.toCustomTool(row))
  }

  async get(toolId: string): Promise<CustomTool | null> {
    const row = await this.prisma.customTool.findUnique({ where: { id: toolId } })
    return row ? this.toCustomTool(row) : null
  }

  async delete(toolId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.customTool.findFirst({ where: { id: toolId, userId } })
    if (!row) return false
    await this.prisma.customTool.delete({ where: { id: toolId } })
    this.tools.unregisterDynamicTool(row.name)
    return true
  }

  async getToolDefinitions(userId: string): Promise<Array<{ name: string; description: string; parameters: Record<string, unknown> }>> {
    const tools = await this.list(userId)
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: this.buildInputSchema(tool),
    }))
  }

  private toCustomTool(row: {
    id: string
    userId: string
    name: string
    description: string
    parameters: unknown
    implementation: unknown
    requiresApproval: boolean
    isPublic: boolean
    version: number
    createdAt: Date
    updatedAt: Date
  }): CustomTool {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      description: row.description,
      parameters: (row.parameters as CustomTool['parameters']) ?? [],
      implementation: row.implementation as CustomTool['implementation'],
      requiresApproval: row.requiresApproval,
      isPublic: row.isPublic,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private assertImplementation(implementation: CustomTool['implementation']) {
    if (!implementation?.type) {
      throw new BadRequestException('implementation.type is required.')
    }
    if (implementation.type === 'http' && !implementation.url?.trim()) {
      throw new BadRequestException('An http tool needs a url.')
    }
    if (implementation.type === 'script' && !implementation.code?.trim()) {
      throw new BadRequestException('A script tool needs code.')
    }
    if (implementation.type === 'chain') {
      if (!Array.isArray(implementation.toolChain) || implementation.toolChain.length === 0) {
        throw new BadRequestException('A chain tool needs at least one step.')
      }
      for (const step of implementation.toolChain) {
        if (!step?.toolName?.trim()) {
          throw new BadRequestException('Every chain step needs a toolName.')
        }
      }
    }
  }
}
