import type { OpenAgentsClient } from '../client'
import type {
  CreateWorkflowInput,
  RunWorkflowInput,
  UpdateWorkflowInput,
  WorkflowBranchRunInput,
  WorkflowRunComparison,
  WorkflowDefinition,
  WorkflowRun,
} from '@openagents/shared'

export function createWorkflowsApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<WorkflowDefinition[]>('/api/v1/workflows'),

    get: (id: string) => client.get<WorkflowDefinition>(`/api/v1/workflows/${id}`),

    create: (input: CreateWorkflowInput) =>
      client.post<WorkflowDefinition>('/api/v1/workflows', input),

    update: (id: string, input: UpdateWorkflowInput) =>
      client.patch<WorkflowDefinition>(`/api/v1/workflows/${id}`, input),

    remove: (id: string) => client.delete<{ ok: true }>(`/api/v1/workflows/${id}`),

    run: (id: string, input: RunWorkflowInput = {}) =>
      client.post<WorkflowRun>(`/api/v1/workflows/${id}/run`, input),

    listRuns: (id: string, limit = 25) =>
      client.get<WorkflowRun[]>(`/api/v1/workflows/${id}/runs?limit=${limit}`),

    rerun: (id: string, runId: string, input: RunWorkflowInput = {}) =>
      client.post<WorkflowRun>(`/api/v1/workflows/${id}/runs/${runId}/rerun`, input),

    branchRun: (id: string, input: WorkflowBranchRunInput) =>
      client.post<WorkflowRun>(`/api/v1/workflows/${id}/runs/branch`, input),

    compareRuns: (id: string, leftRunId: string, rightRunId: string) =>
      client.get<WorkflowRunComparison>(
        `/api/v1/workflows/${id}/runs/compare?leftRunId=${encodeURIComponent(leftRunId)}&rightRunId=${encodeURIComponent(rightRunId)}`,
      ),

    triggerWebhook: (id: string, webhookSecret: string) =>
      client.post<WorkflowRun>(`/api/v1/workflows/${id}/webhook`, { webhookSecret }),
  }
}
