export type OAuthProviderId = 'google' | 'github' | 'notion' | 'slack'

export interface OAuthProviderConfig {
  id: OAuthProviderId
  authorizeUrl: string
  tokenUrl: string
  clientIdEnv: string
  clientSecretEnv: string
  /** Notion requires HTTP Basic auth on the token exchange. */
  tokenAuth: 'body' | 'basic'
  /** Scope separator used in the authorize URL. */
  scopeSeparator: string
  extraAuthorizeParams?: Record<string, string>
}

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProviderConfig> = {
  google: {
    id: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    tokenAuth: 'body',
    scopeSeparator: ' ',
    extraAuthorizeParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
  },
  github: {
    id: 'github',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    clientIdEnv: 'GITHUB_CLIENT_ID',
    clientSecretEnv: 'GITHUB_CLIENT_SECRET',
    tokenAuth: 'body',
    scopeSeparator: ' ',
  },
  notion: {
    id: 'notion',
    authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    clientIdEnv: 'NOTION_CLIENT_ID',
    clientSecretEnv: 'NOTION_CLIENT_SECRET',
    tokenAuth: 'basic',
    scopeSeparator: ' ',
    extraAuthorizeParams: { owner: 'user' },
  },
  slack: {
    id: 'slack',
    authorizeUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    clientIdEnv: 'SLACK_CLIENT_ID',
    clientSecretEnv: 'SLACK_CLIENT_SECRET',
    tokenAuth: 'body',
    scopeSeparator: ',',
  },
}

export interface ConnectorActionDefinition {
  name: string
  displayName: string
  description: string
  method: 'GET' | 'POST'
  url: string
  /** Optional JSON body for POST actions. */
  body?: Record<string, unknown>
}

export interface OAuthConnectorDefinition {
  id: string
  displayName: string
  provider: OAuthProviderId
  scopes: string[]
  actions: ConnectorActionDefinition[]
}

export const OAUTH_CONNECTORS: Record<string, OAuthConnectorDefinition> = {
  google_gmail: {
    id: 'google_gmail',
    displayName: 'Gmail',
    provider: 'google',
    scopes: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.compose'],
    actions: [],
  },
  google_calendar: {
    id: 'google_calendar',
    displayName: 'Google Calendar',
    provider: 'google',
    scopes: ['openid', 'email', 'https://www.googleapis.com/auth/calendar'],
    actions: [],
  },
  google_drive: {
    id: 'google_drive',
    displayName: 'Google Drive',
    provider: 'google',
    scopes: ['openid', 'email', 'https://www.googleapis.com/auth/drive.readonly'],
    actions: [
      {
        name: 'drive_list_files',
        displayName: 'List Drive files',
        description: 'List the most recently modified files in Google Drive.',
        method: 'GET',
        url: 'https://www.googleapis.com/drive/v3/files?pageSize=25&orderBy=modifiedTime%20desc&fields=files(id,name,mimeType,modifiedTime,webViewLink)',
      },
    ],
  },
  github: {
    id: 'github',
    displayName: 'GitHub',
    provider: 'github',
    scopes: ['repo', 'read:user'],
    actions: [
      {
        name: 'github_list_repos',
        displayName: 'List repositories',
        description: 'List repositories for the authenticated user.',
        method: 'GET',
        url: 'https://api.github.com/user/repos?per_page=30&sort=updated',
      },
    ],
  },
  notion: {
    id: 'notion',
    displayName: 'Notion',
    provider: 'notion',
    scopes: [],
    actions: [
      {
        name: 'notion_list_pages',
        displayName: 'List pages',
        description: 'List pages shared with the OpenAgents integration.',
        method: 'POST',
        url: 'https://api.notion.com/v1/search',
        body: { filter: { property: 'object', value: 'page' }, page_size: 25 },
      },
    ],
  },
  slack: {
    id: 'slack',
    displayName: 'Slack',
    provider: 'slack',
    scopes: ['channels:read', 'chat:write'],
    actions: [
      {
        name: 'slack_list_channels',
        displayName: 'List channels',
        description: 'List public Slack channels.',
        method: 'GET',
        url: 'https://slack.com/api/conversations.list?limit=50',
      },
    ],
  },
}

export function getOAuthConnector(id: string): OAuthConnectorDefinition | null {
  return OAUTH_CONNECTORS[id.trim().toLowerCase()] ?? null
}
