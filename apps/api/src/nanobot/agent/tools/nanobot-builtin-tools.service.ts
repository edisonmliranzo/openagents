import { Injectable } from '@nestjs/common'
import { ToolsService } from '../../../tools/tools.service'
import type { NanobotToolDef } from '../../types'

@Injectable()
export class NanobotBuiltinToolsService {
  constructor(private tools: ToolsService) {}

  async list(userId: string): Promise<NanobotToolDef[]> {
    const available = await this.tools.getAvailableForUser(userId)
    return available.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }))
  }

  async execute(userId: string, toolName: string, input: Record<string, unknown>) {
    return this.tools.execute(toolName, input, userId)
  }
}

