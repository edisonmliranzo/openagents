import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import * as fsSync from 'fs'
import { promises as fs } from 'fs'
import * as path from 'path'
import { ToolsService } from '../tools/tools.service'
import { LLMService } from '../agent/llm.service'
import { LibraryService } from '../library/library.service'
import { ArtifactsService } from '../artifacts/artifacts.service'

export interface ResearchSource {
  /** 1-based citation number used in [n] markers */
  n: number
  url: string
  title: string
  snippet: string
  kind: 'web' | 'library'
  documentId?: string
}

export interface ResearchStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  detail?: string
  startedAt?: string
  finishedAt?: string
}

export interface ResearchJob {
  id: string
  userId: string
  goal: string
  status: 'running' | 'completed' | 'failed' | 'interrupted'
  steps: ResearchStep[]
  queries: string[]
  sources: ResearchSource[]
  report: string
  error?: string
  artifactId?: string
  createdAt: string
  updatedAt: string
}

const MAX_JOBS_PER_USER = 50
const SAVE_DEBOUNCE_MS = 500

function safeUserId(userId: string) {
  return String(userId).replace(/[^A-Za-z0-9_-]/g, '_') || '_'
}
const MAX_SOURCES = 20

@Injectable()
export class DeepResearchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeepResearchService.name)
  private jobs = new Map<string, ResearchJob>()
  private readonly dir = path.resolve(process.env.RESEARCH_DATA_DIR ?? path.join(process.cwd(), 'data', 'research'))
  private readonly saveTimers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly tools: ToolsService,
    private readonly llm: LLMService,
    private readonly library: LibraryService,
    private readonly artifacts: ArtifactsService,
  ) {}

  // ── Persistence ──────────────────────────────────────────────────────────

  /** Load persisted jobs; anything still 'running' from a previous process becomes 'interrupted'. */
  onModuleInit() {
    let files: string[] = []
    try {
      files = fsSync.readdirSync(this.dir).filter((f) => f.endsWith('.json'))
    } catch {
      return // no data dir yet
    }
    const now = new Date().toISOString()
    for (const file of files) {
      try {
        const parsed = JSON.parse(fsSync.readFileSync(path.join(this.dir, file), 'utf8'))
        if (!Array.isArray(parsed)) continue
        const touchedUsers = new Set<string>()
        for (const job of parsed as ResearchJob[]) {
          if (!job || typeof job.id !== 'string' || typeof job.userId !== 'string') continue
          if (`${safeUserId(job.userId)}.json` !== file) continue
          if (job.status === 'running') {
            job.status = 'interrupted'
            job.error = job.error ?? 'Research was interrupted by a server restart.'
            for (const s of job.steps ?? []) if (s.status === 'running' || s.status === 'pending') s.status = 'failed'
            job.updatedAt = now
            touchedUsers.add(job.userId)
          }
          job.steps = job.steps ?? []
          job.queries = job.queries ?? []
          job.sources = job.sources ?? []
          job.report = job.report ?? ''
          this.jobs.set(job.id, job)
        }
        for (const userId of touchedUsers) this.scheduleSave(userId)
      } catch (error: any) {
        this.logger.warn(`Failed to load research jobs from ${file}: ${error?.message ?? error}`)
      }
    }
  }

  async onModuleDestroy() {
    const pending = [...this.saveTimers.keys()]
    for (const t of this.saveTimers.values()) clearTimeout(t)
    this.saveTimers.clear()
    await Promise.all(pending.map((u) => this.persist(u)))
  }

  private scheduleSave(userId: string) {
    if (this.saveTimers.has(userId)) return
    const timer = setTimeout(() => {
      this.saveTimers.delete(userId)
      void this.persist(userId)
    }, SAVE_DEBOUNCE_MS)
    timer.unref?.()
    this.saveTimers.set(userId, timer)
  }

  private async persist(userId: string) {
    const jobs = [...this.jobs.values()]
      .filter((j) => j.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_JOBS_PER_USER)
    try {
      await fs.mkdir(this.dir, { recursive: true })
      const file = path.join(this.dir, `${safeUserId(userId)}.json`)
      const tmp = `${file}.${process.pid}.tmp`
      await fs.writeFile(tmp, JSON.stringify(jobs, null, 2), 'utf8')
      await fs.rename(tmp, file)
    } catch (error: any) {
      this.logger.warn(`Failed to persist research jobs for ${userId}: ${error?.message ?? error}`)
    }
  }

  start(userId: string, input: { goal: string; maxQueries?: number; includeLibrary?: boolean }) {
    const goal = String(input?.goal ?? '').trim()
    if (!goal) throw new BadRequestException('goal is required')
    const now = new Date().toISOString()
    const job: ResearchJob = {
      id: `rs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      goal: goal.slice(0, 2000),
      status: 'running',
      steps: [
        { id: 'plan', label: 'Planning research questions', status: 'pending' },
        { id: 'search', label: 'Searching the web', status: 'pending' },
        { id: 'library', label: 'Searching your knowledge library', status: 'pending' },
        { id: 'synthesize', label: 'Writing cited report', status: 'pending' },
      ],
      queries: [],
      sources: [],
      report: '',
      createdAt: now,
      updatedAt: now,
    }
    this.jobs.set(job.id, job)
    this.prune(userId)
    this.scheduleSave(userId)
    const maxQueries = Math.max(1, Math.min(6, Number(input?.maxQueries ?? 4)))
    void this.run(job, maxQueries, input?.includeLibrary !== false).catch((err: any) => {
      job.status = 'failed'
      job.error = err?.message ?? 'Research failed'
      this.touch(job)
    })
    return this.view(job)
  }

  list(userId: string) {
    return [...this.jobs.values()]
      .filter((j) => j.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((j) => ({ id: j.id, goal: j.goal, status: j.status, sourceCount: j.sources.length, createdAt: j.createdAt }))
  }

  get(userId: string, id: string) {
    return this.view(this.require(userId, id))
  }

  report(userId: string, id: string) {
    const job = this.require(userId, id)
    return { id: job.id, goal: job.goal, status: job.status, markdown: this.renderMarkdown(job), sources: job.sources }
  }

  async exportToArtifact(userId: string, id: string, input?: { title?: string; workspaceId?: string }) {
    const job = this.require(userId, id)
    if (job.status !== 'completed') throw new BadRequestException('Research is not completed yet.')
    const artifact = await this.artifacts.create(userId, {
      title: (input?.title?.trim() || `Research: ${job.goal}`).slice(0, 120),
      type: 'report',
      format: 'markdown',
      status: 'generated',
      content: this.renderMarkdown(job),
      summary: job.goal.slice(0, 500),
      labels: ['research'],
      ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
      metadata: { researchId: job.id, sources: job.sources },
    } as any)
    job.artifactId = artifact.id
    this.touch(job)
    return { artifactId: artifact.id, artifact }
  }

  // â”€â”€ Pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async run(job: ResearchJob, maxQueries: number, includeLibrary: boolean) {
    // 1. Plan
    this.stepStart(job, 'plan')
    job.queries = await this.planQueries(job.goal, maxQueries)
    this.stepDone(job, 'plan', `${job.queries.length} queries: ${job.queries.join(' Â· ')}`)

    // 2. Web search
    this.stepStart(job, 'search')
    let webCount = 0
    for (const q of job.queries) {
      if (job.sources.length >= MAX_SOURCES) break
      this.stepDetail(job, 'search', `Searching: ${q}`)
      try {
        const res = await this.tools.execute('web_search', { query: q, count: 5 }, job.userId)
        if (res.success) {
          for (const hit of this.extractWebHits(res.output)) {
            if (this.addSource(job, { ...hit, kind: 'web' })) webCount++
          }
        }
      } catch (err: any) {
        this.logger.warn(`web_search failed for "${q}": ${err?.message}`)
      }
    }
    this.stepDone(job, 'search', `${webCount} web sources`)

    // 3. Library
    this.stepStart(job, 'library')
    let libCount = 0
    if (includeLibrary) {
      try {
        const hits = await this.library.searchCitations(job.userId, job.goal, 5)
        for (const h of hits) {
          if (this.addSource(job, { url: h.url, title: h.title, snippet: h.snippet, kind: 'library', documentId: h.documentId })) libCount++
        }
      } catch (err: any) {
        this.logger.warn(`library search failed: ${err?.message}`)
      }
    }
    this.stepDone(job, 'library', includeLibrary ? `${libCount} library sources` : 'skipped')

    // 4. Synthesize
    this.stepStart(job, 'synthesize')
    job.report = await this.synthesize(job)
    this.stepDone(job, 'synthesize', `${job.report.length} chars`)
    job.status = 'completed'
    this.touch(job)
  }

  private async planQueries(goal: string, max: number): Promise<string[]> {
    try {
      const res = await this.llm.complete(
        [{ role: 'user', content: `Research goal: ${goal}\n\nReturn ONLY a JSON array of up to ${max} concise web search queries that together cover this goal.` }],
        [],
        'You are a research planner. Output strictly a JSON array of strings, no prose.',
      )
      const match = res.content.match(/\[[\s\S]*\]/)
      if (match) {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed)) {
          const qs = parsed.map((q) => String(q).trim()).filter(Boolean).slice(0, max)
          if (qs.length) return qs
        }
      }
    } catch (err: any) {
      this.logger.warn(`planQueries fallback: ${err?.message}`)
    }
    return [goal.slice(0, 200)]
  }

  private async synthesize(job: ResearchJob): Promise<string> {
    if (!job.sources.length) {
      return `No sources could be retrieved for "${job.goal}". Try rephrasing the goal or adding documents to your library.`
    }
    const sourceBlock = job.sources
      .map((s) => `[${s.n}] ${s.title}\nURL: ${s.url}\n${s.snippet}`)
      .join('\n\n')
    try {
      const res = await this.llm.complete(
        [{ role: 'user', content: `Research goal: ${job.goal}\n\nSources:\n${sourceBlock}\n\nWrite the report now.` }],
        [],
        'You are a meticulous research analyst. Write a well-structured markdown report (title, executive summary, key findings with headings, open questions). ' +
          'Every factual claim MUST cite its supporting source(s) inline using bracketed numbers like [1] or [2][3] that match the provided source list. ' +
          'Only use the provided sources; never invent citations. Do not include a sources list at the end â€” it is appended automatically.',
      )
      const text = (res.content ?? '').trim()
      if (text) return this.stripInvalidCitations(text, job.sources.length)
    } catch (err: any) {
      this.logger.warn(`synthesize fallback: ${err?.message}`)
    }
    return [`# ${job.goal}`, '', '## Findings', ...job.sources.map((s) => `- ${s.snippet.slice(0, 240)} [${s.n}]`)].join('\n')
  }

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private extractWebHits(output: unknown): Array<{ url: string; title: string; snippet: string }> {
    const out: Array<{ url: string; title: string; snippet: string }> = []
    let data: unknown = output
    if (typeof data === 'string') {
      try { data = JSON.parse(data) } catch {
        const re = /(https?:\/\/[^\s)"'<>\]]+)/g
        let m: RegExpExecArray | null
        while ((m = re.exec(output as string)) && out.length < 10) out.push({ url: m[1]!, title: m[1]!, snippet: '' })
        return out
      }
    }
    const visit = (v: unknown, depth: number) => {
      if (depth > 5 || !v || out.length >= 10) return
      if (Array.isArray(v)) { v.forEach((x) => visit(x, depth + 1)); return }
      if (typeof v === 'object') {
        const o = v as Record<string, unknown>
        const url = typeof o.url === 'string' ? o.url : typeof o.link === 'string' ? o.link : ''
        if (/^https?:\/\//.test(url)) {
          const title = String(o.title ?? o.name ?? url)
          const snippet = String(o.snippet ?? o.description ?? o.content ?? o.text ?? '')
          out.push({ url, title: title.slice(0, 300), snippet: snippet.replace(/\s+/g, ' ').slice(0, 600) })
          return
        }
        Object.values(o).forEach((x) => visit(x, depth + 1))
      }
    }
    visit(data, 0)
    return out
  }

  private addSource(job: ResearchJob, s: Omit<ResearchSource, 'n'>) {
    if (job.sources.length >= MAX_SOURCES) return false
    const key = s.url.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase()
    if (job.sources.some((x) => x.url.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase() === key)) return false
    job.sources.push({ ...s, n: job.sources.length + 1 })
    this.touch(job)
    return true
  }

  private stripInvalidCitations(text: string, count: number) {
    return text.replace(/\[(\d{1,3})\]/g, (m, d) => (Number(d) >= 1 && Number(d) <= count ? m : ''))
  }

  private renderMarkdown(job: ResearchJob) {
    const lines = [job.report || `# ${job.goal}\n\n_Research in progressâ€¦_`, '', '## Sources', '']
    for (const s of job.sources) lines.push(`${s.n}. [${s.title.replace(/[[\]]/g, '')}](${s.url})${s.snippet ? ` â€” ${s.snippet.slice(0, 200)}` : ''}`)
    return lines.join('\n')
  }

  private require(userId: string, id: string) {
    const job = this.jobs.get(id)
    if (!job || job.userId !== userId) throw new NotFoundException('Research job not found.')
    return job
  }

  private view(job: ResearchJob) {
    const { userId: _u, ...rest } = job
    return rest
  }

  private stepStart(job: ResearchJob, id: string) {
    const s = job.steps.find((x) => x.id === id)
    if (s) { s.status = 'running'; s.startedAt = new Date().toISOString() }
    this.touch(job)
  }

  private stepDetail(job: ResearchJob, id: string, detail: string) {
    const s = job.steps.find((x) => x.id === id)
    if (s) s.detail = detail
    this.touch(job)
  }

  private stepDone(job: ResearchJob, id: string, detail?: string) {
    const s = job.steps.find((x) => x.id === id)
    if (s) { s.status = 'completed'; s.finishedAt = new Date().toISOString(); if (detail) s.detail = detail }
    this.touch(job)
  }

  private touch(job: ResearchJob) {
    job.updatedAt = new Date().toISOString()
    this.scheduleSave(job.userId)
    if (job.status === 'failed') {
      for (const s of job.steps) if (s.status === 'running') s.status = 'failed'
    }
  }

  private prune(userId: string) {
    const mine = [...this.jobs.values()].filter((j) => j.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    while (mine.length > MAX_JOBS_PER_USER) this.jobs.delete(mine.shift()!.id)
  }
}
