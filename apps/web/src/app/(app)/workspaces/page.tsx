'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { Artifact, Conversation, WorkflowDefinition, Workspace, WorkspaceInvitation } from '@openagents/shared'

export default function WorkspacesPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<WorkspaceInvitation[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [memoryTitle, setMemoryTitle] = useState('')
  const [memoryContent, setMemoryContent] = useState('')
  const [shareConversationId, setShareConversationId] = useState('')
  const [shareWorkflowId, setShareWorkflowId] = useState('')
  const [shareArtifactId, setShareArtifactId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false)
  const [isInviting, setIsInviting] = useState(false)
  const [isSavingMemory, setIsSavingMemory] = useState(false)
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [workspaceRows, invitationRows, conversationRows, workflowRows, artifactRows] = await Promise.all([
        sdk.workspaces.list(),
        sdk.workspaces.listPendingInvitations(),
        sdk.conversations.list(),
        sdk.workflows.list(),
        sdk.artifacts.list(),
      ])
      setWorkspaces(workspaceRows)
      setPendingInvitations(invitationRows)
      setConversations(conversationRows)
      setWorkflows(workflowRows)
      setArtifacts(artifactRows)
      if (!selectedWorkspaceId && workspaceRows[0]) {
        setSelectedWorkspaceId(workspaceRows[0].id)
      }
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load workspaces'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast, selectedWorkspaceId])

  const loadWorkspace = useCallback(async (workspaceId: string) => {
    if (!workspaceId) {
      setSelectedWorkspace(null)
      return
    }
    try {
      const workspace = await sdk.workspaces.get(workspaceId)
      setSelectedWorkspace(workspace)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load workspace detail'
      setError(message)
      addToast('error', message)
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadWorkspace(selectedWorkspaceId)
  }, [loadWorkspace, selectedWorkspaceId])

  async function handleCreateWorkspace() {
    if (!name.trim()) {
      addToast('warning', 'Workspace name is required.')
      return
    }
    setIsSavingWorkspace(true)
    setError('')
    try {
      const created = await sdk.workspaces.create({
        name: name.trim(),
        description: description.trim() || undefined,
      })
      setWorkspaces((current) => [created, ...current])
      setSelectedWorkspaceId(created.id)
      setName('')
      setDescription('')
      addToast('success', `Created workspace "${created.name}"`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to create workspace'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSavingWorkspace(false)
    }
  }

  async function handleInvite() {
    if (!selectedWorkspaceId || !inviteEmail.trim()) {
      addToast('warning', 'Select a workspace and provide an email.')
      return
    }
    setIsInviting(true)
    setError('')
    try {
      await sdk.workspaces.invite(selectedWorkspaceId, { email: inviteEmail.trim(), role: 'editor' })
      setInviteEmail('')
      await loadWorkspace(selectedWorkspaceId)
      addToast('success', 'Invitation created')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to invite member'
      setError(message)
      addToast('error', message)
    } finally {
      setIsInviting(false)
    }
  }

  async function handleAcceptInvitation(invitationId: string) {
    setBusyInvitationId(invitationId)
    setError('')
    try {
      const workspace = await sdk.workspaces.acceptInvitation(invitationId)
      setPendingInvitations((current) => current.filter((item) => item.id !== invitationId))
      setSelectedWorkspaceId(workspace.id)
      await load()
      addToast('success', `Joined ${workspace.name}`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to accept invitation'
      setError(message)
      addToast('error', message)
    } finally {
      setBusyInvitationId(null)
    }
  }

  async function handleAddMemory() {
    if (!selectedWorkspaceId || !memoryTitle.trim() || !memoryContent.trim()) {
      addToast('warning', 'Workspace memory needs a title and content.')
      return
    }
    setIsSavingMemory(true)
    setError('')
    try {
      await sdk.workspaces.addMemoryEntry(selectedWorkspaceId, {
        title: memoryTitle.trim(),
        content: memoryContent.trim(),
      })
      setMemoryTitle('')
      setMemoryContent('')
      await loadWorkspace(selectedWorkspaceId)
      addToast('success', 'Workspace memory saved')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to save workspace memory'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSavingMemory(false)
    }
  }

  async function handleShare(kind: 'conversation' | 'workflow' | 'artifact') {
    if (!selectedWorkspaceId) return
    setError('')
    try {
      if (kind === 'conversation' && shareConversationId) {
        await sdk.workspaces.shareConversation(selectedWorkspaceId, shareConversationId)
      }
      if (kind === 'workflow' && shareWorkflowId) {
        await sdk.workspaces.shareWorkflow(selectedWorkspaceId, shareWorkflowId)
      }
      if (kind === 'artifact' && shareArtifactId) {
        await sdk.workspaces.shareArtifact(selectedWorkspaceId, shareArtifactId)
      }
      await loadWorkspace(selectedWorkspaceId)
      addToast('success', `Shared ${kind}`)
    } catch (err: any) {
      const message = err?.message ?? `Failed to share ${kind}`
      setError(message)
      addToast('error', message)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Team Workspaces</h1>
          <p className="mt-1 text-sm text-slate-500">
            Organize shared conversations, workflows, artifacts, memory, invitations, and member roles.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {pendingInvitations.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-amber-900">Pending Invitations</h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {pendingInvitations.map((invitation) => (
              <article key={invitation.id} className="rounded-xl border border-amber-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">{invitation.email}</p>
                <p className="mt-1 text-xs text-slate-500">
                  role {invitation.role} • expires {new Date(invitation.expiresAt).toLocaleDateString()}
                </p>
                <button
                  type="button"
                  onClick={() => void handleAcceptInvitation(invitation.id)}
                  disabled={busyInvitationId === invitation.id}
                  className="mt-3 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {busyInvitationId === invitation.id ? 'Joining...' : 'Accept invitation'}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
        <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create Workspace</h2>
            <p className="mt-1 text-sm text-slate-500">Start with a shared container, then invite collaborators.</p>
          </div>

          <label className="text-xs font-medium text-slate-500">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Growth Ops"
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="text-xs font-medium text-slate-500">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Shared workspace for outbound research, artifacts, and operator follow-up."
              className="mt-1 h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <button
            type="button"
            onClick={() => void handleCreateWorkspace()}
            disabled={isSavingWorkspace}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {isSavingWorkspace ? 'Creating...' : 'Create workspace'}
          </button>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your workspaces</p>
            <div className="mt-2 space-y-2">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  onClick={() => setSelectedWorkspaceId(workspace.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-xs transition ${
                    selectedWorkspaceId === workspace.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <p className="font-semibold">{workspace.name}</p>
                  <p className="mt-1 opacity-80">{workspace.members.length} members</p>
                </button>
              ))}
              {workspaces.length === 0 && (
                <p className="rounded-lg bg-white px-3 py-3 text-xs text-slate-500">
                  {isLoading ? 'Loading...' : 'No workspaces yet.'}
                </p>
              )}
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Workspace Control</h2>
              <p className="mt-1 text-sm text-slate-500">Invite members, share assets, and curate workspace memory.</p>
            </div>
            <select
              value={selectedWorkspaceId}
              onChange={(event) => setSelectedWorkspaceId(event.target.value)}
              className="h-10 min-w-[240px] rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
            >
              <option value="">Select workspace</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>

          {!selectedWorkspace ? (
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              {isLoading ? 'Loading workspace...' : 'Select a workspace to manage it.'}
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Members</p>
                  <div className="mt-2 space-y-2">
                    {selectedWorkspace.members.map((member) => (
                      <div key={member.id} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                        <p className="font-semibold">{member.userId}</p>
                        <p className="mt-1 text-slate-500">{member.role}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <input
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="teammate@example.com"
                      className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                    />
                    <button
                      type="button"
                      onClick={() => void handleInvite()}
                      disabled={isInviting}
                      className="rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      {isInviting ? 'Sending...' : 'Invite'}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workspace memory</p>
                  <input
                    value={memoryTitle}
                    onChange={(event) => setMemoryTitle(event.target.value)}
                    placeholder="Client ICP"
                    className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                  />
                  <textarea
                    value={memoryContent}
                    onChange={(event) => setMemoryContent(event.target.value)}
                    placeholder="Summarize the durable facts this workspace should retain."
                    className="mt-2 h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddMemory()}
                    disabled={isSavingMemory}
                    className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {isSavingMemory ? 'Saving...' : 'Add memory'}
                  </button>

                  <div className="mt-3 space-y-2">
                    {selectedWorkspace.memory.slice(0, 4).map((entry) => (
                      <div key={entry.id} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                        <p className="font-semibold">{entry.title}</p>
                        <p className="mt-1 text-slate-500">{entry.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Share conversation</p>
                  <select
                    value={shareConversationId}
                    onChange={(event) => setShareConversationId(event.target.value)}
                    className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="">Select conversation</option>
                    {conversations.map((conversation) => (
                      <option key={conversation.id} value={conversation.id}>
                        {conversation.title ?? conversation.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleShare('conversation')}
                    className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Share
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Share workflow</p>
                  <select
                    value={shareWorkflowId}
                    onChange={(event) => setShareWorkflowId(event.target.value)}
                    className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="">Select workflow</option>
                    {workflows.map((workflow) => (
                      <option key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleShare('workflow')}
                    className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Share
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Share artifact</p>
                  <select
                    value={shareArtifactId}
                    onChange={(event) => setShareArtifactId(event.target.value)}
                    className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="">Select artifact</option>
                    {artifacts.map((artifact) => (
                      <option key={artifact.id} value={artifact.id}>
                        {artifact.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleShare('artifact')}
                    className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Share
                  </button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shared conversations</p>
                  <div className="mt-2 space-y-2">
                    {selectedWorkspace.conversations.map((entry) => (
                      <div key={entry.id} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                        {entry.title}
                      </div>
                    ))}
                    {selectedWorkspace.conversations.length === 0 && (
                      <p className="rounded-lg bg-white px-3 py-3 text-xs text-slate-500">No shared conversations yet.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shared workflows</p>
                  <div className="mt-2 space-y-2">
                    {selectedWorkspace.workflows.map((entry) => (
                      <div key={entry.id} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                        {entry.name}
                      </div>
                    ))}
                    {selectedWorkspace.workflows.length === 0 && (
                      <p className="rounded-lg bg-white px-3 py-3 text-xs text-slate-500">No shared workflows yet.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shared artifacts</p>
                  <div className="mt-2 space-y-2">
                    {selectedWorkspace.artifacts.map((entry) => (
                      <div key={entry.id} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                        {entry.title}
                      </div>
                    ))}
                    {selectedWorkspace.artifacts.length === 0 && (
                      <p className="rounded-lg bg-white px-3 py-3 text-xs text-slate-500">No shared artifacts yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </article>
      </section>
    </div>
  )
}
