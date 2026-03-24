import type {
  CreateWorkspaceInput,
  CreateWorkspaceInvitationInput,
  CreateWorkspaceMemoryEntryInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceInvitation,
} from '@openagents/shared'
import type { OpenAgentsClient } from '../client'

export function createWorkspacesApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<Workspace[]>('/api/v1/workspaces'),
    get: (id: string) => client.get<Workspace>(`/api/v1/workspaces/${id}`),
    create: (input: CreateWorkspaceInput) =>
      client.post<Workspace>('/api/v1/workspaces', input),
    update: (id: string, input: UpdateWorkspaceInput) =>
      client.patch<Workspace>(`/api/v1/workspaces/${id}`, input),
    listPendingInvitations: () =>
      client.get<WorkspaceInvitation[]>('/api/v1/workspaces/invitations/pending'),
    invite: (workspaceId: string, input: CreateWorkspaceInvitationInput) =>
      client.post<WorkspaceInvitation>(`/api/v1/workspaces/${workspaceId}/invitations`, input),
    acceptInvitation: (invitationId: string) =>
      client.post<Workspace>(`/api/v1/workspaces/invitations/${invitationId}/accept`),
    addMemoryEntry: (workspaceId: string, input: CreateWorkspaceMemoryEntryInput) =>
      client.post(`/api/v1/workspaces/${workspaceId}/memory`, input),
    shareConversation: (workspaceId: string, conversationId: string) =>
      client.post(`/api/v1/workspaces/${workspaceId}/share/conversation/${conversationId}`),
    shareWorkflow: (workspaceId: string, workflowId: string) =>
      client.post(`/api/v1/workspaces/${workspaceId}/share/workflow/${workflowId}`),
    shareArtifact: (workspaceId: string, artifactId: string) =>
      client.post(`/api/v1/workspaces/${workspaceId}/share/artifact/${artifactId}`),
  }
}
