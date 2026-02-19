import 'dotenv/config'
import Bull from 'bull'
import { APPROVAL_JOB_NAMES, QUEUE_NAMES } from '@openagents/shared'
import { processApprovalJob } from './processors/approval.processor'

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

export const approvalQueue = new Bull(QUEUE_NAMES.approvals, redisUrl)
export const toolRunQueue = new Bull(QUEUE_NAMES.toolRuns, redisUrl)

approvalQueue.process(APPROVAL_JOB_NAMES.resolved, processApprovalJob)

toolRunQueue.process(async (job) => {
  console.log('[worker] tool-run job received', job.data)
  // TODO: execute tool and push result back via webhook/SSE
})

console.log('[worker] started, listening on queues: approvals, tool-runs')

process.on('SIGTERM', async () => {
  await approvalQueue.close()
  await toolRunQueue.close()
  process.exit(0)
})
