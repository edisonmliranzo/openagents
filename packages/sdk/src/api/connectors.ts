import type { OpenAgentsClient } from '../client'
import type {
  ConnectorHealthEntry,
  ConnectorHealthSnapshot,
  ReconnectConnectorResult,
  RecordConnectorHealthInput,
} from '@openagents/shared'

export function createConnectorsApi(client: OpenAgentsClient) {
  return {
    health: () => client.get<ConnectorHealthSnapshot>('/api/v1/connectors/health'),

    reconnect: (connectorId: string) =>
      client.post<ReconnectConnectorResult>(`/api/v1/connectors/${encodeURIComponent(connectorId)}/reconnect`),

    report: (input: RecordConnectorHealthInput) =>
      client.post<ConnectorHealthEntry>('/api/v1/connectors/health/report', input),
  }
}
