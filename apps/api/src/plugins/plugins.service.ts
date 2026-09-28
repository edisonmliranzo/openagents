import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { McpService } from '../tools/mcp.service'
import { PLUGIN_CATALOG, type McpServerTemplate } from './plugin-catalog'

export interface PluginRow {
  key: string
  name: string
  description: string
  category: string
  requiresEnv?: string[]
  installed: boolean
  enabled: boolean
}

@Injectable()
export class PluginsService {
  private readonly logger = new Logger(PluginsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mcp: McpService,
  ) {}

  async list(userId: string): Promise<PluginRow[]> {
    const states = await this.prisma.userPlugin.findMany({ where: { userId } })
    const byKey = new Map(states.map((state) => [state.key, state]))
    return PLUGIN_CATALOG.map((plugin) => ({
      key: plugin.key,
      name: plugin.name,
      description: plugin.description,
      category: plugin.category,
      requiresEnv: plugin.requiresEnv,
      installed: byKey.has(plugin.key),
      enabled: byKey.get(plugin.key)?.enabled ?? false,
    }))
  }

  async setEnabled(userId: string, key: string, enabled: boolean): Promise<PluginRow> {
    const plugin = PLUGIN_CATALOG.find((entry) => entry.key === key)
    if (!plugin) throw new BadRequestException(`Unknown plugin "${key}".`)

    await this.prisma.userPlugin.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, enabled },
      update: { enabled },
    })

    if (enabled) {
      this.registerPlugin(plugin)
    } else {
      await this.mcp.removeDynamicServer(`plugin-${plugin.key}`).catch(() => undefined)
    }

    const row = await this.prisma.userPlugin.findUnique({ where: { userId_key: { userId, key } } })
    return {
      key: plugin.key,
      name: plugin.name,
      description: plugin.description,
      category: plugin.category,
      requiresEnv: plugin.requiresEnv,
      installed: true,
      enabled: row?.enabled ?? enabled,
    }
  }

  /** Re-register all enabled plugins for a user (call on boot if needed). */
  async restoreEnabled(userId: string) {
    const states = await this.prisma.userPlugin.findMany({ where: { userId, enabled: true } })
    for (const state of states) {
      const plugin = PLUGIN_CATALOG.find((entry) => entry.key === state.key)
      if (plugin) this.registerPlugin(plugin)
    }
    return { restored: states.length }
  }

  private registerPlugin(plugin: McpServerTemplate) {
    try {
      this.mcp.registerDynamicServer({
        id: `plugin-${plugin.key}`,
        displayName: plugin.name,
        command: plugin.command,
        args: plugin.args,
      })
      this.logger.log(`Plugin registered: ${plugin.name}`)
    } catch (error: any) {
      this.logger.warn(`Plugin registration failed for ${plugin.key}: ${error?.message ?? error}`)
    }
  }
}
