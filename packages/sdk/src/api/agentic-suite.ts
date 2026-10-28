import type { OpenAgentsClient } from '../client'

// 1. Dynamic Tool Forge
export interface ForgedToolItem {
  id: string
  name: string
  description: string
  capabilityPrompt: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  code: string
  testSampleInput: Record<string, unknown>
  verified: boolean
  hotRegistered: boolean
  lastTestResult?: {
    passed: boolean
    output: unknown
    durationMs: number
    error?: string
    testedAt: string
  }
  invocations: number
  createdAt: string
}

// 2. Tree-of-Actions Rollout
export interface ActionBranch {
  id: string
  strategyName: string
  persona: string
  planSteps: string[]
  proposedOutput: string
  scores: {
    correctness: number
    completeness: number
    safety: number
    efficiency: number
    total: number
  }
  verifierNotes: string
  isWinner: boolean
  durationMs: number
}

export interface TreeOfActionsRollout {
  id: string
  goal: string
  branches: ActionBranch[]
  winningBranchId: string
  judgeSummary: string
  finalDeliverable: string
  createdAt: string
}

// 3. Closed-Loop Vision-Action Computer Agent
export interface ComputerUseStep {
  stepIndex: number
  observation: string
  plannedAction: {
    type: 'navigate' | 'click' | 'type' | 'scroll' | 'extract' | 'shell_probe' | 'verify'
    target: string
    value?: string
    coordinates?: { x: number; y: number }
  }
  verification: {
    passed: boolean
    postStateSummary: string
    recoveryApplied?: string
  }
  timestamp: string
}

export interface ComputerUseSession {
  id: string
  objective: string
  targetUrl: string
  status: 'running' | 'completed' | 'needs_attention'
  steps: ComputerUseStep[]
  extractedData?: string
  createdAt: string
  updatedAt: string
}

// 4. Ambient Sentinel
export interface SentinelWatcher {
  id: string
  name: string
  signalType: 'git_diff' | 'file_change' | 'port_health' | 'log_error' | 'api_latency' | 'webhook_event'
  target: string
  condition: string
  reflexAction: string
  enabled: boolean
  lastTriggeredAt?: string
  triggerCount: number
}

export interface SentinelIncident {
  id: string
  watcherId: string
  watcherName: string
  signalType: string
  severity: 'info' | 'warning' | 'critical'
  observedSignal: string
  diagnosis: string
  preparedPatch: string
  status: 'open' | 'resolved'
  createdAt: string
}

// 5. Adversarial Critic & Breaker Loop
export interface BreakerFinding {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  description: string
  exploitOrEdgeCase: string
  fixApplied: string
}

export interface AdversarialVerificationRun {
  id: string
  task: string
  artifactType: 'code' | 'sql' | 'architecture' | 'security_policy' | 'research'
  generatorDraft: string
  breakerFindings: BreakerFinding[]
  breakerVerdict: 'initially_vulnerable' | 'passed_clean'
  hardenedOutput: string
  verificationScore: number
  roundsCompleted: number
  createdAt: string
}

// 6. Overnight Mission Runner
export interface OvernightCheckpoint {
  id: string
  milestoneIndex: number
  milestoneTitle: string
  status: 'pending' | 'completed' | 'backtracked' | 'failed'
  outputSummary: string
  stateSnapshot: Record<string, unknown>
  tokensUsed: number
  costUsd: number
  createdAt: string
}

export interface OvernightMission {
  id: string
  title: string
  objective: string
  status: 'active' | 'completed' | 'paused'
  maxBudgetUsd: number
  spentUsd: number
  totalTokens: number
  autoBacktrack: boolean
  backtrackCount: number
  checkpoints: OvernightCheckpoint[]
  wakeUpReport?: string
  createdAt: string
  updatedAt: string
}

// 7. Episodic World-Model & Shadow Digital Twin
export interface WorldStateNode {
  id: string
  category: 'repository' | 'goal' | 'preference' | 'recent_focus' | 'environment'
  label: string
  detail: string
  confidence: number
  updatedAt: string
}

export interface ShadowActionCard {
  id: string
  title: string
  category: 'code_patch' | 'triage_reply' | 'research_brief' | 'workflow_automation'
  rationale: string
  preparedContent: string
  confidence: number
  status: 'staged' | 'approved' | 'dismissed'
  createdAt: string
}

export interface DigitalTwinState {
  lastSyncedAt: string
  gitBranch: string
  modifiedFilesCount: number
  activeGoalsCount: number
  recentConversationsCount: number
  nodes: WorldStateNode[]
  shadowActions: ShadowActionCard[]
}

// 8. Contract-Net Swarm Market
export interface SpecialistBidder {
  id: string
  name: string
  role: string
  specialties: string[]
  reputationScore: number
  winCount: number
  tasksCompleted: number
  successRate: number
  avgLatencyMs: number
  avgTokens: number
}

export interface SubtaskBid {
  bidderId: string
  bidderName: string
  confidence: number
  reputationScore: number
  compositeScore: number
  estimatedTokens: number
  pitch: string
  isWinner: boolean
}

export interface AwardedSubtask {
  id: string
  subtaskTitle: string
  winnerId: string
  winnerName: string
  winningScore: number
  bids: SubtaskBid[]
  executionOutput: string
}

export interface SwarmMarketContractRun {
  id: string
  task: string
  subtasks: AwardedSubtask[]
  synthesizedResult: string
  totalTokens: number
  createdAt: string
}

export function createAgenticSuiteApi(client: OpenAgentsClient) {
  return {
    // 1. Dynamic Tool Forge
    listForgedTools: () => client.get<ForgedToolItem[]>('/api/v1/agentic/tool-forge'),
    synthesizeTool: (input: {
      name: string
      description: string
      capabilityPrompt: string
      sampleInput?: Record<string, unknown>
    }) => client.post<ForgedToolItem>('/api/v1/agentic/tool-forge/synthesize', input),
    verifyTool: (toolId: string, testInput?: Record<string, unknown>) =>
      client.post<ForgedToolItem>(`/api/v1/agentic/tool-forge/${toolId}/verify`, { testInput }),
    hotRegisterTool: (toolId: string) =>
      client.post<ForgedToolItem>(`/api/v1/agentic/tool-forge/${toolId}/register`, {}),
    executeForgedTool: (toolId: string, input: Record<string, unknown>) =>
      client.post<{ output: unknown; durationMs: number }>(`/api/v1/agentic/tool-forge/${toolId}/execute`, { input }),
    deleteForgedTool: (toolId: string) =>
      client.delete<{ deleted: boolean }>(`/api/v1/agentic/tool-forge/${toolId}`),

    // 2. Tree-of-Actions
    listRollouts: () => client.get<TreeOfActionsRollout[]>('/api/v1/agentic/tree-of-actions'),
    runRollout: (input: { goal: string; branchCount?: number }) =>
      client.post<TreeOfActionsRollout>('/api/v1/agentic/tree-of-actions/run', input),

    // 3. Closed-Loop Computer Use
    listComputerSessions: () => client.get<ComputerUseSession[]>('/api/v1/agentic/computer-use'),
    startComputerSession: (input: { objective: string; targetUrl?: string; maxSteps?: number }) =>
      client.post<ComputerUseSession>('/api/v1/agentic/computer-use/start', input),
    stepComputerSession: (sessionId: string, instruction?: string) =>
      client.post<ComputerUseSession>(`/api/v1/agentic/computer-use/${sessionId}/step`, { instruction }),

    // 4. Ambient Sentinel
    getSentinelState: () =>
      client.get<{ watchers: SentinelWatcher[]; incidents: SentinelIncident[] }>('/api/v1/agentic/sentinel'),
    createSentinelWatcher: (input: {
      name: string
      signalType: SentinelWatcher['signalType']
      target: string
      condition: string
      reflexAction: string
    }) => client.post<SentinelWatcher>('/api/v1/agentic/sentinel/watchers', input),
    toggleSentinelWatcher: (watcherId: string) =>
      client.post<SentinelWatcher>(`/api/v1/agentic/sentinel/watchers/${watcherId}/toggle`, {}),
    pulseSentinel: (watcherId?: string) =>
      client.post<{ incidents: SentinelIncident[]; checkedCount: number }>('/api/v1/agentic/sentinel/pulse', {
        watcherId,
      }),
    resolveSentinelIncident: (incidentId: string) =>
      client.post<SentinelIncident>(`/api/v1/agentic/sentinel/incidents/${incidentId}/resolve`, {}),

    // 5. Adversarial Critic & Breaker Loop
    listVerifierRuns: () => client.get<AdversarialVerificationRun[]>('/api/v1/agentic/verifier'),
    runVerifierLoop: (input: {
      task: string
      artifactType?: AdversarialVerificationRun['artifactType']
    }) => client.post<AdversarialVerificationRun>('/api/v1/agentic/verifier/run', input),

    // 6. Overnight Mission Runner
    listOvernightMissions: () => client.get<OvernightMission[]>('/api/v1/agentic/overnight'),
    createOvernightMission: (input: {
      title: string
      objective: string
      maxBudgetUsd?: number
      autoBacktrack?: boolean
    }) => client.post<OvernightMission>('/api/v1/agentic/overnight', input),
    runOvernightMission: (missionId: string) =>
      client.post<OvernightMission>(`/api/v1/agentic/overnight/${missionId}/run`, {}),
    rewindOvernightMission: (missionId: string, checkpointId: string) =>
      client.post<OvernightMission>(`/api/v1/agentic/overnight/${missionId}/rewind`, { checkpointId }),

    // 7. Episodic World-Model & Shadow Digital Twin
    getDigitalTwin: () => client.get<DigitalTwinState>('/api/v1/agentic/digital-twin'),
    syncDigitalTwin: () => client.post<DigitalTwinState>('/api/v1/agentic/digital-twin/sync', {}),
    generateShadowActions: (contextPrompt?: string) =>
      client.post<DigitalTwinState>('/api/v1/agentic/digital-twin/shadow', { contextPrompt }),
    actOnShadowCard: (cardId: string, decision: 'approved' | 'dismissed') =>
      client.post<DigitalTwinState>(`/api/v1/agentic/digital-twin/shadow/${cardId}`, { decision }),

    // 8. Contract-Net Swarm Market
    getSwarmMarket: () =>
      client.get<{ bidders: SpecialistBidder[]; history: SwarmMarketContractRun[] }>('/api/v1/agentic/swarm-market'),
    broadcastMarketTask: (input: { task: string }) =>
      client.post<SwarmMarketContractRun>('/api/v1/agentic/swarm-market/broadcast', input),
  }
}
