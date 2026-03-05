import type { ExtractionJobData } from '@openagents/shared'
import type { Job } from 'bull'

export async function processExtractionJob(job: Job<ExtractionJobData>) {
  const { extractionId } = job.data
  console.log(`[extraction-processor] Processing extraction job ${extractionId}`)

  const baseUrl = resolveApiBaseUrl()
  const endpoint = `${baseUrl}/api/v1/extract/internal/process`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const workerToken = (process.env.EXTRACTION_WORKER_TOKEN ?? '').trim()
  if (workerToken) {
    headers['x-extraction-worker-token'] = workerToken
  }

  const timeoutMs = parsePositiveInt(process.env.EXTRACTION_HTTP_TIMEOUT_MS, 20000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ extractionId }),
      signal: controller.signal,
    })
  } catch (error) {
    throw new Error(`Extraction process request failed for ${extractionId}: ${toErrorMessage(error)}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await safeReadBody(response)
    throw new Error(`Extraction API returned ${response.status} for ${extractionId}: ${body.slice(0, 300)}`)
  }

  console.log(`[extraction-processor] Extraction ${extractionId} processed successfully.`)
}

function resolveApiBaseUrl() {
  const configured = (process.env.APPROVAL_CONTINUATION_API_URL ?? '').trim()
  if (configured) return configured.replace(/\/+$/, '')

  const port = (process.env.API_PORT ?? process.env.PORT ?? '3001').trim() || '3001'
  return `http://localhost:${port}`
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt((value ?? '').trim(), 10)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return fallback
}

async function safeReadBody(response: Response) {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Unknown error'
}
