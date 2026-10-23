import { Body, Controller, Get, Post } from '@nestjs/common'
import { ModelRoleService } from './model-role.service'
import { LLM_MODELS, type ModelRole } from '@openagents/shared'

import { CurrentUserId } from '../auth/current-user-id.decorator'

/**
 * Which model runs which kind of work.
 *
 * Muse runs Spark for the conversation you are in, and the bigger Wonder
 * sibling for artifact builds, scheduled runs, subagents and background work.
 */
@Controller('model-roles')
export class ModelRoleController {
  constructor(private roles: ModelRoleService) {}

  @Get()
  async get(@CurrentUserId() userId: string) {
    const overrides = await this.roles.userOverrides(userId)
    return {
      roles: overrides,
      defaults: {
        chat: LLM_MODELS.meta.fast,
        artifact: LLM_MODELS.meta.powerful,
        scheduled: LLM_MODELS.meta.powerful,
        subagent: LLM_MODELS.meta.powerful,
        background: LLM_MODELS.meta.powerful,
      },
      available: Object.keys(LLM_MODELS) as Array<keyof typeof LLM_MODELS>,
    }
  }

  @Post()
  set(@CurrentUserId() userId: string, @Body() body: Partial<Record<ModelRole, string>>) {
    return this.roles.setUserOverrides(userId, body)
  }
}
