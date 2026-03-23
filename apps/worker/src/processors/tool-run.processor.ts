import type { ToolRunJobData } from '@openagents/shared'
import type { Job } from 'bull'

export async function processToolRunJob(job: Job<ToolRunJobData>) {
  const { toolName, userId } = job.data
  console.log(`[tool-run-processor] Processing tool job for ${toolName}`)

  const baseUrl = resolveApiBaseUrl()
  const endpoint = `${baseUrl}/api/v1/tools/internal/process`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const workerToken = (process.env.TOOL_RUN_WORKER_TOKEN ?? '').trim()
  if (workerToken) {
    headers['x-tool-run-worker-token'] = workerToken
  }

  const timeoutMs = parsePositiveInt(process.env.TOOL_RUN_HTTP_TIMEOUT_MS, 20_000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(job.data),
      signal: controller.signal,
    })
  } catch (error) {
    throw new Error(`Tool run request failed for ${toolName} (${userId}): ${toErrorMessage(error)}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await safeReadBody(response)
    throw new Error(`Tool API returned ${response.status} for ${toolName}: ${body.slice(0, 300)}`)
  }

  console.log(`[tool-run-processor] Tool ${toolName} completed successfully.`)
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
