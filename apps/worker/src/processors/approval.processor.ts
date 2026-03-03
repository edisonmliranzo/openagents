import type { ApprovalJobData } from '@openagents/shared'
import type { Job } from 'bull'

/**
 * When an approval is resolved, this job resumes the agent run
 * by asking the API runtime to execute continuation logic.
 */
export async function processApprovalJob(job: Job<ApprovalJobData>) {
  const { approvalId, approved } = job.data
  console.log(`[approval-processor] Processing approval ${approvalId}: ${approved ? 'approved' : 'denied'}`)

  if (!approved) {
    console.log(`[approval-processor] Approval ${approvalId} denied. No continuation call required.`)
    return
  }

  const baseUrl = resolveContinuationApiBaseUrl()
  const endpoint = `${baseUrl}/api/v1/approvals/internal/continue`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const workerToken = (process.env.APPROVAL_WORKER_TOKEN ?? '').trim()
  if (workerToken) {
    headers['x-approval-worker-token'] = workerToken
  }

  const timeoutMs = parsePositiveInt(process.env.APPROVAL_CONTINUATION_HTTP_TIMEOUT_MS, 15000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ approvalId }),
      signal: controller.signal,
    })
  } catch (error) {
    throw new Error(`Continuation request failed for ${approvalId}: ${toErrorMessage(error)}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await safeReadBody(response)
    throw new Error(
      `Continuation API returned ${response.status} for ${approvalId}: ${body.slice(0, 300)}`,
    )
  }

  const payload = await safeReadJson(response)
  const status = readStatus(payload)
  if (!status) {
    throw new Error(`Continuation API returned unexpected payload for ${approvalId}: ${JSON.stringify(payload)}`)
  }

  const detail = readDetail(payload)
  console.log(
    `[approval-processor] Approval ${approvalId} continuation status: ${status}${detail ? ` (${detail})` : ''}`,
  )
}

function resolveContinuationApiBaseUrl() {
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

async function safeReadJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function safeReadBody(response: Response) {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

function readStatus(payload: unknown): 'completed' | 'already_completed' | 'ignored' | null {
  if (!payload || typeof payload !== 'object') return null
  const status = (payload as { status?: unknown }).status
  return status === 'completed' || status === 'already_completed' || status === 'ignored'
    ? status
    : null
}

function readDetail(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const detail = (payload as { detail?: unknown }).detail
  return typeof detail === 'string' ? detail : ''
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Unknown error'
}
