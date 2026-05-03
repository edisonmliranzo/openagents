export type UGCAdIntent =
  | 'product_ugc_script'
  | 'ugc_video_prompt'
  | 'tiktok_shop_ad'
  | 'affiliate_product_video'
  | 'bof_conversion_ad'
  | 'unknown'

export type UGCAdDuration = 15 | 30 | 45 | 60

export type UGCSection = 'hook' | 'problem' | 'product_demo' | 'benefit' | 'social_proof' | 'cta'

export interface UGCScriptSection {
  section: UGCSection
  durationSeconds: number
  script: string
  visualPrompt: string
  onScreenText: string
  emotion: string
  creatorAction: string
}

export interface UGCAdScript {
  duration: UGCAdDuration
  sections: UGCScriptSection[]
  totalWordCount: number
  voiceoverPacing: 'fast' | 'normal'
  creatorStyle: string
  hook: string
}

export interface UGCAdWorkflowPlan {
  intent: UGCAdIntent
  productName: string
  productDescription: string
  targetAudience: string
  uniqueSellingPoints: string[]
  hook: string
  creatorPrompt: string
  voiceoverStyle: string
  captionStyle: string
  scripts: UGCAdScript[]
  assemblySteps: string[]
  finalDeliverables: string[]
  missingInputs: string[]
}
