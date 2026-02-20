import type { OpenAgentsClient } from '../client'
import type {
  PlatformBillingSnapshot,
  PlatformEvalRunInput,
  PlatformEvalRunResult,
  PlatformEvalSuite,
  PlatformFleetSnapshot,
  PlatformInboxSnapshot,
  PlatformSetPlanInput,
  PlatformSubscriptionSnapshot,
  PlatformTemplate,
  PlatformTemplateInstallResult,
} from '@openagents/shared'

export interface PlatformBillingQuery {
  start?: string
  end?: string
}

export interface PlatformInboxQuery {
  limit?: number
}

export function createPlatformApi(client: OpenAgentsClient) {
  return {
    listTemplates: () => client.get<PlatformTemplate[]>('/api/v1/platform/templates'),

    installTemplate: (templateId: string) =>
      client.post<PlatformTemplateInstallResult>(`/api/v1/platform/templates/${templateId}/install`),

    fleet: () => client.get<PlatformFleetSnapshot>('/api/v1/platform/fleet'),

    evalSuites: () => client.get<PlatformEvalSuite[]>('/api/v1/platform/evals/suites'),

    runEval: (input: PlatformEvalRunInput) =>
      client.post<PlatformEvalRunResult>('/api/v1/platform/evals/run', input),

    billing: (query: PlatformBillingQuery = {}) => {
      const params = new URLSearchParams()
      if (query.start?.trim()) params.set('start', query.start.trim())
      if (query.end?.trim()) params.set('end', query.end.trim())
      const qs = params.toString()
      return client.get<PlatformBillingSnapshot>(`/api/v1/platform/billing${qs ? `?${qs}` : ''}`)
    },

    subscription: () => client.get<PlatformSubscriptionSnapshot>('/api/v1/platform/subscription'),

    setPlan: (input: PlatformSetPlanInput) =>
      client.patch<PlatformSubscriptionSnapshot>('/api/v1/platform/subscription', input),

    inbox: (query: PlatformInboxQuery = {}) => {
      const params = new URLSearchParams()
      if (Number.isFinite(query.limit) && Number(query.limit) > 0) {
        params.set('limit', `${Math.floor(Number(query.limit))}`)
      }
      const qs = params.toString()
      return client.get<PlatformInboxSnapshot>(`/api/v1/platform/inbox${qs ? `?${qs}` : ''}`)
    },
  }
}

