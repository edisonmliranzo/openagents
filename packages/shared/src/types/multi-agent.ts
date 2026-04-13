/**
 * Multi-Agent Collaboration Types
 * 
 * This module defines types for advanced multi-agent collaboration features including:
 * - Agent teams and role assignment
 * - Shared blackboard for inter-agent communication
 * - Agent negotiation and consensus protocols
 * - Task delegation and handoff
 * - Collaborative planning and execution
 */

// ── Agent Roles & Specializations ──────────────────────────────────────────────

export type AgentSpecialization = 
  | 'researcher'    // Information gathering and analysis
  | 'builder'       // Code generation and implementation
  | 'operator'      // Tool execution and automation
  | 'reviewer'      // Quality assurance and validation
  | 'planner'       // Task decomposition and planning
  | 'coordinator'   // Team coordination and communication
  | 'critic'        // Critical analysis and risk assessment
  | 'synthesizer'   // Result synthesis and summarization

export interface AgentRole {
  id: string
  name: string
  specialization: AgentSpecialization
  description: string
  capabilities: string[]
  constraints: string[]
  priority: number
  maxConcurrentTasks: number
}

// ── Agent Team ─────────────────────────────────────────────────────────────────

export interface AgentTeam {
  id: string
  name: string
  description?: string
  userId: string
  roles: AgentRole[]
  members: AgentTeamMember[]
  sharedBlackboard: SharedBlackboard
  collaborationProtocol: CollaborationProtocol
  createdAt: string
  updatedAt: string
  status: 'active' | 'paused' | 'completed' | 'error'
}

export interface AgentTeamMember {
  agentId: string
  roleId: string
  status: 'active' | 'busy' | 'idle' | 'error'
  currentTask?: string
  completedTasks: number
  failedTasks: number
  joinedAt: string
  lastActiveAt: string
}

// ── Shared Blackboard ──────────────────────────────────────────────────────────

export interface SharedBlackboard {
  id: string
  teamId: string
  entries: BlackboardEntry[]
  locks: BlackboardLock[]
  version: number
  lastUpdated: string
}

export type BlackboardEntryType = 
  | 'fact'          // Shared knowledge fact
  | 'hypothesis'    // Proposed explanation or prediction
  | 'plan'          // Current execution plan
  | 'result'        // Task execution result
  | 'constraint'    // Problem constraint or requirement
  | 'question'      // Open question for the team
  | 'decision'      // Made decision with rationale
  | 'artifact'      // Generated artifact reference

export interface BlackboardEntry {
  id: string
  type: BlackboardEntryType
  authorAgentId: string
  content: string
  metadata?: Record<string, unknown>
  confidence: number
  tags: string[]
  references?: string[]  // References to other entries
  createdAt: string
  updatedAt: string
  endorsements: string[]  // Agent IDs that endorse this entry
  challenges: Challenge[]
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

export interface BlackboardLock {
  id: string
  entryId: string
  agentId: string
  purpose: string
  expiresAt: string
  createdAt: string
}

// ── Collaboration Protocol ─────────────────────────────────────────────────────

export interface CollaborationProtocol {
  id: string
  teamId: string
  communicationStyle: 'synchronous' | 'asynchronous' | 'hybrid'
  decisionMaking: 'consensus' | 'majority' | 'hierarchical' | 'autonomous'
  conflictResolution: 'voting' | 'negotiation' | 'arbitration' | 'merge'
  synchronizationInterval: number  // ms between sync points
  maxParallelTasks: number
  taskAssignmentStrategy: 'round-robin' | 'skill-based' | 'load-balanced' | 'auction'
  qualityThresholds: QualityThresholds
}

export interface QualityThresholds {
  minConfidence: number
  maxDisagreement: number
  minEndorsements: number
  reviewRequired: boolean
}

// ── Agent Negotiation ──────────────────────────────────────────────────────────

export interface NegotiationSession {
  id: string
  teamId: string
  topic: string
  initiatorAgentId: string
  participants: string[]  // Agent IDs
  proposals: NegotiationProposal[]
  currentRound: number
  maxRounds: number
  status: 'active' | 'resolved' | 'deadlocked' | 'abandoned'
  outcome?: NegotiationOutcome
  createdAt: string
  updatedAt: string
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

export interface Tradeoff {
  aspect: string
  benefit: string
  cost: string
  priority: number
}

export type NegotiationOutcomeType = 
  | 'consensus'     // All agents agree
  | 'compromise'    // Partial agreement with concessions
  | 'majority'      // Majority wins
  | 'arbitration'   // Coordinator decides
  | 'merge'         // Proposals combined

export interface NegotiationOutcome {
  type: NegotiationOutcomeType
  selectedProposalId: string
  rationale: string
  concessions: Concession[]
  resolvedAt: string
}

export interface Concession {
  agentId: string
  originalPosition: string
  concededPosition: string
  reason: string
}

// ── Task Delegation & Handoff ──────────────────────────────────────────────────

export interface TaskDelegation {
  id: string
  taskId: string
  fromAgentId: string
  toAgentId: string
  reason: string
  context: TaskContext
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'failed'
  handoffNotes?: string
  createdAt: string
  respondedAt?: string
  completedAt?: string
}

export interface TaskContext {
  objective: string
  constraints: string[]
  dependencies: string[]
  prerequisites: Prerequisite[]
  expectedOutcome: string
  successCriteria: string[]
  resources: Resource[]
}

export interface Prerequisite {
  id: string
  description: string
  satisfied: boolean
  satisfiedBy?: string
}

export interface Resource {
  type: 'tool' | 'data' | 'memory' | 'artifact'
  id: string
  name: string
  accessLevel: 'read' | 'write' | 'execute'
}

// ── Collaborative Planning ─────────────────────────────────────────────────────

export interface CollaborativePlan {
  id: string
  teamId: string
  objective: string
  phases: PlanPhase[]
  currentPhase: string
  sharedContext: PlanContext
  status: 'drafting' | 'reviewing' | 'approved' | 'executing' | 'completed' | 'revised'
  version: number
  createdAt: string
  updatedAt: string
}

export interface PlanPhase {
  id: string
  name: string
  description: string
  tasks: PlanTask[]
  dependencies: string[]  // Phase IDs this depends on
  assignedRoles: string[]
  status: 'pending' | 'active' | 'completed' | 'blocked'
  startedAt?: string
  completedAt?: string
}

export interface PlanTask {
  id: string
  name: string
  description: string
  assignedAgentId?: string
  estimatedDuration: number  // seconds
  actualDuration?: number
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'blocked'
  dependencies: string[]  // Task IDs
  outputs: string[]  // Expected output artifacts
  qualityChecks: QualityCheck[]
}

export interface QualityCheck {
  id: string
  criteria: string
  passed: boolean
  verifiedBy?: string
  notes?: string
}

export interface PlanContext {
  assumptions: Assumption[]
  constraints: PlanningConstraint[]
  risks: Risk[]
  opportunities: Opportunity[]
}

export interface Assumption {
  id: string
  description: string
  confidence: number
  validated: boolean
}

export interface PlanningConstraint {
  id: string
  type: 'time' | 'resource' | 'dependency' | 'policy'
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export interface Risk {
  id: string
  description: string
  probability: number
  impact: number
  mitigation?: string
  owner?: string
}

export interface Opportunity {
  id: string
  description: string
  value: number
  likelihood: number
  action?: string
}

// ── Agent Communication Messages ───────────────────────────────────────────────

export type MessageType = 
  | 'inform'        // Share information
  | 'request'       // Request action or information
  | 'propose'       // Propose a course of action
  | 'accept'        // Accept proposal
  | 'reject'        // Reject proposal
  | 'challenge'     // Challenge a claim or proposal
  | 'query'         // Ask a question
  | 'answer'        // Provide answer
  | 'coordinate'    // Coordinate actions
  | 'sync'          // Synchronization point
  | 'alert'         // Important notification

export interface AgentMessage {
  id: string
  teamId: string
  senderAgentId: string
  recipientAgentIds: string[]
  type: MessageType
  subject: string
  content: string
  inReplyTo?: string  // Message ID being replied to
  relatesTo?: string  // Task/plan/entry ID this relates to
  priority: 'low' | 'normal' | 'high' | 'urgent'
  requiresAck: boolean
  acknowledged: boolean
  createdAt: string
  metadata?: Record<string, unknown>
}

// ── Consensus Mechanisms ───────────────────────────────────────────────────────

export interface ConsensusRound {
  id: string
  teamId: string
  topic: string
  proposal: string
  voters: ConsensusVoter[]
  round: number
  maxRounds: number
  threshold: number  // Required agreement percentage
  status: 'active' | 'reached' | 'failed' | 'timeout'
  result?: ConsensusResult
  createdAt: string
  updatedAt: string
}

export interface ConsensusVoter {
  agentId: string
  vote: 'agree' | 'disagree' | 'abstain'
  confidence: number
  rationale?: string
  votedAt: string
}

export interface ConsensusResult {
  agreement: number  // Percentage
  decision: 'accepted' | 'rejected' | 'inconclusive'
  rationale: string
  dissentingOpinions: DissentingOpinion[]
  reachedAt: string
}

export interface DissentingOpinion {
  agentId: string
  position: string
  rationale: string
}

// ── Team Performance Metrics ───────────────────────────────────────────────────

export interface TeamMetrics {
  teamId: string
  period: {
    start: string
    end: string
  }
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

// ── Input Types for API ────────────────────────────────────────────────────────

export interface CreateAgentTeamInput {
  name: string
  description?: string
  roles: Omit<AgentRole, 'id'>[]
  protocol?: Partial<CollaborationProtocol>
}

export interface CreateNegotiationInput {
  teamId: string
  topic: string
  initiatorAgentId: string
  participants: string[]
  initialProposal: Omit<NegotiationProposal, 'id' | 'sessionId'>
  maxRounds?: number
}

export interface SubmitProposalInput {
  sessionId: string
  proposerAgentId: string
  content: string
  rationale: string
  confidence?: number
  tradeoffs?: Tradeoff[]
}

export interface VoteOnProposalInput {
  sessionId: string
  voterAgentId: string
  proposalId: string
  vote: 'endorse' | 'reject' | 'abstain'
  rationale?: string
}

export interface CreateBlackboardEntryInput {
  teamId: string
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

export interface DelegateTaskInput {
  taskId: string
  fromAgentId: string
  toAgentId: string
  reason: string
  context: TaskContext
  handoffNotes?: string
}

export interface StartConsensusInput {
  teamId: string
  topic: string
  proposal: string
  voters: string[]
  threshold?: number
  maxRounds?: number
}

export interface CastVoteInput {
  roundId: string
  voterAgentId: string
  vote: 'agree' | 'disagree' | 'abstain'
  confidence?: number
  rationale?: string
}