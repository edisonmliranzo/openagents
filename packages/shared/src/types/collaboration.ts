export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface WorkspaceSettings {
  allowMemberInvites: boolean
  requireApprovalForNewMembers: boolean
  defaultMemberRole: WorkspaceRole
  sharedMemoryEnabled: boolean
  sharedAgentsEnabled: boolean
}

export interface WorkspaceMember {
  id: string
  workspaceId: string
  userId: string
  role: WorkspaceRole
  permissions: string[]
  invitedByUserId?: string
  joinedAt: string
}

export interface WorkspaceInvitation {
  id: string
  workspaceId: string
  email: string
  role: WorkspaceRole
  invitedBy: string
  expiresAt: string
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  createdAt: string
  updatedAt: string
}

export interface WorkspaceConversationShare {
  id: string
  workspaceId: string
  conversationId: string
  title: string
  sharedByUserId: string
  createdAt: string
}

export interface WorkspaceWorkflowShare {
  id: string
  workspaceId: string
  workflowId: string
  name: string
  sharedByUserId: string
  createdAt: string
}

export interface WorkspaceArtifactShare {
  id: string
  workspaceId: string
  artifactId: string
  title: string
  sharedByUserId: string
  createdAt: string
}

export interface WorkspaceMemoryEntry {
  id: string
  workspaceId: string
  createdByUserId: string
  type: 'fact' | 'summary' | 'note'
  title: string
  content: string
  tags: string[]
  sourceRef?: string
  createdAt: string
  updatedAt: string
}

export interface Workspace {
  id: string
  name: string
  description?: string
  ownerId: string
  members: WorkspaceMember[]
  invitations: WorkspaceInvitation[]
  conversations: WorkspaceConversationShare[]
  workflows: WorkspaceWorkflowShare[]
  artifacts: WorkspaceArtifactShare[]
  memory: WorkspaceMemoryEntry[]
  settings: WorkspaceSettings
  createdAt: string
  updatedAt: string
}

export interface CreateWorkspaceInput {
  name: string
  description?: string
  settings?: Partial<WorkspaceSettings>
}

export interface UpdateWorkspaceInput {
  name?: string
  description?: string | null
  settings?: Partial<WorkspaceSettings>
}

export interface CreateWorkspaceInvitationInput {
  email: string
  role?: WorkspaceRole
  expiresInDays?: number
}

export interface CreateWorkspaceMemoryEntryInput {
  type?: 'fact' | 'summary' | 'note'
  title: string
  content: string
  tags?: string[]
  sourceRef?: string
}

export interface WorkspaceChange {
  id: string
  workspaceId: string
  userId: string
  entityType: 'agent' | 'artifact' | 'memory' | 'workflow' | 'settings'
  entityId: string
  changeType: 'create' | 'update' | 'delete' | 'share'
  previousValue?: Record<string, unknown>
  newValue: Record<string, unknown>
  message?: string
  timestamp: string
}

export interface PresenceInfo {
  userId: string
  workspaceId: string
  lastActiveAt: string
  currentEntity?: {
    type: string
    id: string
    name: string
  }
  cursor?: {
    line: number
    column: number
  }
}

export interface QualityThresholds {
  minConfidence: number
  maxDisagreement: number
  minEndorsements: number
  reviewRequired: boolean
}

export interface CollaborationProtocol {
  id: string
  teamId: string
  communicationStyle: 'broadcast' | 'direct' | 'hybrid'
  decisionMaking: 'consensus' | 'majority' | 'authority' | 'unanimous'
  conflictResolution: 'negotiation' | 'arbitration' | 'voting' | 'escalation'
  synchronizationInterval: number
  maxParallelTasks: number
  taskAssignmentStrategy: 'skill-based' | 'round-robin' | 'load-balanced' | 'random'
  qualityThresholds: QualityThresholds
}

export interface AgentRole {
  id: string
  name: string
  description?: string
  capabilities: string[]
  responsibilities: string[]
  permissions: string[]
  priority?: number
}

export interface AgentTeamMember {
  agentId: string
  roleId: string
  status: 'idle' | 'active' | 'busy' | 'offline'
  currentTaskId?: string
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

export type BlackboardEntryType = 'fact' | 'hypothesis' | 'decision' | 'task' | 'resource' | 'update'

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
  gain: string
  loss: string
  severity: 'low' | 'medium' | 'high'
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
  type: 'consensus' | 'compromise' | 'arbitration' | 'deadlock'
  selectedProposalId?: string
  rationale: string
  concessions: string[]
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
  status: 'active' | 'resolved' | 'deadlocked' | 'cancelled'
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
  decision: 'accepted' | 'rejected'
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
  status: 'active' | 'reached' | 'failed' | 'cancelled'
  result?: ConsensusResult
  createdAt: string
  updatedAt: string
}

export type MessageType = 'negotiation' | 'consensus' | 'delegation' | 'update' | 'error'

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

export interface TeamCollaborationMetrics {
  messagesExchanged: number
  negotiationsHeld: number
  consensusRounds: number
  averageAgreementTime: number
  conflictRate: number
}

export interface TeamProductivityMetrics {
  tasksCompleted: number
  tasksFailed: number
  averageTaskDuration: number
  handoffsCompleted: number
}

export interface TeamQualityMetrics {
  averageConfidence: number
  endorsementRate: number
  challengeRate: number
  reviewPassRate: number
}

export interface TeamEfficiencyMetrics {
  resourceUtilization: number
  parallelismFactor: number
  idleTime: number
  reworkRate: number
}

export interface TeamMetrics {
  teamId: string
  period: { start: string; end: string }
  collaboration: TeamCollaborationMetrics
  productivity: TeamProductivityMetrics
  quality: TeamQualityMetrics
  efficiency: TeamEfficiencyMetrics
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
