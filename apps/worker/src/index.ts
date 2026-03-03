import 'dotenv/config'
import Bull from 'bull'
import {
  APPROVAL_JOB_NAMES,
  QUEUE_NAMES,
  type ApprovalDeadLetterJobData,
  type ApprovalJobData,
} from '@openagents/shared'
import { processApprovalJob } from './processors/approval.processor'

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

export const approvalQueue = new Bull<ApprovalJobData>(QUEUE_NAMES.approvals, redisUrl)
export const approvalDeadLetterQueue = new Bull<ApprovalDeadLetterJobData>(QUEUE_NAMES.approvalsDeadLetter, redisUrl)
export const toolRunQueue = new Bull(QUEUE_NAMES.toolRuns, redisUrl)

approvalQueue.process(APPROVAL_JOB_NAMES.resolved, processApprovalJob)
approvalQueue.on('failed', async (job, error) => {
  if (!job) return

  const maxAttempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1
  if (job.attemptsMade < maxAttempts) return

  const failedReason = error instanceof Error
    ? error.message
    : (typeof error === 'string' ? error : (job.failedReason ?? 'Unknown failure'))

  try {
    await approvalDeadLetterQueue.add(
      APPROVAL_JOB_NAMES.deadLetter,
      {
        approvalId: job.data.approvalId,
        conversationId: job.data.conversationId,
        userId: job.data.userId,
        toolName: job.data.toolName,
        toolInput: job.data.toolInput,
        attemptsMade: job.attemptsMade,
        failedReason,
        failedAt: new Date().toISOString(),
      },
      {
        jobId: `approval-dlq:${job.data.approvalId}`,
        removeOnComplete: false,
        removeOnFail: false,
      },
    )
    console.error(`[worker] moved approval ${job.data.approvalId} to dead-letter queue after ${job.attemptsMade} attempts`)
  } catch (deadLetterError) {
    const deadLetterMessage = deadLetterError instanceof Error ? deadLetterError.message : String(deadLetterError)
    console.error(`[worker] failed to move approval ${job.data.approvalId} to dead-letter queue: ${deadLetterMessage}`)
  }
})

toolRunQueue.process(async (job) => {
  console.log('[worker] tool-run job received', job.data)
  // TODO: execute tool and push result back via webhook/SSE
})

console.log('[worker] started, listening on queues: approvals, approvals-dead-letter, tool-runs')

process.on('SIGTERM', async () => {
  await approvalQueue.close()
  await approvalDeadLetterQueue.close()
  await toolRunQueue.close()
  process.exit(0)
})
