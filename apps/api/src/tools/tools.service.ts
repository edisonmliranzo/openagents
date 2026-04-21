import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { GmailTool } from './connectors/gmail.tool'
import { CalendarTool } from './connectors/calendar.tool'
import { WebFetchTool } from './connectors/web-fetch.tool'
import { NotesTool } from './connectors/notes.tool'
import { WebSearchTool } from './connectors/web-search.tool'
import { TimeTool } from './connectors/time.tool'
import { CronTool } from './connectors/cron.tool'
import { BybitTool } from './connectors/bybit.tool'
import { DeepResearchTool } from './connectors/deep-research.tool'
import { ComputerUseTool } from './connectors/computer-use.tool'
import { GithubTool } from './connectors/github.tool'
import { NotionTool } from './connectors/notion.tool'
import { LinearTool } from './connectors/linear.tool'
import { JiraTool } from './connectors/jira.tool'
import { NewsTool } from './connectors/news.tool'
import { YoutubeTool } from './connectors/youtube.tool'
import { MemoryPersonalTool } from './connectors/memory-personal.tool'
import { ProactiveTool } from './connectors/proactive.tool'
import { ShellTool } from './connectors/shell.tool'
import { CodeExecutionTool } from './connectors/code-execution.tool'
import { ImageGenerationTool } from './connectors/image-generation.tool'
import { AudioGenerationTool } from './connectors/audio-generation.tool'
import { AtlasCloudTool } from './connectors/atlascloud.tool'
import { VoiceTranscriptionTool } from './connectors/voice-transcription.tool'
import { DocumentQATool } from './connectors/document-qa.tool'
import { KnowledgeBaseTool } from './connectors/knowledge-base.tool'
import { PdfExtractTool } from './connectors/pdf-extract.tool'
import { PostgresQueryTool } from './connectors/postgres-query.tool'
import { SlackSendTool } from './connectors/slack-send.tool'
import { AirtableTool } from './connectors/airtable.tool'
import { HubSpotTool } from './connectors/hubspot.tool'
import { BrowserScreenshotTool } from './connectors/browser-screenshot.tool'
import { WhatsAppSendTool } from './connectors/whatsapp-send.tool'
import { TelegramSendTool } from './connectors/telegram-send.tool'
import { ParallelAgentTool } from './connectors/parallel-agent.tool'
import { MixtureOfAgentsTool } from './connectors/mixture-of-agents.tool'
import { SkillSaveTool } from './connectors/skill-save.tool'
import type { ToolDryRunResult, ToolResult } from '@openagents/shared'
import { ConnectorsService } from '../connectors/connectors.service'
import { McpService } from './mcp.service'
import { PolicyService } from '../policy/policy.service'

export interface ToolDefinition {
  name: string
  displayName: string
  description: string
  requiresApproval: boolean
  inputSchema: Record<string, unknown>
  source?: 'builtin' | 'mcp'
  serverId?: string
  originalName?: string
  /** If true, tool is available to the agent but not shown in the UI tools list */
  hidden?: boolean
}

@Injectable()
export class ToolsService {
  private registry: Map<string, { def: ToolDefinition; execute: (input: any, userId: string) => Promise<ToolResult> }>

  constructor(
    private prisma: PrismaService,
    private connectors: ConnectorsService,
    private policy: PolicyService,
    private gmail: GmailTool,
    private calendar: CalendarTool,
    private webFetch: WebFetchTool,
    private notes: NotesTool,
    private webSearch: WebSearchTool,
    private time: TimeTool,
    private cron: CronTool,
    private bybit: BybitTool,
    private deepResearch: DeepResearchTool,
    private computerUse: ComputerUseTool,
    private github: GithubTool,
    private notion: NotionTool,
    private linear: LinearTool,
    private jira: JiraTool,
    private news: NewsTool,
    private youtube: YoutubeTool,
    private memoryPersonal: MemoryPersonalTool,
    private proactive: ProactiveTool,
    private shell: ShellTool,
    private codeExecution: CodeExecutionTool,
    private imageGeneration: ImageGenerationTool,
    private audioGeneration: AudioGenerationTool,
    private atlasCloud: AtlasCloudTool,
    private voiceTranscription: VoiceTranscriptionTool,
    private documentQA: DocumentQATool,
    private knowledgeBase: KnowledgeBaseTool,
    private pdfExtract: PdfExtractTool,
    private postgresQuery: PostgresQueryTool,
    private slackSend: SlackSendTool,
    private airtable: AirtableTool,
    private hubspot: HubSpotTool,
    private browserScreenshot: BrowserScreenshotTool,
    private whatsappSend: WhatsAppSendTool,
    private telegramSend: TelegramSendTool,
    private parallelAgent: ParallelAgentTool,
    private mixtureOfAgents: MixtureOfAgentsTool,
    private skillSave: SkillSaveTool,
    private mcp: McpService,
    ) {
    this.registry = new Map([
      ['gmail_search', { def: this.withBuiltinSource(this.gmail.searchDef), execute: this.gmail.search.bind(this.gmail) }],
      ['gmail_read_thread', { def: this.withBuiltinSource(this.gmail.readThreadDef), execute: this.gmail.readThread.bind(this.gmail) }],
      ['gmail_list_labels', { def: this.withBuiltinSource(this.gmail.listLabelsDef), execute: this.gmail.listLabels.bind(this.gmail) }],
      ['gmail_draft_reply', { def: this.withBuiltinSource(this.gmail.draftReplyDef), execute: this.gmail.draftReply.bind(this.gmail) }],
      ['gmail_send_draft', { def: this.withBuiltinSource(this.gmail.sendDraftDef), execute: this.gmail.sendDraft.bind(this.gmail) }],
      ['calendar_get_availability', { def: this.withBuiltinSource(this.calendar.availabilityDef), execute: this.calendar.getAvailability.bind(this.calendar) }],
      ['calendar_create_event', { def: this.withBuiltinSource(this.calendar.createEventDef), execute: this.calendar.createEvent.bind(this.calendar) }],
      ['calendar_update_event', { def: this.withBuiltinSource(this.calendar.updateEventDef), execute: this.calendar.updateEvent.bind(this.calendar) }],
      ['calendar_cancel_event', { def: this.withBuiltinSource(this.calendar.cancelEventDef), execute: this.calendar.cancelEvent.bind(this.calendar) }],
      ['web_fetch', { def: this.withBuiltinSource(this.webFetch.def), execute: this.webFetch.fetch.bind(this.webFetch) }],
      ['web_search', { def: this.withBuiltinSource(this.webSearch.def), execute: this.webSearch.search.bind(this.webSearch) }],
      ['get_current_time', { def: this.withBuiltinSource(this.time.def), execute: this.time.getCurrentTime.bind(this.time) }],
      ['cron_add', { def: this.withBuiltinSource(this.cron.addDef), execute: this.cron.add.bind(this.cron) }],
      ['cron_list', { def: this.withBuiltinSource(this.cron.listDef), execute: this.cron.list.bind(this.cron) }],
      ['cron_remove', { def: this.withBuiltinSource(this.cron.removeDef), execute: this.cron.remove.bind(this.cron) }],
      ['notes_create', { def: this.withBuiltinSource(this.notes.createDef), execute: this.notes.create.bind(this.notes) }],
      ['notes_list', { def: this.withBuiltinSource(this.notes.listDef), execute: this.notes.list.bind(this.notes) }],
      ['bybit_get_ticker', { def: this.withBuiltinSource(this.bybit.tickerDef), execute: this.bybit.getTicker.bind(this.bybit) }],
      ['bybit_get_positions', { def: this.withBuiltinSource(this.bybit.positionsDef), execute: this.bybit.getPositions.bind(this.bybit) }],
      ['bybit_get_wallet_balance', { def: this.withBuiltinSource(this.bybit.walletBalanceDef), execute: this.bybit.getWalletBalance.bind(this.bybit) }],
      ['bybit_place_demo_order', { def: this.withBuiltinSource(this.bybit.placeDemoOrderDef), execute: this.bybit.placeDemoOrder.bind(this.bybit) }],
      ['deep_research', { def: this.withBuiltinSource(this.deepResearch.def), execute: this.deepResearch.run.bind(this.deepResearch) }],
      ['computer_session_start', { def: this.withBuiltinSource(this.computerUse.sessionStartDef), execute: this.computerUse.start.bind(this.computerUse) }],
      ['computer_navigate', { def: this.withBuiltinSource(this.computerUse.navigateDef), execute: this.computerUse.navigate.bind(this.computerUse) }],
      ['computer_click_link', { def: this.withBuiltinSource(this.computerUse.clickDef), execute: this.computerUse.click.bind(this.computerUse) }],
      ['computer_snapshot', { def: this.withBuiltinSource(this.computerUse.snapshotDef), execute: this.computerUse.snapshot.bind(this.computerUse) }],
      ['computer_session_end', { def: this.withBuiltinSource(this.computerUse.endSessionDef), execute: this.computerUse.end.bind(this.computerUse) }],
      // GitHub
      ['github_create_issue', { def: this.withBuiltinSource(this.github.createIssueDef), execute: (i: any) => this.github.createIssue(i) }],
      ['github_list_prs',     { def: this.withBuiltinSource(this.github.listPRsDef),     execute: (i: any) => this.github.listPRs(i) }],
      ['github_add_comment',  { def: this.withBuiltinSource(this.github.addCommentDef),  execute: (i: any) => this.github.addComment(i) }],
      ['github_get_file',     { def: this.withBuiltinSource(this.github.getFileDef),     execute: (i: any) => this.github.getFile(i) }],
      ['github_create_pr',    { def: this.withBuiltinSource(this.github.createPRDef),    execute: (i: any) => this.github.createPR(i) }],
      // Notion
      ['notion_read_page',      { def: this.withBuiltinSource(this.notion.readPageDef),      execute: (i: any) => this.notion.readPage(i) }],
      ['notion_create_page',    { def: this.withBuiltinSource(this.notion.createPageDef),    execute: (i: any) => this.notion.createPage(i) }],
      ['notion_query_database', { def: this.withBuiltinSource(this.notion.queryDatabaseDef), execute: (i: any) => this.notion.queryDatabase(i) }],
      // Linear
      ['linear_create_issue',  { def: this.withBuiltinSource(this.linear.createIssueDef),  execute: (i: any) => this.linear.createIssue(i) }],
      ['linear_update_status', { def: this.withBuiltinSource(this.linear.updateStatusDef), execute: (i: any) => this.linear.updateStatus(i) }],
      ['linear_list_issues',   { def: this.withBuiltinSource(this.linear.listIssuesDef),   execute: (i: any) => this.linear.listIssues(i) }],
      ['linear_add_comment',   { def: this.withBuiltinSource(this.linear.addCommentDef),   execute: (i: any) => this.linear.addComment(i) }],
      // Jira
      ['jira_create_issue',     { def: this.withBuiltinSource(this.jira.createIssueDef),     execute: (i: any) => this.jira.createIssue(i) }],
      ['jira_transition_issue', { def: this.withBuiltinSource(this.jira.transitionIssueDef), execute: (i: any) => this.jira.transitionIssue(i) }],
      ['jira_search_issues',    { def: this.withBuiltinSource(this.jira.searchIssuesDef),    execute: (i: any) => this.jira.searchIssues(i) }],
      ['jira_add_comment',      { def: this.withBuiltinSource(this.jira.addCommentDef),      execute: (i: any) => this.jira.addComment(i) }],
      ['jira_list_transitions', { def: this.withBuiltinSource(this.jira.listTransitionsDef), execute: (i: any) => this.jira.listTransitions(i) }],
      // News & RSS
      ['news_guardian_search',   { def: this.withBuiltinSource(this.news.guardianSearchDef),   execute: this.news.guardianSearch.bind(this.news) }],
      ['news_guardian_headlines', { def: this.withBuiltinSource(this.news.guardianHeadlinesDef), execute: this.news.guardianHeadlines.bind(this.news) }],
      ['rss_fetch',              { def: this.withBuiltinSource(this.news.rssFetchDef),          execute: this.news.rssFetch.bind(this.news) }],
      ['rss_list_feeds',         { def: this.withBuiltinSource(this.news.rssListFeedsDef),      execute: this.news.rssListFeeds.bind(this.news) }],
      // YouTube
      ['youtube_summarize',  { def: this.withBuiltinSource(this.youtube.summarizeDef),  execute: this.youtube.summarize.bind(this.youtube) }],
      ['youtube_transcript', { def: this.withBuiltinSource(this.youtube.transcriptDef), execute: this.youtube.transcript.bind(this.youtube) }],
      // Memory & personalization
      ['memory_save_contact',    { def: this.withBuiltinSource(this.memoryPersonal.saveContactDef),       execute: this.memoryPersonal.saveContact.bind(this.memoryPersonal) }],
      ['memory_save_preference', { def: this.withBuiltinSource(this.memoryPersonal.savePreferenceDef),    execute: this.memoryPersonal.savePreference.bind(this.memoryPersonal) }],
      ['memory_save_session',    { def: this.withBuiltinSource(this.memoryPersonal.saveSessionSummaryDef), execute: this.memoryPersonal.saveSessionSummary.bind(this.memoryPersonal) }],
      ['memory_search',          { def: this.withBuiltinSource(this.memoryPersonal.searchDef),            execute: this.memoryPersonal.search.bind(this.memoryPersonal) }],
      ['memory_get_profile',     { def: this.withBuiltinSource(this.memoryPersonal.getProfileDef),        execute: this.memoryPersonal.getProfile.bind(this.memoryPersonal) }],
      ['memory_update_profile',  { def: this.withBuiltinSource(this.memoryPersonal.updateProfileDef),     execute: this.memoryPersonal.updateProfile.bind(this.memoryPersonal) }],
      // Proactive / Always-on
      ['proactive_daily_briefing',  { def: this.withBuiltinSource(this.proactive.dailyBriefingDef),  execute: this.proactive.dailyBriefing.bind(this.proactive) }],
      ['proactive_web_monitor',     { def: this.withBuiltinSource(this.proactive.webMonitorDef),     execute: this.proactive.webMonitor.bind(this.proactive) }],
      ['proactive_keyword_alert',   { def: this.withBuiltinSource(this.proactive.keywordAlertDef),   execute: this.proactive.keywordAlert.bind(this.proactive) }],
      ['proactive_uptime_monitor',  { def: this.withBuiltinSource(this.proactive.uptimeMonitorDef),  execute: this.proactive.uptimeMonitor.bind(this.proactive) }],
      ['proactive_list',            { def: this.withBuiltinSource(this.proactive.listDef),            execute: this.proactive.list.bind(this.proactive) }],
      ['proactive_pause',           { def: this.withBuiltinSource(this.proactive.pauseDef),           execute: this.proactive.pause.bind(this.proactive) }],
      // Shell execution
      ['shell_execute',       { def: this.withBuiltinSource(this.shell.executeDef),     execute: this.shell.execute.bind(this.shell) }],
      ['shell_session_start', { def: this.withBuiltinSource(this.shell.sessionStartDef), execute: this.shell.sessionStart.bind(this.shell) }],
      ['shell_session_run',   { def: this.withBuiltinSource(this.shell.sessionRunDef),  execute: this.shell.sessionRun.bind(this.shell) }],
      ['shell_session_end',   { def: this.withBuiltinSource(this.shell.sessionEndDef),  execute: this.shell.sessionEnd.bind(this.shell) }],
      // Code execution
      ['code_execute', { def: this.withBuiltinSource(this.codeExecution.def), execute: this.codeExecution.execute.bind(this.codeExecution) }],
      // Multimodal generation
      ['image_generate', { def: this.withBuiltinSource(this.imageGeneration.def), execute: this.imageGeneration.generate.bind(this.imageGeneration) }],
      ['audio_generate', { def: this.withBuiltinSource(this.audioGeneration.def), execute: this.audioGeneration.generate.bind(this.audioGeneration) }],
      ['atlascloud_image_generate', { def: this.withBuiltinSource(this.atlasCloud.def), execute: this.atlasCloud.generate.bind(this.atlasCloud) }],
      ['voice_transcribe', { def: this.withBuiltinSource(this.voiceTranscription.def), execute: this.voiceTranscription.transcribe.bind(this.voiceTranscription) }],
      ['document_qa', { def: this.withBuiltinSource(this.documentQA.def), execute: this.documentQA.answer.bind(this.documentQA) }],
      ['knowledge_base', { def: this.withBuiltinSource(this.knowledgeBase.def), execute: this.knowledgeBase.execute.bind(this.knowledgeBase) }],
      // New connectors
      ['pdf_extract', { def: this.withBuiltinSource(this.pdfExtract.def), execute: this.pdfExtract.extract.bind(this.pdfExtract) }],
      ['postgres_query', { def: this.withBuiltinSource(this.postgresQuery.def), execute: this.postgresQuery.query.bind(this.postgresQuery) }],
      ['slack_send', { def: this.withBuiltinSource(this.slackSend.def), execute: this.slackSend.send.bind(this.slackSend) }],
      ['airtable_query', { def: this.withBuiltinSource(this.airtable.def), execute: this.airtable.query.bind(this.airtable) }],
      ['hubspot_search', { def: this.withBuiltinSource(this.hubspot.def), execute: this.hubspot.search.bind(this.hubspot) }],
      ['browser_screenshot', { def: this.withBuiltinSource(this.browserScreenshot.def), execute: this.browserScreenshot.screenshot.bind(this.browserScreenshot) }],
      // Outbound messaging
      ['whatsapp_send', { def: this.withBuiltinSource(this.whatsappSend.def), execute: this.whatsappSend.send.bind(this.whatsappSend) }],
      ['telegram_send', { def: this.withBuiltinSource(this.telegramSend.def), execute: this.telegramSend.send.bind(this.telegramSend) }],
      // Parallel agent
      ['parallel_agent_run', { def: this.withBuiltinSource(this.parallelAgent.def), execute: this.parallelAgent.run.bind(this.parallelAgent) }],
      // Mixture of agents
      ['mixture_of_agents', { def: this.withBuiltinSource(this.mixtureOfAgents.def), execute: this.mixtureOfAgents.run.bind(this.mixtureOfAgents) }],
      // Skill save
      ['skill_save', { def: this.withBuiltinSource(this.skillSave.def), execute: this.skillSave.run.bind(this.skillSave) }],
    ])
  }

  async getAvailableForUser(userId: string): Promise<ToolDefinition[]> {
    // For MVP: return all tools; later filter by connected tools
    const builtinTools = Array.from(this.registry.values()).map((t) => t.def)
    const mcpTools = await this.mcp.listToolDefinitions()
    return [...builtinTools, ...mcpTools]
  }

  async execute(toolName: string, input: Record<string, unknown>, userId: string): Promise<ToolResult> {
    const tool = this.registry.get(toolName)
    const startedAt = Date.now()
    try {
      const result = tool
        ? await tool.execute(input, userId)
        : await this.mcp.execute(toolName, input, userId)
      const latencyMs = Date.now() - startedAt
      await this.connectors.recordToolExecution(userId, toolName, {
        success: result.success,
        latencyMs,
        error: result.error ?? undefined,
        rateLimited: this.isRateLimitError(result.error),
      }).catch(() => {})
      return result
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      await this.connectors.recordToolExecution(userId, toolName, {
        success: false,
        latencyMs: Date.now() - startedAt,
        error: errorMessage,
        rateLimited: this.isRateLimitError(errorMessage),
      }).catch(() => {})
      return { success: false, output: null, error: errorMessage }
    }
  }

  async getAllDefinitions(): Promise<ToolDefinition[]> {
    const builtinTools = Array.from(this.registry.values()).map((t) => t.def).filter((d) => !d.hidden)
    const mcpTools = await this.mcp.listToolDefinitions()
    return [...builtinTools, ...mcpTools]
  }

  async dryRun(userId: string, toolName: string, input: Record<string, unknown> = {}): Promise<ToolDryRunResult> {
    const definition = await this.resolveDefinition(toolName)
    const connectorId = this.inferConnectorId(toolName)
    const connectorSnapshot = connectorId
      ? await this.connectors.listHealth(userId).catch(() => null)
      : null
    const connectorEntry = connectorId
      ? connectorSnapshot?.connectors.find((entry) => entry.connectorId === connectorId) ?? null
      : null
    const predictedScope = this.inferScope(toolName)
    const reversible = !/(delete|remove|revoke|shutdown|terminate|wipe|create_event|update_event|cancel_event|draft_reply|send_draft|place_demo_order)/i.test(toolName)
    const sideEffects = this.inferSideEffects(toolName)
    const risk = this.policy.evaluate({
      action: definition.description,
      toolName,
      scope: predictedScope,
      reversible,
      estimatedCostUsd: this.estimateCost(toolName, input),
      sensitivity: connectorId ? 'internal' : 'public',
      metadata: {
        inputKeys: Object.keys(input).slice(0, 12),
      },
    })

    const warnings: string[] = []
    if (definition.requiresApproval) {
      warnings.push('Tool requires approval before live execution.')
    }
    if (connectorId && (!connectorEntry || connectorEntry.status === 'down')) {
      warnings.push('Connector is not ready for live execution.')
    }
    if (connectorEntry?.status === 'degraded') {
      warnings.push('Connector is degraded; live execution may fail or be delayed.')
    }
    if (!reversible) {
      warnings.push('Tool may mutate external state.')
    }

    return {
      toolName,
      requiresApproval: definition.requiresApproval,
      ready: !connectorId || (connectorEntry?.status === 'connected' || connectorEntry?.status === 'degraded'),
      connectorId,
      connectorStatus: connectorEntry?.status ?? (connectorId ? 'down' : 'unknown'),
      predictedScope,
      reversible,
      estimatedCostUsd: this.estimateCost(toolName, input),
      sideEffects,
      warnings,
      risk,
      previewGeneratedAt: new Date().toISOString(),
    }
  }

  private isRateLimitError(message: string | undefined | null) {
    if (!message) return false
    return /rate\s*limit|too many requests|429/i.test(message)
  }

  private async resolveDefinition(toolName: string): Promise<ToolDefinition> {
    const builtin = this.registry.get(toolName)?.def
    if (builtin) return builtin
    const mcpTools = await this.mcp.listToolDefinitions()
    const found = mcpTools.find((tool) => tool.name === toolName)
    if (!found) {
      throw new Error(`Unknown tool: ${toolName}`)
    }
    return found
  }

  private inferConnectorId(toolName: string) {
    const value = toolName.trim().toLowerCase()
    if (value.startsWith('gmail_')) return 'google_gmail'
    if (value.startsWith('calendar_')) return 'google_calendar'
    if (value.startsWith('web_')) return null
    if (value.startsWith('notes_')) return null
    return null
  }

  private inferScope(toolName: string) {
    const value = toolName.trim().toLowerCase()
    if (/(create|draft|send|remove|delete|update|cancel|place_demo_order)/i.test(value)) return 'external_write' as const
    if (/(web_|gmail_|calendar_|bybit_get_|deep_research|computer_)/i.test(value)) return 'external_read' as const
    if (/(cron_add|cron_remove)/i.test(value)) return 'system_mutation' as const
    if (/(shell_execute|shell_session_run|code_execute)/i.test(value)) return 'system_mutation' as const
    if (/(image_generate|audio_generate|atlascloud_image_generate)/i.test(value)) return 'external_write' as const
    return 'local' as const
  }

  private inferSideEffects(toolName: string) {
    const value = toolName.trim().toLowerCase()
    const effects: string[] = []
    if (value.startsWith('gmail_')) effects.push('Reads or drafts Gmail content')
    if (value.startsWith('calendar_')) effects.push('Reads or updates Google Calendar data')
    if (value.startsWith('web_')) effects.push('Fetches external web content')
    if (value.startsWith('notes_')) effects.push('Reads or writes local note state')
    if (value.startsWith('computer_')) effects.push('Creates browser automation side effects')
    if (value.startsWith('shell_')) effects.push('Executes shell commands on the host system')
    if (value === 'code_execute') effects.push('Executes code in an isolated process on the host system')
    if (value === 'image_generate') effects.push('Calls external image generation API; may incur cost')
    if (value === 'atlascloud_image_generate') effects.push('Calls AtlasCloud AI image generation API; may incur cost')
    if (value === 'audio_generate') effects.push('Calls external TTS API; may incur cost')
    if (value === 'voice_transcribe') effects.push('Calls OpenAI Whisper STT API')
    if (value === 'pdf_extract') effects.push('Fetches and parses a PDF document from a remote URL')
    if (value === 'postgres_query') effects.push('Executes SQL against a user-configured PostgreSQL database')
    if (value === 'slack_send') effects.push('Sends a message to a Slack channel or user')
    if (value === 'airtable_query') effects.push('Reads records from an Airtable base')
    if (value === 'hubspot_search') effects.push('Searches HubSpot CRM contacts/companies/deals')
    if (value === 'browser_screenshot') effects.push('Takes a screenshot of a URL using external screenshot API')
    if (value === 'whatsapp_send') effects.push('Sends outbound WhatsApp message via Meta Cloud API')
    if (value === 'telegram_send') effects.push('Sends outbound Telegram message via Bot API')
    if (effects.length === 0) effects.push('Tool-specific side effects depend on runtime inputs')
    return effects
  }

  private estimateCost(toolName: string, input: Record<string, unknown>) {
    const value = toolName.trim().toLowerCase()
    if (value === 'deep_research') return 0.25
    if (value.startsWith('computer_')) return 0.1
    if (value.startsWith('web_')) return 0.01
    if (value.includes('bybit')) return 0.02
    if (value === 'image_generate') return 0.04
    if (value === 'atlascloud_image_generate') return 0.02
    if (value === 'audio_generate') return 0.015
    if (value === 'voice_transcribe') return 0.006
    if (value === 'pdf_extract') return 0.005
    if (value === 'postgres_query') return 0.002
    if (value === 'slack_send') return 0
    if (value === 'airtable_query') return 0.001
    if (value === 'hubspot_search') return 0.001
    if (value === 'browser_screenshot') return 0.01
    if (value === 'whatsapp_send') return 0.001
    if (value === 'telegram_send') return 0.001
    if (value === 'shell_execute' || value === 'shell_session_run' || value === 'code_execute') return 0.005
    return Object.keys(input).length > 8 ? 0.02 : 0
  }

  private withBuiltinSource(def: ToolDefinition): ToolDefinition {
    return { ...def, source: 'builtin' }
  }
}
