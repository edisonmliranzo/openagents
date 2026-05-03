import { Injectable } from '@nestjs/common'
import { CreateVideoWorkflowDto } from './video-workflow.dto'
import { VIDEO_WORKFLOW_AGENT_SYSTEM_PROMPT } from './video-workflow.prompt'
import type {
  VideoAspectRatio,
  VideoAssemblyStep,
  VideoProvider,
  VideoScenePlan,
  VideoWorkflowIntent,
  VideoWorkflowPlan,
} from './video-workflow.types'

@Injectable()
export class VideoWorkflowService {
  createPlan(input: CreateVideoWorkflowDto): VideoWorkflowPlan {
    const prompt = input.prompt.trim()
    const lower = prompt.toLowerCase()

    const intent = this.detectIntent(lower, input)
    const targetPlatform = input.targetPlatform ?? this.detectPlatform(lower)
    const aspectRatio = input.aspectRatio ?? this.defaultAspectRatio(targetPlatform)
    const totalDurationSeconds = input.durationSeconds ?? this.defaultDuration(intent, targetPlatform)
    const style = input.style ?? this.detectStyle(lower)
    const sceneCount = this.sceneCount(totalDurationSeconds)
    const provider = this.pickVideoProvider(lower, intent)
    const voiceoverEnabled = this.needsVoiceover(lower, intent)

    const scenes = this.buildScenes({
      prompt,
      lower,
      intent,
      provider,
      sceneCount,
      totalDurationSeconds,
      productName: input.productName,
      productDescription: input.productDescription,
      callToAction: input.callToAction,
      language: input.language ?? this.detectLanguage(lower),
      assets: input.assets ?? [],
    })

    const voiceoverScript = scenes
      .map((scene) => scene.voiceoverLine)
      .filter(Boolean)
      .join(' ')

    const assemblySteps = this.buildAssemblySteps({
      intent,
      provider,
      aspectRatio,
      scenes,
      voiceoverEnabled,
      assetsCount: input.assets?.length ?? 0,
    })

    return {
      intent,
      title: this.buildTitle(intent, input.productName),
      summary: this.buildSummary(intent, targetPlatform, totalDurationSeconds, style),
      aspectRatio,
      totalDurationSeconds,
      style,
      targetPlatform,
      sourceAssets: input.assets ?? [],
      scenes,
      voiceover: {
        enabled: voiceoverEnabled,
        language: input.language ?? this.detectLanguage(lower),
        tone: this.detectVoiceTone(lower),
        voiceProvider: 'elevenlabs',
        script: voiceoverScript,
        pacing: totalDurationSeconds <= 20 ? 'fast' : 'normal',
      },
      assemblySteps,
      finalDeliverables: [
        `Final ${aspectRatio} MP4 video`,
        'Scene-by-scene source prompts',
        voiceoverEnabled ? 'Voiceover audio track' : 'No voiceover track requested',
        'Caption-ready script',
        'Editable production workflow JSON',
      ],
      safetyNotes: [
        'External API calls should require user approval before spending credits.',
        'Uploaded user images should be used only with user permission.',
        'Final rendering should run through a safe worker or FFmpeg sandbox.',
      ],
      missingInputs: this.findMissingInputs(intent, input),
    }
  }

  getSystemPrompt() {
    return {
      name: 'OpenAgents Video Workflow Agent',
      prompt: VIDEO_WORKFLOW_AGENT_SYSTEM_PROMPT,
    }
  }

  getCapabilities() {
    return {
      intents: [
        'text_to_video',
        'image_to_video',
        'product_ugc_video',
        'story_video',
        'voiceover_video',
        'music_video',
        'shorts_pack',
      ],
      providers: [
        'seedance',
        'kling',
        'runway',
        'pika',
        'luma',
        'veo',
        'sora',
        'atlascloud',
        'openai',
        'elevenlabs',
        'ffmpeg',
        'custom_api',
      ],
      outputs: [
        'scene plan',
        'video prompts',
        'image-to-video prompts',
        'voiceover script',
        'assembly steps',
        'final render plan',
      ],
    }
  }

  private detectIntent(lower: string, input: CreateVideoWorkflowDto): VideoWorkflowIntent {
    const hasImages = input.assets?.some((asset) => asset.type === 'image')
    if (hasImages || lower.includes('image to video') || lower.includes('images to video') || lower.includes('turn this image into video')) {
      return 'image_to_video'
    }

    if (
      lower.includes('tiktok shop') ||
      lower.includes('ugc') ||
      lower.includes('product video') ||
      lower.includes('sell this product') ||
      lower.includes('ad video')
    ) {
      return 'product_ugc_video'
    }

    if (lower.includes('voice over') || lower.includes('voiceover') || lower.includes('narration')) {
      return 'voiceover_video'
    }

    if (lower.includes('youtube shorts') || lower.includes('shorts pack') || lower.includes('reels pack')) {
      return 'shorts_pack'
    }

    if (lower.includes('music video') || lower.includes('song video')) {
      return 'music_video'
    }

    if (lower.includes('story') || lower.includes('episode') || lower.includes('scene')) {
      return 'story_video'
    }

    if (lower.includes('video') || lower.includes('cinematic')) {
      return 'text_to_video'
    }

    return 'unknown'
  }

  private detectPlatform(lower: string): VideoWorkflowPlan['targetPlatform'] {
    if (lower.includes('tiktok')) return 'tiktok'
    if (lower.includes('shorts')) return 'youtube_shorts'
    if (lower.includes('reels') || lower.includes('instagram')) return 'instagram_reels'
    if (lower.includes('youtube')) return 'youtube'
    if (lower.includes('ad') || lower.includes('ads')) return 'ads'
    return 'general'
  }

  private defaultAspectRatio(platform: VideoWorkflowPlan['targetPlatform']): VideoAspectRatio {
    if (platform === 'tiktok' || platform === 'youtube_shorts' || platform === 'instagram_reels') return '9:16'
    if (platform === 'youtube') return '16:9'
    if (platform === 'ads') return '9:16'
    return '9:16'
  }

  private defaultDuration(intent: VideoWorkflowIntent, platform: VideoWorkflowPlan['targetPlatform']) {
    if (intent === 'product_ugc_video') return 15
    if (platform === 'tiktok' || platform === 'youtube_shorts' || platform === 'instagram_reels') return 20
    if (intent === 'story_video') return 60
    return 15
  }

  private detectStyle(lower: string) {
    if (lower.includes('cinematic')) return 'cinematic realistic'
    if (lower.includes('ugc')) return 'realistic UGC handheld social video'
    if (lower.includes('movie')) return 'movie-style cinematic'
    if (lower.includes('anime')) return 'anime inspired'
    if (lower.includes('cartoon')) return 'stylized cartoon'
    if (lower.includes('luxury')) return 'luxury commercial'
    return 'realistic cinematic social video'
  }

  private pickVideoProvider(lower: string, intent: VideoWorkflowIntent): VideoProvider {
    if (lower.includes('seedance')) return 'seedance'
    if (lower.includes('kling')) return 'kling'
    if (lower.includes('runway')) return 'runway'
    if (lower.includes('veo')) return 'veo'
    if (lower.includes('sora')) return 'sora'
    if (intent === 'image_to_video') return 'kling'
    if (intent === 'product_ugc_video') return 'seedance'
    return 'seedance'
  }

  private needsVoiceover(lower: string, intent: VideoWorkflowIntent) {
    if (lower.includes('no voice') || lower.includes('no voiceover') || lower.includes('without voice')) return false
    if (intent === 'voiceover_video' || intent === 'product_ugc_video' || intent === 'story_video' || intent === 'shorts_pack') return true
    return lower.includes('voice') || lower.includes('narration') || lower.includes('script')
  }

  private detectLanguage(lower: string) {
    if (lower.includes('spanish') || lower.includes('español') || lower.includes('espanol')) return 'Spanish'
    return 'English'
  }

  private detectVoiceTone(lower: string) {
    if (lower.includes('dramatic')) return 'dramatic and emotional'
    if (lower.includes('funny')) return 'funny and energetic'
    if (lower.includes('luxury')) return 'premium and confident'
    if (lower.includes('sales') || lower.includes('sell')) return 'persuasive UGC sales tone'
    return 'natural, clear, and engaging'
  }

  private sceneCount(totalDurationSeconds: number) {
    if (totalDurationSeconds <= 10) return 2
    if (totalDurationSeconds <= 15) return 3
    if (totalDurationSeconds <= 30) return 5
    if (totalDurationSeconds <= 60) return 8
    return 10
  }

  private buildScenes(args: {
    prompt: string
    lower: string
    intent: VideoWorkflowIntent
    provider: VideoProvider
    sceneCount: number
    totalDurationSeconds: number
    productName?: string
    productDescription?: string
    callToAction?: string
    language: string
    assets: any[]
  }): VideoScenePlan[] {
    const durationPerScene = Math.max(3, Math.round(args.totalDurationSeconds / args.sceneCount))
    const negativePrompt =
      'no distorted faces, no extra fingers, no warped hands, no unreadable text, no watermark, no logo distortion, no low-quality anatomy'

    const scenes: VideoScenePlan[] = []

    for (let index = 0; index < args.sceneCount; index++) {
      const sceneNumber = index + 1
      const isFirst = sceneNumber === 1
      const isLast = sceneNumber === args.sceneCount

      const voiceoverLine = this.defaultVoiceoverLine({
        intent: args.intent,
        sceneNumber,
        isFirst,
        isLast,
        productName: args.productName,
        productDescription: args.productDescription,
        callToAction: args.callToAction,
        language: args.language,
      })

      scenes.push({
        sceneNumber,
        durationSeconds: durationPerScene,
        visualPrompt: this.defaultVisualPrompt({
          basePrompt: args.prompt,
          intent: args.intent,
          sceneNumber,
          isFirst,
          isLast,
          productName: args.productName,
          productDescription: args.productDescription,
          hasAssets: args.assets.length > 0,
        }),
        motionPrompt: this.defaultMotionPrompt(sceneNumber, isFirst, isLast),
        cameraPrompt: this.defaultCameraPrompt(sceneNumber, args.intent),
        voiceoverLine,
        onScreenText: this.defaultOnScreenText(args.intent, isFirst, isLast, args.productName),
        negativePrompt,
        requiredAssets: args.assets.map((asset, assetIndex) => asset.id ?? asset.filename ?? `asset_${assetIndex + 1}`),
        providerHint: args.provider,
      })
    }

    return scenes
  }

  private defaultVisualPrompt(args: {
    basePrompt: string
    intent: VideoWorkflowIntent
    sceneNumber: number
    isFirst: boolean
    isLast: boolean
    productName?: string
    productDescription?: string
    hasAssets: boolean
  }) {
    if (args.intent === 'product_ugc_video') {
      if (args.isFirst) {
        return `A realistic TikTok UGC creator looking directly at the camera, holding or showing ${args.productName ?? 'the product'}, natural home lighting, authentic social media style, strong hook moment. Product details: ${args.productDescription ?? args.basePrompt}`
      }

      if (args.isLast) {
        return `Close-up of ${args.productName ?? 'the product'} being used with satisfying results, creator smiles confidently at camera, clear TikTok Shop sales ending, realistic handheld video.`
      }

      return `Realistic UGC product demonstration scene for ${args.productName ?? 'the product'}, creator uses the product naturally, close-up details, believable lifestyle setting, social proof feeling.`
    }

    if (args.intent === 'image_to_video') {
      return `Animate the provided image into a cinematic realistic video scene. Preserve the original subject identity, clothing, face, and composition. Add natural motion, subtle camera movement, realistic depth, and cinematic lighting. Scene ${args.sceneNumber}.`
    }

    if (args.intent === 'story_video') {
      return `Cinematic story scene ${args.sceneNumber}: ${args.basePrompt}. Emotional visual storytelling, realistic characters, strong atmosphere, film-quality lighting.`
    }

    return `Cinematic realistic video scene ${args.sceneNumber}: ${args.basePrompt}. High-quality lighting, natural movement, detailed environment, production-ready composition.`
  }

  private defaultMotionPrompt(sceneNumber: number, isFirst: boolean, isLast: boolean) {
    if (isFirst) return 'slow push-in, subject begins with strong attention-grabbing movement, natural realistic motion'
    if (isLast) return 'smooth final push-in, confident ending pose, clean motion, no abrupt cuts'
    if (sceneNumber % 2 === 0) return 'handheld micro-movement, smooth side tracking, realistic body motion'
    return 'gentle dolly movement, subtle parallax, natural environmental motion'
  }

  private defaultCameraPrompt(sceneNumber: number, intent: VideoWorkflowIntent) {
    if (intent === 'product_ugc_video') {
      if (sceneNumber === 1) return 'eye-level selfie camera, 24mm lens, authentic TikTok UGC framing'
      return 'close-up product camera angle, handheld but stable, natural focus pull'
    }

    if (intent === 'image_to_video') return 'slow cinematic camera push, shallow depth of field, realistic parallax'

    return 'cinematic 35mm camera, smooth controlled movement, realistic depth of field'
  }

  private defaultVoiceoverLine(args: {
    intent: VideoWorkflowIntent
    sceneNumber: number
    isFirst: boolean
    isLast: boolean
    productName?: string
    productDescription?: string
    callToAction?: string
    language: string
  }) {
    const cta = args.callToAction ?? 'Order now on TikTok Shop while the offer is still available.'

    if (args.language === 'Spanish') {
      if (args.intent === 'product_ugc_video') {
        if (args.isFirst) return `Si todavía no has probado ${args.productName ?? 'este producto'}, mira esto.`
        if (args.isLast) return `Tócalo en TikTok Shop y ordénalo ahora antes de que se agote.`
        return `Lo uso así de fácil, y la diferencia se nota rápido.`
      }

      if (args.isFirst) return 'Mira esto, porque en pocos segundos vas a entender por qué funciona.'
      if (args.isLast) return 'Y así queda el video final, listo para publicar.'
      return 'Cada escena mantiene el movimiento, la emoción y la atención del espectador.'
    }

    if (args.intent === 'product_ugc_video') {
      if (args.isFirst) return `If you still have not tried ${args.productName ?? 'this product'}, watch this.`
      if (args.isLast) return cta
      return `It is simple to use, looks great on camera, and solves the problem fast.`
    }

    if (args.isFirst) return 'Watch closely, because this video starts with a strong cinematic hook.'
    if (args.isLast) return 'Now the final video is ready to render, publish, and share.'
    return 'Each scene builds momentum with clean visuals, motion, and sound.'
  }

  private defaultOnScreenText(intent: VideoWorkflowIntent, isFirst: boolean, isLast: boolean, productName?: string) {
    if (intent === 'product_ugc_video') {
      if (isFirst) return productName ? `I tried ${productName}` : 'I tried this product'
      if (isLast) return 'Order now'
      return 'Real results'
    }

    if (isFirst) return 'Watch this'
    if (isLast) return 'Final result'
    return ''
  }

  private buildAssemblySteps(args: {
    intent: VideoWorkflowIntent
    provider: VideoProvider
    aspectRatio: VideoAspectRatio
    scenes: VideoScenePlan[]
    voiceoverEnabled: boolean
    assetsCount: number
  }): VideoAssemblyStep[] {
    const steps: VideoAssemblyStep[] = []

    if (args.assetsCount > 0) {
      steps.push({
        order: steps.length + 1,
        name: 'Prepare source assets',
        provider: 'custom_api',
        action: 'validate_assets',
        input: {
          assetsRequired: args.assetsCount,
          normalizeFormat: true,
        },
        outputKey: 'validated_assets',
        requiresApproval: false,
      })
    }

    for (const scene of args.scenes) {
      steps.push({
        order: steps.length + 1,
        name: `Generate scene ${scene.sceneNumber}`,
        provider: scene.providerHint,
        action: args.intent === 'image_to_video' ? 'image_to_video' : 'text_to_video',
        input: {
          visualPrompt: scene.visualPrompt,
          motionPrompt: scene.motionPrompt,
          cameraPrompt: scene.cameraPrompt,
          negativePrompt: scene.negativePrompt,
          durationSeconds: scene.durationSeconds,
          aspectRatio: args.aspectRatio,
          requiredAssets: scene.requiredAssets,
        },
        outputKey: `scene_${scene.sceneNumber}_video`,
        requiresApproval: true,
      })
    }

    if (args.voiceoverEnabled) {
      steps.push({
        order: steps.length + 1,
        name: 'Generate voiceover',
        provider: 'elevenlabs',
        action: 'text_to_speech',
        input: {
          combineSceneVoiceover: true,
          voiceStyle: 'natural social media voice',
        },
        outputKey: 'voiceover_audio',
        requiresApproval: true,
      })
    }

    steps.push({
      order: steps.length + 1,
      name: 'Assemble final video',
      provider: 'ffmpeg',
      action: 'assemble_video',
      input: {
        sceneVideoKeys: args.scenes.map((scene) => `scene_${scene.sceneNumber}_video`),
        voiceoverKey: args.voiceoverEnabled ? 'voiceover_audio' : null,
        aspectRatio: args.aspectRatio,
        addCaptions: true,
        normalizeAudio: true,
        exportFormat: 'mp4',
      },
      outputKey: 'final_video_mp4',
      requiresApproval: false,
    })

    return steps
  }

  private buildTitle(intent: VideoWorkflowIntent, productName?: string) {
    if (intent === 'product_ugc_video') return `${productName ?? 'Product'} UGC Video Workflow`
    if (intent === 'image_to_video') return 'Image-to-Video Workflow'
    if (intent === 'voiceover_video') return 'Voiceover Video Workflow'
    if (intent === 'story_video') return 'Story Video Workflow'
    if (intent === 'shorts_pack') return 'Short-Form Video Pack Workflow'
    return 'AI Video Generation Workflow'
  }

  private buildSummary(
    intent: VideoWorkflowIntent,
    targetPlatform: VideoWorkflowPlan['targetPlatform'],
    duration: number,
    style: string,
  ) {
    return `Creates a ${duration}-second ${style} video for ${targetPlatform}. Intent: ${intent}. Includes scene generation, voiceover planning, and final assembly steps.`
  }

  private findMissingInputs(intent: VideoWorkflowIntent, input: CreateVideoWorkflowDto) {
    const missing: string[] = []

    if (intent === 'image_to_video' && (!input.assets || input.assets.length === 0)) {
      missing.push('At least one source image is recommended for image-to-video.')
    }

    if (intent === 'product_ugc_video' && !input.productName) {
      missing.push('Product name is recommended for stronger UGC scripts.')
    }

    if (!input.prompt?.trim()) {
      missing.push('Video prompt is required.')
    }

    return missing
  }
}