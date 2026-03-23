import type { OpenAgentsClient } from '../client'
import type {
  ConnectorConnection,
  ConnectorConnectionResult,
  ConnectorHealthEntry,
  ConnectorHealthSnapshot,
  ReconnectConnectorResult,
  RecordConnectorHealthInput,
  SaveConnectorConnectionInput,
} from '@openagents/shared'

export function createConnectorsApi(client: OpenAgentsClient) {
  return {
    health: () => client.get<ConnectorHealthSnapshot>('/api/v1/connectors/health'),

    reconnect: (connectorId: string) =>
      client.post<ReconnectConnectorResult>(`/api/v1/connectors/${encodeURIComponent(connectorId)}/reconnect`),

    report: (input: RecordConnectorHealthInput) =>
      client.post<ConnectorHealthEntry>('/api/v1/connectors/health/report', input),

    getConnection: (connectorId: string) =>
      client.get<ConnectorConnection>(`/api/v1/connectors/${encodeURIComponent(connectorId)}/connection`),

    saveConnection: (connectorId: string, input: SaveConnectorConnectionInput) =>
      client.put<ConnectorConnectionResult>(
        `/api/v1/connectors/${encodeURIComponent(connectorId)}/connection`,
        input,
      ),

    deleteConnection: (connectorId: string) =>
      client.delete<{ ok: true }>(`/api/v1/connectors/${encodeURIComponent(connectorId)}/connection`),
  }
}
