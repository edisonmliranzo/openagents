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

// 9. Grok DeepSearch + Big Brain + Live Pulse Radar
export type GrokToneMode = 'truth_seeking' | 'unfiltered_witty' | 'first_principles' | 'executive_brief'

export interface GrokCitation {
  id: string
  title: string
  url: string
  sourceType: 'web' | 'x_realtime' | 'arxiv' | 'repo' | 'telemetry'
  snippet: string
  credibilityScore: number
}

export interface GrokDeepSearchResult {
  id: string
  query: string
  toneMode: GrokToneMode
  bigBrainEnabled: boolean
  durationMs: number
  confidenceScore: number
  subQueries: string[]
  thinkingTrace: string[]
  synthesisMarkdown: string
  contrarianTake: string
  citations: GrokCitation[]
  createdAt: string
}

export interface GrokPulseItem {
  id: string
  category: 'ai_frontier' | 'repo_ops' | 'market_signal' | 'security_watch'
  headline: string
  summary: string
  momentum: string
  suggestedPrompt: string
  updatedAt: string
}

// 10. OpenClaw Core (SOUL.md / IDENTITY / Heartbeat Loop / Multi-Channel Gateway)
export interface OpenClawChannelNode {
  id: string
  channel: 'telegram' | 'discord' | 'whatsapp' | 'slack' | 'local_shell' | 'browser_claw'
  label: string
  status: 'connected' | 'standby' | 'configured'
  lastEvent: string
}

export interface OpenClawHeartbeatRun {
  id: string
  triggeredBy: 'manual' | 'autonomous_loop'
  gitBranch: string
  dirtyFilesCount: number
  activeGoalsCount: number
  sentinelAlertsCount: number
  proactiveDecision: string
  executedReflexes: string[]
  createdAt: string
}

export interface OpenClawSoulState {
  soulMd: string
  userMd: string
  heartbeatMd: string
  memoryMd: string
  heartbeatIntervalSec: number
  heartbeatEnabled: boolean
  channels: OpenClawChannelNode[]
  recentHeartbeats: OpenClawHeartbeatRun[]
  updatedAt: string
}

// 11. Hermes-3 Cognitive Steer & Native XML/JSON Function-Calling Trace
export interface HermesSteerConfig {
  reasoningDepth: number // 0-100
  creativity: number // 0-100
  toolAggressiveness: number // 0-100
  directness: number // 0-100
  uncensoredTechnicalMode: boolean
  structuredJsonMode: boolean
  systemDirective: string
  updatedAt: string
}

export interface HermesTraceRun {
  id: string
  prompt: string
  rawThinkXml: string
  rawToolCallXml: string
  toolExecutionResult: Record<string, unknown>
  finalResponse: string
  tokensPerSec: number
  contextUtilizationPct: number
  createdAt: string
}

// 12. Dots Mixture-of-Reasoners & Dynamic Compute Router
export interface DotsExpertAllocation {
  expertId: 'fast_reflex' | 'deep_math_logic' | 'code_tool_synth' | 'vision_doc_grounding' | 'swarm_consensus'
  label: string
  weightPct: number
  modelTier: string
  rationale: string
}

export interface DotsConnectedNode {
  id: string
  kind: 'memory' | 'goal' | 'file' | 'tool' | 'session'
  label: string
  relevanceScore: number
}

export interface DotsRouteResult {
  id: string
  prompt: string
  selectedPrimaryPath: string
  estimatedLatencyMs: number
  computeSavedPct: number
  allocations: DotsExpertAllocation[]
  connectedDots: DotsConnectedNode[]
  synthesizedAnswer: string
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

    // 9. Grok DeepSearch + Big Brain + Live Pulse Radar
    getGrokState: () =>
      client.get<{ pulse: GrokPulseItem[]; history: GrokDeepSearchResult[] }>('/api/v1/agentic/grok'),
    runGrokDeepSearch: (input: {
      query: string
      toneMode?: GrokToneMode
      bigBrainEnabled?: boolean
    }) => client.post<GrokDeepSearchResult>('/api/v1/agentic/grok/deepsearch', input),

    // 10. OpenClaw Core (SOUL.md / Heartbeat / Multi-Channel Claw)
    getOpenClawState: () => client.get<OpenClawSoulState>('/api/v1/agentic/openclaw'),
    updateOpenClawSoul: (input: Partial<Pick<OpenClawSoulState, 'soulMd' | 'userMd' | 'heartbeatMd' | 'memoryMd' | 'heartbeatIntervalSec' | 'heartbeatEnabled'>>) =>
      client.post<OpenClawSoulState>('/api/v1/agentic/openclaw/soul', input),
    runOpenClawHeartbeat: (triggeredBy: 'manual' | 'autonomous_loop' = 'manual') =>
      client.post<{ state: OpenClawSoulState; latestRun: OpenClawHeartbeatRun }>('/api/v1/agentic/openclaw/heartbeat', {
        triggeredBy,
      }),

    // 11. Hermes-3 Steer & Native XML Trace
    getHermesState: () =>
      client.get<{ config: HermesSteerConfig; traces: HermesTraceRun[] }>('/api/v1/agentic/hermes'),
    updateHermesSteer: (input: Partial<HermesSteerConfig>) =>
      client.post<HermesSteerConfig>('/api/v1/agentic/hermes/steer', input),
    invokeHermesTrace: (input: { prompt: string }) =>
      client.post<HermesTraceRun>('/api/v1/agentic/hermes/invoke', input),

    // 12. Dots Mixture-of-Reasoners & Dynamic Compute Router
    getDotsState: () => client.get<{ history: DotsRouteResult[] }>('/api/v1/agentic/dots'),
    routeWithDots: (input: { prompt: string }) =>
      client.post<DotsRouteResult>('/api/v1/agentic/dots/route', input),
  }
}
