import type { OpenAgentsClient } from '../client'
import type {
  MissionControlEventType,
  MissionControlEventStatus,
  MissionControlListResult,
} from '@openagents/shared'

export interface ListMissionControlEventsInput {
  limit?: number
  cursor?: string
  types?: MissionControlEventType[]
  statuses?: MissionControlEventStatus[]
  source?: string
}

function buildQuery(input: ListMissionControlEventsInput = {}) {
  const params = new URLSearchParams()
  if (input.limit != null) params.set('limit', String(input.limit))
  if (input.cursor) params.set('cursor', input.cursor)
  if (input.types?.length) params.set('types', input.types.join(','))
  if (input.statuses?.length) params.set('statuses', input.statuses.join(','))
  if (input.source) params.set('source', input.source)
  const rendered = params.toString()
  return rendered ? `?${rendered}` : ''
}

export function createMissionControlApi(client: OpenAgentsClient) {
  return {
    listEvents: (input: ListMissionControlEventsInput = {}) =>
      client.get<MissionControlListResult>(`/api/v1/mission-control/events${buildQuery(input)}`),
  }
}
