// Multi-modal content generation types
export interface MultiModalPipeline {
  id: string
  userId: string
  name: string
  description: string
  steps: PipelineStep[]
  inputTypes: string[]
  outputTypes: string[]
  createdAt: string
  updatedAt: string
}

export interface PipelineStep {
  id: string
  order: number
  type: 'input' | 'transform' | 'generate' | 'merge' | 'output'
  provider: string
  model?: string
  config: Record<string, unknown>
  inputMapping: Record<string, string>
}

export interface ContentGenerationRequest {
  pipelineId?: string
  inputType: 'text' | 'image' | 'audio' | 'video' | 'document'
  inputData: string | Record<string, unknown>
  outputType: 'text' | 'image' | 'audio' | 'video' | 'document'
  options: GenerationOptions
}

export interface GenerationOptions {
  quality?: 'fast' | 'balanced' | 'high'
  style?: string
  format?: string
  size?: string
  duration?: number
  language?: string
}

export interface GenerationResult {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  outputType: string
  outputUrl?: string
  outputData?: Record<string, unknown>
  error?: string
  metadata: GenerationMetadata
  createdAt: string
}

export interface GenerationMetadata {
  provider: string
  model: string
  durationMs: number
  cost: number
  tokensUsed?: number
}
