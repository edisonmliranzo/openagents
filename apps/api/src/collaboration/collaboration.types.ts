/**
 * Local types for the collaboration module.
 * These are self-contained and do not depend on @openagents/shared
 * to avoid conflicts with the multi-agent types in that package.
 */

export type BlackboardEntryType =
  | 'observation'
  | 'hypothesis'
  | 'fact'
  | 'decision'
  | 'task'
  | 'question'
  | 'result'
  | 'plan'
  | 'constraint'
  | 'artifact'

export type MessageType =
  | 'inform'
  | 'request'
  | 'propose'
  | 'accept'
  | 'reject'
  | 'query'
  | 'confirm'
  | 'report'
  | 'challenge'
  | 'coordinate'
  | 'sync'
  | 'alert'
  | 'answer'

export interface QualityThresholds {
  minConfidence: number
  maxDisagreement: number
  minEndorsements: number
  reviewRequired: boolean
}

export interface CollaborationProtocol {
  id: string
  teamId: string
  communicationStyle: 'broadcast' | 'direct' | 'hybrid' | 'synchronous' | 'asynchronous'
  decisionMaking: 'consensus' | 'majority' | 'authority' | 'unanimous' | 'hierarchical' | 'autonomous'
  conflictResolution: 'negotiation' | 'arbitration' | 'voting' | 'escalation' | 'merge'
  synchronizationInterval: number
  maxParallelTasks: number
  taskAssignmentStrategy: 'skill-based' | 'round-robin' | 'load-balanced' | 'random' | 'auction'
  qualityThresholds: QualityThresholds
}

export interface AgentRole {
  id: string
  name: string
  description?: string
  capabilities: string[]
  responsibilities: string[]
  permissions: string[]
  constraints?: string[]
  priority?: number
  maxConcurrentTasks?: number
  specialization?: string
}

export interface AgentTeamMember {
  agentId: string
  roleId: string
  status: 'idle' | 'active' | 'busy' | 'offline' | 'error'
  currentTaskId?: string
  currentTask?: string
  completedTasks: number
  failedTasks: number
  joinedAt: string
  lastActiveAt: string
}

export interface Challenge {
  id: string
  challengingAgentId: string
  entryId: string
  reason: string
  alternativeProposal?: string
  createdAt: string
  resolved: boolean
  resolution?: string
}

export interface BlackboardEntry {
  id: string
  type: BlackboardEntryType
  authorAgentId: string
  content: string
  confidence: number
  tags: string[]
  metadata?: Record<string, unknown>
  references?: string[]
  endorsements: string[]
  challenges: Challenge[]
  createdAt: string
  updatedAt: string
}

export interface BlackboardLock {
  id: string
  entryId: string
  agentId: string
  purpose: string
  expiresAt: string
  createdAt: string
}

export interface SharedBlackboard {
  id: string
  teamId: string
  entries: BlackboardEntry[]
  locks: BlackboardLock[]
  version: number
  lastUpdated: string
}

export interface AgentTeam {
  id: string
  name: string
  description?: string
  userId: string
  roles: AgentRole[]
  members: AgentTeamMember[]
  sharedBlackboard: SharedBlackboard
  collaborationProtocol: CollaborationProtocol
  status: 'active' | 'paused' | 'completed' | 'error'
  createdAt: string
  updatedAt: string
}

export interface Tradeoff {
  aspect: string
  gain?: string
  loss?: string
  severity?: 'low' | 'medium' | 'high'
  benefit?: string
  cost?: string
  priority?: number
}

export interface NegotiationProposal {
  id: string
  sessionId: string
  proposerAgentId: string
  content: string
  rationale: string
  confidence: number
  tradeoffs?: Tradeoff[]
  round: number
  endorsements: string[]
  rejections: string[]
  createdAt: string
}

export interface NegotiationOutcome {
  type: 'consensus' | 'compromise' | 'arbitration' | 'deadlock' | 'majority' | 'merge'
  selectedProposalId?: string
  rationale: string
  concessions: string[] | Array<{ agentId: string; originalPosition: string; concededPosition: string; reason: string }>
  resolvedAt: string
}

export interface NegotiationSession {
  id: string
  teamId: string
  topic: string
  initiatorAgentId: string
  participants: string[]
  proposals: NegotiationProposal[]
  currentRound: number
  maxRounds: number
  status: 'active' | 'resolved' | 'deadlocked' | 'cancelled' | 'abandoned'
  outcome?: NegotiationOutcome
  createdAt: string
  updatedAt: string
}

export interface DissentingOpinion {
  agentId: string
  position: string
  rationale: string
}

export interface ConsensusResult {
  agreement: number
  decision: 'accepted' | 'rejected' | 'inconclusive'
  rationale: string
  dissentingOpinions: DissentingOpinion[]
  reachedAt: string
}

export interface ConsensusVoter {
  agentId: string
  vote: 'agree' | 'disagree' | 'abstain'
  confidence: number
  rationale?: string
  votedAt: string
}

export interface ConsensusRound {
  id: string
  teamId: string
  topic: string
  proposal: string
  voters: ConsensusVoter[]
  round: number
  maxRounds: number
  threshold: number
  status: 'active' | 'reached' | 'failed' | 'cancelled' | 'timeout'
  result?: ConsensusResult
  createdAt: string
  updatedAt: string
}

export interface AgentMessage {
  id: string
  teamId: string
  type: MessageType
  subject: string
  content: string
  senderAgentId: string
  recipientAgentIds: string[]
  priority: 'low' | 'normal' | 'high' | 'urgent'
  requiresAck: boolean
  acknowledged: boolean
  metadata?: Record<string, unknown>
  inReplyTo?: string
  relatesTo?: string
  createdAt: string
}

export interface TaskDelegationContext {
  objective: string
  constraints: string[]
  dependencies: string[]
  prerequisites: string[]
  expectedOutcome: string
  successCriteria: string[]
  resources: string[]
}

export interface TaskDelegation {
  id: string
  taskId: string
  fromAgentId: string
  toAgentId: string
  reason: string
  context: TaskDelegationContext
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'failed'
  handoffNotes?: string
  createdAt: string
  respondedAt?: string
  completedAt?: string
}

export interface TeamMetrics {
  teamId: string
  period: { start: string; end: string }
  collaboration: {
    messagesExchanged: number
    negotiationsHeld: number
    consensusRounds: number
    averageAgreementTime: number
    conflictRate: number
  }
  productivity: {
    tasksCompleted: number
    tasksFailed: number
    averageTaskDuration: number
    handoffsCompleted: number
  }
  quality: {
    averageConfidence: number
    endorsementRate: number
    challengeRate: number
    reviewPassRate: number
  }
  efficiency: {
    resourceUtilization: number
    parallelismFactor: number
    idleTime: number
    reworkRate: number
  }
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateAgentTeamInput {
  name: string
  description?: string
  roles: Array<Partial<AgentRole> & { name: string; capabilities: string[]; responsibilities: string[]; permissions: string[] }>
  protocol?: Partial<Omit<CollaborationProtocol, 'id' | 'teamId'>>
}

export interface CreateBlackboardEntryInput {
  type: BlackboardEntryType
  authorAgentId: string
  content: string
  confidence?: number
  tags?: string[]
  metadata?: Record<string, unknown>
  references?: string[]
}

export interface ChallengeEntryInput {
  entryId: string
  challengingAgentId: string
  reason: string
  alternativeProposal?: string
}

export interface CreateNegotiationInput {
  topic: string
  initiatorAgentId: string
  participants: string[]
  maxRounds?: number
  initialProposal: {
    content: string
    rationale: string
    confidence?: number
    tradeoffs?: Tradeoff[]
  }
}

export interface SubmitProposalInput {
  proposerAgentId: string
  content: string
  rationale: string
  confidence?: number
  tradeoffs?: Tradeoff[]
}

export interface VoteOnProposalInput {
  proposalId: string
  voterAgentId: string
  vote: 'endorse' | 'reject'
}

export interface StartConsensusInput {
  topic: string
  proposal: string
  voters: string[]
  maxRounds?: number
  threshold?: number
}

export interface CastVoteInput {
  voterAgentId: string
  vote: 'agree' | 'disagree' | 'abstain'
  confidence?: number
  rationale?: string
}
