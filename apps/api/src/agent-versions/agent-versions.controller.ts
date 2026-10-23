import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { AgentVersionsService, DEFAULT_AGENT_ID } from './agent-versions.service'
import {
  AgentVersionSnapshot,
  CreateAgentVersionInput,
  AgentVersionDiffResult,
  AgentVersionRollbackResult,
  AgentVersionSettingsSnapshot,
  NanobotRuntimeConfig,
  NanobotSkillState
} from '@openagents/shared'

import { CurrentUserId } from '../auth/current-user-id.decorator'
@Controller('agent-versions')
export class AgentVersionsController {
  constructor(private readonly agentVersionsService: AgentVersionsService) {}

  /**
   * Lists the caller's versions. `agentId` narrows the list to a single agent;
   * omitting it returns every version the caller owns.
   */
  @Get()
  async listVersions(
    @CurrentUserId() userId: string,
    @Query('agentId') agentId?: string,
    @Query('limit') limit?: number,
  ): Promise<AgentVersionSnapshot[]> {
    return this.agentVersionsService.listForUser(userId, agentId, limit)
  }

  @Post()
  async createVersion(
    @CurrentUserId() userId: string,
    @Body()
    body: {
      note?: string
      agentId?: string
      settings?: AgentVersionSettingsSnapshot
      runtimeConfig?: NanobotRuntimeConfig
      skills?: NanobotSkillState[]
    },
  ): Promise<AgentVersionSnapshot> {
    return this.agentVersionsService.createVersion(
      userId,
      body.agentId?.trim() || DEFAULT_AGENT_ID,
      { note: body.note, agentId: body.agentId },
      body.settings,
    )
  }

  @Post(':id/rollback')
  async rollbackToVersion(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<AgentVersionRollbackResult> {
    return this.agentVersionsService.rollbackToVersion(userId, id)
  }

  @Get('compare/:fromId/:toId')
  async compareVersions(
    @Param('fromId') fromId: string,
    @Param('toId') toId: string,
    @CurrentUserId() userId: string,
  ): Promise<AgentVersionDiffResult> {
    await this.agentVersionsService.getVersion(userId, fromId)
    await this.agentVersionsService.getVersion(userId, toId)
    return this.agentVersionsService.compareVersions(fromId, toId)
  }

  @Get('id/:id')
  async getVersion(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<AgentVersionSnapshot> {
    return this.agentVersionsService.getVersion(userId, id)
  }

  @Post(':agentId/rollback/:versionId')
  async rollbackAgentVersion(
    @Param('agentId') agentId: string,
    @Param('versionId') versionId: string,
    @CurrentUserId() userId: string,
  ): Promise<AgentVersionRollbackResult> {
    return this.agentVersionsService.rollbackToVersion(userId, versionId)
  }

  @Post(':agentId')
  async createAgentVersion(
    @Param('agentId') agentId: string,
    @CurrentUserId() userId: string,
    @Body() body: { input?: CreateAgentVersionInput; snapshot?: AgentVersionSettingsSnapshot },
  ): Promise<AgentVersionSnapshot> {
    return this.agentVersionsService.createVersion(
      userId,
      agentId,
      body.input ?? {},
      body.snapshot,
    )
  }

  @Get(':agentId/latest')
  async getLatestVersion(
    @Param('agentId') agentId: string,
    @CurrentUserId() userId: string,
  ): Promise<AgentVersionSnapshot | null> {
    return this.agentVersionsService.getLatestVersion(userId, agentId)
  }

  @Get(':agentId')
  async getVersions(
    @Param('agentId') agentId: string,
    @CurrentUserId() userId: string,
    @Query('limit') limit?: number,
  ): Promise<AgentVersionSnapshot[]> {
    return this.agentVersionsService.getVersions(userId, agentId, limit)
  }
}
