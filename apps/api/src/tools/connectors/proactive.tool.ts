import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import { CronService } from '../../cron/cron.service'
import type { ToolDefinition } from '../tools.service'

/**
 * Proactive / Always-on tools.
 *
 * These tools let the agent set up persistent background tasks that run
 * automatically on a schedule without the user prompting each time.
 * All are hidden from the UI — the agent creates them on request.
 */
@Injectable()
export class ProactiveTool {
  constructor(private cron: CronService) {}

  // ── Daily Briefing ────────────────────────────────────────────────────────

  get dailyBriefingDef(): ToolDefinition {
    return {
      name: 'proactive_daily_briefing',
      displayName: 'Daily Briefing',
      description: 'Set up a daily morning briefing that automatically runs every day at a chosen time. The agent will fetch top news, check the calendar, and deliver a personalized digest — no prompting needed.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          time_utc:  { type: 'string', description: 'Time to run in UTC HH:MM format (e.g. "07:00" for 7am UTC)' },
          topics:    { type: 'string', description: 'Topics to include: "world news, tech, calendar" etc.' },
          style:     { type: 'string', description: 'Delivery style: "brief" (5 bullets) or "detailed" (full summary). Default: brief' },
        },
        required: ['time_utc'],
      },
    }
  }

  async dailyBriefing(input: { time_utc: string; topics?: string; style?: string }, userId: string): Promise<ToolResult> {
    const [h, m] = (input.time_utc ?? '07:00').split(':').map(Number)
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      return { success: false, output: null, error: 'time_utc must be HH:MM format (e.g. "07:00").' }
    }

    const topics = input.topics?.trim() || 'world news, technology, science'
    const style = input.style === 'detailed' ? 'detailed summary with context' : '5 bullet points'
    const cronExpr = `${m} ${h} * * *`

    const prompt = [
      `Daily briefing task. Fetch and summarize today's news and information.`,
      `Topics to cover: ${topics}.`,
      `Format: ${style}.`,
      `Steps:`,
      `1. Use rss_fetch or news_guardian_headlines to get latest headlines for each topic.`,
      `2. Use get_current_time to confirm today's date.`,
      `3. Summarize the most important stories.`,
      `4. End with: "That's your briefing for [DATE]. Have a great day!"`,
      `Keep the response friendly and conversational.`,
    ].join(' ')

    try {
      const job = await this.cron.createJob(userId, {
        name: `Daily Briefing ${input.time_utc} UTC`,
        description: `Morning briefing: ${topics}`,
        enabled: true,
        scheduleKind: 'cron',
        scheduleValue: cronExpr,
        sessionTarget: 'main',
        payloadKind: 'agentTurn',
        payloadText: prompt,
        deliveryMode: 'none',
      })
      return {
        success: true,
        output: {
          message: `Daily briefing set up! It will run every day at ${input.time_utc} UTC.`,
          jobId: job.id,
          schedule: cronExpr,
          topics,
        },
      }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Failed to create briefing job.' }
    }
  }

  // ── Web Monitor ───────────────────────────────────────────────────────────

  get webMonitorDef(): ToolDefinition {
    return {
      name: 'proactive_web_monitor',
      displayName: 'Web Monitor',
      description: 'Monitor a URL for changes. The agent checks it on schedule and notifies you when content changes — great for tracking product pages, competitor sites, or any webpage.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          url:       { type: 'string', description: 'URL to monitor' },
          check_every: { type: 'string', description: 'How often to check: "1h", "6h", "1d", etc. Default: 6h' },
          watch_for: { type: 'string', description: 'What to look for: "price", "new content", "keyword X", "any change"' },
          name:      { type: 'string', description: 'A short label for this monitor' },
        },
        required: ['url'],
      },
    }
  }

  async webMonitor(input: { url: string; check_every?: string; watch_for?: string; name?: string }, userId: string): Promise<ToolResult> {
    const url = input.url?.trim()
    if (!url) return { success: false, output: null, error: 'url is required.' }

    const interval = input.check_every?.trim() || '6h'
    const watchFor = input.watch_for?.trim() || 'any significant change'
    const label = input.name?.trim() || `Monitor: ${url.replace(/^https?:\/\//, '').slice(0, 40)}`

    const prompt = [
      `Web monitor check for: ${url}`,
      `I am checking this URL for: ${watchFor}.`,
      `Steps:`,
      `1. Use web_fetch to retrieve the current content of ${url}.`,
      `2. Look specifically for: ${watchFor}.`,
      `3. If something notable is found, summarize it clearly.`,
      `4. If nothing has changed or nothing relevant was found, say "No notable changes detected at ${url}."`,
      `Be concise — only report if there is something worth knowing.`,
    ].join(' ')

    try {
      const job = await this.cron.createJob(userId, {
        name: label,
        description: `Monitor ${url} for ${watchFor}`,
        enabled: true,
        scheduleKind: 'every',
        scheduleValue: interval,
        sessionTarget: 'main',
        payloadKind: 'agentTurn',
        payloadText: prompt,
        deliveryMode: 'none',
      })
      return {
        success: true,
        output: {
          message: `Web monitor created. I'll check ${url} every ${interval}.`,
          jobId: job.id,
          url,
          interval,
          watchFor,
        },
      }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Failed to create web monitor.' }
    }
  }

  // ── Keyword Alert ─────────────────────────────────────────────────────────

  get keywordAlertDef(): ToolDefinition {
    return {
      name: 'proactive_keyword_alert',
      displayName: 'Keyword Alert',
      description: 'Watch RSS feeds and news for a keyword or topic. The agent checks regularly and alerts you when matching articles are found.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          keyword:     { type: 'string', description: 'Keyword, phrase, or topic to watch for (e.g. "OpenAI", "climate policy", "your company name")' },
          sources:     { type: 'string', description: 'Comma-separated RSS preset keys or "all". Default: bbc_top,reuters_top,hn_top' },
          check_every: { type: 'string', description: 'Check interval: "1h", "2h", "6h". Default: 2h' },
        },
        required: ['keyword'],
      },
    }
  }

  async keywordAlert(input: { keyword: string; sources?: string; check_every?: string }, userId: string): Promise<ToolResult> {
    const keyword = input.keyword?.trim()
    if (!keyword) return { success: false, output: null, error: 'keyword is required.' }

    const sources = input.sources?.trim() || 'bbc_top,reuters_top,hn_top'
    const interval = input.check_every?.trim() || '2h'
    const feedKeys = sources === 'all'
      ? 'bbc_top,bbc_world,reuters_top,reuters_world,nyt_home,guardian_top,hn_top,techcrunch'
      : sources

    const prompt = [
      `Keyword alert check for: "${keyword}".`,
      `Scan these RSS feeds: ${feedKeys}.`,
      `Steps:`,
      `1. For each feed key, call rss_fetch with that key and count=20.`,
      `2. Search titles and summaries for mentions of "${keyword}" (case-insensitive).`,
      `3. If matches found: list each article with title, source, date, and a 1-sentence summary.`,
      `4. If no matches: respond only with "No mentions of '${keyword}' in the latest news."`,
      `Keep it short — only report what's new and relevant.`,
    ].join(' ')

    try {
      const job = await this.cron.createJob(userId, {
        name: `Keyword Alert: "${keyword}"`,
        description: `Watch for "${keyword}" in ${feedKeys}`,
        enabled: true,
        scheduleKind: 'every',
        scheduleValue: interval,
        sessionTarget: 'main',
        payloadKind: 'agentTurn',
        payloadText: prompt,
        deliveryMode: 'none',
      })
      return {
        success: true,
        output: {
          message: `Keyword alert set! I'll scan for "${keyword}" every ${interval}.`,
          jobId: job.id,
          keyword,
          sources: feedKeys,
          interval,
        },
      }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Failed to create keyword alert.' }
    }
  }

  // ── Uptime Monitor ────────────────────────────────────────────────────────

  get uptimeMonitorDef(): ToolDefinition {
    return {
      name: 'proactive_uptime_monitor',
      displayName: 'Uptime Monitor',
      description: 'Ping one or more URLs on a schedule and alert if any are down or returning errors.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          urls:        { type: 'string', description: 'Comma-separated list of URLs to check' },
          check_every: { type: 'string', description: 'Check interval: "5m", "15m", "1h". Default: 15m' },
          name:        { type: 'string', description: 'Name for this monitor group' },
        },
        required: ['urls'],
      },
    }
  }

  async uptimeMonitor(input: { urls: string; check_every?: string; name?: string }, userId: string): Promise<ToolResult> {
    const urls = (input.urls ?? '').split(',').map((u) => u.trim()).filter(Boolean)
    if (!urls.length) return { success: false, output: null, error: 'urls is required.' }

    const interval = input.check_every?.trim() || '15m'
    const label = input.name?.trim() || `Uptime: ${urls[0].replace(/^https?:\/\//, '').slice(0, 30)}`

    const urlList = urls.map((u) => `- ${u}`).join('\n')
    const prompt = [
      `Uptime check for the following URLs:\n${urlList}`,
      `For each URL: use web_fetch to check if it returns a valid response.`,
      `Report results as a table: URL | Status | Response time.`,
      `If ANY URL is down or returns an error, start your response with "⚠️ ALERT:" and describe the issue clearly.`,
      `If all URLs are up, respond with "✅ All services operational." followed by the table.`,
    ].join(' ')

    try {
      const job = await this.cron.createJob(userId, {
        name: label,
        description: `Uptime check every ${interval}: ${urls.join(', ')}`,
        enabled: true,
        scheduleKind: 'every',
        scheduleValue: interval,
        sessionTarget: 'main',
        payloadKind: 'agentTurn',
        payloadText: prompt,
        deliveryMode: 'none',
      })
      return {
        success: true,
        output: {
          message: `Uptime monitor created for ${urls.length} URL(s). Checks every ${interval}.`,
          jobId: job.id,
          urls,
          interval,
        },
      }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Failed to create uptime monitor.' }
    }
  }

  // ── List active proactive jobs ────────────────────────────────────────────

  get listDef(): ToolDefinition {
    return {
      name: 'proactive_list',
      displayName: 'List Proactive Tasks',
      description: 'List all active background/proactive tasks the agent is running for the user.',
      requiresApproval: false,
      hidden: true,
      inputSchema: { type: 'object', properties: {} },
    }
  }

  async list(_input: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const jobs = await this.cron.listJobs(userId)
      return {
        success: true,
        output: {
          jobs: jobs.map((j: any) => ({
            id: j.id,
            name: j.name,
            enabled: j.enabled,
            schedule: `${j.scheduleKind}: ${j.scheduleValue}`,
            lastRun: j.runs?.[0]?.createdAt ?? null,
            lastStatus: j.runs?.[0]?.status ?? 'never run',
          })),
        },
      }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Failed to list jobs.' }
    }
  }

  // ── Pause / resume ────────────────────────────────────────────────────────

  get pauseDef(): ToolDefinition {
    return {
      name: 'proactive_pause',
      displayName: 'Pause Proactive Task',
      description: 'Pause or resume a background task by job ID.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          job_id: { type: 'string', description: 'Job ID to pause or resume' },
          enabled: { type: 'boolean', description: 'true = resume, false = pause' },
        },
        required: ['job_id'],
      },
    }
  }

  async pause(input: { job_id: string; enabled?: boolean }, userId: string): Promise<ToolResult> {
    const enabled = input.enabled !== false   // default: resume (true)
    try {
      await this.cron.updateJob(userId, input.job_id, { enabled })
      return { success: true, output: { updated: input.job_id, enabled } }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Failed to update job.' }
    }
  }
}
