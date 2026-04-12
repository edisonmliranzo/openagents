import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { AgentVersionsService } from './agent-versions.service'
import {
  AgentVersionSnapshot,
  CreateAgentVersionInput,
  AgentVersionDiffResult,
  AgentVersionRollbackResult,
  AgentVersionSettingsSnapshot
} from '@openagents/shared'

@Controller('agent-versions')
export class AgentVersionsController {
  constructor(private readonly agentVersionsService: AgentVersionsService) {}

  @Post(':agentId')
  async createVersion(
    @Param('agentId') agentId: string,
    @Body() body: { userId: string; input: CreateAgentVersionInput; snapshot: AgentVersionSettingsSnapshot },
  ): Promise<AgentVersionSnapshot> {
    return this.agentVersionsService.createVersion(body.userId, agentId, body.input, body.snapshot)
  }

  @Get(':agentId')
  async getVersions(
    @Param('agentId') agentId: string,
    @Query('userId') userId: string,
    @Query('limit') limit?: number,
  ): Promise<AgentVersionSnapshot[]> {
    return this.agentVersionsService.getVersions(userId, agentId, limit)
  }

  @Get(':agentId/latest')
  async getLatestVersion(
    @Param('agentId') agentId: string,
    @Query('userId') userId: string,
  ): Promise<AgentVersionSnapshot | null> {
    return this.agentVersionsService.getLatestVersion(userId, agentId)
  }

  @Get('/id/:id')
  async getVersion(
    @Param('id') id: string,
    @Query('userId') userId: string,
  ): Promise<AgentVersionSnapshot> {
    return this.agentVersionsService.getVersion(userId, id)
  }

  @Get('compare/:fromId/:toId')
  async compareVersions(
    @Param('fromId') fromId: string,
    @Param('toId') toId: string,
  ): Promise<AgentVersionDiffResult> {
    return this.agentVersionsService.compareVersions(fromId, toId)
  }

  @Post(':agentId/rollback/:versionId')
  async rollbackToVersion(
    @Param('agentId') agentId: string,
    @Param('versionId') versionId: string,
    @Body() body: { userId: string },
  ): Promise<AgentVersionRollbackResult> {
    return this.agentVersionsService.rollbackToVersion(body.userId, agentId, versionId)
  }
}