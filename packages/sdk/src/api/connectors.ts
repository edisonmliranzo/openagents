import type {
  ConnectorConnection,
  ConnectorConnectionResult,
  ConnectorHealthEntry,
  ConnectorHealthSnapshot,
  ReconnectConnectorResult,
  RecordConnectorHealthInput,
  SaveConnectorConnectionInput,
} from '@openagents/shared'
import type { OpenAgentsClient } from '../client'

const DEFAULT_CONNECTOR_IDS = ['google_gmail', 'google_calendar'] as const

export function createConnectorsApi(client: OpenAgentsClient) {
  return {
    health: () => client.get<ConnectorHealthSnapshot>('/api/v1/connectors/health'),
    reconnect: (connectorId: string) =>
      client.post<ReconnectConnectorResult>(`/api/v1/connectors/${connectorId}/reconnect`),
    getConnection: (connectorId: string) =>
      client.get<ConnectorConnection>(`/api/v1/connectors/${connectorId}/connection`),
    list: async () =>
      Promise.all(DEFAULT_CONNECTOR_IDS.map((connectorId) => client.get<ConnectorConnection>(
        `/api/v1/connectors/${connectorId}/connection`,
      ))),
    report: (input: RecordConnectorHealthInput) =>
      client.post<ConnectorHealthEntry>('/api/v1/connectors/health/report', input),
    saveConnection: (connectorId: string, input: SaveConnectorConnectionInput) =>
      client.put<ConnectorConnectionResult>(`/api/v1/connectors/${connectorId}/connection`, input),
    deleteConnection: (connectorId: string) =>
      client.delete<{ ok: true }>(`/api/v1/connectors/${connectorId}/connection`),
  }
}
