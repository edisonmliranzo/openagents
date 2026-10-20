export type PlanId = 'free' | 'pro' | 'team'
export type UsageMetric = 'messages' | 'researchJobs' | 'agents' | 'voiceMinutes'

export interface PlanLimits {
  /** Messages per day */
  messages: number
  /** Research jobs per day */
  researchJobs: number
  /** Max concurrent agents (absolute, not per period) */
  agents: number
  /** Voice minutes per month */
  voiceMinutes: number
}

export interface PlanDefinition {
  id: PlanId
  name: string
  priceLabel: string
  limits: PlanLimits
  features: string[]
}

/** -1 means unlimited. */
export const UNLIMITED = -1

export const METRIC_PERIOD: Record<UsageMetric, 'day' | 'month' | 'absolute'> = {
  messages: 'day',
  researchJobs: 'day',
  agents: 'absolute',
  voiceMinutes: 'month',
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    priceLabel: '$0',
    limits: { messages: 50, researchJobs: 3, agents: 2, voiceMinutes: 30 },
    features: ['Core assistant', 'Community skills', 'Basic memory'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceLabel: '$20 / month',
    limits: { messages: 1000, researchJobs: 50, agents: 10, voiceMinutes: 600 },
    features: ['Everything in Free', 'Deep research', 'More agents', 'Priority models'],
  },
  team: {
    id: 'team',
    name: 'Team',
    priceLabel: '$50 / seat / month',
    limits: { messages: 5000, researchJobs: 250, agents: 50, voiceMinutes: 3000 },
    features: ['Everything in Pro', 'Shared workspaces', 'Admin controls'],
  },
}

/** When Stripe is not configured everyone is on 'free' with these generous limits. */
export const UNCONFIGURED_LIMITS: PlanLimits = {
  messages: 2000,
  researchJobs: 100,
  agents: 25,
  voiceMinutes: 1000,
}
