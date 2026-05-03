import { Injectable } from '@nestjs/common'
import { CreateSocialMediaWorkflowDto } from './social-media-workflow.dto'
import { SOCIAL_MEDIA_WORKFLOW_SYSTEM_PROMPT } from './social-media-workflow.prompt'
import type {
  CalendarEntry,
  ContentFormat,
  ContentPillar,
  ContentType,
  SocialMediaWorkflowPlan,
  SocialPlatform,
} from './social-media-workflow.types'

@Injectable()
export class SocialMediaWorkflowService {
  createPlan(input: CreateSocialMediaWorkflowDto): SocialMediaWorkflowPlan {
    const lower = input.niche.toLowerCase()
    const platforms: SocialPlatform[] = input.platforms?.length ? input.platforms : this.defaultPlatforms(lower)
    const totalDays = input.totalDays ?? 30
    const postsPerDay = input.postsPerDay ?? 1
    const pillars = input.pillars?.map((p, i) => ({
      name: p,
      description: p,
      percentage: ([40, 30, 20, 10] as number[])[i] ?? 10,
    })) ?? this.defaultPillars(input.niche)

    const calendar = this.buildCalendar({
      niche: input.niche,
      brand: input.brand ?? input.niche,
      platforms,
      pillars,
      totalDays,
      postsPerDay,
      productName: input.productName,
      callToAction: input.callToAction,
      language: input.language ?? 'English',
    })

    return {
      niche: input.niche,
      brand: input.brand ?? input.niche,
      platforms,
      pillars,
      totalDays,
      postsPerDay,
      totalPosts: calendar.length,
      calendar,
      hashtagStrategy: this.buildHashtagStrategy(input.niche, platforms),
      postingTimes: this.buildPostingTimes(platforms),
      contentRules: this.buildContentRules(input.niche),
      finalDeliverables: [
        `${totalDays}-day content calendar`,
        'Script for every post',
        'Visual prompts for every post',
        'Captions and hashtags',
        'Posting time schedule',
        'Hashtag strategy',
      ],
      missingInputs: this.findMissingInputs(input),
    }
  }

  getSystemPrompt() {
    return {
      name: 'OpenAgents Social Media Content Agent',
      prompt: SOCIAL_MEDIA_WORKFLOW_SYSTEM_PROMPT,
    }
  }

  getCapabilities() {
    return {
      platforms: ['tiktok', 'instagram', 'youtube', 'twitter', 'linkedin', 'facebook', 'threads'],
      contentTypes: ['educational', 'storytelling', 'controversial', 'product_demo', 'behind_the_scenes', 'testimonial', 'call_to_action', 'trending_audio', 'q_and_a', 'transformation'],
      formats: ['short_video', 'long_video', 'image_post', 'carousel', 'story', 'live', 'thread'],
    }
  }

  private defaultPlatforms(lower: string): SocialPlatform[] {
    if (lower.includes('linkedin') || lower.includes('b2b')) return ['linkedin', 'twitter']
    if (lower.includes('youtube')) return ['youtube', 'instagram']
    return ['tiktok', 'instagram']
  }

  private defaultPillars(niche: string): ContentPillar[] {
    return [
      { name: `${niche} tips`, description: `Educational tips about ${niche}`, percentage: 40 },
      { name: 'My journey', description: 'Behind-the-scenes and personal stories', percentage: 30 },
      { name: 'Product spotlight', description: 'Product demos and promotions', percentage: 20 },
      { name: 'Social proof', description: 'Testimonials and results', percentage: 10 },
    ]
  }

  private buildCalendar(args: {
    niche: string
    brand: string
    platforms: SocialPlatform[]
    pillars: ContentPillar[]
    totalDays: number
    postsPerDay: number
    productName?: string
    callToAction?: string
    language: string
  }): CalendarEntry[] {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const contentTypes: ContentType[] = [
      'educational', 'storytelling', 'product_demo', 'educational', 'call_to_action',
      'behind_the_scenes', 'testimonial', 'educational', 'controversial', 'q_and_a',
    ]
    const entries: CalendarEntry[] = []

    for (let day = 1; day <= args.totalDays; day++) {
      const dayOfWeek = days[(day - 1) % 7]
      const platform = args.platforms[(day - 1) % args.platforms.length]
      const contentType = contentTypes[(day - 1) % contentTypes.length]
      const pillar = args.pillars[(day - 1) % args.pillars.length]
      const format = this.pickFormat(platform, contentType)

      entries.push({
        day,
        dayOfWeek,
        platform,
        contentType,
        format,
        pillar: pillar.name,
        hook: this.generateHook(args.niche, contentType, args.productName),
        script: this.generateScript(args.niche, contentType, pillar.name, args.productName, args.callToAction),
        visualPrompt: this.generateVisualPrompt(args.niche, contentType, platform),
        caption: this.generateCaption(args.niche, contentType, args.brand, args.callToAction),
        hashtags: this.generateHashtags(args.niche, contentType, platform),
        callToAction: args.callToAction ?? this.defaultCTA(contentType, args.productName),
        estimatedReach: this.estimateReach(platform, contentType),
      })
    }

    return entries
  }

  private pickFormat(platform: SocialPlatform, contentType: ContentType): ContentFormat {
    if (platform === 'tiktok') return 'short_video'
    if (platform === 'instagram' && contentType === 'educational') return 'carousel'
    if (platform === 'instagram') return 'short_video'
    if (platform === 'youtube') return contentType === 'educational' ? 'long_video' : 'short_video'
    if (platform === 'twitter' || platform === 'threads') return 'thread'
    if (platform === 'linkedin') return contentType === 'storytelling' ? 'thread' : 'image_post'
    return 'image_post'
  }

  private generateHook(niche: string, contentType: ContentType, productName?: string): string {
    const hooks: Record<ContentType, string> = {
      educational: `The number one mistake people make with ${niche} that nobody talks about.`,
      storytelling: `I almost quit ${niche} — until this happened.`,
      controversial: `Unpopular opinion: most ${niche} advice is wrong.`,
      product_demo: `This ${productName ?? niche + ' product'} changed my entire routine.`,
      behind_the_scenes: `What a real day in my ${niche} business looks like.`,
      testimonial: `They said it was impossible. Here are their results.`,
      call_to_action: `If you want to grow in ${niche}, watch this first.`,
      trending_audio: `Using this trend to explain ${niche} — and it works.`,
      q_and_a: `You asked me about ${niche}. Here is the honest truth.`,
      transformation: `From zero to results in ${niche}. Here is how.`,
    }
    return hooks[contentType] ?? `Watch this if you care about ${niche}.`
  }

  private generateScript(
    niche: string,
    contentType: ContentType,
    pillar: string,
    productName?: string,
    cta?: string,
  ): string {
    const ctaLine = cta ?? `Follow for more ${niche} content.`
    if (contentType === 'educational') {
      return `Hook: Today I am sharing the top thing you need to know about ${pillar}. Here is what most people get wrong. [Key insight 1]. [Key insight 2]. [Key insight 3]. This changed how I approach ${niche} completely. ${ctaLine}`
    }
    if (contentType === 'product_demo') {
      return `Hook: Watch me use ${productName ?? 'this product'} in real time. Step one: [action]. Step two: [action]. The result: [outcome]. This is why I use it every day for my ${niche} work. ${ctaLine}`
    }
    if (contentType === 'storytelling') {
      return `Hook: Let me tell you what happened when I first started with ${niche}. I had no idea what I was doing. I made every mistake possible. Then I discovered [key turning point]. Now I [result]. If you are just starting out, here is what I wish I knew. ${ctaLine}`
    }
    if (contentType === 'call_to_action') {
      return `Hook: If you have been struggling with ${niche}, this is for you. The solution is simpler than you think. [Core value point]. Start with this one thing. The rest will follow. ${ctaLine}`
    }
    return `Hook: Here is something about ${niche} that actually works. [Main point 1]. [Main point 2]. [Main point 3]. Save this for later. ${ctaLine}`
  }

  private generateVisualPrompt(niche: string, contentType: ContentType, platform: SocialPlatform): string {
    const ratio = platform === 'tiktok' || platform === 'instagram' ? '9:16 vertical' : '16:9 horizontal'
    if (contentType === 'educational') return `Clean talking-head ${ratio} video, creator speaks directly to camera, bright natural lighting, minimal background with subtle ${niche} props, text overlay highlights key points`
    if (contentType === 'product_demo') return `Close-up ${ratio} product demonstration, hands-on use, clean surface, natural soft lighting, clear product visibility, satisfying motion`
    if (contentType === 'behind_the_scenes') return `Authentic ${ratio} workspace or process shot, natural lighting, real environment, creator is active and engaged`
    return `Professional ${ratio} content shot for ${niche}, creator faces camera, good lighting, minimal clean background, engaging body language`
  }

  private generateCaption(niche: string, contentType: ContentType, brand: string, cta?: string): string {
    const follow = `Follow @${brand.toLowerCase().replace(/\s/g, '')} for daily ${niche} content.`
    const ctaText = cta ?? follow
    if (contentType === 'educational') return `Everything you need to know about this ${niche} strategy. Save this post. Share it with someone who needs it. ${ctaText}`
    if (contentType === 'product_demo') return `Real results. Real product. No filters. This is what consistency in ${niche} looks like. ${ctaText}`
    return `Dropping value for anyone serious about ${niche}. Drop a comment if this helps. ${ctaText}`
  }

  private generateHashtags(niche: string, contentType: ContentType, platform: SocialPlatform): string[] {
    const nicheTag = `#${niche.replace(/\s/g, '').toLowerCase()}`
    const base = [nicheTag, '#contentcreator', '#growyourbusiness']
    if (platform === 'tiktok') return [...base, '#tiktok', '#tiktoktips', '#viral', '#fyp', '#foryou']
    if (platform === 'instagram') return [...base, '#instagram', '#reels', '#instagrammarketing', '#contentmarketing']
    if (platform === 'linkedin') return [...base, '#linkedin', '#entrepreneurship', '#business', '#growth']
    return [...base, '#socialmedia', '#marketing', '#digitalmarketing']
  }

  private defaultCTA(contentType: ContentType, productName?: string): string {
    if (contentType === 'call_to_action' || contentType === 'product_demo') {
      return productName ? `Order ${productName} now — link in bio.` : 'Click the link in bio.'
    }
    return 'Follow for more content like this.'
  }

  private estimateReach(platform: SocialPlatform, contentType: ContentType): string {
    if (platform === 'tiktok' && contentType === 'educational') return '5k–50k views organic'
    if (platform === 'tiktok') return '2k–20k views organic'
    if (platform === 'instagram' && contentType === 'educational') return '500–5k reach'
    if (platform === 'instagram') return '300–3k reach'
    if (platform === 'linkedin') return '1k–10k impressions'
    return '200–2k reach'
  }

  private buildHashtagStrategy(niche: string, platforms: SocialPlatform[]): string[] {
    const nicheTag = niche.replace(/\s/g, '').toLowerCase()
    return [
      `#${nicheTag} — core niche tag, always include`,
      '#fyp, #foryou — TikTok discovery tags',
      '#reels, #explore — Instagram discovery tags',
      'Mix 3 large (1M+), 3 medium (100k–1M), 3 small (10k–100k) hashtags per post',
      'Create a branded hashtag for your community',
      'Avoid banned or overused hashtags that suppress reach',
    ]
  }

  private buildPostingTimes(platforms: SocialPlatform[]): Record<SocialPlatform, string> {
    const times: Partial<Record<SocialPlatform, string>> = {}
    for (const p of platforms) {
      times[p] = this.optimalPostingTime(p)
    }
    return times as Record<SocialPlatform, string>
  }

  private optimalPostingTime(platform: SocialPlatform): string {
    const map: Record<SocialPlatform, string> = {
      tiktok: '7am–9am or 7pm–9pm local time',
      instagram: '8am–10am or 6pm–8pm local time',
      youtube: '2pm–4pm on weekdays',
      twitter: '8am–10am or 12pm–1pm weekdays',
      linkedin: '7am–9am Tuesday–Thursday',
      facebook: '1pm–3pm Wednesday–Friday',
      threads: '10am–12pm or 6pm–8pm',
    }
    return map[platform]
  }

  private buildContentRules(niche: string): string[] {
    return [
      `Every post must relate to ${niche} — no random off-topic content`,
      'Hook must be in the first 1-3 seconds for video, first line for text',
      'Always include one clear CTA per post',
      'Batch-create content weekly to stay consistent',
      'Repurpose top-performing posts across platforms',
      'Engage with comments within the first 60 minutes of posting',
      'Never post just to post — every post should deliver value or a result',
    ]
  }

  private findMissingInputs(input: CreateSocialMediaWorkflowDto): string[] {
    const missing: string[] = []
    if (!input.niche?.trim()) missing.push('Niche is required.')
    if (!input.brand) missing.push('Brand name recommended for captions and hashtags.')
    return missing
  }
}
