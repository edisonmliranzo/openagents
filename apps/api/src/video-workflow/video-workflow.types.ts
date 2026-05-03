export type VideoWorkflowIntent =
  | 'text_to_video'
  | 'image_to_video'
  | 'product_ugc_video'
  | 'story_video'
  | 'voiceover_video'
  | 'music_video'
  | 'shorts_pack'
  | 'unknown'

export type VideoAspectRatio = '9:16' | '16:9' | '1:1' | '4:5' | '21:9'

export type VideoProvider =
  | 'seedance'
  | 'kling'
  | 'runway'
  | 'pika'
  | 'luma'
  | 'veo'
  | 'sora'
  | 'atlascloud'
  | 'openai'
  | 'elevenlabs'
  | 'ffmpeg'
  | 'custom_api'

export interface VideoSourceAsset {
  id?: string
  type: 'image' | 'video' | 'audio' | 'script' | 'product_url' | 'reference'
  url?: string
  filename?: string
  description?: string
  role?:
    | 'main_subject'
    | 'product'
    | 'background'
    | 'style_reference'
    | 'voice_reference'
    | 'music_reference'
}

export interface VideoScenePlan {
  sceneNumber: number
  durationSeconds: number
  visualPrompt: string
  motionPrompt: string
  cameraPrompt: string
  voiceoverLine?: string
  onScreenText?: string
  negativePrompt: string
  requiredAssets: string[]
  providerHint: VideoProvider
}

export interface VoiceoverPlan {
  enabled: boolean
  language: string
  tone: string
  voiceProvider: VideoProvider
  script: string
  pacing: 'slow' | 'normal' | 'fast'
}

export interface VideoAssemblyStep {
  order: number
  name: string
  provider: VideoProvider
  action: string
  input: Record<string, unknown>
  outputKey: string
  requiresApproval: boolean
}

export interface VideoWorkflowPlan {
  intent: VideoWorkflowIntent
  title: string
  summary: string
  aspectRatio: VideoAspectRatio
  totalDurationSeconds: number
  style: string
  targetPlatform: 'tiktok' | 'youtube_shorts' | 'instagram_reels' | 'youtube' | 'ads' | 'general'
  sourceAssets: VideoSourceAsset[]
  scenes: VideoScenePlan[]
  voiceover: VoiceoverPlan
  assemblySteps: VideoAssemblyStep[]
  finalDeliverables: string[]
  safetyNotes: string[]
  missingInputs: string[]
}