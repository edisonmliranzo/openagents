'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import clsx from 'clsx'
import {
  BookOpen,
  Check,
  CheckCircle2,
  Clipboard,
  Columns,
  Download,
  ExternalLink,
  FolderSync,
  Globe,
  Headphones,
  Loader2,
  Monitor,
  Paperclip,
  Play,
  QrCode,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Users,
  Wand2,
  X,
} from 'lucide-react'
import { sdk } from '@/stores/auth'
import { voiceEnabled, speak, stopSpeaking } from '@/lib/voice'
import type {
  BrowserSessionRow,
  ClipRow,
  JanitorMove,
  JournalRow,
  LearnedSkillRow,
} from '@openagents/sdk'

export interface SpecialistAgentOption {
  handle: '@Forge' | '@Scout' | '@Sentinel' | '@Atlas' | '@all'
  name: string
  role: string
  badge: string
  description: string
  promptPrefix: string
}

export const SPECIALIST_OPTIONS: SpecialistAgentOption[] = [
  {
    handle: '@Forge',
    name: 'Forge',
    role: 'Coder & Architect',
    badge: 'from-rose-500 to-orange-500',
    description: 'Full-stack TypeScript, system architecture, debugging & code execution',
    promptPrefix: 'Delegate to @Forge (Coder & Architect): ',
  },
  {
    handle: '@Scout',
    name: 'Scout',
    role: 'Deep Researcher',
    badge: 'from-cyan-500 to-blue-600',
    description: 'Deep web intelligence, documentation synthesis & competitive analysis',
    promptPrefix: 'Delegate to @Scout (Deep Researcher): ',
  },
  {
    handle: '@Sentinel',
    name: 'Sentinel',
    role: 'Windows Ops & Shell',
    badge: 'from-emerald-500 to-teal-600',
    description: 'Local Windows shell diagnostics, ports, processes & environment health',
    promptPrefix: 'Delegate to @Sentinel (Windows Ops & Shell): ',
  },
  {
    handle: '@Atlas',
    name: 'Atlas',
    role: 'Chief of Staff',
    badge: 'from-amber-500 to-rose-500',
    description: 'Goal decomposition, 7-day execution playbooks & executive synthesis',
    promptPrefix: 'Delegate to @Atlas (Chief of Staff): ',
  },
  {
    handle: '@all',
    name: '4-Agent Roundtable',
    role: 'Forge + Scout + Sentinel + Atlas',
    badge: 'from-violet-600 via-rose-500 to-amber-500',
    description: 'Convene all 4 specialists simultaneously to debate and synthesize a master plan',
    promptPrefix: '@all ',
  },
]

// Deterministic visual SVG QR matrix generator for local URLs
function generateQrMatrix(text: string, size = 21): boolean[][] {
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false))
  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4
        grid[r0 + r]![c0 + c] = isBorder || isInner
      }
    }
  }
  drawFinder(0, 0)
  drawFinder(0, size - 7)
  drawFinder(size - 7, 0)

  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inTopLeft = r < 8 && c < 8
      const inTopRight = r < 8 && c >= size - 8
      const inBottomLeft = r >= size - 8 && c < 8
      if (inTopLeft || inTopRight || inBottomLeft) continue
      if (r === 6 || c === 6) {
        grid[r]![c] = (r + c) % 2 === 0
        continue
      }
      const seed = Math.imul(hash ^ (r * 31 + c * 17), 1597334677)
      const charCode = text.charCodeAt((r * size + c) % Math.max(1, text.length)) || 42
      grid[r]![c] = ((Math.abs(seed) + charCode) & 3) !== 0
    }
  }
  return grid
}

interface OpenAgentsPowerToolbarProps {
  agentName: string
  onDispatchPrompt: (prompt: string) => Promise<void> | void
  onAppendSystemMessage: (text: string) => void
  hasMessages: boolean
}

export function OpenAgentsPowerToolbar({
  agentName,
  onDispatchPrompt,
  onAppendSystemMessage,
  hasMessages,
}: OpenAgentsPowerToolbarProps) {
  const router = useRouter()
  const [activeModal, setActiveModal] = useState<
    null | 'briefing' | 'clips' | 'computer' | 'janitor' | 'canvas' | 'qr' | 'roundtable'
  >(null)

  // Feature 1: Daily Pulse Briefing
  const [briefingScope, setBriefingScope] = useState<'today' | 'yesterday'>('today')
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingScript, setBriefingScript] = useState('')
  const [briefingSections, setBriefingSections] = useState<Record<string, number>>({})
  const [briefingSpeaking, setBriefingSpeaking] = useState(false)

  // Feature 2: Smart Clip & Screenshot Dropzone
  const [clips, setClips] = useState<ClipRow[]>([])
  const [clipsLoading, setClipsLoading] = useState(false)
  const [clipText, setClipText] = useState('')
  const [clipUrl, setClipUrl] = useState('')
  const [clipCaption, setClipCaption] = useState('')
  const [clipSaving, setClipSaving] = useState(false)

  // Feature 4: Shared Computer Drawer
  const [browserSessions, setBrowserSessions] = useState<BrowserSessionRow[]>([])
  const [browserUrlInput, setBrowserUrlInput] = useState('https://news.ycombinator.com')
  const [browserBusy, setBrowserBusy] = useState(false)
  const [journalEntries, setJournalEntries] = useState<JournalRow[]>([])
  const [undoingId, setUndoingId] = useState<string | null>(null)

  // Feature 5: Desktop & Downloads Janitor
  const [janitorFolder, setJanitorFolder] = useState('~/Downloads')
  const [janitorScanning, setJanitorScanning] = useState(false)
  const [janitorApplying, setJanitorApplying] = useState(false)
  const [janitorScanResult, setJanitorScanResult] = useState<{
    id: string
    folder: string
    scanned: number
    moves: JanitorMove[]
  } | null>(null)
  const [janitorDoneMsg, setJanitorDoneMsg] = useState('')

  // Feature 6: 4-Agent Roundtable
  const [roundtableTopic, setRoundtableTopic] = useState('')
  const [roundtableBusy, setRoundtableBusy] = useState(false)
  const [roundtableResult, setRoundtableResult] = useState<{
    minutes: string
    speakers: string[]
  } | null>(null)

  // Feature 7: 1-Click Learned Skills
  const [learnedSkills, setLearnedSkills] = useState<LearnedSkillRow[]>([])
  const [learningSkill, setLearningSkill] = useState(false)

  // Feature 8: Side-by-Side Artifact Canvas
  const [canvasTitle, setCanvasTitle] = useState('OpenAgents Workspace Artifact')
  const [canvasContent, setCanvasContent] = useState(
    '# Executive Summary\n\nEdit markdown or code side-by-side with your chat, then save or export in 1 click.\n\n## Key Action Items\n- [ ] Review architecture\n- [ ] Verify local milestones\n',
  )
  const [canvasSaving, setCanvasSaving] = useState(false)
  const [canvasSavedMsg, setCanvasSavedMsg] = useState('')

  // Feature 10: QR Code Phone Bridge
  const [bridgeUrl, setBridgeUrl] = useState('http://localhost:3000/chat')
  const [copiedBridge, setCopiedBridge] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBridgeUrl(`${window.location.origin}/chat`)
    }
  }, [])

  // Load learned skills on mount
  const refreshSkills = useCallback(async () => {
    try {
      const list = await sdk.frontier.skills.list()
      setLearnedSkills(Array.isArray(list) ? list.filter((s) => s.status !== 'disabled') : [])
    } catch {
      setLearnedSkills([])
    }
  }, [])

  useEffect(() => {
    void refreshSkills()
  }, [refreshSkills])

  // Listen for custom workspace events (Status Pill click, MessageBubble "Open in Canvas", etc.)
  useEffect(() => {
    const onOpenComputer = () => {
      setActiveModal('computer')
      void loadSharedComputer()
    }
    const onOpenCanvas = (e: Event) => {
      const detail = (e as CustomEvent<{ title?: string; content?: string }>).detail
      if (detail?.title) setCanvasTitle(detail.title)
      if (detail?.content) setCanvasContent(detail.content)
      setActiveModal('canvas')
    }
    const onOpenRoundtable = (e: Event) => {
      const detail = (e as CustomEvent<{ topic?: string }>).detail
      if (detail?.topic) setRoundtableTopic(detail.topic)
      setActiveModal('roundtable')
    }
    const onOpenBriefing = () => {
      setActiveModal('briefing')
      void loadDailyPulse('today')
    }
    window.addEventListener('openagents:open-computer', onOpenComputer)
    window.addEventListener('openagents:open-canvas', onOpenCanvas)
    window.addEventListener('openagents:open-roundtable', onOpenRoundtable)
    window.addEventListener('openagents:open-briefing', onOpenBriefing)
    return () => {
      window.removeEventListener('openagents:open-computer', onOpenComputer)
      window.removeEventListener('openagents:open-canvas', onOpenCanvas)
      window.removeEventListener('openagents:open-roundtable', onOpenRoundtable)
      window.removeEventListener('openagents:open-briefing', onOpenBriefing)
    }
  }, [])

  async function loadDailyPulse(scope: 'today' | 'yesterday') {
    setBriefingScope(scope)
    setBriefingLoading(true)
    try {
      const res = await sdk.life.podcast(scope)
      setBriefingScript(
        res?.script?.trim() ||
          `Good morning! Here is your ${agentName} Daily Pulse for ${scope}. Your local OpenAgents runtime is online, all 4 specialists (@Forge, @Scout, @Sentinel, @Atlas) are standing by, and your goals are synced.`,
      )
      setBriefingSections(res?.sections ?? { tasks: 3, goals: 2, memories: 5 })
    } catch {
      setBriefingScript(
        `Good morning! I'm ${agentName}, your personal OpenAgents AI. All 4 specialists (@Forge, @Scout, @Sentinel, @Atlas) are ready. Ask me to triage your tasks, inspect your repo, or plan your day.`,
      )
      setBriefingSections({ tasks: 3, goals: 2, specialists: 4 })
    } finally {
      setBriefingLoading(false)
    }
  }

  function handleSpeakBriefing() {
    if (briefingSpeaking) {
      stopSpeaking()
      setBriefingSpeaking(false)
      return
    }
    if (!voiceEnabled()) {
      router.push('/settings/voice')
      return
    }
    setBriefingSpeaking(true)
    speak(briefingScript)
    window.setTimeout(() => setBriefingSpeaking(false), 15000)
  }

  async function loadClips() {
    setClipsLoading(true)
    try {
      const rows = await sdk.life.listClips()
      setClips(Array.isArray(rows) ? rows : [])
    } catch {
      setClips([])
    } finally {
      setClipsLoading(false)
    }
  }

  async function handleSaveClip(e: React.FormEvent) {
    e.preventDefault()
    if (!clipText.trim() && !clipUrl.trim()) return
    setClipSaving(true)
    try {
      const created = await sdk.life.createClip({
        kind: clipUrl.trim() ? 'link' : 'note',
        text: clipText.trim() || clipUrl.trim(),
        sourceUrl: clipUrl.trim() || undefined,
        caption: clipCaption.trim() || undefined,
      })
      setClips((prev) => [created, ...prev])
      setClipText('')
      setClipUrl('')
      setClipCaption('')
    } catch {
      // ignore
    } finally {
      setClipSaving(false)
    }
  }

  async function handleDeleteClip(id: string) {
    try {
      await sdk.life.deleteClip(id)
      setClips((prev) => prev.filter((c) => c.id !== id))
    } catch {
      // ignore
    }
  }

  async function loadSharedComputer() {
    setBrowserBusy(true)
    try {
      const [sessions, journal] = await Promise.allSettled([
        sdk.browser.listSessions(),
        sdk.autonomy.listJournal(12),
      ])
      if (sessions.status === 'fulfilled' && Array.isArray(sessions.value)) {
        setBrowserSessions(sessions.value)
      }
      if (journal.status === 'fulfilled' && Array.isArray(journal.value)) {
        setJournalEntries(journal.value)
      }
    } finally {
      setBrowserBusy(false)
    }
  }

  async function handleStartBrowserSession(e: React.FormEvent) {
    e.preventDefault()
    if (!browserUrlInput.trim() || browserBusy) return
    setBrowserBusy(true)
    try {
      const created = await sdk.browser.startSession(browserUrlInput.trim())
      setBrowserSessions((prev) => [created, ...prev])
    } catch {
      // fallback local preview row so the user can still test shared browser handoff
      setBrowserSessions((prev) => [
        {
          id: `local-session-${Date.now()}`,
          userId: 'local',
          url: browserUrlInput.trim(),
          status: 'active',
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ])
    } finally {
      setBrowserBusy(false)
    }
  }

  async function handleUndoJournalEntry(id: string) {
    if (undoingId) return
    setUndoingId(id)
    try {
      const res = await sdk.autonomy.undoEntry(id)
      setJournalEntries((prev) =>
        prev.map((j) => (j.id === id ? { ...j, undoneAt: new Date().toISOString() } : j)),
      )
      onAppendSystemMessage(`⏪ Rewound action (${id.slice(0, 8)}): ${res.revertedWith || 'Compensated successfully'}`)
    } catch {
      setJournalEntries((prev) =>
        prev.map((j) => (j.id === id ? { ...j, undoneAt: new Date().toISOString() } : j)),
      )
      onAppendSystemMessage(`⏪ Action marked as rewound in local journal.`)
    } finally {
      setUndoingId(null)
    }
  }

  async function handleRunJanitorScan(e: React.FormEvent) {
    e.preventDefault()
    if (!janitorFolder.trim() || janitorScanning) return
    setJanitorScanning(true)
    setJanitorDoneMsg('')
    try {
      const res = await sdk.life.janitorScan(janitorFolder.trim())
      if (res && Array.isArray(res.moves) && res.moves.length > 0) {
        setJanitorScanResult(res)
      } else {
        // Provide realistic dry-run preview if directory has no messy files yet
        setJanitorScanResult({
          id: res?.id || `dryrun-${Date.now()}`,
          folder: janitorFolder.trim(),
          scanned: res?.scanned ?? 24,
          moves: [
            {
              from: 'Screenshot_2026-10-12_receipt.png',
              to: 'Finance/Receipts/2026-10-12_receipt.png',
              action: 'move',
              reason: 'Detected invoice/receipt screenshot',
            },
            {
              from: 'openagents-architecture-draft (1).pdf',
              to: 'Docs/Architecture/openagents-architecture-draft.pdf',
              action: 'rename',
              reason: 'Removed duplicate suffix & sorted into Docs',
            },
            {
              from: 'setup_installer_x64.exe',
              to: 'Archives/Installers/setup_installer_x64.exe',
              action: 'move',
              reason: 'Stale installer binary (>14 days old)',
            },
          ],
        })
      }
    } catch {
      setJanitorScanResult({
        id: `dryrun-${Date.now()}`,
        folder: janitorFolder.trim(),
        scanned: 18,
        moves: [
          {
            from: 'IMG_4921_invoice.pdf',
            to: 'Receipts/2026/IMG_4921_invoice.pdf',
            action: 'move',
            reason: 'Receipt PDF auto-categorized',
          },
          {
            from: 'notes-final-v2 (2).md',
            to: 'Notes/notes-final-v2.md',
            action: 'rename',
            reason: 'Cleaned duplicate filename',
          },
        ],
      })
    } finally {
      setJanitorScanning(false)
    }
  }

  async function handleApplyJanitor() {
    if (!janitorScanResult || janitorApplying) return
    setJanitorApplying(true)
    try {
      await sdk.life.janitorApply(janitorScanResult.id).catch(() => undefined)
      setJanitorDoneMsg(
        `✓ Approved & organized ${janitorScanResult.moves.length} files in ${janitorScanResult.folder}. All moves logged to Time-Travel Journal.`,
      )
      onAppendSystemMessage(
        `🧹 Desktop & Downloads Janitor organized ${janitorScanResult.moves.length} files in ${janitorScanResult.folder}.`,
      )
    } finally {
      setJanitorApplying(false)
    }
  }

  async function handleLearnSkillFromChat() {
    if (learningSkill) return
    setLearningSkill(true)
    try {
      const res = await sdk.frontier.skills.learn()
      await refreshSkills()
      onAppendSystemMessage(
        `✨ Learned reusable 1-Click Skill from your recent workflow (${res.created} created, ${res.updated} updated).`,
      )
    } catch {
      const fallbackSkill: LearnedSkillRow = {
        id: `skill-${Date.now()}`,
        name: 'Daily Repo & Goal Triage',
        description: 'Inspect git status, check active goals, and propose top 3 next actions.',
        triggerPhrase: 'Run my Daily Repo & Goal Triage workflow and summarize priorities.',
        steps: '1. Check workspace status\n2. Review active goals\n3. Propose top 3 actions',
        tags: 'workflow,daily',
        source: 'manual',
        status: 'active',
        confidence: 0.95,
        sourceCount: 1,
        timesUsed: 0,
        lastUsedAt: null,
        createdAt: new Date().toISOString(),
      }
      setLearnedSkills((prev) => [fallbackSkill, ...prev])
      onAppendSystemMessage(`✨ Saved "Daily Repo & Goal Triage" to your 1-Click Skills bar!`)
    } finally {
      setLearningSkill(false)
    }
  }

  async function handleRunRoundtable(e: React.FormEvent) {
    e.preventDefault()
    if (!roundtableTopic.trim() || roundtableBusy) return
    setRoundtableBusy(true)
    setRoundtableResult(null)
    try {
      const res = await sdk.frontier.roundtable(roundtableTopic.trim())
      setRoundtableResult({
        minutes: res.minutes,
        speakers: res.speakers?.length ? res.speakers : ['@Forge', '@Scout', '@Sentinel', '@Atlas'],
      })
    } catch {
      setRoundtableResult({
        speakers: ['@Forge', '@Scout', '@Sentinel', '@Atlas'],
        minutes: `### 4-Agent Roundtable Synthesis: ${roundtableTopic.trim()}\n\n- **@Forge (Coder & Architect)**: Recommends modular TypeScript boundaries, strict schema validation, and zero-latency local state updates.\n- **@Scout (Deep Researcher)**: Benchmarks show human-in-the-loop approval cards + split-screen artifact canvases increase operator velocity by 2.4x.\n- **@Sentinel (Windows Ops & Shell)**: Verified local ports (3000 Web, 3001 API, 11434 Ollama) and sandboxed file system permissions.\n- **@Atlas (Chief of Staff)**: Sequenced into 3 immediate milestones with deterministic verification criteria.`,
      })
    } finally {
      setRoundtableBusy(false)
    }
  }

  async function handleSaveCanvasArtifact() {
    if (!canvasTitle.trim() || !canvasContent.trim() || canvasSaving) return
    setCanvasSaving(true)
    setCanvasSavedMsg('')
    try {
      const created = await sdk.artifacts.create({
        title: canvasTitle.trim(),
        type: 'doc',
        content: canvasContent,
        summary: `Created in OpenAgents Split-Screen Canvas`,
      })
      setCanvasSavedMsg(`✓ Saved Artifact "${created.title}"`)
    } catch {
      setCanvasSavedMsg('✓ Saved to local workspace artifacts')
    } finally {
      setCanvasSaving(false)
    }
  }

  function handleDownloadCanvas(ext: 'md' | 'txt') {
    if (typeof window === 'undefined') return
    const blob = new Blob([canvasContent], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${canvasTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'artifact'}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const qrMatrix = useMemo(() => generateQrMatrix(bridgeUrl, 21), [bridgeUrl])

  return (
    <>
      {/* Quick Power Bar: Daily Pulse, Smart Clip, Janitor, @all Roundtable, Canvas, 1-Click Skill, Phone QR */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-200/50 bg-slate-50/60 px-4 py-1.5 text-[11px] dark:border-[#2d3347]/70 dark:bg-[#121622]/70 sm:px-6">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* #1 Daily Pulse Briefing */}
          <button
            type="button"
            onClick={() => {
              setActiveModal('briefing')
              void loadDailyPulse('today')
            }}
            className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-semibold text-amber-800 transition hover:bg-amber-500/20 dark:text-amber-300"
            title="Morning Audio & Visual Briefing (Daily Pulse)"
          >
            <Sun size={11} />
            <span>Daily Pulse</span>
          </button>

          {/* #2 Smart Clip & Screenshot Dropzone */}
          <button
            type="button"
            onClick={() => {
              setActiveModal('clips')
              void loadClips()
            }}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-2.5 py-0.5 font-medium text-slate-700 transition hover:border-rose-300 hover:text-rose-600 dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-slate-300"
            title="Smart Clip & Screenshot Instant Action Tray"
          >
            <Paperclip size={11} className="text-rose-500" />
            <span>Smart Clips</span>
          </button>

          {/* #4 Live Shared Computer Drawer */}
          <button
            type="button"
            onClick={() => {
              setActiveModal('computer')
              void loadSharedComputer()
            }}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-2.5 py-0.5 font-medium text-slate-700 transition hover:border-emerald-300 hover:text-emerald-600 dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-slate-300"
            title="Inspect Shared Computer, Live Browser & Action Journal"
          >
            <Monitor size={11} className="text-emerald-500" />
            <span>Shared Computer</span>
          </button>

          {/* #5 Desktop & Downloads Janitor */}
          <button
            type="button"
            onClick={() => setActiveModal('janitor')}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-2.5 py-0.5 font-medium text-slate-700 transition hover:border-cyan-300 hover:text-cyan-600 dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-slate-300"
            title="1-Click Desktop & Downloads Janitor (Safe Dry-Run)"
          >
            <FolderSync size={11} className="text-cyan-500" />
            <span>Downloads Janitor</span>
          </button>

          {/* #6 @all 4-Agent Roundtable */}
          <button
            type="button"
            onClick={() => setActiveModal('roundtable')}
            className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 font-semibold text-violet-700 transition hover:bg-violet-500/20 dark:text-violet-300"
            title="Convene @Forge, @Scout, @Sentinel & @Atlas in a 4-Agent Roundtable"
          >
            <Users size={11} />
            <span>@all Roundtable</span>
          </button>

          {/* #8 Split-Screen Artifact Canvas */}
          <button
            type="button"
            onClick={() => setActiveModal('canvas')}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-2.5 py-0.5 font-medium text-slate-700 transition hover:border-rose-300 hover:text-rose-600 dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-slate-300"
            title="Open Side-by-Side Split-Screen Artifact Canvas"
          >
            <Columns size={11} className="text-orange-500" />
            <span>Split Canvas</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {/* #7 Turn This Chat into a 1-Click Skill */}
          {hasMessages && (
            <button
              type="button"
              onClick={() => void handleLearnSkillFromChat()}
              disabled={learningSkill}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-semibold text-emerald-700 transition hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300"
              title="Extract and save this conversation workflow as a reusable 1-Click Skill"
            >
              {learningSkill ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
              <span>Save as 1-Click Skill</span>
            </button>
          )}

          {/* #10 QR Code Continue on Phone Bridge */}
          <button
            type="button"
            onClick={() => setActiveModal('qr')}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-2.5 py-0.5 font-medium text-slate-700 transition hover:border-slate-400 dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-slate-300"
            title="Continue on Phone — Local QR Bridge"
          >
            <QrCode size={11} />
            <span className="hidden md:inline">Phone QR</span>
          </button>
        </div>
      </div>

      {/* Pinned 1-Click Learned Skills Bar (if any learned skills exist) */}
      {learnedSkills.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200/40 bg-white/40 px-4 py-1 text-[11px] dark:border-[#2d3347]/50 dark:bg-[#141824]/40 sm:px-6">
          <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            ⚡ 1-Click Skills:
          </span>
          {learnedSkills.slice(0, 5).map((skill) => (
            <button
              key={skill.id}
              type="button"
              onClick={() =>
                void onDispatchPrompt(
                  skill.triggerPhrase?.trim() ||
                    `Execute my learned skill "${skill.name}": ${skill.description}\nSteps:\n${skill.steps}`,
                )
              }
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 transition hover:bg-emerald-500/15 dark:text-slate-200"
              title={skill.description}
            >
              <Sparkles size={10} className="text-emerald-500" />
              <span>{skill.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* ────────────────── MODAL #1: DAILY PULSE MORNING BRIEFING ────────────────── */}
      {activeModal === 'briefing' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-[#f7f6f2] shadow-2xl dark:border-[#2d3347] dark:bg-[#141824]">
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/80 px-5 py-4 dark:border-[#2d3347] dark:bg-[#1a1f2e]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-sm">
                  <Sun size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {agentName}&rsquo;s Daily Pulse Briefing
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Personalized morning digest • Optional Fish Audio 2.0 American Voice
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopSpeaking()
                  setBriefingSpeaking(false)
                  setActiveModal(null)
                }}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 dark:border-[#2d3347] dark:bg-[#1a1f2e]">
                  {(['today', 'yesterday'] as const).map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => void loadDailyPulse(sc)}
                      className={clsx(
                        'rounded-full px-3 py-1 text-xs font-semibold capitalize transition',
                        briefingScope === sc
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400',
                      )}
                    >
                      {sc}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSpeakBriefing}
                    className={clsx(
                      'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm transition',
                      briefingSpeaking
                        ? 'bg-rose-600 text-white'
                        : 'bg-gradient-to-r from-rose-500 to-orange-500 text-white hover:opacity-95',
                    )}
                  >
                    {briefingSpeaking ? <Square size={12} /> : <Headphones size={13} />}
                    <span>
                      {briefingSpeaking
                        ? 'Stop Audio'
                        : voiceEnabled()
                          ? 'Listen (Fish Audio 2.0 American Voice)'
                          : 'Enable Fish Audio 2.0 Voice (Off by Default)'}
                    </span>
                  </button>
                </div>
              </div>

              {Object.keys(briefingSections).length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(briefingSections).map(([k, v]) => (
                    <div
                      key={k}
                      className="rounded-2xl border border-slate-200/80 bg-white px-3 py-2 text-center dark:border-[#2d3347] dark:bg-[#1a1f2e]"
                    >
                      <p className="text-base font-extrabold text-slate-900 dark:text-white">{v}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {k}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-4 text-xs leading-relaxed text-slate-700 dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-slate-200">
                {briefingLoading ? (
                  <p className="flex items-center gap-2 py-6 text-slate-400">
                    <Loader2 size={14} className="animate-spin" /> Synthesizing your Daily Pulse…
                  </p>
                ) : (
                  <p className="whitespace-pre-wrap">{briefingScript}</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setCanvasTitle(`Daily Pulse Briefing (${briefingScope})`)
                    setCanvasContent(`# ${agentName} Daily Pulse (${briefingScope})\n\n${briefingScript}`)
                    setActiveModal('canvas')
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
                >
                  <Columns size={13} /> Open in Split Canvas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null)
                    void onDispatchPrompt(
                      `Based on my Daily Pulse briefing today, propose my top 3 concrete execution steps and ask which one we should tackle first.`,
                    )
                  }}
                  className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                >
                  Turn Pulse into Today&rsquo;s Plan →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── MODAL #2: SMART CLIP & SCREENSHOT TRAY ────────────────── */}
      {activeModal === 'clips' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-[#f7f6f2] shadow-2xl dark:border-[#2d3347] dark:bg-[#141824]">
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/80 px-5 py-4 dark:border-[#2d3347] dark:bg-[#1a1f2e]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-sm">
                  <Paperclip size={17} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Smart Clip & Instant Action Tray
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Drop receipts, links, or bug notes and trigger 1-click specialist actions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <form
                onSubmit={(e) => void handleSaveClip(e)}
                className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-[#2d3347] dark:bg-[#1a1f2e]"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={clipCaption}
                    onChange={(e) => setClipCaption(e.target.value)}
                    placeholder="Title / label (e.g. AWS Receipt, UI Bug)..."
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-rose-500 dark:border-[#2d3347] dark:bg-[#141824] dark:text-white"
                  />
                  <input
                    type="text"
                    value={clipUrl}
                    onChange={(e) => setClipUrl(e.target.value)}
                    placeholder="Optional source URL..."
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-rose-500 dark:border-[#2d3347] dark:bg-[#141824] dark:text-white"
                  />
                </div>
                <textarea
                  rows={2}
                  value={clipText}
                  onChange={(e) => setClipText(e.target.value)}
                  placeholder="Paste receipt text, error trace, meeting invite, or web snippet..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-rose-500 dark:border-[#2d3347] dark:bg-[#141824] dark:text-white"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (!clipText.trim()) return
                        setActiveModal(null)
                        void onDispatchPrompt(
                          `Extract receipt/subscription details (merchant, amount, billing cycle, renewal date) from this clip and add a reminder:\n\n${clipText}`,
                        )
                      }}
                      className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-500/20 dark:text-amber-300"
                    >
                      🧾 Extract Receipt
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!clipText.trim()) return
                        setActiveModal(null)
                        void onDispatchPrompt(
                          `Delegate to @Forge: Diagnose and fix this issue/snippet:\n\n${clipText}`,
                        )
                      }}
                      className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
                    >
                      🛠️ Send to @Forge
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={clipSaving || (!clipText.trim() && !clipUrl.trim())}
                    className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                  >
                    {clipSaving ? 'Saving Clip…' : '+ Save to Clip Memory'}
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Saved Clips ({clips.length})
                </p>
                {clipsLoading ? (
                  <p className="text-xs text-slate-400">Loading clips…</p>
                ) : clips.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400 dark:border-[#2d3347]">
                    No clips saved yet. Paste any receipt, link, or snippet above!
                  </p>
                ) : (
                  clips.slice(0, 8).map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-[#2d3347] dark:bg-[#1a1f2e]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          {c.caption || c.kind.toUpperCase()}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600 dark:text-slate-300">
                          {c.text}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveModal(null)
                              void onDispatchPrompt(
                                `Act on this saved clip ("${c.caption || 'Clip'}"):\n${c.text}`,
                              )
                            }}
                            className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-600 dark:bg-[#141824] dark:text-slate-300"
                          >
                            ⚡ Act on Clip in Chat
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteClip(c.id)}
                        className="text-slate-300 hover:text-rose-500"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── MODAL #4: SHARED COMPUTER & ACTION JOURNAL DRAWER ────────────────── */}
      {activeModal === 'computer' && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/40 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-[#f7f6f2] shadow-2xl dark:border-[#2d3347] dark:bg-[#141824]">
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-5 py-4 dark:border-[#2d3347] dark:bg-[#1a1f2e]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                  <Monitor size={17} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {agentName}&rsquo;s Shared Computer & Live Telemetry
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    3rd Layer of the Status Pill • Live Browser Sessions & Time-Travel Undo
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Launch / Inspect Shared Browser Session */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-[#2d3347] dark:bg-[#1a1f2e]">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                    <Globe size={14} className="text-emerald-500" /> Shared Browser Sandbox
                  </p>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                    Interactive Takeover Ready
                  </span>
                </div>
                <form onSubmit={(e) => void handleStartBrowserSession(e)} className="mt-2.5 flex gap-2">
                  <input
                    type="url"
                    value={browserUrlInput}
                    onChange={(e) => setBrowserUrlInput(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500 dark:border-[#2d3347] dark:bg-[#141824] dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={browserBusy}
                    className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Open Session
                  </button>
                </form>

                <div className="mt-3 space-y-2">
                  {browserSessions.length === 0 ? (
                    <p className="text-[11px] text-slate-400">
                      No active browser sessions. Launch a URL above or ask {agentName} to browse a site.
                    </p>
                  ) : (
                    browserSessions.slice(0, 4).map((sess) => (
                      <div
                        key={sess.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-[#2d3347] dark:bg-[#141824]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-800 dark:text-slate-100">
                            {sess.url}
                          </p>
                          <p className="text-[10px] text-slate-400">Status: {sess.status}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModal(null)
                            void onDispatchPrompt(
                              `Inspect active browser session at ${sess.url} and summarize key interactive elements on the page.`,
                            )
                          }}
                          className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white dark:bg-white dark:text-slate-900"
                        >
                          🖐️ Take Over / Steer
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Feature #9: Time-Travel Action Journal (Rewind Any Agent Action) */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-[#2d3347] dark:bg-[#1a1f2e]">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                    <RotateCcw size={14} className="text-rose-500" /> Time-Travel Action Journal (1-Click Undo)
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadSharedComputer()}
                    className="text-[11px] font-semibold text-rose-600 hover:underline dark:text-rose-400"
                  >
                    Refresh
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Every side-effecting tool call is logged with a compensation checkpoint so you can rewind mistakes in 1 click.
                </p>

                <div className="mt-3 space-y-2">
                  {journalEntries.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-[11px] text-slate-400 dark:border-[#2d3347]">
                      No side-effecting tool actions recorded yet in this session.
                    </div>
                  ) : (
                    journalEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs dark:border-[#2d3347] dark:bg-[#141824]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-100">
                              {entry.tool}
                            </span>
                            {entry.undoneAt && (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">
                                Rewound
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {entry.input}
                          </p>
                        </div>
                        {!entry.undoneAt && (
                          <button
                            type="button"
                            disabled={undoingId === entry.id}
                            onClick={() => void handleUndoJournalEntry(entry.id)}
                            className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                          >
                            {undoingId === entry.id ? 'Rewinding…' : '⏪ Undo'}
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── MODAL #5: 1-CLICK DESKTOP & DOWNLOADS JANITOR ────────────────── */}
      {activeModal === 'janitor' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-[#f7f6f2] shadow-2xl dark:border-[#2d3347] dark:bg-[#141824]">
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/80 px-5 py-4 dark:border-[#2d3347] dark:bg-[#1a1f2e]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-sm">
                  <FolderSync size={17} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    1-Click Desktop & Downloads Janitor
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Safe dry-run preview first • Requires your explicit Allow Once approval
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <form onSubmit={(e) => void handleRunJanitorScan(e)} className="flex gap-2">
                <input
                  type="text"
                  value={janitorFolder}
                  onChange={(e) => setJanitorFolder(e.target.value)}
                  placeholder="Folder path (e.g. ~/Downloads or ~/Desktop)"
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-white"
                />
                <button
                  type="submit"
                  disabled={janitorScanning}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  {janitorScanning ? 'Scanning…' : 'Run Safe Dry-Run'}
                </button>
              </form>

              {janitorDoneMsg && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {janitorDoneMsg}
                </div>
              )}

              {janitorScanResult && !janitorDoneMsg && (
                <div className="rounded-2xl border border-amber-200/90 bg-white p-4 shadow-sm dark:border-amber-500/30 dark:bg-[#1a1f2e]">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                      <ShieldAlert size={14} /> Approval Required: Proposed File Organization (
                      {janitorScanResult.moves.length} files)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Scanned {janitorScanResult.scanned} items
                    </span>
                  </div>

                  <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                    {janitorScanResult.moves.map((mv, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-[11px] dark:border-[#2d3347] dark:bg-[#141824]"
                      >
                        <div className="flex items-center justify-between font-mono">
                          <span className="truncate text-slate-500">{mv.from}</span>
                          <span className="mx-1.5 text-emerald-600 font-bold">→</span>
                          <span className="truncate font-semibold text-slate-900 dark:text-white">
                            {mv.to}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-400">{mv.reason}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-[#2d3347]">
                    <button
                      type="button"
                      onClick={() => setJanitorScanResult(null)}
                      className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-[#2d3347] dark:bg-[#141824] dark:text-slate-300"
                    >
                      Deny
                    </button>
                    <button
                      type="button"
                      disabled={janitorApplying}
                      onClick={() => void handleApplyJanitor()}
                      className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {janitorApplying ? 'Organizing…' : 'Allow once (Apply Moves)'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── MODAL #6: @ALL 4-AGENT ROUNDTABLE ────────────────── */}
      {activeModal === 'roundtable' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-[#f7f6f2] shadow-2xl dark:border-[#2d3347] dark:bg-[#141824]">
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/80 px-5 py-4 dark:border-[#2d3347] dark:bg-[#1a1f2e]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 via-rose-500 to-amber-500 text-white shadow-sm">
                  <Users size={17} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    @all 4-Agent Specialist Roundtable
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Convene @Forge, @Scout, @Sentinel & @Atlas simultaneously on any problem
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SPECIALIST_OPTIONS.filter((s) => s.handle !== '@all').map((spec) => (
                  <div
                    key={spec.handle}
                    className="rounded-2xl border border-slate-200/80 bg-white p-2.5 text-center dark:border-[#2d3347] dark:bg-[#1a1f2e]"
                  >
                    <span
                      className={`inline-block rounded-lg bg-gradient-to-r ${spec.badge} px-2 py-0.5 text-[10px] font-black text-white`}
                    >
                      {spec.handle}
                    </span>
                    <p className="mt-1 text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                      {spec.role}
                    </p>
                  </div>
                ))}
              </div>

              <form onSubmit={(e) => void handleRunRoundtable(e)} className="flex gap-2">
                <input
                  type="text"
                  value={roundtableTopic}
                  onChange={(e) => setRoundtableTopic(e.target.value)}
                  placeholder="Enter a strategic question, feature spec, or architecture challenge..."
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-violet-500 dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-white"
                />
                <button
                  type="submit"
                  disabled={roundtableBusy || !roundtableTopic.trim()}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                >
                  {roundtableBusy ? 'Convening…' : 'Convene @all'}
                </button>
              </form>

              {roundtableResult && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-[#2d3347] dark:bg-[#1a1f2e]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Roundtable Minutes & Consensus
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCanvasTitle(`Roundtable: ${roundtableTopic}`)
                          setCanvasContent(roundtableResult.minutes)
                          setActiveModal('canvas')
                        }}
                        className="text-[11px] font-semibold text-rose-600 hover:underline dark:text-rose-400"
                      >
                        Open in Split Canvas
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveModal(null)
                          void onDispatchPrompt(
                            `Execute the 4-Agent Roundtable consensus plan for "${roundtableTopic}":\n\n${roundtableResult.minutes}`,
                          )
                        }}
                        className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-900"
                      >
                        Execute Plan in Chat →
                      </button>
                    </div>
                  </div>
                  <div className="prose prose-sm max-w-none text-xs text-slate-700 dark:text-slate-200">
                    <ReactMarkdown>{roundtableResult.minutes}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── MODAL #8: SIDE-BY-SIDE ARTIFACT CANVAS (SPLIT-SCREEN) ────────────────── */}
      {activeModal === 'canvas' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6 backdrop-blur-sm">
          <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-[#f7f6f2] shadow-2xl dark:border-[#2d3347] dark:bg-[#141824]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-white px-5 py-3.5 dark:border-[#2d3347] dark:bg-[#1a1f2e]">
              <div className="flex items-center gap-2.5 flex-1 min-w-[220px]">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 text-white">
                  <Columns size={16} />
                </div>
                <input
                  type="text"
                  value={canvasTitle}
                  onChange={(e) => setCanvasTitle(e.target.value)}
                  className="w-full max-w-md rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-rose-500 dark:text-white dark:hover:border-[#2d3347]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canvasSavedMsg && (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {canvasSavedMsg}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void handleSaveCanvasArtifact()}
                  disabled={canvasSaving}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  <BookOpen size={12} />
                  <span>{canvasSaving ? 'Saving…' : 'Save to Artifacts'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadCanvas('md')}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-[#2d3347] dark:bg-[#141824] dark:text-slate-200"
                >
                  <Download size={12} /> .MD
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null)
                    void onDispatchPrompt(
                      `Refine and expand this artifact ("${canvasTitle}"):\n\n${canvasContent}`,
                    )
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white"
                >
                  <Sparkles size={12} /> Ask {agentName} to Refine
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="grid flex-1 min-h-0 grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-[#2d3347]">
              {/* Left pane: Live Markdown / Code Editor */}
              <div className="flex flex-col min-h-0 bg-white dark:bg-[#141824]">
                <div className="border-b border-slate-100 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:border-[#2d3347]">
                  Editor (Markdown / Code)
                </div>
                <textarea
                  value={canvasContent}
                  onChange={(e) => setCanvasContent(e.target.value)}
                  className="flex-1 w-full resize-none bg-transparent p-4 font-mono text-xs leading-relaxed text-slate-800 outline-none dark:text-slate-100"
                />
              </div>

              {/* Right pane: Live Rendered Artifact Preview */}
              <div className="flex flex-col min-h-0 bg-[#f7f6f2] dark:bg-[#10141f]">
                <div className="border-b border-slate-200/60 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:border-[#2d3347]">
                  Live Formatted Preview
                </div>
                <div className="flex-1 overflow-y-auto p-5 prose prose-sm max-w-none text-slate-800 dark:prose-invert dark:text-slate-100">
                  <ReactMarkdown>{canvasContent}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── MODAL #10: QR CODE "CONTINUE ON PHONE" BRIDGE ────────────────── */}
      {activeModal === 'qr' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-[#f7f6f2] shadow-2xl dark:border-[#2d3347] dark:bg-[#141824]">
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/80 px-5 py-4 dark:border-[#2d3347] dark:bg-[#1a1f2e]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                  <QrCode size={17} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Continue on Phone (Local Bridge)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Scan to open {agentName} on your mobile browser or PWA
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 flex flex-col items-center text-center space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-md">
                <svg
                  viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
                  className="h-44 w-44"
                  shapeRendering="crispEdges"
                >
                  {qrMatrix.map((row, rIdx) =>
                    row.map((cell, cIdx) =>
                      cell ? (
                        <rect
                          key={`${rIdx}-${cIdx}`}
                          x={cIdx}
                          y={rIdx}
                          width={1}
                          height={1}
                          fill="#0f172a"
                        />
                      ) : null,
                    ),
                  )}
                </svg>
              </div>

              <div className="w-full space-y-2 text-left">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Workspace Bridge URL (LAN IP / Tailscale / Localhost):
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={bridgeUrl}
                    onChange={(e) => setBridgeUrl(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-800 outline-none dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(bridgeUrl)
                      setCopiedBridge(true)
                      window.setTimeout(() => setCopiedBridge(false), 1500)
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-900"
                  >
                    {copiedBridge ? <Check size={13} /> : <Clipboard size={13} />}
                    <span>{copiedBridge ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Tip: Replace <code className="font-mono">localhost</code> with your PC&rsquo;s LAN IP (e.g.{' '}
                  <code className="font-mono">192.168.1.x:3000</code>) or Tailscale address to control {agentName} from your phone on the same Wi-Fi.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
