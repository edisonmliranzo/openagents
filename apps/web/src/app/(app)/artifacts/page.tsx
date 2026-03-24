'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { Artifact, ArtifactDetail, ArtifactTemplate, ArtifactType, Workspace } from '@openagents/shared'

const ARTIFACT_TYPES: ArtifactType[] = ['doc', 'report', 'spreadsheet', 'landing_page', 'dataset_export', 'brief']

export default function ArtifactsPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [templates, setTemplates] = useState<ArtifactTemplate[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedArtifactId, setSelectedArtifactId] = useState('')
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactDetail | null>(null)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ArtifactType>('doc')
  const [workspaceId, setWorkspaceId] = useState('')
  const [content, setContent] = useState('')
  const [summary, setSummary] = useState('')
  const [newVersionContent, setNewVersionContent] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateOutline, setTemplateOutline] = useState('')
  const [templateFieldSchema, setTemplateFieldSchema] = useState('title, sources, summary, next_actions')
  const [isLoading, setIsLoading] = useState(false)
  const [isSavingArtifact, setIsSavingArtifact] = useState(false)
  const [isSavingVersion, setIsSavingVersion] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [artifactRows, templateRows, workspaceRows] = await Promise.all([
        sdk.artifacts.list(),
        sdk.artifacts.listTemplates(),
        sdk.workspaces.list(),
      ])
      setArtifacts(artifactRows)
      setTemplates(templateRows)
      setWorkspaces(workspaceRows)
      if (!selectedArtifactId && artifactRows[0]) {
        setSelectedArtifactId(artifactRows[0].id)
      }
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load artifacts'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast, selectedArtifactId])

  const loadDetail = useCallback(async (artifactId: string) => {
    if (!artifactId) {
      setSelectedArtifact(null)
      return
    }
    try {
      const detail = await sdk.artifacts.get(artifactId)
      setSelectedArtifact(detail)
      setNewVersionContent(detail.currentVersion.content)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load artifact detail'
      setError(message)
      addToast('error', message)
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadDetail(selectedArtifactId)
  }, [loadDetail, selectedArtifactId])

  async function handleCreateArtifact() {
    if (!title.trim()) {
      addToast('warning', 'Artifact title is required.')
      return
    }
    setIsSavingArtifact(true)
    setError('')
    try {
      const created = await sdk.artifacts.create({
        title: title.trim(),
        type,
        workspaceId: workspaceId || undefined,
        content,
        summary: summary.trim() || undefined,
      })
      setArtifacts((current) => [created, ...current])
      setSelectedArtifactId(created.id)
      setTitle('')
      setSummary('')
      setContent('')
      addToast('success', `Created artifact "${created.title}"`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to create artifact'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSavingArtifact(false)
    }
  }

  async function handleAddVersion() {
    if (!selectedArtifactId || !newVersionContent.trim()) {
      addToast('warning', 'Select an artifact and add content first.')
      return
    }
    setIsSavingVersion(true)
    setError('')
    try {
      const updated = await sdk.artifacts.addVersion(selectedArtifactId, {
        content: newVersionContent,
      })
      setSelectedArtifact(updated)
      setArtifacts((current) =>
        current.map((artifact) => (artifact.id === updated.id ? updated : artifact)))
      addToast('success', `Saved v${updated.currentVersion.version}`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to save artifact version'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSavingVersion(false)
    }
  }

  async function handleCreateTemplate() {
    if (!templateName.trim()) {
      addToast('warning', 'Template name is required.')
      return
    }
    setIsSavingTemplate(true)
    setError('')
    try {
      const created = await sdk.artifacts.createTemplate({
        name: templateName.trim(),
        type,
        outline: templateOutline.trim() || undefined,
        fieldSchema: templateFieldSchema
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      })
      setTemplates((current) => [created, ...current])
      setTemplateName('')
      setTemplateOutline('')
      addToast('success', `Created template "${created.name}"`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to create template'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSavingTemplate(false)
    }
  }

  async function handleExport() {
    if (!selectedArtifactId) return
    setIsExporting(true)
    setError('')
    try {
      const result = await sdk.artifacts.export(selectedArtifactId, 'markdown')
      addToast('success', `Prepared ${result.fileName}`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to export artifact'
      setError(message)
      addToast('error', message)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Artifact Workspace</h1>
          <p className="mt-1 text-sm text-slate-500">
            Promote generated outputs into versioned artifacts with reusable templates and export-ready states.
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

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create Artifact</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-slate-500 md:col-span-2">
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Q2 research brief"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="text-xs font-medium text-slate-500">
              Type
              <select
                value={type}
                onChange={(event) => setType(event.target.value as ArtifactType)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
              >
                {ARTIFACT_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-slate-500">
              Workspace
              <select
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">Personal artifact</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-slate-500 md:col-span-2">
              Summary
              <input
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="One-line context for this deliverable."
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="text-xs font-medium text-slate-500 md:col-span-2">
              Initial content
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Draft the artifact body here..."
                className="mt-1 h-44 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void handleCreateArtifact()}
              disabled={isSavingArtifact}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSavingArtifact ? 'Creating...' : 'Create artifact'}
            </button>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Artifact Studio</h2>
              <p className="mt-1 text-sm text-slate-500">Review current output, add versions, and export the latest draft.</p>
            </div>
            <select
              value={selectedArtifactId}
              onChange={(event) => setSelectedArtifactId(event.target.value)}
              className="h-10 min-w-[220px] rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">Select artifact</option>
              {artifacts.map((artifact) => (
                <option key={artifact.id} value={artifact.id}>
                  {artifact.title}
                </option>
              ))}
            </select>
          </div>

          {!selectedArtifact ? (
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              {isLoading ? 'Loading artifacts...' : 'Select an artifact to inspect versions.'}
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{selectedArtifact.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedArtifact.type} • {selectedArtifact.status} • {selectedArtifact.versionCount} version(s)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleExport()}
                    disabled={isExporting}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {isExporting ? 'Exporting...' : 'Export latest'}
                  </button>
                </div>
                {selectedArtifact.summary && (
                  <p className="mt-2 text-sm text-slate-700">{selectedArtifact.summary}</p>
                )}
              </div>

              <label className="text-xs font-medium text-slate-500">
                New version content
                <textarea
                  value={newVersionContent}
                  onChange={(event) => setNewVersionContent(event.target.value)}
                  className="mt-1 h-56 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleAddVersion()}
                  disabled={isSavingVersion}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isSavingVersion ? 'Saving...' : 'Save new version'}
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Version history</p>
                <div className="mt-2 space-y-2">
                  {selectedArtifact.versions.map((version) => (
                    <div key={version.id} className="rounded-lg bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-800">v{version.version}</p>
                        <p className="text-[11px] text-slate-400">{new Date(version.createdAt).toLocaleString()}</p>
                      </div>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-slate-600">
                        {version.content.slice(0, 400)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Artifact Templates</h2>
        <div className="mt-4 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="text-xs font-medium text-slate-500">
              Template name
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Research memo"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Outline
              <textarea
                value={templateOutline}
                onChange={(event) => setTemplateOutline(event.target.value)}
                placeholder="Problem, evidence, recommendation, risks, next steps"
                className="mt-1 h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Fields
              <input
                value={templateFieldSchema}
                onChange={(event) => setTemplateFieldSchema(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleCreateTemplate()}
              disabled={isSavingTemplate}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSavingTemplate ? 'Saving...' : 'Create template'}
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {templates.map((template) => (
              <article key={template.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">{template.name}</p>
                <p className="mt-1 text-xs text-slate-500">{template.type} • {template.defaultFormat}</p>
                {template.description && (
                  <p className="mt-2 text-xs text-slate-600">{template.description}</p>
                )}
                {template.outline && (
                  <p className="mt-2 text-xs text-slate-600">{template.outline}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-1">
                  {template.fieldSchema.map((field) => (
                    <span key={field} className="rounded bg-white px-2 py-0.5 text-[11px] text-slate-600">
                      {field}
                    </span>
                  ))}
                </div>
              </article>
            ))}
            {templates.length === 0 && (
              <p className="text-sm text-slate-500">
                {isLoading ? 'Loading templates...' : 'No templates yet.'}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
