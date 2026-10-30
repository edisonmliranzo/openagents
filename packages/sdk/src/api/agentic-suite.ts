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

// 13. Speculative Pre-Fetch & Ghost Typing
export interface SpeculativePrediction {
  id: string
  partialInput: string
  ghostCompletion: string
  predictedIntent: string
  warmedResources: Array<{ kind: 'file' | 'memory' | 'web' | 'tool'; label: string; latencySavedMs: number }>
  estimatedTimeToFirstTokenMs: number
  createdAt: string
}

// 14. Full-Duplex Live Voice & Screen Co-Pilot
export interface CopilotVisualAnalysis {
  id: string
  windowTitle: string
  detectedElements: Array<{ label: string; region: string; actionableSuggestion: string }>
  spokenResponse: string
  suggestedCommand: string
  createdAt: string
}

// 15. Prompt & Agent Evolution Arena (Genetic Prompt Optimizer)
export interface PromptChromosome {
  id: string
  generation: number
  label: string
  systemPromptSnippet: string
  mutationStrategy: string
  accuracyScore: number
  avgLatencyMs: number
  avgTokens: number
  fitnessScore: number
  isChampion: boolean
  createdAt: string
}

// 16. Autonomous Web Workflow Recorder ("Show Once, Run Forever" RPA)
export interface RecordedMacroStep {
  stepNumber: number
  action: 'navigate' | 'click' | 'fill' | 'extract' | 'assert'
  selector: string
  visionFallbackAnchor: string
  value?: string
}

export interface WebWorkflowMacro {
  id: string
  name: string
  targetDomain: string
  scheduleCron: string
  parameters: string[]
  steps: RecordedMacroStep[]
  playwrightCode: string
  runsCount: number
  selfHealedCount: number
  lastStatus: 'ready' | 'succeeded' | 'self_healed'
  lastOutputPreview: string
  createdAt: string
}

// 17. Inline Live Code Sandbox & Micro-App Renderer (Artifacts 2.0)
export interface LiveMicroApp {
  id: string
  title: string
  framework: 'html_tailwind' | 'svg_interactive' | 'data_dashboard'
  prompt: string
  sourceCode: string
  publishedSlug?: string
  viewsCount: number
  createdAt: string
}

// 18. Personal Knowledge Time-Machine & Contradiction Detector
export interface TemporalEventNode {
  id: string
  timestamp: string
  source: 'commit' | 'decision' | 'goal' | 'memory'
  title: string
  summary: string
}

export interface ContradictionAlert {
  id: string
  severity: 'high' | 'medium'
  earlierStatement: string
  earlierDate: string
  newerStatement: string
  newerDate: string
  resolutionSuggestion: string
  resolved: boolean
}

export interface TimeMachineState {
  events: TemporalEventNode[]
  contradictions: ContradictionAlert[]
  lastQueryAnswer?: string
}

// 19. Firewall & Secret-Zero Outbound Interceptor
export interface FirewallRuleItem {
  id: string
  name: string
  patternType: 'api_key' | 'jwt_token' | 'pii_email_phone' | 'private_key' | 'db_connection'
  action: 'redact' | 'block'
  enabled: boolean
  hitsCount: number
}

export interface FirewallPacketInspection {
  id: string
  destination: string
  originalLength: number
  sanitizedPayload: string
  redactedSecretsCount: number
  matchedRules: string[]
  verdict: 'sanitized_allowed' | 'blocked' | 'clean'
  createdAt: string
}

// 20. Autonomous FinOps & API Arbitrage Engine
export interface ProviderArbitrageRow {
  provider: string
  model: string
  latencyMs: number
  costPer1MTokensUsd: number
  uptimePct: number
  qualityScore: number
  arbitrageRank: number
  status: 'optimal' | 'standby' | 'degraded'
}

export interface FinOpsArbitrageState {
  monthlySavedUsd: number
  semanticCacheHitRatePct: number
  totalArbitrageRoutes: number
  providers: ProviderArbitrageRow[]
  latestSimulation?: {
    prompt: string
    chosenProvider: string
    chosenModel: string
    baselineCostUsd: number
    arbitrageCostUsd: number
    savingsPct: number
    rationale: string
  }
}

// 21. Multiplayer Live War Room & Shared Agent Canvas
export interface WarRoomParticipant {
  id: string
  name: string
  kind: 'human' | 'specialist_agent'
  role: string
  status: 'online' | 'typing' | 'executing'
}

export interface WarRoomTurn {
  id: string
  authorName: string
  authorKind: 'human' | 'specialist_agent'
  roleBadge: string
  content: string
  createdAt: string
}

export interface MultiplayerWarRoomState {
  roomId: string
  title: string
  sharedCanvasMarkdown: string
  participants: WarRoomParticipant[]
  turns: WarRoomTurn[]
  updatedAt: string
}

// 22. 1-Click Prompt-to-Production Ship Pipeline
export interface ShipPipelineStep {
  name: string
  status: 'passed' | 'running' | 'pending' | 'rolled_back'
  durationMs: number
  detail: string
}

export interface ShipPipelineRun {
  id: string
  title: string
  promptOrDiff: string
  branchName: string
  commitSha: string
  previewUrl: string
  productionUrl: string
  status: 'deployed' | 'rolled_back'
  steps: ShipPipelineStep[]
  createdAt: string
}

// 23. Autonomous Self-Training & Dataset Distiller
export interface DistilledTrajectorySample {
  id: string
  title: string
  sourceEngine: string
  qualityScore: number
  tokenCount: number
  format: 'sharegpt_jsonl' | 'alpaca_jsonl' | 'hermes_xml_lora'
  systemPrompt: string
  userInput: string
  thinkTrace: string
  toolCallsJson: string
  verifiedOutput: string
  jsonlRow: string
  createdAt: string
}

export interface DistillerState {
  totalSamples: number
  avgQualityScore: number
  readyForLoraFineTune: boolean
  targetLocalModel: string
  samples: DistilledTrajectorySample[]
}

// 24. Multi-Persona Boardroom & Synthetic User Simulator
export interface PersonaCritique {
  personaId: string
  personaName: string
  role: string
  conversionLikelihoodPct: number
  topPraise: string
  topObjection: string
  concreteFix: string
}

export interface BoardroomSimulationRun {
  id: string
  proposal: string
  overallScore: number
  consensusVerdict: 'ship_now' | 'iterate_copy_and_ux' | 'high_risk_rework'
  critiques: PersonaCritique[]
  executiveSynthesis: string
  createdAt: string
}

// 25. Autonomous Bug Hunter & Chaos Monkey Engine
export interface ChaosFinding {
  id: string
  vector: 'null_boundary' | 'unicode_overflow' | 'jwt_expiry_race' | 'rate_limit_burst' | 'malformed_json'
  targetEndpoint: string
  severity: 'critical' | 'medium' | 'low'
  status: 'auto_patched' | 'resilient'
  reproductionTest: string
  generatedPatch: string
}

export interface ChaosRunReport {
  id: string
  targetScope: string
  resilienceScore: number
  probesExecuted: number
  findings: ChaosFinding[]
  createdAt: string
}

// 26. Multimodal Deep Document & Repo Cartographer
export interface CartographerNode {
  id: string
  label: string
  layer: 'client_ui' | 'sdk_contract' | 'api_controller' | 'domain_service' | 'persistence'
  filePath: string
  blastRadiusScore: number
  dependencies: string[]
  summary: string
}

export interface CartographerMapState {
  targetScope: string
  totalFilesScanned: number
  criticalPathSummary: string
  nodes: CartographerNode[]
  updatedAt: string
}

// 27. Autonomous Omnichannel GTM, Social Engagement & Revenue Autopilot
export type OmnichannelTouchType = 'comment' | 'reply' | 'dm' | 'email' | 'text_sms' | 'whatsapp'

export type OmnichannelPlatform =
  | 'Reddit'
  | 'X (Twitter)'
  | 'LinkedIn'
  | 'Threads'
  | 'Hacker News'
  | 'Instagram'
  | 'Email (SMTP/IMAP)'
  | 'SMS / Text'
  | 'WhatsApp'

export interface OmnichannelProspectDraft {
  id: string
  touchType: OmnichannelTouchType
  platform: OmnichannelPlatform
  prospectName: string
  prospectHandleOrContact: string
  prospectRole: string
  icpFitScore: number
  sourceContext: string
  whyTheyFit: string[]
  chainOfThought: string[]
  subjectLine?: string
  draftMessage: string
  status: 'pending_review' | 'approved' | 'sent' | 'skipped'
  scheduledAt?: string
  sentAt?: string
  createdAt: string
}

export interface OwnPostReplyWatchItem {
  id: string
  platform: 'X (Twitter)' | 'LinkedIn' | 'Reddit' | 'Threads'
  postTitleOrSnippet: string
  hoursRemaining: number
  commenterHandle: string
  incomingComment: string
  needsFounderAttention: boolean
  attentionReason?: string
  draftedReply: string
  status: 'waiting_for_you' | 'draft_ready' | 'replied' | 'dismissed'
}

export interface OmnichannelConnector {
  id: string
  channel: 'social_browser' | 'email_smtp' | 'text_sms' | 'whatsapp'
  label: string
  providerDetail: string
  status: 'connected' | 'warming_up' | 'paused'
  dailySent: number
  dailyCap: number
  safetyNote: string
}

export interface GrowthExperiment {
  id: string
  title: string
  channel: 'x_thread' | 'linkedin_launch' | 'waitlist_email' | 'seo_landing'
  predictedLiftPct: number
  status: 'ready' | 'active' | 'completed'
  generatedCopy: string
  callToAction: string
  createdAt: string
}

export interface GrowthAutopilotState {
  waitlistCount: number
  weeklyGrowthPct: number
  conversionRatePct: number
  mrrProjectedUsd: number
  experiments: GrowthExperiment[]
  voiceProfile?: {
    tone: string
    rules: string[]
    learnedEditsCount: number
  }
  funnel?: {
    prospectsPrioritized: number
    draftsReady: number
    approvedReadyToSend: number
    sentToday: number
    repliesOrVisits: number
    trialsStarted: number
    payingCustomers: number
  }
  outreachQueue?: OmnichannelProspectDraft[]
  ownPostWatchers?: OwnPostReplyWatchItem[]
  connectors?: OmnichannelConnector[]
}

// 28. Cryptographic Proof-of-Execution & Tamper-Evident Audit Ledger
export interface CryptoExecutionReceipt {
  id: string
  blockIndex: number
  timestamp: string
  actor: string
  actionType: string
  payloadSummary: string
  prevHash: string
  sha256Hash: string
  signature: string
  verified: boolean
}

export interface CryptoLedgerState {
  chainIntegrityValid: boolean
  merkleRoot: string
  totalBlocks: number
  receipts: CryptoExecutionReceipt[]
}

// 29. Cross-Device Clipboard, Dropzone & Instant Handoff Beam
export interface BeamDropItem {
  id: string
  title: string
  kind: 'code_snippet' | 'url_bookmark' | 'prompt_brief' | 'terminal_command'
  sourceDevice: 'Desktop Studio' | 'iPhone Companion' | 'Browser Claw' | 'CLI Terminal'
  content: string
  autoStagedAction: string
  createdAt: string
}

// 30. Autonomous API & Webhook Reverse-Engineer
export interface ReverseEngineeredSdk {
  id: string
  apiName: string
  sourceInput: string
  detectedAuthType: string
  endpointsCount: number
  zodSchemaCode: string
  typescriptClientCode: string
  mcpToolDefinitionJson: string
  createdAt: string
}

// 31. Cognitive Load & Deep-Work Flow Guardian
export interface InterceptedNoiseItem {
  id: string
  source: string
  sender: string
  originalMessage: string
  urgencyScore: number
  autoHandledResponse: string
  receivedAt: string
}

export interface FlowGuardianState {
  deepWorkEnabled: boolean
  focusTopic: string
  focusMinutesSaved: number
  cognitiveLoadPct: number
  whileYouWereInFlowDigest: string
  interceptedItems: InterceptedNoiseItem[]
}

// 32. Autonomous Database & SQL Optimization Lab
export interface SqlOptimizationReport {
  id: string
  naturalLanguageQuery: string
  generatedSql: string
  estimatedBeforeMs: number
  estimatedAfterMs: number
  speedupFactor: string
  recommendedIndex: string
  nPlusOneWarning: string | null
  sampleRows: Array<Record<string, string | number>>
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

    // 13. Speculative Pre-Fetch & Ghost Typing
    getSpeculativeState: () =>
      client.get<{ history: SpeculativePrediction[] }>('/api/v1/agentic/speculative'),
    predictSpeculative: (input: { partialInput: string }) =>
      client.post<SpeculativePrediction>('/api/v1/agentic/speculative/predict', input),

    // 14. Full-Duplex Live Voice & Screen Co-Pilot
    getCopilotState: () =>
      client.get<{ analyses: CopilotVisualAnalysis[] }>('/api/v1/agentic/copilot'),
    analyzeScreenFrame: (input: { windowTitle: string; voiceTranscript: string; domSummary?: string }) =>
      client.post<CopilotVisualAnalysis>('/api/v1/agentic/copilot/analyze', input),

    // 15. Prompt & Agent Evolution Arena
    getEvolutionArena: () =>
      client.get<{ chromosomes: PromptChromosome[] }>('/api/v1/agentic/evolution'),
    runEvolutionGeneration: (input: { benchmarkGoal: string }) =>
      client.post<{ chromosomes: PromptChromosome[]; newChampion: PromptChromosome }>('/api/v1/agentic/evolution/mutate', input),
    promotePromptVariant: (chromosomeId: string) =>
      client.post<{ chromosomes: PromptChromosome[] }>(`/api/v1/agentic/evolution/${chromosomeId}/promote`, {}),

    // 16. Autonomous Web Workflow Recorder (RPA)
    getWebMacros: () =>
      client.get<{ macros: WebWorkflowMacro[] }>('/api/v1/agentic/web-recorder'),
    createWebMacro: (input: { name: string; targetDomain: string; demonstrationPrompt: string; scheduleCron?: string }) =>
      client.post<WebWorkflowMacro>('/api/v1/agentic/web-recorder', input),
    executeWebMacro: (macroId: string, params?: Record<string, string>) =>
      client.post<WebWorkflowMacro>(`/api/v1/agentic/web-recorder/${macroId}/run`, { params }),

    // 17. Inline Live Code Sandbox & Micro-App Renderer
    getMicroApps: () =>
      client.get<{ apps: LiveMicroApp[] }>('/api/v1/agentic/sandbox'),
    createMicroApp: (input: { title: string; prompt: string; framework?: LiveMicroApp['framework'] }) =>
      client.post<LiveMicroApp>('/api/v1/agentic/sandbox', input),
    publishMicroApp: (appId: string) =>
      client.post<LiveMicroApp>(`/api/v1/agentic/sandbox/${appId}/publish`, {}),

    // 18. Personal Knowledge Time-Machine & Contradiction Detector
    getTimeMachineState: () =>
      client.get<TimeMachineState>('/api/v1/agentic/time-machine'),
    queryTimeMachine: (input: { question: string }) =>
      client.post<TimeMachineState>('/api/v1/agentic/time-machine/query', input),
    resolveContradiction: (alertId: string) =>
      client.post<TimeMachineState>(`/api/v1/agentic/time-machine/contradictions/${alertId}/resolve`, {}),

    // 19. Firewall & Secret-Zero Outbound Interceptor
    getFirewallState: () =>
      client.get<{ rules: FirewallRuleItem[]; inspections: FirewallPacketInspection[] }>('/api/v1/agentic/firewall'),
    scanOutboundPayload: (input: { destination: string; payload: string }) =>
      client.post<FirewallPacketInspection>('/api/v1/agentic/firewall/scan', input),
    toggleFirewallRule: (ruleId: string) =>
      client.post<{ rules: FirewallRuleItem[] }>(`/api/v1/agentic/firewall/rules/${ruleId}/toggle`, {}),

    // 20. Autonomous FinOps & API Arbitrage Engine
    getFinOpsState: () =>
      client.get<FinOpsArbitrageState>('/api/v1/agentic/finops'),
    simulateArbitrageRoute: (input: { prompt: string; maxLatencyMs?: number }) =>
      client.post<FinOpsArbitrageState>('/api/v1/agentic/finops/route', input),

    // 21. Multiplayer Live War Room & Shared Agent Canvas
    getWarRoomState: () =>
      client.get<MultiplayerWarRoomState>('/api/v1/agentic/war-room'),
    postWarRoomTurn: (input: { message: string; inviteSpecialists?: boolean }) =>
      client.post<MultiplayerWarRoomState>('/api/v1/agentic/war-room/turn', input),
    updateWarRoomCanvas: (input: { sharedCanvasMarkdown: string }) =>
      client.post<MultiplayerWarRoomState>('/api/v1/agentic/war-room/canvas', input),

    // 22. 1-Click Prompt-to-Production Ship Pipeline
    getShipPipelines: () =>
      client.get<{ pipelines: ShipPipelineRun[] }>('/api/v1/agentic/ship'),
    runShipPipeline: (input: { title: string; promptOrDiff: string }) =>
      client.post<ShipPipelineRun>('/api/v1/agentic/ship/run', input),
    rollbackShipPipeline: (pipelineId: string) =>
      client.post<ShipPipelineRun>(`/api/v1/agentic/ship/${pipelineId}/rollback`, {}),

    // 23. Autonomous Self-Training & Dataset Distiller
    getDistillerState: () =>
      client.get<DistillerState>('/api/v1/agentic/distiller'),
    distillTrajectory: (input: { title: string; userInput: string; format?: DistilledTrajectorySample['format'] }) =>
      client.post<DistillerState>('/api/v1/agentic/distiller/distill', input),

    // 24. Multi-Persona Boardroom & Synthetic User Simulator
    getBoardroomState: () =>
      client.get<{ runs: BoardroomSimulationRun[] }>('/api/v1/agentic/boardroom'),
    runBoardroomSimulation: (input: { proposal: string }) =>
      client.post<BoardroomSimulationRun>('/api/v1/agentic/boardroom/simulate', input),

    // 25. Autonomous Bug Hunter & Chaos Monkey Engine
    getChaosState: () =>
      client.get<{ reports: ChaosRunReport[] }>('/api/v1/agentic/chaos'),
    runChaosMonkey: (input: { targetScope: string }) =>
      client.post<ChaosRunReport>('/api/v1/agentic/chaos/run', input),

    // 26. Multimodal Deep Document & Repo Cartographer
    getCartographerState: () =>
      client.get<CartographerMapState>('/api/v1/agentic/cartographer'),
    scanCartographerMap: (input: { targetScope: string }) =>
      client.post<CartographerMapState>('/api/v1/agentic/cartographer/map', input),

    // 27. Autonomous Omnichannel GTM, Social Engagement & Revenue Autopilot
    getGrowthState: () =>
      client.get<GrowthAutopilotState>('/api/v1/agentic/growth'),
    generateGrowthCampaign: (input: { title: string; channel: GrowthExperiment['channel']; productAngle: string }) =>
      client.post<GrowthAutopilotState>('/api/v1/agentic/growth/campaign', input),
    scanOmnichannelProspects: (input: {
      touchType: OmnichannelTouchType
      platform?: OmnichannelPlatform
      prospectName?: string
      prospectHandleOrContact?: string
      prospectRole?: string
      sourceContext: string
      subjectLine?: string
    }) => client.post<GrowthAutopilotState>('/api/v1/agentic/growth/scan', input),
    actOnOmnichannelDraft: (
      draftId: string,
      input: {
        action: 'approve' | 'unapprove' | 'send' | 'skip' | 'edit'
        draftMessage?: string
        subjectLine?: string
        styleFeedbackNote?: string
      },
    ) => client.post<GrowthAutopilotState>(`/api/v1/agentic/growth/drafts/${draftId}/action`, input),
    bulkRewriteOmnichannelDrafts: (input: {
      instruction: string
      touchTypeFilter?: OmnichannelTouchType | 'all'
      minFitScoreToApprove?: number
    }) => client.post<GrowthAutopilotState>('/api/v1/agentic/growth/drafts/bulk-rewrite', input),
    sendApprovedOmnichannelDrafts: (input?: { touchTypeFilter?: OmnichannelTouchType | 'all' }) =>
      client.post<GrowthAutopilotState>('/api/v1/agentic/growth/drafts/send-approved', input ?? {}),
    actOnOwnPostReply: (
      replyId: string,
      input: { action: 'approve_send' | 'dismiss'; draftedReply?: string },
    ) => client.post<GrowthAutopilotState>(`/api/v1/agentic/growth/own-posts/${replyId}/action`, input),

    // 28. Cryptographic Proof-of-Execution & Tamper-Evident Audit Ledger
    getCryptoLedger: () =>
      client.get<CryptoLedgerState>('/api/v1/agentic/ledger'),
    signExecutionReceipt: (input: { actor: string; actionType: string; payloadSummary: string }) =>
      client.post<CryptoLedgerState>('/api/v1/agentic/ledger/sign', input),
    verifyCryptoLedger: () =>
      client.post<{ valid: boolean; verifiedBlocks: number; merkleRoot: string }>('/api/v1/agentic/ledger/verify', {}),

    // 29. Cross-Device Clipboard, Dropzone & Instant Handoff Beam
    getBeamDrops: () =>
      client.get<{ drops: BeamDropItem[] }>('/api/v1/agentic/beam'),
    createBeamDrop: (input: {
      title: string
      kind?: BeamDropItem['kind']
      sourceDevice?: BeamDropItem['sourceDevice']
      content: string
    }) => client.post<BeamDropItem>('/api/v1/agentic/beam/drop', input),

    // 30. Autonomous API & Webhook Reverse-Engineer
    getReverseEngineeredSdks: () =>
      client.get<{ sdks: ReverseEngineeredSdk[] }>('/api/v1/agentic/reverse-engineer'),
    synthesizeReverseEngineeredSdk: (input: { apiName: string; rawCurlOrJson: string }) =>
      client.post<ReverseEngineeredSdk>('/api/v1/agentic/reverse-engineer/synthesize', input),

    // 31. Cognitive Load & Deep-Work Flow Guardian
    getFlowGuardianState: () =>
      client.get<FlowGuardianState>('/api/v1/agentic/flow-guardian'),
    toggleDeepWorkMode: (input: { deepWorkEnabled: boolean; focusTopic?: string }) =>
      client.post<FlowGuardianState>('/api/v1/agentic/flow-guardian/toggle', input),
    simulateInterceptedPing: (input: { source: string; sender: string; originalMessage: string }) =>
      client.post<FlowGuardianState>('/api/v1/agentic/flow-guardian/intercept', input),

    // 32. Autonomous Database & SQL Optimization Lab
    getDatabaseLabState: () =>
      client.get<{ reports: SqlOptimizationReport[] }>('/api/v1/agentic/database-lab'),
    analyzeDatabaseQuery: (input: { naturalLanguageQuery: string }) =>
      client.post<SqlOptimizationReport>('/api/v1/agentic/database-lab/analyze', input),
  }
}
