import { Injectable } from '@nestjs/common'
import { DetectIntentDto, RouteRequestDto } from './master-agent.dto'
import { MASTER_AGENT_SYSTEM_PROMPT } from './master-agent.prompt'
import type {
  AgentActionPlan,
  AgentIntent,
  IntentDetectionResult,
  RiskLevel,
  UploadedFile,
  WorkflowInfo,
} from './master-agent.types'

@Injectable()
export class MasterAgentService {
  private readonly INTENT_KEYWORDS: Record<AgentIntent, string[]> = {
    video_generation: [
      'video', 'make video', 'create video', 'tiktok video', 'youtube video',
      'reel', 'shorts', 'cinematic', 'scene', 'animation', 'clip', 'movie',
      'footage', 'image to video', 'ugc video', 'product video', 'shorts pack',
      'voiceover video', 'music video', 'story video', 'faceless', 'youtube short',
      'animated', 'generate video', 'video ad', 'video content',
    ],
    image_generation: [
      'image', 'photo', 'poster', 'logo', 'thumbnail', 'picture', 'banner',
      'design', 'illustration', 'artwork', 'graphic', 'visual', 'generate image',
      'create image', 'product photo', 'brand asset', 'mockup', 'headshot',
      'portrait', 'background', 'wallpaper', 'cover art', 'make poster',
    ],
    coding: [
      'code', 'bug', 'fix', 'error', 'debug', 'feature', 'function', 'build feature',
      'api', 'component', 'typescript', 'javascript', 'python', 'class',
      'refactor', 'test', 'unit test', 'endpoint', 'route', 'controller',
      'service', 'module', 'hook', 'deploy code', 'git push', 'import',
      'compile', 'type error', 'runtime error', 'stack trace', 'lint',
    ],
    app_builder: [
      'build app', 'create app', 'make app', 'saas', 'mvp', 'mobile app',
      'ios app', 'android app', 'dashboard', 'admin panel', 'full stack',
      'app like', 'clone', 'startup app', 'build platform', 'create platform',
      'web application', 'build dashboard', 'create dashboard', 'build saas',
    ],
    website_builder: [
      'website', 'landing page', 'sales page', 'homepage', 'portfolio',
      'web page', 'build website', 'create website', 'make website',
      'next.js site', 'react site', 'web presence', 'build landing',
      'create landing page', 'make landing page', 'online presence',
    ],
    ecommerce: [
      'sell', 'tiktok shop', 'ugc ad', 'product ad', 'listing', 'affiliate',
      'dropship', 'shopify', 'ecommerce', 'store', 'shop', 'product video',
      'sell this', 'sell product', 'product script', 'ugc script', 'buy now',
      'conversion ad', 'retargeting ad', 'bof ad',
    ],
    social_media: [
      'content calendar', 'caption', 'hashtag', 'grow page', 'grow account',
      'instagram', 'tiktok content', 'linkedin post', 'twitter post', 'threads',
      'reels', 'followers', 'engagement', 'viral', '30 days', 'content plan',
      'social media', 'post ideas', 'content strategy', 'grow channel',
      'social content', 'posting schedule',
    ],
    voiceover: [
      'voiceover', 'voice over', 'tts', 'text to speech', 'narration',
      'read this', 'speak this', 'elevenlabs', 'voice actor', 'ai voice',
      'generate voice', 'voice script', 'audio narration',
    ],
    music_generation: [
      'music', 'song', 'melody', 'beat', 'soundtrack', 'jingle',
      'background music', 'intro music', 'generate music', 'make music',
      'create song', 'compose', 'audio track', 'suno', 'udio',
    ],
    research: [
      'research', 'find information', 'search', 'what is', 'how does',
      'compare', 'best tool', 'latest news', 'analyze market', 'study',
      'investigate', 'look up', 'find data', 'fact check', 'summarize',
      'explain this', 'learn about', 'tell me about',
    ],
    business_strategy: [
      'business plan', 'launch', 'strategy', 'pitch', 'investor',
      'go to market', 'revenue model', 'pricing strategy', 'startup',
      'venture', 'market analysis', 'competitive analysis', 'monetize',
      'business launch', 'launch plan', 'business model', 'growth strategy',
    ],
    customer_support: [
      'customer', 'reply to customer', 'support ticket', 'complaint', 'refund',
      'answer email', 'help desk', 'respond to', 'customer message',
      'customer service', 'handle complaint', 'escalation', 'unhappy customer',
    ],
    automation: [
      'automate', 'workflow automation', 'trigger', 'schedule task', 'every day',
      'monitor', 'notify me', 'webhook', 'zapier', 'make.com', 'n8n',
      'automatically', 'run when', 'if this then that', 'cron', 'batch',
      'auto run', 'schedule this', 'recurring task',
    ],
    document_creation: [
      'ebook', 'pdf', 'document', 'guide', 'report', 'proposal', 'contract',
      'presentation', 'slides', 'create course', 'manual', 'whitepaper',
      'write ebook', 'make pdf', 'create guide', 'make report',
    ],
    email: [
      'email', 'send email', 'draft email', 'cold email', 'follow up',
      'write email', 'email outreach', 'newsletter', 'email campaign',
      'email sequence', 'reply to this email', 'write subject line',
    ],
    calendar: [
      'calendar', 'schedule meeting', 'appointment', 'reminder',
      'book time', 'block time', 'calendar event', 'availability',
      'set meeting', 'create event', 'reschedule',
    ],
    trading: [
      'trading', 'trade signal', 'forex', 'stock market', 'crypto',
      'pine script', 'mt5', 'mql5', 'indicator', 'trading strategy',
      'backtest', 'trading bot', 'entry signal', 'exit signal',
      'stop loss', 'take profit', 'gold trade', 'bitcoin trade',
    ],
    content_creation: [
      'write', 'blog post', 'article', 'copywriting', 'write script',
      'story', 'creative writing', 'write content', 'headline',
      'product description', 'write copy', 'write post', 'write caption',
    ],
    unknown: [],
  }

  private readonly INTENT_TO_WORKFLOW: Record<AgentIntent, string> = {
    video_generation: 'video-workflow',
    image_generation: 'image-workflow',
    coding: 'coding-workflow',
    app_builder: 'app-builder-workflow',
    website_builder: 'app-builder-workflow',
    ecommerce: 'ugc-ad-workflow',
    social_media: 'social-media-workflow',
    voiceover: 'video-workflow',
    music_generation: 'video-workflow',
    research: 'research-workflow',
    business_strategy: 'business-launch-workflow',
    customer_support: 'customer-support-workflow',
    automation: 'automation-workflow',
    document_creation: 'document-workflow',
    email: 'email-workflow',
    calendar: 'calendar-workflow',
    trading: 'trading-workflow',
    content_creation: 'content-workflow',
    unknown: 'master-agent',
  }

  private readonly INTENT_TOOLS: Record<AgentIntent, string[]> = {
    video_generation: ['script_generator', 'video_api', 'voiceover_api', 'caption_tool', 'ffmpeg'],
    image_generation: ['prompt_builder', 'image_api', 'upscale_api', 'background_remover'],
    coding: ['file_reader', 'code_editor', 'type_checker', 'test_runner', 'git'],
    app_builder: ['code_generator', 'schema_builder', 'api_router', 'page_builder', 'deployer'],
    website_builder: ['code_generator', 'copy_writer', 'seo_tool', 'deployer', 'vercel_api'],
    ecommerce: ['script_generator', 'video_api', 'voiceover_api', 'caption_tool', 'tiktok_shop_api'],
    social_media: ['caption_writer', 'hashtag_tool', 'scheduler', 'visual_prompter', 'analytics'],
    voiceover: ['tts_api', 'elevenlabs_api', 'audio_editor', 'script_formatter'],
    music_generation: ['music_api', 'audio_editor', 'stem_splitter'],
    research: ['web_search', 'browser', 'summarizer', 'fact_checker', 'citation_tool'],
    business_strategy: ['market_analyzer', 'copy_writer', 'pitch_builder', 'competitor_tool'],
    customer_support: ['knowledge_base', 'email_api', 'ticket_system', 'sentiment_analyzer'],
    automation: ['webhook_handler', 'scheduler', 'trigger_engine', 'notification_api'],
    document_creation: ['text_editor', 'pdf_exporter', 'cover_designer', 'outline_builder'],
    email: ['email_api', 'template_engine', 'spam_checker', 'subject_optimizer'],
    calendar: ['calendar_api', 'availability_checker', 'notification_api'],
    trading: ['chart_analyzer', 'code_generator', 'backtester', 'indicator_builder'],
    content_creation: ['copy_writer', 'seo_tool', 'grammar_checker', 'tone_analyzer'],
    unknown: ['clarification_tool'],
  }

  private readonly INTENT_STEPS: Record<AgentIntent, string[]> = {
    video_generation: [
      'Detect video type, platform, and aspect ratio',
      'Detect style, duration, and required assets',
      'Write full video script with hook',
      'Split script into scenes',
      'Generate visual prompts per scene',
      'Generate motion and camera prompts',
      'Write voiceover script',
      'Plan captions and on-screen text',
      'Generate API call steps per scene',
      'Create final assembly plan',
    ],
    image_generation: [
      'Detect image type and intent',
      'Determine aspect ratio and dimensions',
      'Detect style and subject',
      'Write optimized generation prompt',
      'Write negative prompt',
      'Choose best provider (OpenAI/Ideogram/Flux/Stability)',
      'Plan 4 variants with style variations',
      'Add enhancement steps (upscale, background remove)',
      'Prepare final deliverables list',
      'Create download and export plan',
    ],
    coding: [
      'Detect programming language and framework',
      'Read all relevant files',
      'Understand the error or feature request',
      'Create step-by-step implementation plan',
      'Edit files with correct changes',
      'Run type-check',
      'Run tests if available',
      'Fix any remaining errors',
      'Show final diff and changes',
      'Commit if requested',
    ],
    app_builder: [
      'Define app idea and MVP scope',
      'Create feature list with priorities',
      'Choose optimal tech stack',
      'Design database schema',
      'Define all API routes',
      'Plan UI pages and sections',
      'Set up authentication and payments if needed',
      'Create admin panel if required',
      'Write deployment plan',
      'Create final deliverables list',
    ],
    website_builder: [
      'Detect business type and goal',
      'Define all page sections',
      'Write compelling copy for each section',
      'Design UI layout and visual direction',
      'Generate React/Next.js code',
      'Add SEO metadata and OG tags',
      'Add contact form and CTA',
      'Add pricing section if needed',
      'Run type-check and lint',
      'Prepare Vercel deployment',
    ],
    ecommerce: [
      'Analyze product and target audience',
      'Detect pain point and hook angle',
      'Write 15-second, 30-second, and 45-second scripts',
      'Create hook → problem → demo → benefit → social proof → CTA structure',
      'Write creator/avatar prompt',
      'Create visual prompts for each section',
      'Plan voiceover and caption style',
      'Create assembly steps',
      'Add TikTok Shop link strategy',
      'Output all ad scripts and production plan',
    ],
    social_media: [
      'Detect niche, brand, and target platform',
      'Define 3-5 content pillars with percentages',
      'Generate 30-day content calendar',
      'Write hook for every post',
      'Write script for every post',
      'Write captions and hashtags',
      'Generate visual prompts',
      'Set optimal posting times per platform',
      'Create hashtag strategy',
      'Build content rules and consistency guide',
    ],
    voiceover: [
      'Read and format the script',
      'Detect language and accent requirements',
      'Choose voice style and tone',
      'Select best TTS provider',
      'Generate voiceover audio',
      'Add pacing and emphasis markers',
      'Review for pronunciation issues',
      'Export final audio file',
      'Create sync timing for video if needed',
      'Deliver final audio track',
    ],
    music_generation: [
      'Detect music genre and mood',
      'Detect tempo and key if specified',
      'Write music generation prompt',
      'Choose music generation provider',
      'Generate music track',
      'Create variations if needed',
      'Add intro and outro segments',
      'Export in required format',
      'Sync timestamps with video if needed',
      'Deliver final music track',
    ],
    research: [
      'Clarify research topic and scope',
      'Search trusted and authoritative sources',
      'Extract and verify key facts',
      'Compare multiple perspectives',
      'Score credibility of each source',
      'Create structured summary',
      'Give clear recommendation',
      'List pros, cons, and uncertainties',
      'Cite all sources',
      'Suggest next steps',
    ],
    business_strategy: [
      'Define the product or service offer',
      'Identify target customer and pain point',
      'Create pricing strategy',
      'Write sales page copy',
      'Build pitch deck outline',
      'Create buyer outreach list strategy',
      'Write cold email scripts',
      'Create social proof plan',
      'Build launch timeline',
      'Define success metrics',
    ],
    customer_support: [
      'Detect customer intent and emotion',
      'Classify issue type',
      'Search knowledge base for relevant policy',
      'Draft empathetic response',
      'Flag if refund or escalation is needed',
      'Ask approval before sending response',
      'Send response or save draft',
      'Log case summary',
      'Flag repeat issues for product feedback',
      'Close ticket or escalate',
    ],
    automation: [
      'Detect trigger event',
      'Define conditions and filters',
      'Define target action',
      'Set schedule if recurring',
      'Identify required tools and APIs',
      'Build workflow logic',
      'Add error handling and retries',
      'Add approval gate for risky actions',
      'Add notification and logging',
      'Test and activate workflow',
    ],
    document_creation: [
      'Detect document type and purpose',
      'Create detailed chapter or section outline',
      'Write full content for each section',
      'Add tables, checklists, and callouts',
      'Design cover page direction',
      'Format for PDF or DOCX export',
      'Add headers, footers, and page numbers',
      'Create mockup image prompt',
      'Export final document',
      'Create sharing or selling plan',
    ],
    email: [
      'Identify recipient and purpose',
      'Detect tone: professional, sales, follow-up, cold',
      'Draft compelling subject line',
      'Write email body with clear CTA',
      'Check spam trigger words',
      'Optimize for reply rate',
      'Ask approval before sending',
      'Send or save as draft',
      'Log sent email for follow-up tracking',
      'Schedule follow-up if no reply',
    ],
    calendar: [
      'Detect event type and participants',
      'Check availability if calendar access granted',
      'Propose meeting times',
      'Create event with title, description, and location',
      'Add video call link if needed',
      'Send invites to participants',
      'Set reminders',
      'Confirm event creation',
      'Add to follow-up task list',
      'Log event summary',
    ],
    trading: [
      'Detect asset, timeframe, and strategy type',
      'Analyze indicators and chart patterns',
      'Define entry and exit rules',
      'Define stop loss and take profit levels',
      'Set risk percentage per trade',
      'Generate code (MQL5, Pine Script, Python)',
      'Add logging and error handling to bot',
      'Create backtest instructions',
      'Warn that past results do not guarantee future profits',
      'Deliver strategy code and documentation',
    ],
    content_creation: [
      'Detect content type and platform',
      'Identify audience and tone',
      'Research topic and angle',
      'Write compelling headline or hook',
      'Write full body content',
      'Add SEO keywords naturally',
      'Add call to action',
      'Review readability and tone',
      'Format for target platform',
      'Deliver final content',
    ],
    unknown: [
      'Analyze the user request for all possible intents',
      'List the most likely interpretations',
      'Ask one targeted clarifying question',
      'Wait for user response',
      'Route to the most appropriate workflow',
    ],
  }

  private readonly INTENT_OUTPUTS: Record<AgentIntent, string[]> = {
    video_generation: ['scene_plan', 'voiceover_script', 'video_prompts', 'assembly_steps', 'final_video_mp4'],
    image_generation: ['image_variants', 'generation_prompts', 'enhanced_image', 'final_assets'],
    coding: ['implementation_plan', 'code_diff', 'type_check_result', 'test_results', 'git_commit'],
    app_builder: ['feature_list', 'db_schema', 'api_routes', 'ui_pages', 'deployment_plan'],
    website_builder: ['page_sections', 'copy', 'nextjs_code', 'seo_metadata', 'deployment_plan'],
    ecommerce: ['ugc_scripts', 'scene_prompts', 'creator_prompt', 'voiceover_plan', 'assembly_steps'],
    social_media: ['30_day_calendar', 'hooks_and_scripts', 'captions', 'hashtags', 'posting_schedule'],
    voiceover: ['voiceover_audio', 'script', 'timing_markers', 'audio_file'],
    music_generation: ['music_track', 'generation_prompt', 'audio_file', 'timing_sync'],
    research: ['summary', 'key_facts', 'comparison', 'recommendation', 'sources'],
    business_strategy: ['offer', 'sales_page_copy', 'pitch_deck', 'email_scripts', 'launch_checklist'],
    customer_support: ['response_draft', 'case_summary', 'escalation_flag', 'sent_status'],
    automation: ['workflow_config', 'trigger_rules', 'action_steps', 'notification_plan'],
    document_creation: ['document_outline', 'full_content', 'pdf_export', 'mockup_image'],
    email: ['subject_line', 'email_body', 'send_status', 'follow_up_schedule'],
    calendar: ['event_created', 'invite_sent', 'reminder_set', 'event_summary'],
    trading: ['strategy_code', 'entry_exit_rules', 'backtest_plan', 'risk_parameters'],
    content_creation: ['headline', 'full_content', 'formatted_post', 'seo_metadata'],
    unknown: ['clarification_question', 'intent_options', 'suggested_workflows'],
  }

  route(dto: RouteRequestDto): AgentActionPlan {
    const message = dto.message?.trim() ?? ''
    const lower = message.toLowerCase()
    const files = dto.uploadedFiles ?? []

    const isDoIt = this.isDoItRequest(lower)
    const detection = isDoIt && dto.previousIntent
      ? { intent: dto.previousIntent, confidence: 0.95 }
      : this.scoreIntents(lower, files)

    const { intent, confidence } = detection
    const riskLevel = this.assessRisk(intent, lower)
    const needsApproval = this.requiresApproval(riskLevel, intent, lower)
    const approvalReasons = this.buildApprovalReasons(intent, lower, riskLevel)
    const missingInputs = this.findMissingInputs(intent, lower, files)
    const fileActions = this.buildFileActions(files)

    return {
      intent,
      confidence,
      userGoal: this.buildUserGoal(intent, message, files, isDoIt),
      workflow: this.INTENT_TO_WORKFLOW[intent],
      requiredTools: this.INTENT_TOOLS[intent],
      missingInputs,
      riskLevel,
      needsApproval,
      approvalReasons,
      steps: this.INTENT_STEPS[intent],
      expectedOutput: this.INTENT_OUTPUTS[intent],
      suggestedNextAction: this.buildSuggestedNextAction(intent, needsApproval, missingInputs, confidence),
      fileActions,
      availableWorkflows: this.listAvailableWorkflows(),
    }
  }

  detectIntent(dto: DetectIntentDto): IntentDetectionResult {
    const lower = dto.message?.toLowerCase() ?? ''
    const files = dto.uploadedFiles ?? []
    const { intent, confidence, scores } = this.scoreIntentsWithAll(lower, files)

    const sorted = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(1, 4)
      .filter(([, score]) => score > 0)

    return {
      intent,
      confidence,
      reasoning: this.buildReasoning(intent, lower),
      alternativeIntents: sorted.map(([alt, score]) => ({
        intent: alt as AgentIntent,
        confidence: Math.min(0.98, 0.3 + score * 0.1),
      })),
    }
  }

  getSystemPrompt() {
    return {
      name: 'OpenAgents Master Router',
      prompt: MASTER_AGENT_SYSTEM_PROMPT,
    }
  }

  getIntents(): Array<{ intent: AgentIntent; description: string; workflow: string }> {
    return [
      { intent: 'video_generation', description: 'Create videos, TikTok content, YouTube Shorts, cinematic scenes', workflow: 'video-workflow' },
      { intent: 'image_generation', description: 'Generate images, product photos, logos, thumbnails, posters', workflow: 'image-workflow' },
      { intent: 'coding', description: 'Write code, fix bugs, build features, debug errors', workflow: 'coding-workflow' },
      { intent: 'app_builder', description: 'Build full-stack apps, SaaS, mobile apps, dashboards', workflow: 'app-builder-workflow' },
      { intent: 'website_builder', description: 'Build websites, landing pages, sales pages', workflow: 'app-builder-workflow' },
      { intent: 'ecommerce', description: 'Create UGC ads, TikTok Shop scripts, product videos', workflow: 'ugc-ad-workflow' },
      { intent: 'social_media', description: 'Create content calendars, captions, hashtag strategies', workflow: 'social-media-workflow' },
      { intent: 'voiceover', description: 'Generate AI voiceovers, text-to-speech, narration', workflow: 'video-workflow' },
      { intent: 'music_generation', description: 'Generate music, background audio, soundtracks', workflow: 'video-workflow' },
      { intent: 'research', description: 'Research topics, compare tools, find information', workflow: 'research-workflow' },
      { intent: 'business_strategy', description: 'Create business plans, launch strategies, pitches', workflow: 'business-launch-workflow' },
      { intent: 'customer_support', description: 'Reply to customers, handle complaints, support tickets', workflow: 'customer-support-workflow' },
      { intent: 'automation', description: 'Automate tasks, create workflows, set up triggers', workflow: 'automation-workflow' },
      { intent: 'document_creation', description: 'Create ebooks, guides, reports, courses, PDFs', workflow: 'document-workflow' },
      { intent: 'email', description: 'Write emails, cold outreach, follow-ups, newsletters', workflow: 'email-workflow' },
      { intent: 'calendar', description: 'Schedule meetings, create events, manage availability', workflow: 'calendar-workflow' },
      { intent: 'trading', description: 'Trading bots, Pine Script, MT5, strategy analysis', workflow: 'trading-workflow' },
      { intent: 'content_creation', description: 'Write blog posts, articles, scripts, product descriptions', workflow: 'content-workflow' },
      { intent: 'unknown', description: 'Unclear or ambiguous request — clarification needed', workflow: 'master-agent' },
    ]
  }

  getWorkflows(): WorkflowInfo[] {
    return [
      { id: 'video-workflow', name: 'Video Workflow Agent', description: 'Full video production from script to assembly', intents: ['video_generation', 'voiceover', 'music_generation'], endpoint: '/video-workflow/plan' },
      { id: 'image-workflow', name: 'Image Workflow Agent', description: 'AI image generation, product photos, logos, thumbnails', intents: ['image_generation'], endpoint: '/image-workflow/plan' },
      { id: 'app-builder-workflow', name: 'App Builder Agent', description: 'Full-stack app and website planning and code generation', intents: ['app_builder', 'website_builder'], endpoint: '/app-builder-workflow/plan' },
      { id: 'ugc-ad-workflow', name: 'UGC Ad Agent', description: 'TikTok Shop UGC ad scripts and video production plans', intents: ['ecommerce'], endpoint: '/ugc-ad-workflow/plan' },
      { id: 'social-media-workflow', name: 'Social Media Agent', description: '30-day content calendars, captions, hashtags, posting schedules', intents: ['social_media'], endpoint: '/social-media-workflow/plan' },
    ]
  }

  private scoreIntents(lower: string, files: UploadedFile[]): { intent: AgentIntent; confidence: number } {
    const { intent, confidence } = this.scoreIntentsWithAll(lower, files)
    return { intent, confidence }
  }

  private scoreIntentsWithAll(lower: string, files: UploadedFile[]): {
    intent: AgentIntent
    confidence: number
    scores: Record<string, number>
  } {
    const scores: Record<string, number> = {}

    for (const [intentKey, keywords] of Object.entries(this.INTENT_KEYWORDS)) {
      let score = 0
      for (const kw of keywords) {
        if (lower.includes(kw)) score++
      }
      scores[intentKey] = score
    }

    // File-based score boosts
    for (const file of files) {
      if (file.type === 'image') {
        scores['image_generation'] = (scores['image_generation'] ?? 0) + 3
        scores['video_generation'] = (scores['video_generation'] ?? 0) + 2
        scores['ecommerce'] = (scores['ecommerce'] ?? 0) + 2
      }
      if (file.type === 'video') {
        scores['video_generation'] = (scores['video_generation'] ?? 0) + 4
      }
      if (file.type === 'audio') {
        scores['voiceover'] = (scores['voiceover'] ?? 0) + 4
        scores['video_generation'] = (scores['video_generation'] ?? 0) + 2
      }
      if (file.type === 'pdf') {
        scores['document_creation'] = (scores['document_creation'] ?? 0) + 4
        scores['research'] = (scores['research'] ?? 0) + 2
      }
      if (file.type === 'code') {
        scores['coding'] = (scores['coding'] ?? 0) + 5
      }
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
    const topKey = sorted[0][0] as AgentIntent
    const topScore = sorted[0][1]

    const intent: AgentIntent = topScore === 0 ? 'unknown' : topKey
    const confidence = topScore === 0 ? 0.2 : Math.min(0.98, 0.3 + topScore * 0.1)

    return { intent, confidence, scores }
  }

  private isDoItRequest(lower: string): boolean {
    const doItPhrases = ['do it', 'make it', 'create it', 'build it', 'add it', 'do this',
      'go ahead', 'proceed', 'just do it', 'start it', 'run it', 'execute it', 'generate it']
    return lower.length < 30 && doItPhrases.some((phrase) => lower.trim().startsWith(phrase))
  }

  private assessRisk(intent: AgentIntent, lower: string): RiskLevel {
    if (
      intent === 'email' ||
      intent === 'customer_support' ||
      lower.includes('deploy') ||
      lower.includes('push to') ||
      lower.includes('delete') ||
      lower.includes('drop table') ||
      lower.includes('send email') ||
      lower.includes('post publicly') ||
      intent === 'trading'
    ) {
      return 'high'
    }

    if (
      intent === 'video_generation' ||
      intent === 'image_generation' ||
      intent === 'voiceover' ||
      intent === 'music_generation' ||
      intent === 'ecommerce' ||
      intent === 'automation' ||
      intent === 'calendar'
    ) {
      return 'medium'
    }

    return 'low'
  }

  private requiresApproval(riskLevel: RiskLevel, intent: AgentIntent, lower: string): boolean {
    if (riskLevel === 'high') return true
    if (riskLevel === 'medium') return true
    if (lower.includes('deploy') || lower.includes('publish') || lower.includes('send')) return true
    return false
  }

  private buildApprovalReasons(intent: AgentIntent, lower: string, riskLevel: RiskLevel): string[] {
    const reasons: string[] = []

    if (intent === 'video_generation' || intent === 'voiceover' || intent === 'music_generation') {
      reasons.push('Video and audio generation uses external API credits')
    }
    if (intent === 'image_generation') {
      reasons.push('Image generation uses external API credits')
    }
    if (intent === 'email' || lower.includes('send email')) {
      reasons.push('Sending emails is irreversible — review before sending')
    }
    if (lower.includes('deploy') || lower.includes('push to github')) {
      reasons.push('Deployment and git push affect live production systems')
    }
    if (lower.includes('delete') || lower.includes('drop')) {
      reasons.push('Deletion is irreversible — confirm before proceeding')
    }
    if (intent === 'customer_support') {
      reasons.push('Sending a customer reply is public-facing and irreversible')
    }
    if (intent === 'trading') {
      reasons.push('Trading bots can result in financial loss — review carefully')
    }
    if (intent === 'calendar') {
      reasons.push('Calendar invites are sent to external participants')
    }
    if (intent === 'automation') {
      reasons.push('Automation can trigger repeated external actions and API calls')
    }

    return reasons
  }

  private findMissingInputs(intent: AgentIntent, lower: string, files: UploadedFile[]): string[] {
    const missing: string[] = []

    if (intent === 'video_generation') {
      if (!lower.includes('product') && !lower.includes('topic') && lower.length < 15) {
        missing.push('Video topic or prompt is very short — more detail will improve output')
      }
    }

    if (intent === 'image_generation') {
      if (!lower.includes('style') && !lower.includes('photo') && !lower.includes('logo')) {
        missing.push('Image style or type not specified — will use best-effort detection')
      }
    }

    if (intent === 'ecommerce') {
      if (!lower.includes('product') && files.filter((f) => f.type === 'image').length === 0) {
        missing.push('Product name or product image recommended for UGC scripts')
      }
    }

    if (intent === 'email') {
      if (!lower.includes('to') && !lower.includes('recipient') && !lower.includes('@')) {
        missing.push('Recipient email address not specified')
      }
    }

    if (intent === 'trading') {
      if (!lower.includes('asset') && !lower.includes('gold') && !lower.includes('btc') && !lower.includes('forex')) {
        missing.push('Trading asset not specified (e.g. XAUUSD, BTCUSD, EURUSD)')
      }
    }

    if (intent === 'coding') {
      if (files.filter((f) => f.type === 'code').length === 0 && !lower.includes('error') && lower.length < 20) {
        missing.push('No code file provided — paste the relevant code or upload the file')
      }
    }

    return missing
  }

  private buildFileActions(files: UploadedFile[]): string[] {
    if (files.length === 0) return []
    const actions: string[] = []

    for (const file of files) {
      if (file.type === 'image') {
        actions.push(`Image detected (${file.filename ?? 'uploaded'}): can use for image edit, image-to-video, product ad, or thumbnail`)
      }
      if (file.type === 'video') {
        actions.push(`Video detected (${file.filename ?? 'uploaded'}): can use for clip generation, voiceover overlay, or podcast clips`)
      }
      if (file.type === 'audio') {
        actions.push(`Audio detected (${file.filename ?? 'uploaded'}): can use for transcription, clip cutting, or voiceover alignment`)
      }
      if (file.type === 'pdf') {
        actions.push(`PDF detected (${file.filename ?? 'uploaded'}): can summarize, turn into ebook sections, or create slides`)
      }
      if (file.type === 'code') {
        actions.push(`Code file detected (${file.filename ?? 'uploaded'}): can debug, explain, refactor, or extend`)
      }
      if (file.type === 'csv') {
        actions.push(`CSV detected (${file.filename ?? 'uploaded'}): can analyze data, generate charts, or import to database`)
      }
    }

    return actions
  }

  private buildUserGoal(intent: AgentIntent, message: string, files: UploadedFile[], isDoIt: boolean): string {
    if (isDoIt) return `Continue previous task: ${intent.replace(/_/g, ' ')} — executing best-effort plan from context`

    const fileNote = files.length > 0 ? ` with ${files.length} uploaded file(s)` : ''

    const goalMap: Record<AgentIntent, string> = {
      video_generation: `Create a video${fileNote}: ${message.slice(0, 100)}`,
      image_generation: `Generate an image${fileNote}: ${message.slice(0, 100)}`,
      coding: `Code task${fileNote}: ${message.slice(0, 100)}`,
      app_builder: `Build an application: ${message.slice(0, 100)}`,
      website_builder: `Build a website: ${message.slice(0, 100)}`,
      ecommerce: `Create a product/UGC ad${fileNote}: ${message.slice(0, 100)}`,
      social_media: `Create social media content: ${message.slice(0, 100)}`,
      voiceover: `Generate voiceover: ${message.slice(0, 100)}`,
      music_generation: `Generate music: ${message.slice(0, 100)}`,
      research: `Research: ${message.slice(0, 100)}`,
      business_strategy: `Business strategy: ${message.slice(0, 100)}`,
      customer_support: `Customer support: ${message.slice(0, 100)}`,
      automation: `Automate: ${message.slice(0, 100)}`,
      document_creation: `Create document: ${message.slice(0, 100)}`,
      email: `Email task: ${message.slice(0, 100)}`,
      calendar: `Calendar task: ${message.slice(0, 100)}`,
      trading: `Trading task: ${message.slice(0, 100)}`,
      content_creation: `Create content: ${message.slice(0, 100)}`,
      unknown: `Unclear request — needs clarification: ${message.slice(0, 100)}`,
    }

    return goalMap[intent]
  }

  private buildSuggestedNextAction(
    intent: AgentIntent,
    needsApproval: boolean,
    missingInputs: string[],
    confidence: number,
  ): string {
    if (missingInputs.length > 0) {
      return `Provide the missing inputs listed above to complete the plan, then I will proceed.`
    }

    if (confidence < 0.4) {
      return `I am not fully certain of your intent. Please confirm: are you asking for ${intent.replace(/_/g, ' ')}? Or describe your goal more clearly.`
    }

    if (needsApproval) {
      return `Plan is ready. Review the steps above and approve to begin execution. External API calls will only be made after your approval.`
    }

    return `Plan is ready. I can begin immediately — no external API calls required for this step.`
  }

  private buildReasoning(intent: AgentIntent, lower: string): string {
    const matchedKeywords = (this.INTENT_KEYWORDS[intent] ?? []).filter((kw) => lower.includes(kw))
    if (matchedKeywords.length === 0) return `No strong keyword matches found — classified as ${intent} by best guess.`
    return `Matched keywords for ${intent}: ${matchedKeywords.slice(0, 5).join(', ')}`
  }

  private listAvailableWorkflows(): string[] {
    return [
      'video-workflow',
      'image-workflow',
      'app-builder-workflow',
      'ugc-ad-workflow',
      'social-media-workflow',
    ]
  }
}
