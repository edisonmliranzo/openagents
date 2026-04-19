/**
 * Agent-to-Agent Delegation Types for OpenAgents
 * Allows one agent to spin up specialized sub-agents mid-conversation
 */

export enum DelegationStrategy {
  PARALLEL = 'parallel',
  SEQUENTIAL = 'sequential',
  CASCADE = 'cascade',
  BROADCAST = 'broadcast',
}

export enum SubAgentStatus {
  PENDING = 'pending',
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout',
}

export interface DelegationRequest {
  parentAgentId: string;
  parentSessionId: string;
  task: string;
  requiredCapabilities?: string[];
  preferredPreset?: string;
  maxBudget?: number;
  timeout?: number;
  priority?: number;
  context?: Record<string, unknown>;
}

export interface SubAgentInstance {
  id: string;
  parentId: string;
  delegationId: string;
  status: SubAgentStatus;
  task: string;
  result?: SubAgentResult;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  metrics?: SubAgentMetrics;
}

export interface SubAgentResult {
  success: boolean;
  output: string;
  toolsUsed: string[];
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
  duration: number;
  quality?: number;
  metadata?: Record<string, unknown>;
}

export interface SubAgentMetrics {
  tokensPerSecond?: number;
  toolCallsCount: number;
  errorCount: number;
  retryCount: number;
  contextWindowUsage: number;
}

export interface DelegationSession {
  id: string;
  parentAgentId: string;
  parentSessionId: string;
  strategy: DelegationStrategy;
  subAgents: SubAgentInstance[];
  status: SubAgentStatus;
  mergedResult?: MergedResult;
  createdAt: Date;
  completedAt?: Date;
  totalBudget?: number;
  budgetUsed?: number;
}

export interface MergedResult {
  success: boolean;
  synthesizedOutput: string;
  outputsByAgent: Record<string, string>;
  quality: number;
  confidence: number;
  insights: string[];
  recommendations: string[];
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  totalCost: number;
  totalDuration: number;
}

export interface DelegationPolicy {
  maxConcurrentAgents: number;
  maxTotalBudget: number;
  defaultTimeout: number;
  allowedPresets: string[];
  allowedCapabilities: string[];
  requireApprovalForBudgetAbove?: number;
  autoMergeStrategy: 'consensus' | 'hierarchical' | 'voting' | 'latest';
}

export interface ResultMergerConfig {
  strategy: 'consensus' | 'hierarchical' | 'voting' | 'latest';
  conflictResolution: 'majority' | 'parent-pick' | 'highest-quality' | 'manual';
  qualityWeighting: boolean;
  consensusThreshold: number;
}

export interface DelegationMetrics {
  totalDelegations: number;
  successfulDelegations: number;
  failedDelegations: number;
  averageSubAgentsPerDelegation: number;
  averageDuration: number;
  averageCost: number;
  usageByStrategy: Record<DelegationStrategy, number>;
  usageByPreset: Record<string, number>;
}

export type DelegationEventType =
  | 'delegation.created'
  | 'delegation.subagent.started'
  | 'delegation.subagent.completed'
  | 'delegation.subagent.failed'
  | 'delegation.merged'
  | 'delegation.completed'
  | 'delegation.cancelled'
  | 'delegation.budget.exceeded';

export interface DelegationEvent {
  type: DelegationEventType;
  delegationId: string;
  subAgentId?: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}
