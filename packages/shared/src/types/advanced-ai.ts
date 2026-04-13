/**
 * Advanced AI Capabilities Types
 * 
 * This module defines types for advanced AI reasoning, self-reflection,
 * meta-cognition, and learning capabilities.
 */

export type ReasoningStrategy = 'chain-of-thought' | 'tree-of-thought' | 'graph-of-thought' | 'react' | 'plan-and-solve'

export type ReasoningStep = {
  id: string
  content: string
  reasoningType: ReasoningStrategy
  confidence: number
  metadata?: Record<string, unknown>
  timestamp: string
  previousSteps?: string[]
  nextSteps?: string[]
}

export type ReasoningChain = {
  id: string
  problem: string
  strategy: ReasoningStrategy
  steps: ReasoningStep[]
  finalAnswer?: string
  confidence: number
  qualityScore?: number
  createdAt: string
  completedAt?: string
  metadata?: Record<string, unknown>
}

export type ThoughtNode = {
  id: string
  content: string
  parentIds: string[]
  childIds: string[]
  confidence: number
  explorationDepth: number
  value?: number
  metadata?: Record<string, unknown>
  createdAt: string
}

export type ThoughtTree = {
  id: string
  rootProblem: string
  nodes: ThoughtNode[]
  edges: Array<{ from: string; to: string; weight: number }>
  bestPath?: string[]
  explorationStrategy: 'breadth-first' | 'depth-first' | 'best-first' | 'monte-carlo'
  createdAt: string
  completedAt?: string
}

export type GraphEdge = {
  from: string
  to: string
  weight: number
  relationshipType: 'causal' | 'correlational' | 'hierarchical' | 'sequential'
  confidence: number
}

export type KnowledgeGraph = {
  id: string
  nodes: Array<{
    id: string
    type: 'concept' | 'fact' | 'procedure' | 'entity'
    content: string
    confidence: number
    lastUpdated: string
  }>
  edges: GraphEdge[]
  createdAt: string
  lastUpdated: string
}

export type MetaCognitiveState = {
  selfAwareness: number // 0-1 scale of agent's awareness of its own capabilities
  uncertainty: number // 0-1 scale of uncertainty about current task
  confidence: number // 0-1 scale of confidence in current approach
  knowledgeGaps: string[] // Areas where agent recognizes lack of knowledge
  cognitiveLoad: number // 0-1 scale of current mental workload
  learningRate: number // How quickly agent adapts based on feedback
  lastUpdated: string
}

export type SelfReflection = {
  id: string
  targetOutput: string
  reflectionType: 'quality' | 'accuracy' | 'completeness' | 'relevance'
  assessment: {
    score: number // 0-100 quality score
    strengths: string[]
    weaknesses: string[]
    improvementSuggestions: string[]
    confidence: number
  }
  reasoning: string
  timestamp: string
  metadata?: Record<string, unknown>
}

export type LearningFeedback = {
  id: string
  source: 'user' | 'self' | 'peer' | 'system'
  feedbackType: 'positive' | 'negative' | 'corrective' | 'suggestion'
  content: string
  targetComponent: 'reasoning' | 'output' | 'behavior' | 'knowledge'
  priority: 'low' | 'medium' | 'high' | 'critical'
  timestamp: string
  metadata?: Record<string, unknown>
}

export type AdaptiveMemory = {
  id: string
  agentId: string
  memories: Array<{
    id: string
    content: string
    type: 'experience' | 'lesson' | 'pattern' | 'mistake'
    timestamp: string
    relevance: number
    emotionalValence?: number
    tags: string[]
  }>
  patterns: Array<{
    trigger: string
    response: string
    successRate: number
    lastUsed: string
  }>
  lastUpdated: string
}

export type CognitiveLoad = {
  workingMemoryUsage: number // 0-1 scale
  processingSpeed: number // relative to baseline
  attentionSpan: number // current focus duration
  fatigueLevel: number // 0-1 scale
  stressLevel: number // 0-1 scale
  timestamp: string
}

export type UncertaintyQuantification = {
  epistemic: number // uncertainty due to lack of knowledge
  aleatoric: number // uncertainty due to inherent randomness
  total: number // combined uncertainty
  confidenceInterval: [number, number]
  sources: string[]
  timestamp: string
}

export type ReasoningContext = {
  problemStatement: string
  availableTools: string[]
  timeConstraints: number
  qualityRequirements: {
    minimumConfidence: number
    maximumUncertainty: number
    requiredAccuracy: number
  }
  cognitiveState: MetaCognitiveState
  previousAttempts: ReasoningChain[]
  availableKnowledge: KnowledgeGraph
  currentLoad: CognitiveLoad
}

export type AdvancedAICapabilities = {
  reasoning: {
    enabledStrategies: ReasoningStrategy[]
    maxChainLength: number
    confidenceThreshold: number
  }
  reflection: {
    enabled: boolean
    reflectionFrequency: 'always' | 'on-demand' | 'periodic'
    qualityThreshold: number
  }
  metaCognition: {
    enabled: boolean
    selfAwarenessThreshold: number
    uncertaintyThreshold: number
  }
  learning: {
    enabled: boolean
    feedbackIntegrationRate: number
    memoryRetentionPeriod: number
  }
}

// Input types for API endpoints

export interface CreateReasoningChainInput {
  problem: string
  strategy: ReasoningStrategy
  context?: Partial<ReasoningContext>
  maxSteps?: number
  qualityThreshold?: number
}

export interface AddReasoningStepInput {
  chainId: string
  content: string
  confidence?: number
  metadata?: Record<string, unknown>
}

export interface EvaluateOutputInput {
  output: string
  criteria: {
    accuracy?: boolean
    completeness?: boolean
    relevance?: boolean
    quality?: boolean
  }
  context?: string
}

export interface GetMetaCognitiveStateInput {
  agentId: string
  includeHistory?: boolean
  historyLimit?: number
}

export interface ProcessFeedbackInput {
  feedback: LearningFeedback
  applyImmediately?: boolean
  updateMemory?: boolean
}

export interface AdaptiveLearningInput {
  experience: {
    task: string
    approach: string
    outcome: string
    success: boolean
    lessons: string[]
  }
  updateStrategy?: boolean
}

export interface UncertaintyAnalysisInput {
  output: string
  context: string
  knowledgeBase: KnowledgeGraph
}

export interface CognitiveLoadInput {
  agentId: string
  currentTask?: string
  taskComplexity?: number
  timePressure?: number
}

// Response types

export interface ReasoningChainResponse {
  chain: ReasoningChain
  status: 'completed' | 'in-progress' | 'failed'
  nextAction?: 'continue' | 'evaluate' | 'conclude'
}

export interface ReflectionResponse {
  reflection: SelfReflection
  improvements: string[]
  confidence: number
}

export interface MetaCognitiveResponse {
  state: MetaCognitiveState
  recommendations: string[]
  riskAssessment: {
    overconfidence: boolean
    underconfidence: boolean
    cognitiveOverload: boolean
    knowledgeGaps: string[]
  }
}

export interface LearningResponse {
  updatedMemory: AdaptiveMemory
  newPatterns: Array<{ trigger: string; response: string }>
  performanceImprovement: number
}

export interface UncertaintyResponse {
  quantification: UncertaintyQuantification
  mitigationStrategies: string[]
  confidenceRecommendation: 'proceed' | 'seek_clarification' | 'escalate'
}

export interface CognitiveLoadResponse {
  currentLoad: CognitiveLoad
  recommendations: string[]
  performanceImpact: {
    accuracyImpact: number
    speedImpact: number
    qualityImpact: number
  }
}

export interface ThoughtTreeResponse {
  tree: ThoughtTree
  status: 'active' | 'completed'
  rootNode?: ThoughtNode
  selectedNode?: ThoughtNode
  pathValue?: number
}

export interface KnowledgeGraphResponse {
  graph: KnowledgeGraph
  status: 'active' | 'completed'
  addedNode?: KnowledgeGraph['nodes'][number]
  addedEdge?: GraphEdge
}
