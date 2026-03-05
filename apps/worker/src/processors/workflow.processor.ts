import type { WorkflowRunJobData } from '@openagents/shared'
import type { Job } from 'bull'

export async function processWorkflowJob(job: Job<WorkflowRunJobData>) {
  const { userId, workflowId, runId } = job.data
  console.log(`[workflow-processor] Processing workflow run ${runId} (${workflowId})`)

  const baseUrl = resolveWorkflowApiBaseUrl()
  const endpoint = `${baseUrl}/api/v1/workflows/internal/process`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const workerToken = (process.env.WORKFLOW_WORKER_TOKEN ?? '').trim()
  if (workerToken) {
    headers['x-workflow-worker-token'] = workerToken
  }

  const timeoutMs = parsePositiveInt(process.env.WORKFLOW_PROCESS_HTTP_TIMEOUT_MS, 20_000)
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
    throw new Error(`Workflow process request failed for ${runId}: ${toErrorMessage(error)}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await safeReadBody(response)
    throw new Error(`Workflow API returned ${response.status} for ${runId}: ${body.slice(0, 300)}`)
  }

  console.log(`[workflow-processor] Workflow run ${runId} processed successfully for user ${userId}.`)
}

function resolveWorkflowApiBaseUrl() {
  const configured = (process.env.WORKFLOW_CONTINUATION_API_URL ?? '').trim()
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
