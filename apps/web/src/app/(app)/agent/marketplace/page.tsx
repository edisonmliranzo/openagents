'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type {
  AgentPreset,
  ArtifactTemplate,
  NanobotSkillState,
  PackBundle,
  PackInstallPreview,
  WorkflowDefinition,
} from '@openagents/shared'

function toggleSelection(list: string[], value: string) {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
}

function countSummary(pack: PackBundle) {
  return `${pack.manifest.skills.length} skills • ${pack.manifest.presets.length} presets • ${pack.manifest.workflows.length} workflows • ${pack.manifest.artifactTemplates.length} templates`
}

export default function MarketplacePage() {
  const addToast = useUIStore((state) => state.addToast)
  const [myPacks, setMyPacks] = useState<PackBundle[]>([])
  const [publicPacks, setPublicPacks] = useState<PackBundle[]>([])
  const [skills, setSkills] = useState<NanobotSkillState[]>([])
  const [presets, setPresets] = useState<AgentPreset[]>([])
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [templates, setTemplates] = useState<ArtifactTemplate[]>([])
  const [previewByPackId, setPreviewByPackId] = useState<Record<string, PackInstallPreview>>({})
  const [name, setName] = useState('research-ops-pack')
  const [description, setDescription] = useState('Preset-driven research and artifact workflow bundle.')
  const [visibility, setVisibility] = useState<'private' | 'workspace' | 'public'>('public')
  const [tags, setTags] = useState('research, ops')
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([])
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState<string[]>([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [busyPackId, setBusyPackId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [
        myPackRows,
        publicPackRows,
        skillRows,
        presetRows,
        workflowRows,
        templateRows,
      ] = await Promise.all([
        sdk.packs.listMine(),
        sdk.packs.listPublic(),
        sdk.nanobot.listSkills(),
        sdk.agentPresets.list(),
        sdk.workflows.list(),
        sdk.artifacts.listTemplates(),
      ])
      setMyPacks(myPackRows)
      setPublicPacks(publicPackRows)
      setSkills(skillRows)
      setPresets(presetRows)
      setWorkflows(workflowRows)
      setTemplates(templateRows)
      setSelectedSkillIds((current) => current.length > 0
        ? current
        : skillRows.filter((skill) => skill.enabled).map((skill) => skill.id))
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load marketplace'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreatePack() {
    if (!name.trim()) {
      addToast('warning', 'Pack name is required.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const created = await sdk.packs.create({
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
        tags: tags.split(',').map((entry) => entry.trim()).filter(Boolean),
        skillIds: selectedSkillIds,
        presetIds: selectedPresetIds,
        workflowIds: selectedWorkflowIds,
        artifactTemplateIds: selectedTemplateIds,
      })
      setMyPacks((current) => [created, ...current])
      if (created.visibility === 'public') {
        setPublicPacks((current) => [created, ...current])
      }
      addToast('success', `Created pack "${created.name}"`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to create pack'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handlePreview(packId: string) {
    setBusyPackId(packId)
    setError('')
    try {
      const preview = await sdk.packs.preview(packId)
      setPreviewByPackId((current) => ({ ...current, [packId]: preview }))
    } catch (err: any) {
      const message = err?.message ?? 'Failed to preview pack'
      setError(message)
      addToast('error', message)
    } finally {
      setBusyPackId(null)
    }
  }

  async function handleInstall(pack: PackBundle) {
    setBusyPackId(pack.id)
    setError('')
    try {
      const result = await sdk.packs.install(pack.id)
      addToast(
        'success',
        `Installed ${result.installed.skills.length} skills, ${result.installed.presetIds.length} presets, and ${result.installed.workflowIds.length} workflows.`,
      )
      await load()
    } catch (err: any) {
      const message = err?.message ?? 'Failed to install pack'
      setError(message)
      addToast('error', message)
    } finally {
      setBusyPackId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Pack Marketplace</h1>
          <p className="mt-1 text-sm text-slate-500">
            Bundle skills, presets, workflows, and artifact templates into reusable installable packs.
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
            <h2 className="text-lg font-semibold text-slate-900">Pack Composer</h2>
            <p className="mt-1 text-sm text-slate-500">
              Presets bring policy and model defaults with them, so packs stay role-aware instead of becoming loose files.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-slate-500 md:col-span-2">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            <label className="text-xs font-medium text-slate-500 md:col-span-2">
              Description
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Visibility
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as 'private' | 'workspace' | 'public')}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
              >
                <option value="private">private</option>
                <option value="workspace">workspace</option>
                <option value="public">public</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">
              Tags
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="research, ops"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            <div className="md:col-span-2 flex justify-end">
              <button
                type="button"
                onClick={() => void handleCreatePack()}
                disabled={isSaving}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {isSaving ? 'Creating...' : 'Create pack'}
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Skills</p>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                {skills.map((skill) => (
                  <label key={skill.id} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedSkillIds.includes(skill.id)}
                      onChange={() => setSelectedSkillIds((current) => toggleSelection(current, skill.id))}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-200"
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
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Presets</p>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                {presets.map((preset) => (
                  <label key={preset.id} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedPresetIds.includes(preset.id)}
                      onChange={() => setSelectedPresetIds((current) => toggleSelection(current, preset.id))}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-200"
                    />
                    <span>
                      <span className="font-semibold text-slate-800">{preset.name}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{preset.role}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workflows</p>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                {workflows.map((workflow) => (
                  <label key={workflow.id} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedWorkflowIds.includes(workflow.id)}
                      onChange={() => setSelectedWorkflowIds((current) => toggleSelection(current, workflow.id))}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-200"
                    />
                    <span>
                      <span className="font-semibold text-slate-800">{workflow.name}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{workflow.trigger.kind}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Artifact templates</p>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                {templates.map((template) => (
                  <label key={template.id} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedTemplateIds.includes(template.id)}
                      onChange={() => setSelectedTemplateIds((current) => toggleSelection(current, template.id))}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-200"
                    />
                    <span>
                      <span className="font-semibold text-slate-800">{template.name}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{template.type}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Public Packs</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {publicPacks.map((pack) => {
            const preview = previewByPackId[pack.id]
            return (
              <article key={pack.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{pack.name}</p>
                    <p className="mt-1 text-xs text-slate-500">v{pack.version} • {pack.installCount} installs</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    public
                  </span>
                </div>
                {pack.description && (
                  <p className="mt-2 text-sm text-slate-700">{pack.description}</p>
                )}
                <p className="mt-2 text-[11px] text-slate-500">{countSummary(pack)}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {pack.tags.map((tag) => (
                    <span key={tag} className="rounded bg-white px-2 py-0.5 text-[11px] text-slate-600">
                      {tag}
                    </span>
                  ))}
                </div>
                {preview && (
                  <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                    preview.installable
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border border-amber-200 bg-amber-50 text-amber-700'
                  }`}>
                    {preview.installable
                      ? 'Installable on this instance.'
                      : `Missing tools: ${preview.missingTools.join(', ')}`}
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handlePreview(pack.id)}
                    disabled={busyPackId === pack.id}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {busyPackId === pack.id ? 'Working...' : 'Preview'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleInstall(pack)}
                    disabled={busyPackId === pack.id}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    Install
                  </button>
                </div>
              </article>
            )
          })}
          {publicPacks.length === 0 && (
            <p className="text-sm text-slate-500">
              {isLoading ? 'Loading public packs...' : 'No public packs published yet.'}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Your Packs</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {myPacks.map((pack) => (
            <article key={pack.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{pack.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {pack.visibility} • updated {new Date(pack.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                  v{pack.version}
                </span>
              </div>
              {pack.description && (
                <p className="mt-2 text-sm text-slate-700">{pack.description}</p>
              )}
              <p className="mt-2 text-[11px] text-slate-500">{countSummary(pack)}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {pack.tags.map((tag) => (
                  <span key={tag} className="rounded bg-white px-2 py-0.5 text-[11px] text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
          {myPacks.length === 0 && (
            <p className="text-sm text-slate-500">
              {isLoading ? 'Loading your packs...' : 'No packs created yet.'}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
