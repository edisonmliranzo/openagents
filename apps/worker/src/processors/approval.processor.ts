import type { ApprovalJobData } from '@openagents/shared'
import type { Job } from 'bull'

/**
 * When an approval is resolved, this job resumes the agent run
 * by re-executing the approved tool and continuing the conversation.
 */
export async function processApprovalJob(job: Job<ApprovalJobData>) {
  const { approvalId, approved, conversationId, userId, toolName, toolInput } = job.data
  console.log(`[approval-processor] Processing approval ${approvalId}: ${approved ? 'approved' : 'denied'}`)

  if (!approved) {
    // Notify via SSE that the action was denied
    // TODO: push SSE event to the user's active session
    return
  }

  // TODO: execute the tool and stream result back
  // This will call the tool registry and push the result to the conversation
  console.log(`[approval-processor] Would execute ${toolName} with`, toolInput)
}
