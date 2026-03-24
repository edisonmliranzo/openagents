'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type {
  AgentPreset,
  NanobotSkillState,
  UserSettings,
  WorkflowDefinition,
  Workspace,
} from '@openagents/shared'

const AUTONOMY_OPTIONS = ['assist', 'copilot', 'autonomous'] as const

function badgeTone(visibility: AgentPreset['visibility']) {
  if (visibility === 'public') return 'bg-emerald-100 text-emerald-700'
  if (visibility === 'workspace') return 'bg-blue-100 text-blue-700'
  return 'bg-slate-200 text-slate-700'
}

export default function AgentPresetsPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [presets, setPresets] = useState<AgentPreset[]>([])
  const [skills, setSkills] = useState<NanobotSkillState[]>([])
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [role, setRole] = useState('researcher')
  const [outputStyle, setOutputStyle] = useState('structured brief')
  const [autonomyMode, setAutonomyMode] = useState<(typeof AUTONOMY_OPTIONS)[number]>('assist')
  const [visibility, setVisibility] = useState<'private' | 'workspace' | 'public'>('private')
  const [workspaceId, setWorkspaceId] = useState('')
  const [preferredProvider, setPreferredProvider] = useState('')
  const [preferredModel, setPreferredModel] = useState('')
  const [customSystemPrompt, setCustomSystemPrompt] = useState('')
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [busyPresetId, setBusyPresetId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [presetRows, skillRows, workflowRows, settingsRow, workspaceRows] = await Promise.all([
        sdk.agentPresets.list(),
        sdk.nanobot.listSkills(),
        sdk.workflows.list(),
        sdk.users.getSettings(),
        sdk.workspaces.list(),
      ])
      setPresets(presetRows)
      setSkills(skillRows)
      setWorkflows(workflowRows)
      setSettings(settingsRow)
      setWorkspaces(workspaceRows)
      setPreferredProvider((current) => current || settingsRow.preferredProvider || '')
      setPreferredModel((current) => current || settingsRow.preferredModel || '')
      setCustomSystemPrompt((current) => current || settingsRow.customSystemPrompt || '')
      setSelectedSkillIds((current) => current.length > 0
        ? current
        : skillRows.filter((skill) => skill.enabled).map((skill) => skill.id))
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load presets'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  function toggleSelection(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value])
  }

  async function handleCreatePreset() {
    if (!name.trim()) {
      addToast('warning', 'Preset name is required.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const created = await sdk.agentPresets.create({
        name: name.trim(),
        description: description.trim() || undefined,
        role: role.trim() || undefined,
        outputStyle: outputStyle.trim() || undefined,
        autonomyMode,
        visibility,
        workspaceId: workspaceId || undefined,
        settings: {
          preferredProvider: preferredProvider.trim() || undefined,
          preferredModel: preferredModel.trim() || undefined,
          customSystemPrompt: customSystemPrompt.trim() || undefined,
        },
        enabledSkills: selectedSkillIds,
        suggestedWorkflowIds: selectedWorkflowIds,
        policy: {
          defaultDecision: autonomyMode === 'autonomous' ? 'auto' : 'confirm',
          approvalScopes: autonomyMode === 'autonomous'
            ? ['external_write', 'system_mutation']
            : ['external_write', 'system_mutation', 'external_read'],
          maxAutonomySteps: autonomyMode === 'autonomous' ? 12 : 6,
        },
      })
      setPresets((current) => [created, ...current])
      setName('')
      setDescription('')
      addToast('success', `Created preset "${created.name}"`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to create preset'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleApplyPreset(preset: AgentPreset) {
    setBusyPresetId(preset.id)
    setError('')
    try {
      const result = await sdk.agentPresets.apply(preset.id)
      setPresets((current) =>
        current.map((entry) => (entry.id === preset.id ? result.preset : entry)))
      addToast('success', `Applied "${preset.name}"`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to apply preset'
      setError(message)
      addToast('error', message)
    } finally {
      setBusyPresetId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1450px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Agent Presets</h1>
          <p className="mt-1 text-sm text-slate-500">
            Save repeatable role profiles with models, prompts, skills, policies, and workflow hints.
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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create Preset</h2>
            <p className="mt-1 text-sm text-slate-500">
              Seed the form from your current settings, then capture the role-specific runtime profile.
            </p>
          </div>
          {settings && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Current defaults: {settings.preferredProvider} / {settings.preferredModel}
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-slate-500">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Researcher"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="text-xs font-medium text-slate-500">
              Role
              <input
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="researcher"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="text-xs font-medium text-slate-500 md:col-span-2">
              Description
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Produces source-grounded research briefs with action-oriented summaries."
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="text-xs font-medium text-slate-500">
              Output style
              <input
                value={outputStyle}
                onChange={(event) => setOutputStyle(event.target.value)}
                placeholder="structured brief"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="text-xs font-medium text-slate-500">
              Autonomy
              <select
                value={autonomyMode}
                onChange={(event) => setAutonomyMode(event.target.value as (typeof AUTONOMY_OPTIONS)[number])}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
              >
                {AUTONOMY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-slate-500">
              Provider
              <input
                value={preferredProvider}
                onChange={(event) => setPreferredProvider(event.target.value)}
                placeholder="anthropic"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="text-xs font-medium text-slate-500">
              Model
              <input
                value={preferredModel}
                onChange={(event) => setPreferredModel(event.target.value)}
                placeholder="claude-sonnet-4-6"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="text-xs font-medium text-slate-500">
              Visibility
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as 'private' | 'workspace' | 'public')}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
              >
                <option value="private">private</option>
                <option value="workspace">workspace</option>
                <option value="public">public</option>
              </select>
            </label>

            <label className="text-xs font-medium text-slate-500">
              Workspace
              <select
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Personal preset</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-slate-500 md:col-span-2">
              Custom system prompt
              <textarea
                value={customSystemPrompt}
                onChange={(event) => setCustomSystemPrompt(event.target.value)}
                placeholder="Prefer current sources, cite uncertainty, and end with next actions."
                className="mt-1 h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Skills</p>
              <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                {skills.map((skill) => (
                  <label key={skill.id} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedSkillIds.includes(skill.id)}
                      onChange={() => toggleSelection(selectedSkillIds, skill.id, setSelectedSkillIds)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
                    />
                    <span>
                      <span className="font-semibold text-slate-800">{skill.title}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{skill.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested workflows</p>
              <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
                {workflows.map((workflow) => (
                  <label key={workflow.id} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedWorkflowIds.includes(workflow.id)}
                      onChange={() => toggleSelection(selectedWorkflowIds, workflow.id, setSelectedWorkflowIds)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
                    />
                    <span>
                      <span className="font-semibold text-slate-800">{workflow.name}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{workflow.trigger.kind}</span>
                    </span>
                  </label>
                ))}
                {workflows.length === 0 && (
                  <p className="rounded-lg bg-white px-3 py-3 text-xs text-slate-500">No workflows yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void handleCreatePreset()}
            disabled={isSaving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? 'Creating...' : 'Create preset'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Saved Presets</h2>
        <p className="mt-1 text-sm text-slate-500">
          {presets.length} preset{presets.length === 1 ? '' : 's'} available.
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {presets.map((preset) => (
            <article key={preset.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{preset.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {preset.role} • {preset.settings.preferredProvider ?? 'default provider'} / {preset.settings.preferredModel ?? 'default model'}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeTone(preset.visibility)}`}>
                  {preset.visibility}
                </span>
              </div>

              {preset.description && (
                <p className="mt-2 text-sm text-slate-700">{preset.description}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                <span className="rounded bg-white px-2 py-1">skills {preset.enabledSkills.length}</span>
                <span className="rounded bg-white px-2 py-1">workflows {preset.suggestedWorkflowIds.length}</span>
                <span className="rounded bg-white px-2 py-1">autonomy {preset.autonomyMode}</span>
                <span className="rounded bg-white px-2 py-1">applied {preset.appliedCount}x</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-[11px] text-slate-400">
                  updated {new Date(preset.updatedAt).toLocaleString()}
                </div>
                <button
                  type="button"
                  onClick={() => void handleApplyPreset(preset)}
                  disabled={busyPresetId === preset.id}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  {busyPresetId === preset.id ? 'Applying...' : 'Apply preset'}
                </button>
              </div>
            </article>
          ))}

          {presets.length === 0 && (
            <p className="text-sm text-slate-500">
              {isLoading ? 'Loading presets...' : 'No presets yet.'}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
