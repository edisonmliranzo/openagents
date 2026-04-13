import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type {
  AgentTeam,
  AgentRole,
  AgentTeamMember,
  SharedBlackboard,
  BlackboardEntry,
  BlackboardLock,
  Challenge,
  CollaborationProtocol,
  QualityThresholds,
  NegotiationSession,
  NegotiationProposal,
  NegotiationOutcome,
  Tradeoff,
  ConsensusRound,
  ConsensusVoter,
  ConsensusResult,
  AgentMessage,
  TaskDelegation,
  TeamMetrics,
  CreateAgentTeamInput,
  CreateNegotiationInput,
  SubmitProposalInput,
  VoteOnProposalInput,
  CreateBlackboardEntryInput,
  ChallengeEntryInput,
  StartConsensusInput,
  CastVoteInput,
  BlackboardEntryType,
  MessageType,
} from '@openagents/shared'

interface TeamState {
  team: AgentTeam
  messages: AgentMessage[]
  delegations: TaskDelegation[]
  metrics: TeamMetrics
}

const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  minConfidence: 0.7,
  maxDisagreement: 0.3,
  minEndorsements: 2,
  reviewRequired: true,
}

const DEFAULT_PROTOCOL: CollaborationProtocol = {
  id: 'default',
  teamId: '',
  communicationStyle: 'hybrid',
  decisionMaking: 'consensus',
  conflictResolution: 'negotiation',
  synchronizationInterval: 5000,
  maxParallelTasks: 3,
  taskAssignmentStrategy: 'skill-based',
  qualityThresholds: DEFAULT_QUALITY_THRESHOLDS,
}

@Injectable()
export class CollaborationService {
  private readonly logger = new Logger(CollaborationService.name)
  private readonly teams = new Map<string, TeamState>()
  private readonly negotiations = new Map<string, NegotiationSession>()
  private readonly consensusRounds = new Map<string, ConsensusRound>()
  private readonly maxTeams = 200
  private readonly maxMessagesPerTeam = 1000

  // ── Team Management ──────────────────────────────────────────────────────────

  createTeam(userId: string, input: CreateAgentTeamInput): AgentTeam {
    const teamId = `team_${randomUUID()}`
    const now = new Date().toISOString()

    const roles: AgentRole[] = input.roles.map((r, i) => ({
      ...r,
      id: r.id || `role_${i + 1}`,
    }))

    const members: AgentTeamMember[] = roles.map((role) => ({
      agentId: `agent_${randomUUID()}`,
      roleId: role.id,
      status: 'idle' as const,
      completedTasks: 0,
      failedTasks: 0,
      joinedAt: now,
      lastActiveAt: now,
    }))

    const protocol: CollaborationProtocol = {
      ...DEFAULT_PROTOCOL,
      ...input.protocol,
      id: `protocol_${randomUUID()}`,
      teamId,
    }

    const blackboard: SharedBlackboard = {
      id: `blackboard_${randomUUID()}`,
      teamId,
      entries: [],
      locks: [],
      version: 0,
      lastUpdated: now,
    }

    const team: AgentTeam = {
      id: teamId,
      name: input.name,
      description: input.description,
      userId,
      roles,
      members,
      sharedBlackboard: blackboard,
      collaborationProtocol: protocol,
      createdAt: now,
      updatedAt: now,
      status: 'active',
    }

    const state: TeamState = {
      team,
      messages: [],
      delegations: [],
      metrics: this.initializeMetrics(teamId),
    }

    this.teams.set(teamId, state)
    this.pruneTeams()

    this.logger.log(`Created agent team "${input.name}" with ${members.length} members`)
    return team
  }

  getTeam(userId: string, teamId: string): AgentTeam {
    const state = this.teams.get(teamId)
    if (!state || state.team.userId !== userId) {
      throw new NotFoundException(`Team "${teamId}" not found`)
    }
    return state.team
  }

  listTeams(userId: string, limit = 20): AgentTeam[] {
    return [...this.teams.values()]
      .filter((s) => s.team.userId === userId)
      .sort((a, b) => b.team.updatedAt.localeCompare(a.team.updatedAt))
      .slice(0, Math.min(limit, 100))
      .map((s) => s.team)
  }

  updateTeamStatus(teamId: string, status: AgentTeam['status']): AgentTeam {
    const state = this.teams.get(teamId)
    if (!state) throw new NotFoundException(`Team "${teamId}" not found`)
    state.team.status = status
    state.team.updatedAt = new Date().toISOString()
    return state.team
  }

  // ── Shared Blackboard ────────────────────────────────────────────────────────

  addBlackboardEntry(teamId: string, input: CreateBlackboardEntryInput): BlackboardEntry {
    const state = this.teams.get(teamId)
    if (!state) throw new NotFoundException(`Team "${teamId}" not found`)

    const member = state.team.members.find((m) => m.agentId === input.authorAgentId)
    if (!member) throw new BadRequestException(`Agent "${input.authorAgentId}" not in team`)

    const entry: BlackboardEntry = {
      id: `entry_${randomUUID()}`,
      type: input.type,
      authorAgentId: input.authorAgentId,
      content: input.content.slice(0, 10000),
      confidence: Math.max(0, Math.min(1, input.confidence ?? 0.8)),
      tags: (input.tags ?? []).slice(0, 10),
      metadata: input.metadata,
      references: (input.references ?? []).slice(0, 10),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      endorsements: [],
      challenges: [],
    }

    state.team.sharedBlackboard.entries.unshift(entry)
    state.team.sharedBlackboard.version++
    state.team.sharedBlackboard.lastUpdated = new Date().toISOString()

    // Trim entries to prevent memory bloat
    if (state.team.sharedBlackboard.entries.length > 500) {
      state.team.sharedBlackboard.entries = state.team.sharedBlackboard.entries.slice(0, 500)
    }

    // Auto-endorse by author
    entry.endorsements.push(input.authorAgentId)

    // Notify team members via message
    this.broadcastToTeam(teamId, {
      type: 'inform',
      subject: `New ${input.type} on blackboard`,
      content: entry.content.slice(0, 500),
      senderAgentId: input.authorAgentId,
      priority: 'normal',
      requiresAck: false,
    })

    return entry
  }

  endorseEntry(teamId: string, entryId: string, agentId: string): BlackboardEntry {
    const entry = this.findBlackboardEntry(teamId, entryId)
    if (!entry) throw new NotFoundException(`Entry "${entryId}" not found`)

    if (!entry.endorsements.includes(agentId)) {
      entry.endorsements.push(agentId)
      entry.updatedAt = new Date().toISOString()
    }

    return entry
  }

  challengeEntry(teamId: string, entryId: string, input: Omit<ChallengeEntryInput, 'entryId'>): Challenge {
    const entry = this.findBlackboardEntry(teamId, entryId)
    if (!entry) throw new NotFoundException(`Entry "${input.entryId}" not found`)

    const challenge: Challenge = {
      id: `challenge_${randomUUID()}`,
      challengingAgentId: input.challengingAgentId,
      entryId: input.entryId,
      reason: input.reason.slice(0, 2000),
      alternativeProposal: input.alternativeProposal?.slice(0, 5000),
      createdAt: new Date().toISOString(),
      resolved: false,
    }

    entry.challenges.push(challenge)
    entry.updatedAt = new Date().toISOString()

    return challenge
  }

  resolveChallenge(teamId: string, entryId: string, challengeId: string, resolution: string): Challenge {
    const entry = this.findBlackboardEntry(teamId, entryId)
    if (!entry) throw new NotFoundException(`Entry "${entryId}" not found`)

    const challenge = entry.challenges.find((c) => c.id === challengeId)
    if (!challenge) throw new NotFoundException(`Challenge "${challengeId}" not found`)

    challenge.resolved = true
    challenge.resolution = resolution
    entry.updatedAt = new Date().toISOString()

    return challenge
  }

  lockEntry(teamId: string, entryId: string, agentId: string, purpose: string, ttlMs = 30000): BlackboardLock {
    const state = this.teams.get(teamId)
    if (!state) throw new NotFoundException(`Team "${teamId}" not found`)

    // Remove expired locks
    const now = new Date()
    state.team.sharedBlackboard.locks = state.team.sharedBlackboard.locks.filter(
      (l) => new Date(l.expiresAt) > now,
    )

    const lock: BlackboardLock = {
      id: `lock_${randomUUID()}`,
      entryId,
      agentId,
      purpose: purpose.slice(0, 500),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      createdAt: new Date().toISOString(),
    }

    state.team.sharedBlackboard.locks.push(lock)
    return lock
  }

  unlockEntry(teamId: string, entryId: string, agentId: string): boolean {
    const state = this.teams.get(teamId)
    if (!state) throw new NotFoundException(`Team "${teamId}" not found`)

    const before = state.team.sharedBlackboard.locks.length
    state.team.sharedBlackboard.locks = state.team.sharedBlackboard.locks.filter(
      (l) => !(l.entryId === entryId && l.agentId === agentId),
    )
    return state.team.sharedBlackboard.locks.length < before
  }

  getBlackboard(teamId: string): SharedBlackboard {
    const state = this.teams.get(teamId)
    if (!state) throw new NotFoundException(`Team "${teamId}" not found`)
    return state.team.sharedBlackboard
  }

  queryBlackboard(teamId: string, type?: BlackboardEntryType, tags?: string[], limit = 50): BlackboardEntry[] {
    const state = this.teams.get(teamId)
    if (!state) throw new NotFoundException(`Team "${teamId}" not found`)

    return state.team.sharedBlackboard.entries
      .filter((e) => !type || e.type === type)
      .filter((e) => !tags || tags.some((t) => e.tags.includes(t)))
      .sort((a, b) => b.confidence - a.confidence || b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.min(limit, 100))
  }

  // ── Negotiation ──────────────────────────────────────────────────────────────

  startNegotiation(teamId: string, input: CreateNegotiationInput): NegotiationSession {
    const state = this.teams.get(teamId)
    if (!state) throw new NotFoundException(`Team "${teamId}" not found`)

    const sessionId = `neg_${randomUUID()}`
    const now = new Date().toISOString()

    const initialProposal: NegotiationProposal = {
      id: `prop_${randomUUID()}`,
      sessionId,
      proposerAgentId: input.initiatorAgentId,
      content: input.initialProposal.content.slice(0, 5000),
      rationale: input.initialProposal.rationale.slice(0, 2000),
      confidence: Math.max(0, Math.min(1, input.initialProposal.confidence ?? 0.8)),
      tradeoffs: input.initialProposal.tradeoffs,
      round: 1,
      endorsements: [input.initiatorAgentId],
      rejections: [],
      createdAt: now,
    }

    const session: NegotiationSession = {
      id: sessionId,
      teamId,
      topic: input.topic.slice(0, 500),
      initiatorAgentId: input.initiatorAgentId,
      participants: input.participants,
      proposals: [initialProposal],
      currentRound: 1,
      maxRounds: input.maxRounds ?? 10,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }

    this.negotiations.set(sessionId, session)

    // Notify participants
    for (const participantId of input.participants) {
      this.sendTeamMessage(teamId, {
        type: 'propose',
        subject: `Negotiation: ${input.topic.slice(0, 100)}`,
        content: initialProposal.content.slice(0, 500),
        senderAgentId: input.initiatorAgentId,
        recipientAgentIds: [participantId],
        priority: 'high',
        requiresAck: true,
      })
    }

    return session
  }

  submitProposal(sessionId: string, input: SubmitProposalInput): NegotiationProposal {
    const session = this.negotiations.get(sessionId)
    if (!session || session.status !== 'active') {
      throw new NotFoundException(`Negotiation session "${sessionId}" not found or inactive`)
    }

    if (session.currentRound >= session.maxRounds) {
      session.status = 'deadlocked'
      throw new BadRequestException('Max negotiation rounds reached')
    }

    const proposal: NegotiationProposal = {
      id: `prop_${randomUUID()}`,
      sessionId,
      proposerAgentId: input.proposerAgentId,
      content: input.content.slice(0, 5000),
      rationale: input.rationale.slice(0, 2000),
      confidence: Math.max(0, Math.min(1, input.confidence ?? 0.7)),
      tradeoffs: input.tradeoffs,
      round: session.currentRound + 1,
      endorsements: [input.proposerAgentId],
      rejections: [],
      createdAt: new Date().toISOString(),
    }

    session.proposals.push(proposal)
    session.currentRound++
    session.updatedAt = new Date().toISOString()

    // Notify participants of new proposal
    for (const participantId of session.participants) {
      if (participantId !== input.proposerAgentId) {
        this.sendTeamMessage(session.teamId, {
          type: 'propose',
          subject: `New proposal in round ${session.currentRound}`,
          content: proposal.content.slice(0, 500),
          senderAgentId: input.proposerAgentId,
          recipientAgentIds: [participantId],
          priority: 'normal',
          requiresAck: false,
        })
      }
    }

    return proposal
  }

  voteOnProposal(sessionId: string, input: VoteOnProposalInput): void {
    const session = this.negotiations.get(sessionId)
    if (!session || session.status !== 'active') {
      throw new NotFoundException(`Negotiation session "${sessionId}" not found or inactive`)
    }

    const proposal = session.proposals.find((p) => p.id === input.proposalId)
    if (!proposal) throw new NotFoundException(`Proposal "${input.proposalId}" not found`)

    if (input.vote === 'endorse') {
      if (!proposal.endorsements.includes(input.voterAgentId)) {
        proposal.endorsements.push(input.voterAgentId)
      }
    } else if (input.vote === 'reject') {
      if (!proposal.rejections.includes(input.voterAgentId)) {
        proposal.rejections.push(input.voterAgentId)
      }
    }

    session.updatedAt = new Date().toISOString()

    // Check if consensus reached
    this.checkNegotiationConsensus(session)
  }

  private checkNegotiationConsensus(session: NegotiationSession): void {
    const totalVoters = session.participants.length
    if (totalVoters === 0) return

    for (const proposal of session.proposals) {
      const endorsementRate = proposal.endorsements.length / totalVoters
      const rejectionRate = proposal.rejections.length / totalVoters

      // Consensus: >80% endorsement
      if (endorsementRate >= 0.8) {
        this.resolveNegotiation(session, {
          type: 'consensus',
          selectedProposalId: proposal.id,
          rationale: `Consensus reached with ${Math.round(endorsementRate * 100)}% endorsement`,
          concessions: [],
          resolvedAt: new Date().toISOString(),
        })
        return
      }

      // Deadlock: >50% rejection
      if (rejectionRate > 0.5) {
        if (session.currentRound >= session.maxRounds) {
          session.status = 'deadlocked'
          session.updatedAt = new Date().toISOString()
          return
        }
      }
    }
  }

  private resolveNegotiation(session: NegotiationSession, outcome: NegotiationOutcome): void {
    session.status = 'resolved'
    session.outcome = outcome
    session.updatedAt = new Date().toISOString()

    // Notify all participants
    for (const participantId of session.participants) {
      this.sendTeamMessage(session.teamId, {
        type: 'inform',
        subject: 'Negotiation resolved',
        content: outcome.rationale,
        senderAgentId: session.initiatorAgentId,
        recipientAgentIds: [participantId],
        priority: 'high',
        requiresAck: true,
      })
    }
  }

  getNegotiation(sessionId: string): NegotiationSession | null {
    return this.negotiations.get(sessionId) ?? null
  }

  // ── Consensus Rounds ─────────────────────────────────────────────────────────

  startConsensusRound(teamId: string, input: StartConsensusInput): ConsensusRound {
    const state = this.teams.get(teamId)
    if (!state) throw new NotFoundException(`Team "${teamId}" not found`)

    const roundId = `consensus_${randomUUID()}`
    const now = new Date().toISOString()

    const voters: ConsensusVoter[] = input.voters.map((agentId) => ({
      agentId,
      vote: 'abstain',
      confidence: 1,
      votedAt: now,
    }))

    const round: ConsensusRound = {
      id: roundId,
      teamId,
      topic: input.topic.slice(0, 500),
      proposal: input.proposal.slice(0, 5000),
      voters,
      round: 1,
      maxRounds: input.maxRounds ?? 3,
      threshold: input.threshold ?? 0.75,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }

    this.consensusRounds.set(roundId, round)

    // Notify voters
    for (const voter of voters) {
      this.sendTeamMessage(teamId, {
        type: 'request',
        subject: `Vote requested: ${input.topic.slice(0, 100)}`,
        content: input.proposal.slice(0, 500),
        senderAgentId: 'system',
        recipientAgentIds: [voter.agentId],
        priority: 'high',
        requiresAck: true,
      })
    }

    return round
  }

  castConsensusVote(roundId: string, input: CastVoteInput): ConsensusRound {
    const round = this.consensusRounds.get(roundId)
    if (!round || round.status !== 'active') {
      throw new NotFoundException(`Consensus round "${roundId}" not found or inactive`)
    }

    const voter = round.voters.find((v) => v.agentId === input.voterAgentId)
    if (!voter) throw new BadRequestException(`Agent "${input.voterAgentId}" is not a voter`)

    voter.vote = input.vote
    voter.confidence = Math.max(0, Math.min(1, input.confidence ?? 1))
    voter.rationale = input.rationale?.slice(0, 500)
    voter.votedAt = new Date().toISOString()

    round.updatedAt = new Date().toISOString()

    // Check if all votes are in
    const allVoted = round.voters.every((v) => v.vote !== 'abstain')
    if (allVoted) {
      this.resolveConsensusRound(round)
    }

    return round
  }

  private resolveConsensusRound(round: ConsensusRound): void {
    const totalVoters = round.voters.length
    const agreements = round.voters.filter((v) => v.vote === 'agree').length
    const agreementRate = totalVoters > 0 ? agreements / totalVoters : 0

    const dissentingOpinions = round.voters
      .filter((v) => v.vote === 'disagree')
      .map((v) => ({
        agentId: v.agentId,
        position: v.rationale ?? 'Disagrees with proposal',
        rationale: v.rationale ?? '',
      }))

    const decision = agreementRate >= round.threshold ? 'accepted' : 'rejected'

    round.result = {
      agreement: Math.round(agreementRate * 100),
      decision,
      rationale: decision === 'accepted'
        ? `Proposal accepted with ${Math.round(agreementRate * 100)}% agreement (threshold: ${Math.round(round.threshold * 100)}%)`
        : `Proposal rejected with only ${Math.round(agreementRate * 100)}% agreement (threshold: ${Math.round(round.threshold * 100)}%)`,
      dissentingOpinions,
      reachedAt: new Date().toISOString(),
    }

    round.status = 'reached'
    round.updatedAt = new Date().toISOString()

    // Notify all voters
    for (const voter of round.voters) {
      this.sendTeamMessage(round.teamId, {
        type: 'inform',
        subject: 'Consensus reached',
        content: round.result.rationale,
        senderAgentId: 'system',
        recipientAgentIds: [voter.agentId],
        priority: 'high',
        requiresAck: false,
      })
    }
  }

  getConsensusRound(roundId: string): ConsensusRound | null {
    return this.consensusRounds.get(roundId) ?? null
  }

  // ── Agent Messaging ──────────────────────────────────────────────────────────

  sendTeamMessage(
    teamId: string,
    input: Omit<AgentMessage, 'id' | 'teamId' | 'createdAt' | 'acknowledged'> & { senderAgentId: string; recipientAgentIds: string[] },
  ): AgentMessage {
    const state = this.teams.get(teamId)
    if (!state) throw new NotFoundException(`Team "${teamId}" not found`)

    const message: AgentMessage = {
      ...input,
      id: `msg_${randomUUID()}`,
      teamId,
      createdAt: new Date().toISOString(),
      acknowledged: false,
    }

    state.messages.push(message)

    // Trim messages
    if (state.messages.length > this.maxMessagesPerTeam) {
      state.messages = state.messages.slice(-this.maxMessagesPerTeam)
    }

    return message
  }

  broadcastToTeam(
    teamId: string,
    input: Omit<AgentMessage, 'id' | 'teamId' | 'createdAt' | 'acknowledged' | 'recipientAgentIds'>,
  ): AgentMessage[] {
    const state = this.teams.get(teamId)
    if (!state) throw new NotFoundException(`Team "${teamId}" not found`)

    const recipientIds = state.team.members.map((m) => m.agentId).filter((id) => id !== input.senderAgentId)

    if (recipientIds.length === 0) return []

    return [this.sendTeamMessage(teamId, {
      ...input,
      recipientAgentIds: recipientIds.slice(0, 50),
    })]
  }

  getTeamMessages(teamId: string, limit = 100, type?: MessageType): AgentMessage[] {
    const state = this.teams.get(teamId)
    if (!state) throw new NotFoundException(`Team "${teamId}" not found`)

    return state.messages
      .filter((m) => !type || m.type === type)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.min(limit, 200))
  }

  acknowledgeMessage(teamId: string, messageId: string, agentId: string): boolean {
    const state = this.teams.get(teamId)
    if (!state) throw new NotFoundException(`Team "${teamId}" not found`)

    const message = state.messages.find((m) => m.id === messageId)
    if (!message) return false

    if (message.recipientAgentIds.includes(agentId)) {
      message.acknowledged = true
      return true
    }

    return false
  }

  // ── Task Delegation ──────────────────────────────────────────────────────────

  delegateTask(teamId: string, input: {
    taskId: string
    fromAgentId: string
    toAgentId: string
    reason: string
    handoffNotes?: string
  }): TaskDelegation {
    const state = this.teams.get(teamId)
    if (!state) throw new NotFoundException(`Team "${teamId}" not found`)

    const fromMember = state.team.members.find((m) => m.agentId === input.fromAgentId)
    const toMember = state.team.members.find((m) => m.agentId === input.toAgentId)

    if (!fromMember) throw new BadRequestException(`Agent "${input.fromAgentId}" not in team`)
    if (!toMember) throw new BadRequestException(`Agent "${input.toAgentId}" not in team`)

    const delegation: TaskDelegation = {
      id: `delegation_${randomUUID()}`,
      taskId: input.taskId,
      fromAgentId: input.fromAgentId,
      toAgentId: input.toAgentId,
      reason: input.reason.slice(0, 1000),
      context: {
        objective: 'Task delegated for execution',
        constraints: [],
        dependencies: [],
        prerequisites: [],
        expectedOutcome: 'Successful task completion',
        successCriteria: [],
        resources: [],
      },
      status: 'pending',
      handoffNotes: input.handoffNotes?.slice(0, 2000),
      createdAt: new Date().toISOString(),
    }

    state.delegations.push(delegation)

    // Notify recipient
    this.sendTeamMessage(teamId, {
      type: 'request',
      subject: 'Task delegation',
      content: `Task "${input.taskId}" delegated: ${input.reason.slice(0, 200)}`,
      senderAgentId: input.fromAgentId,
      recipientAgentIds: [input.toAgentId],
      priority: 'high',
      requiresAck: true,
    })

    return delegation
  }

  acceptDelegation(teamId: string, delegationId: string, agentId: string): TaskDelegation {
    const delegation = this.findDelegation(teamId, delegationId)
    if (!delegation) throw new NotFoundException(`Delegation "${delegationId}" not found`)
    if (delegation.toAgentId !== agentId) throw new BadRequestException('Not authorized to accept this delegation')

    delegation.status = 'accepted'
    delegation.respondedAt = new Date().toISOString()

    return delegation
  }

  completeDelegation(teamId: string, delegationId: string, agentId: string): TaskDelegation {
    const delegation = this.findDelegation(teamId, delegationId)
    if (!delegation) throw new NotFoundException(`Delegation "${delegationId}" not found`)
    if (delegation.toAgentId !== agentId) throw new BadRequestException('Not authorized to complete this delegation')

    delegation.status = 'completed'
    delegation.completedAt = new Date().toISOString()

    // Update member stats
    const state = this.teams.get(teamId)
    if (state) {
      const member = state.team.members.find((m) => m.agentId === agentId)
      if (member) member.completedTasks++
    }

    return delegation
  }

  // ── Team Metrics ─────────────────────────────────────────────────────────────

  getTeamMetrics(teamId: string): TeamMetrics | null {
    const state = this.teams.get(teamId)
    return state?.metrics ?? null
  }

  recordTeamActivity(teamId: string, activity: {
    messageType?: MessageType
    negotiationStarted?: boolean
    consensusStarted?: boolean
    taskCompleted?: boolean
    taskFailed?: boolean
    delegationMade?: boolean
  }): void {
    const state = this.teams.get(teamId)
    if (!state) return

    const metrics = state.metrics
    const now = new Date()

    if (activity.messageType) {
      metrics.collaboration.messagesExchanged++
    }
    if (activity.negotiationStarted) {
      metrics.collaboration.negotiationsHeld++
    }
    if (activity.consensusStarted) {
      metrics.collaboration.consensusRounds++
    }
    if (activity.taskCompleted) {
      metrics.productivity.tasksCompleted++
    }
    if (activity.taskFailed) {
      metrics.productivity.tasksFailed++
    }
    if (activity.delegationMade) {
      metrics.productivity.handoffsCompleted++
    }

    metrics.period.end = now.toISOString()
  }

  // ── Helper Methods ───────────────────────────────────────────────────────────

  private findBlackboardEntry(teamId: string, entryId: string): BlackboardEntry | null {
    const state = this.teams.get(teamId)
    if (!state) return null
    return state.team.sharedBlackboard.entries.find((e) => e.id === entryId) ?? null
  }

  private findDelegation(teamId: string, delegationId: string): TaskDelegation | null {
    const state = this.teams.get(teamId)
    if (!state) return null
    return state.delegations.find((d) => d.id === delegationId) ?? null
  }

  private initializeMetrics(teamId: string): TeamMetrics {
    const now = new Date().toISOString()
    return {
      teamId,
      period: { start: now, end: now },
      collaboration: {
        messagesExchanged: 0,
        negotiationsHeld: 0,
        consensusRounds: 0,
        averageAgreementTime: 0,
        conflictRate: 0,
      },
      productivity: {
        tasksCompleted: 0,
        tasksFailed: 0,
        averageTaskDuration: 0,
        handoffsCompleted: 0,
      },
      quality: {
        averageConfidence: 0,
        endorsementRate: 0,
        challengeRate: 0,
        reviewPassRate: 0,
      },
      efficiency: {
        resourceUtilization: 0,
        parallelismFactor: 0,
        idleTime: 0,
        reworkRate: 0,
      },
    }
  }

  private pruneTeams(): void {
    if (this.teams.size <= this.maxTeams) return

    const sorted = [...this.teams.entries()].sort(
      (a, b) => a[1].team.updatedAt.localeCompare(b[1].team.updatedAt),
    )

    const overflow = this.teams.size - this.maxTeams
    for (let i = 0; i < overflow; i++) {
      this.teams.delete(sorted[i][0])
    }
  }
}