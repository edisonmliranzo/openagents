export type SocialPlatform = 'tiktok' | 'instagram' | 'youtube' | 'twitter' | 'linkedin' | 'facebook' | 'threads'

export type ContentType =
  | 'educational'
  | 'storytelling'
  | 'controversial'
  | 'product_demo'
  | 'behind_the_scenes'
  | 'testimonial'
  | 'call_to_action'
  | 'trending_audio'
  | 'q_and_a'
  | 'transformation'

export type ContentFormat = 'short_video' | 'long_video' | 'image_post' | 'carousel' | 'story' | 'live' | 'thread'

export interface ContentPillar {
  name: string
  description: string
  percentage: number
}

export interface CalendarEntry {
  day: number
  dayOfWeek: string
  platform: SocialPlatform
  contentType: ContentType
  format: ContentFormat
  pillar: string
  hook: string
  script: string
  visualPrompt: string
  caption: string
  hashtags: string[]
  callToAction: string
  estimatedReach: string
}

export interface SocialMediaWorkflowPlan {
  niche: string
  brand: string
  platforms: SocialPlatform[]
  pillars: ContentPillar[]
  totalDays: number
  postsPerDay: number
  totalPosts: number
  calendar: CalendarEntry[]
  hashtagStrategy: string[]
  postingTimes: Record<SocialPlatform, string>
  contentRules: string[]
  finalDeliverables: string[]
  missingInputs: string[]
}
