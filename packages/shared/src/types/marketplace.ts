// AI Model marketplace and benchmarking types
export interface ModelListing {
  id: string
  provider: string
  modelId: string
  displayName: string
  description: string
  pricing: ModelPricing
  capabilities: ModelCapabilities
  benchmarks: ModelBenchmark[]
  isFeatured: boolean
  isVerified: boolean
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface ModelPricing {
  inputCostPer1kTokens: number
  outputCostPer1kTokens: number
  currency: string
  isFree: boolean
  hasFreeTier: boolean
}

export interface ModelCapabilities {
  maxTokens: number
  supportsStreaming: boolean
  supportsFunctionCalling: boolean
  supportsVision: boolean
  supportsAudio: boolean
  supportsJsonMode: boolean
  contextWindow: number
}

export interface ModelBenchmark {
  name: string
  score: number
  maxScore: number
  category: 'reasoning' | 'coding' | 'math' | 'creative' | 'factual'
}

export interface BenchmarkComparison {
  id: string
  userId: string
  modelIds: string[]
  testPrompts: string[]
  results: BenchmarkResult[]
  createdAt: string
}

export interface BenchmarkResult {
  modelId: string
  promptIndex: number
  response: string
  latencyMs: number
  tokensUsed: number
  cost: number
  qualityScore?: number
}

export interface MarketplaceReview {
  id: string
  modelId: string
  userId: string
  rating: number
  title: string
  content: string
  useCases: string[]
  pros: string[]
  cons: string[]
  upvotes: number
  downvotes: number
  createdAt: string
}
