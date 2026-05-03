import { Injectable } from '@nestjs/common'
import { CreateUGCAdWorkflowDto } from './ugc-ad-workflow.dto'
import { UGC_AD_WORKFLOW_SYSTEM_PROMPT } from './ugc-ad-workflow.prompt'
import type {
  UGCAdDuration,
  UGCAdIntent,
  UGCAdScript,
  UGCAdWorkflowPlan,
  UGCScriptSection,
  UGCSection,
} from './ugc-ad-workflow.types'

@Injectable()
export class UGCAdWorkflowService {
  createPlan(input: CreateUGCAdWorkflowDto): UGCAdWorkflowPlan {
    const lower = (input.prompt ?? '').toLowerCase()
    const intent = this.detectIntent(lower, input)
    const productName = input.productName
    const targetAudience = input.targetAudience ?? this.inferAudience(lower, input.productDescription)
    const usps = input.uniqueSellingPoints?.length
      ? input.uniqueSellingPoints
      : this.generateUSPs(productName, input.productDescription)
    const hook = this.generateHook(productName, intent, targetAudience)
    const creatorPrompt = this.generateCreatorPrompt(lower, input.creatorStyle)
    const durations: UGCAdDuration[] = input.durations?.length ? input.durations : [15, 30, 45]

    const scripts = durations.map((duration) =>
      this.buildScript({
        duration,
        productName,
        productDescription: input.productDescription,
        targetAudience,
        usps,
        callToAction: input.callToAction,
        language: input.language ?? 'English',
        intent,
        creatorStyle: input.creatorStyle ?? 'relatable everyday person',
      }),
    )

    return {
      intent,
      productName,
      productDescription: input.productDescription ?? '',
      targetAudience,
      uniqueSellingPoints: usps,
      hook,
      creatorPrompt,
      voiceoverStyle: this.voiceoverStyle(lower),
      captionStyle: 'Bold white text, black stroke, centered, 80% screen width',
      scripts,
      assemblySteps: this.buildAssemblySteps(scripts),
      finalDeliverables: [
        `${durations.length} UGC ad scripts (${durations.join('s, ')}s)`,
        'Scene-by-scene visual prompts',
        'Creator prompt for AI avatar or human creator brief',
        'Voiceover script for each ad length',
        'Caption text for each scene',
        'Assembly steps for video production',
      ],
      missingInputs: this.findMissingInputs(input),
    }
  }

  getSystemPrompt() {
    return {
      name: 'OpenAgents UGC Ad Workflow Agent',
      prompt: UGC_AD_WORKFLOW_SYSTEM_PROMPT,
    }
  }

  getCapabilities() {
    return {
      intents: ['product_ugc_script', 'ugc_video_prompt', 'tiktok_shop_ad', 'affiliate_product_video', 'bof_conversion_ad'],
      durations: [15, 30, 45, 60],
      sections: ['hook', 'problem', 'product_demo', 'benefit', 'social_proof', 'cta'],
      formats: ['tiktok_shop', 'instagram_reels', 'youtube_shorts', 'meta_ads'],
    }
  }

  private detectIntent(lower: string, input: CreateUGCAdWorkflowDto): UGCAdIntent {
    if (input.intent) return input.intent
    if (lower.includes('tiktok shop') || input.platform === 'tiktok_shop') return 'tiktok_shop_ad'
    if (lower.includes('affiliate') || lower.includes('commission')) return 'affiliate_product_video'
    if (lower.includes('conversion') || lower.includes('bof') || lower.includes('retarget')) return 'bof_conversion_ad'
    if (lower.includes('ugc') || lower.includes('user generated') || lower.includes('creator')) return 'product_ugc_script'
    return 'tiktok_shop_ad'
  }

  private inferAudience(lower: string, description?: string): string {
    const desc = description?.toLowerCase() ?? ''
    if (lower.includes('women') || desc.includes('women')) return 'Women aged 18-35'
    if (lower.includes('men') || desc.includes('men')) return 'Men aged 18-35'
    if (lower.includes('fitness') || desc.includes('fitness')) return 'Fitness enthusiasts aged 18-40'
    if (lower.includes('beauty') || desc.includes('beauty')) return 'Beauty-conscious women aged 18-40'
    if (lower.includes('wellness') || desc.includes('wellness')) return 'Health-conscious adults aged 25-45'
    if (lower.includes('business') || lower.includes('entrepreneur')) return 'Entrepreneurs and business owners aged 25-45'
    return 'Adults aged 18-45 interested in this product category'
  }

  private generateUSPs(productName: string, description?: string): string[] {
    if (description) {
      return [
        `${productName} delivers fast, visible results`,
        'Easy to use in your daily routine',
        'Trusted by thousands of happy customers',
        'Risk-free with satisfaction guarantee',
      ]
    }
    return [
      'Works faster than alternatives',
      'Easy and convenient to use',
      'Backed by customer reviews',
      'Available now on TikTok Shop',
    ]
  }

  private generateHook(productName: string, intent: UGCAdIntent, audience: string): string {
    if (intent === 'tiktok_shop_ad') return `POV: You finally try ${productName} and can't believe you waited this long.`
    if (intent === 'bof_conversion_ad') return `Still on the fence about ${productName}? Let me change your mind in 30 seconds.`
    if (intent === 'affiliate_product_video') return `I found this on TikTok and immediately ordered it — ${productName} review.`
    return `I have been using ${productName} for 30 days. Here is what actually happened.`
  }

  private generateCreatorPrompt(lower: string, style?: string): string {
    const base = style ?? 'relatable everyday person, casual clothing, home setting'
    if (lower.includes('luxury')) return `Aspirational creator, clean minimal home, elegant casual style, confident tone — ${base}`
    if (lower.includes('fitness')) return `Fit energetic creator in workout clothes, gym or home gym background — ${base}`
    if (lower.includes('beauty')) return `Beauty creator, well-lit ring light setup, makeup or skincare on vanity — ${base}`
    if (lower.includes('mom') || lower.includes('parent')) return `Relatable parent creator, warm home kitchen or living room, approachable energy — ${base}`
    return `Authentic UGC creator, natural home lighting, speaks directly to camera, ${base}`
  }

  private voiceoverStyle(lower: string): string {
    if (lower.includes('luxury')) return 'Premium, confident, slow pace, aspirational'
    if (lower.includes('funny') || lower.includes('humor')) return 'Playful, energetic, fast, entertaining'
    if (lower.includes('serious') || lower.includes('medical')) return 'Calm, trustworthy, clear, factual'
    return 'Authentic, conversational, relatable, natural pacing'
  }

  private buildScript(args: {
    duration: UGCAdDuration
    productName: string
    productDescription?: string
    targetAudience: string
    usps: string[]
    callToAction?: string
    language: string
    intent: UGCAdIntent
    creatorStyle: string
  }): UGCAdScript {
    const cta = args.callToAction ?? `Order ${args.productName} now — TikTok Shop link below.`
    const sections = this.buildSections(args, cta)
    const script = sections.map((s) => s.script).join(' ')

    return {
      duration: args.duration,
      sections,
      totalWordCount: script.split(' ').length,
      voiceoverPacing: args.duration <= 20 ? 'fast' : 'normal',
      creatorStyle: args.creatorStyle,
      hook: sections[0]?.script ?? '',
    }
  }

  private buildSections(
    args: {
      duration: UGCAdDuration
      productName: string
      productDescription?: string
      targetAudience: string
      usps: string[]
      callToAction?: string
      language: string
      intent: UGCAdIntent
      creatorStyle: string
    },
    cta: string,
  ): UGCScriptSection[] {
    const { duration, productName, usps, language } = args
    const isSpanish = language === 'Spanish'

    const sectionOrder: UGCSection[] =
      duration === 15
        ? ['hook', 'product_demo', 'cta']
        : duration === 30
          ? ['hook', 'problem', 'product_demo', 'benefit', 'cta']
          : ['hook', 'problem', 'product_demo', 'benefit', 'social_proof', 'cta']

    const durationMap: Record<UGCSection, number> = {
      hook: duration === 15 ? 4 : duration === 30 ? 5 : 6,
      problem: duration === 30 ? 5 : 7,
      product_demo: duration === 15 ? 7 : duration === 30 ? 10 : 12,
      benefit: duration === 30 ? 5 : 8,
      social_proof: 7,
      cta: duration === 15 ? 4 : 5,
    }

    return sectionOrder.map((section) => ({
      section,
      durationSeconds: durationMap[section] ?? 5,
      script: this.sectionScript(section, productName, usps, cta, isSpanish, args.intent),
      visualPrompt: this.sectionVisualPrompt(section, productName, args.creatorStyle),
      onScreenText: this.sectionOnScreenText(section, productName),
      emotion: this.sectionEmotion(section),
      creatorAction: this.sectionCreatorAction(section, productName),
    }))
  }

  private sectionScript(
    section: UGCSection,
    productName: string,
    usps: string[],
    cta: string,
    isSpanish: boolean,
    intent: UGCAdIntent,
  ): string {
    if (isSpanish) {
      const es: Record<UGCSection, string> = {
        hook: `Si todavía no has probado ${productName}, mira esto antes de irte.`,
        problem: `Yo llevaba meses buscando algo que funcionara de verdad para este problema.`,
        product_demo: `Cuando encontré ${productName}, lo probé así. ${usps[0] ?? 'Los resultados fueron increíbles'}.`,
        benefit: `${usps[1] ?? 'Es fácil de usar'} y ${usps[2] ?? 'los resultados se notan rápido'}.`,
        social_proof: `Miles de personas ya lo están usando. Las reseñas hablan por sí solas.`,
        cta: `Tócalo en TikTok Shop y ordénalo ahora antes de que se agote.`,
      }
      return es[section]
    }

    const en: Record<UGCSection, string> = {
      hook: `Wait — if you have not tried ${productName} yet, you need to watch this.`,
      problem: `I was struggling with this for months and nothing I tried was actually working.`,
      product_demo: `Then I found ${productName}. I tried it like this. ${usps[0] ?? 'And the difference was immediate'}.`,
      benefit: `${usps[1] ?? 'It is so easy to use'} and ${usps[2] ?? 'results show up fast'}.`,
      social_proof: `Thousands of people are already using it. The reviews speak for themselves.`,
      cta,
    }
    return en[section]
  }

  private sectionVisualPrompt(section: UGCSection, productName: string, creatorStyle: string): string {
    const map: Record<UGCSection, string> = {
      hook: `Creator looks directly into camera with surprised/excited expression, ${creatorStyle}, holds ${productName} visible, 9:16 TikTok framing`,
      problem: `Creator shows relatable frustrated expression, natural setting, no product visible yet, authentic moment`,
      product_demo: `Close-up hands using ${productName}, smooth motion, clean surface, product clearly visible, satisfying action`,
      benefit: `Creator smiles holding ${productName}, good lighting, positive body language, before/after text overlay`,
      social_proof: `Screen recording of reviews or creator showing phone with ratings, authentic feel`,
      cta: `Creator points at camera or screen with confident smile, ${productName} in hand, TikTok Shop icon or text overlay visible`,
    }
    return map[section]
  }

  private sectionOnScreenText(section: UGCSection, productName: string): string {
    const map: Record<UGCSection, string> = {
      hook: `POV: You finally try ${productName}`,
      problem: 'Nothing was working...',
      product_demo: 'Watch this',
      benefit: 'The results',
      social_proof: 'Thousands of happy customers',
      cta: 'Order now — TikTok Shop',
    }
    return map[section]
  }

  private sectionEmotion(section: UGCSection): string {
    const map: Record<UGCSection, string> = {
      hook: 'Excited, urgent, attention-grabbing',
      problem: 'Relatable, empathetic, honest',
      product_demo: 'Focused, satisfying, clear',
      benefit: 'Positive, confident, enthusiastic',
      social_proof: 'Trustworthy, calm, credible',
      cta: 'Urgent, friendly, direct',
    }
    return map[section]
  }

  private sectionCreatorAction(section: UGCSection, productName: string): string {
    const map: Record<UGCSection, string> = {
      hook: `Hold ${productName} up toward camera, make eye contact, big reaction`,
      problem: 'Gesture with hands to show frustration or searching, look relatable',
      product_demo: `Demonstrate ${productName} use clearly, show hands, show result`,
      benefit: 'Point to key benefit text on screen, smile, nod',
      social_proof: 'Show phone with reviews or point to review text overlay',
      cta: 'Point down at TikTok Shop link, smile confidently',
    }
    return map[section]
  }

  private buildAssemblySteps(scripts: UGCAdScript[]): string[] {
    return [
      'Record or generate creator footage for each section',
      'Record or generate voiceover from script',
      'Sync voiceover timing to video sections',
      'Add caption text overlays using CapCut or Descript',
      'Add trending TikTok audio under voiceover at low volume',
      'Add transitions between sections (cut or simple fade)',
      'Add product close-up B-roll between sections',
      'Export at 1080x1920 (9:16) for TikTok, Reels, Shorts',
      'Add TikTok Shop product link tag',
      `Create ${scripts.length} versions: ${scripts.map((s) => s.duration + 's').join(', ')}`,
    ]
  }

  private findMissingInputs(input: CreateUGCAdWorkflowDto): string[] {
    const missing: string[] = []
    if (!input.productName) missing.push('Product name is required for UGC scripts.')
    if (!input.productDescription) missing.push('Product description recommended for stronger scripts.')
    if (!input.callToAction) missing.push('Custom call-to-action recommended for better conversion.')
    return missing
  }
}
