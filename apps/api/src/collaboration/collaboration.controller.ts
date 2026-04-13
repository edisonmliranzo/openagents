import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common'
import { CollaborationService } from './collaboration.service'
import type {
  CreateAgentTeamInput,
  CreateNegotiationInput,
  SubmitProposalInput,
  VoteOnProposalInput,
  CreateBlackboardEntryInput,
  ChallengeEntryInput,
  StartConsensusInput,
  CastVoteInput,
  MessageType,
} from './collaboration.types'

@Controller('collaboration')
export class CollaborationController {
  constructor(private readonly collaborationService: CollaborationService) {}

  // ── Team Management ──────────────────────────────────────────────────────────

  @Post('teams')
  createTeam(
    @Query('userId') userId: string,
    @Body() input: CreateAgentTeamInput,
  ) {
    if (!userId) throw new BadRequestException('userId is required')
    return this.collaborationService.createTeam(userId, input)
  }

  @Get('teams')
  listTeams(
    @Query('userId') userId: string,
    @Query('limit') limit?: number,
  ) {
    if (!userId) throw new BadRequestException('userId is required')
    return this.collaborationService.listTeams(userId, limit ? Number(limit) : 20)
  }

  @Get('teams/:teamId')
  getTeam(
    @Query('userId') userId: string,
    @Param('teamId', ParseUUIDPipe) teamId: string,
  ) {
    if (!userId) throw new BadRequestException('userId is required')
    return this.collaborationService.getTeam(userId, teamId)
  }

  @Patch('teams/:teamId/status')
  updateTeamStatus(
    @Param('teamId') teamId: string,
    @Body('status') status: 'active' | 'paused' | 'completed' | 'error',
  ) {
    return this.collaborationService.updateTeamStatus(teamId, status)
  }

  // ── Shared Blackboard ────────────────────────────────────────────────────────

  @Get('teams/:teamId/blackboard')
  getBlackboard(@Param('teamId') teamId: string) {
    return this.collaborationService.getBlackboard(teamId)
  }

  @Post('teams/:teamId/blackboard/entries')
  addBlackboardEntry(
    @Param('teamId') teamId: string,
    @Body() input: CreateBlackboardEntryInput,
  ) {
    return this.collaborationService.addBlackboardEntry(teamId, input)
  }

  @Get('teams/:teamId/blackboard/entries')
  queryBlackboard(
    @Param('teamId') teamId: string,
    @Query('type') type?: CreateBlackboardEntryInput['type'],
    @Query('tags') tags?: string,
    @Query('limit') limit?: number,
  ) {
    return this.collaborationService.queryBlackboard(
      teamId,
      type,
      tags ? tags.split(',').map((t) => t.trim()) : undefined,
      limit ? Number(limit) : 50,
    )
  }

  @Post('blackboard/entries/:entryId/endorse')
  endorseEntry(
    @Query('teamId') teamId: string,
    @Param('entryId') entryId: string,
    @Body('agentId') agentId: string,
  ) {
    return this.collaborationService.endorseEntry(teamId, entryId, agentId)
  }

  @Post('blackboard/entries/:entryId/challenge')
  challengeEntry(
    @Query('teamId') teamId: string,
    @Param('entryId') entryId: string,
    @Body('challengingAgentId') challengingAgentId: string,
    @Body('reason') reason: string,
    @Body('alternativeProposal') alternativeProposal?: string,
  ) {
    return this.collaborationService.challengeEntry(teamId, entryId, {
      challengingAgentId,
      reason,
      alternativeProposal,
    })
  }

  @Patch('blackboard/entries/:entryId/challenges/:challengeId/resolve')
  resolveChallenge(
    @Query('teamId') teamId: string,
    @Param('entryId') entryId: string,
    @Param('challengeId') challengeId: string,
    @Body('resolution') resolution: string,
  ) {
    return this.collaborationService.resolveChallenge(teamId, entryId, challengeId, resolution)
  }

  @Post('blackboard/entries/:entryId/lock')
  lockEntry(
    @Query('teamId') teamId: string,
    @Param('entryId') entryId: string,
    @Body('agentId') agentId: string,
    @Body('purpose') purpose: string,
    @Body('ttlMs') ttlMs?: number,
  ) {
    return this.collaborationService.lockEntry(teamId, entryId, agentId, purpose, ttlMs)
  }

  @Delete('blackboard/entries/:entryId/lock')
  unlockEntry(
    @Query('teamId') teamId: string,
    @Param('entryId') entryId: string,
    @Body('agentId') agentId: string,
  ) {
    return this.collaborationService.unlockEntry(teamId, entryId, agentId)
  }

  // ── Negotiation ──────────────────────────────────────────────────────────────

  @Post('negotiations')
  startNegotiation(
    @Query('teamId') teamId: string,
    @Body() input: CreateNegotiationInput,
  ) {
    return this.collaborationService.startNegotiation(teamId, input)
  }

  @Get('negotiations/:sessionId')
  getNegotiation(@Param('sessionId') sessionId: string) {
    return this.collaborationService.getNegotiation(sessionId)
  }

  @Post('negotiations/:sessionId/proposals')
  submitProposal(
    @Param('sessionId') sessionId: string,
    @Body() input: SubmitProposalInput,
  ) {
    return this.collaborationService.submitProposal(sessionId, input)
  }

  @Post('negotiations/:sessionId/vote')
  voteOnProposal(
    @Param('sessionId') sessionId: string,
    @Body() input: VoteOnProposalInput,
  ) {
    this.collaborationService.voteOnProposal(sessionId, input)
    return { success: true }
  }

  // ── Consensus ────────────────────────────────────────────────────────────────

  @Post('consensus')
  startConsensusRound(
    @Query('teamId') teamId: string,
    @Body() input: StartConsensusInput,
  ) {
    return this.collaborationService.startConsensusRound(teamId, input)
  }

  @Get('consensus/:roundId')
  getConsensusRound(@Param('roundId') roundId: string) {
    return this.collaborationService.getConsensusRound(roundId)
  }

  @Post('consensus/:roundId/vote')
  castConsensusVote(
    @Param('roundId') roundId: string,
    @Body() input: CastVoteInput,
  ) {
    return this.collaborationService.castConsensusVote(roundId, input)
  }

  // ── Messaging ────────────────────────────────────────────────────────────────

  @Get('teams/:teamId/messages')
  getTeamMessages(
    @Param('teamId') teamId: string,
    @Query('limit') limit?: number,
    @Query('type') type?: string,
  ) {
    return this.collaborationService.getTeamMessages(
      teamId,
      limit ? Number(limit) : 100,
      type as any,
    )
  }

  @Post('teams/:teamId/messages/:messageId/acknowledge')
  acknowledgeMessage(
    @Param('teamId') teamId: string,
    @Param('messageId') messageId: string,
    @Body('agentId') agentId: string,
  ) {
    return this.collaborationService.acknowledgeMessage(teamId, messageId, agentId)
  }

  // ── Task Delegation ──────────────────────────────────────────────────────────

  @Post('teams/:teamId/delegations')
  delegateTask(
    @Param('teamId') teamId: string,
    @Body() input: {
      taskId: string
      fromAgentId: string
      toAgentId: string
      reason: string
      handoffNotes?: string
    },
  ) {
    return this.collaborationService.delegateTask(teamId, input)
  }

  @Post('delegations/:delegationId/accept')
  acceptDelegation(
    @Query('teamId') teamId: string,
    @Param('delegationId') delegationId: string,
    @Body('agentId') agentId: string,
  ) {
    return this.collaborationService.acceptDelegation(teamId, delegationId, agentId)
  }

  @Post('delegations/:delegationId/complete')
  completeDelegation(
    @Query('teamId') teamId: string,
    @Param('delegationId') delegationId: string,
    @Body('agentId') agentId: string,
  ) {
    return this.collaborationService.completeDelegation(teamId, delegationId, agentId)
  }

  // ── Metrics ──────────────────────────────────────────────────────────────────

  @Get('teams/:teamId/metrics')
  getTeamMetrics(@Param('teamId') teamId: string) {
    return this.collaborationService.getTeamMetrics(teamId)
  }

  @Post('teams/:teamId/activity')
  recordActivity(
    @Param('teamId') teamId: string,
    @Body() activity: {
      messageType?: MessageType
      negotiationStarted?: boolean
      consensusStarted?: boolean
      taskCompleted?: boolean
      taskFailed?: boolean
      delegationMade?: boolean
    },
  ) {
    this.collaborationService.recordTeamActivity(teamId, activity)
    return { success: true }
  }
}