// Predictive resource scaling types
export interface ScalingPrediction {
  id: string
  taskComplexity: 'low' | 'medium' | 'high' | 'very_high'
  estimatedDurationMs: number
  estimatedTokens: number
  estimatedCost: number
  recommendedModel: string
  recommendedAutonomyLevel: string
  confidenceScore: number
  features: PredictedFeature[]
  createdAt: string
}

export interface PredictedFeature {
  name: string
  estimated: number
  confidence: number
}

export interface ScalingModel {
  id: string
  name: string
  version: string
  algorithm: 'linear' | 'gradient_boost' | 'neural_network' | 'ensemble'
  trainingDataSize: number
  accuracy: number
  lastTrainedAt: string
  status: 'training' | 'active' | 'deprecated'
}

export interface ScalingMetric {
  id: string
  taskType: string
  model: string
  autonomyLevel: string
  actualDurationMs: number
  actualTokens: number
  actualCost: number
  successRate: number
  timestamp: string
}

export interface ScalingRecommendation {
  type: 'model_switch' | 'autonomy_adjust' | 'resource_burst' | 'batch_optimization'
  reason: string
  expectedImprovement: number
  confidence: number
  config: Record<string, unknown>
}

export interface ResourcePool {
  id: string
  name: string
  capacity: ResourceCapacity
  currentUsage: ResourceUsage
  scalingRules: ScalingRule[]
}

export interface ResourceCapacity {
  maxConcurrentTasks: number
  maxTokensPerMinute: number
  maxCostPerHour: number
}

export interface ResourceUsage {
  activeTasks: number
  tokensThisMinute: number
  costThisHour: number
}

export interface ScalingRule {
  id: string
  trigger: ScalingTrigger
  action: ScalingAction
  enabled: boolean
}

export interface ScalingTrigger {
  type: 'queue_depth' | 'cost_rate' | 'latency_p95' | 'error_rate'
  threshold: number
  comparison: 'gt' | 'lt' | 'eq'
}

export interface ScalingAction {
  type: 'scale_up' | 'scale_down' | 'route_to_queue' | 'throttle'
  targetValue: number
}
