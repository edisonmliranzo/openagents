export interface FinetuneConfig {
  provider: 'openai' | 'anthropic'
  model: string
}

export interface TrainingExample {
  input: string
  output: string
}

export interface FinetuneInput {
  trainingData: TrainingExample[]
  validationData?: TrainingExample[]
  epochs?: number
  batchSize?: number
  learningRate?: number
}

export interface FinetuneResult {
  success: boolean
  jobId?: string
  status?: 'queued' | 'running' | 'completed' | 'failed'
  modelId?: string
  error?: string
}

export class FineTuner {
  private config: FinetuneConfig

  constructor(config: FinetuneConfig) {
    this.config = config
  }

  async createJob(input: FinetuneInput): Promise<FinetuneResult> {
    try {
      if (this.config.provider === 'openai') {
        return await this.openaiFinetune(input)
      } else if (this.config.provider === 'anthropic') {
        return { success: false, error: 'Anthropic fine-tuning not supported' }
      }
      return { success: false, error: 'Unknown provider' }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create job',
      }
    }
  }

  async getJob(jobId: string): Promise<FinetuneResult> {
    try {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) return { success: false, error: 'OpenAI API key not configured' }

      const response = await fetch(`https://api.openai.com/v1/fineTunes/${jobId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })

      if (!response.ok) {
        const error = await response.text()
        return { success: false, error }
      }

      const data = (await response.json()) as { status: string; fine_tuned_model?: string }
      return {
        success: true,
        jobId,
        status: data.status as FinetuneResult['status'],
        modelId: data.fine_tuned_model,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to get job',
      }
    }
  }

  private async openaiFinetune(input: FinetuneInput): Promise<FinetuneResult> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return { success: false, error: 'OpenAI API key not configured' }

    const trainingFile = await this.prepareTrainingData(input.trainingData)
    const validationFile = input.validationData
      ? await this.prepareTrainingData(input.validationData)
      : undefined

    const formData = new FormData()
    formData.append('training_file', trainingFile)
    if (validationFile) {
      formData.append('validation_file', validationFile)
    }
    formData.append('model', this.config.model)
    formData.append('epochs', String(input.epochs || 3))
    formData.append('batch_size', String(input.batchSize || 3))
    formData.append('learning_rate_multiplier', String(input.learningRate || 1))

    const response = await fetch('https://api.openai.com/v1/fineTunes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error }
    }

    const data = (await response.json()) as { id?: string }
    return { success: true, jobId: data.id, status: 'queued' }
  }

  private async prepareTrainingData(data: TrainingExample[]): Promise<File> {
    const jsonl = data
      .map((d) => JSON.stringify({ prompt: d.input, completion: d.output }))
      .join('\n')
    return new File([jsonl], 'training.jsonl', { type: 'application/jsonl' })
  }
}

export interface ModelInfo {
  id: string
  name: string
  status: 'available' | 'deleted'
  created: number
  baseModel: string
}

export async function listModels(): Promise<ModelInfo[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return []

  const response = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!response.ok) return []

  const data = (await response.json()) as { data?: Array<{ id: string; created: number }> }
  return (data.data || []).map((m) => ({
    id: m.id,
    name: m.id,
    status: 'available' as const,
    created: m.created,
    baseModel: '',
  }))
}

export function createFineTuner(config: FinetuneConfig): FineTuner {
  return new FineTuner(config)
}
