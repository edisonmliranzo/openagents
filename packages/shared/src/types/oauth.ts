export type OAuthProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'minimax'
  | 'groq'
  | 'cohere'
  | 'mistral'
  | 'claude'
  | 'ollama'

export interface OAuthProviderConfig {
  id: OAuthProvider
  name: string
  authUrl: string
  tokenUrl: string
  scopes: string[]
  userInfoUrl?: string
  iconUrl?: string
}

export interface OAuthState {
  state: string
  provider: OAuthProvider
  userId?: string
  expiresAt: string
}

export interface OAuthCallbackParams {
  code: string
  state: string
  error?: string
  errorDescription?: string
}

export interface OAuthTokenResponse {
  accessToken: string
  tokenType: string
  expiresIn?: number
  refreshToken?: string
  scope?: string
}

export interface OAuthProviderCredentials {
  provider: OAuthProvider
  accessToken?: string
  refreshToken?: string
  apiKey?: string
  email?: string
  expiresAt?: string
  scopes?: string[]
  metadata?: Record<string, unknown>
}

export interface ProviderConnection {
  id: string
  userId: string
  provider: OAuthProvider
  connectedEmail?: string
  isConnected: boolean
  connectedAt: string
  expiresAt?: string
  scopes?: string[]
}

export interface CreateProviderConnectionInput {
  provider: OAuthProvider
  accessToken: string
  refreshToken?: string
  email?: string
  expiresAt?: string
  scopes?: string[]
}

export interface ProviderUserInfo {
  email: string
  name?: string
  avatarUrl?: string
  provider: OAuthProvider
}

export const OAUTH_PROVIDERS: Record<OAuthProvider, OAuthProviderConfig> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    authUrl: 'https://auth.openai.com/oauth/authorize',
    tokenUrl: 'https://auth.openai.com/oauth/token',
    scopes: ['profile', 'email'],
    userInfoUrl: 'https://api.openai.com/v1/user',
    iconUrl: 'https://openai.com/favicon.ico',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    authUrl: 'https://console.anthropic.com/oauth/authorize',
    tokenUrl: 'https://console.anthropic.com/oauth/token',
    scopes: ['profile', 'email'],
    userInfoUrl: 'https://api.anthropic.com/v1/user',
    iconUrl: 'https://anthropic.com/favicon.ico',
  },
  google: {
    id: 'google',
    name: 'Google Gemini',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['profile', 'email', 'https://www.googleapis.com/auth/generativeai'],
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    iconUrl: 'https://www.google.com/favicon.ico',
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    authUrl: 'https://api.minimax.chat/oauth/authorize',
    tokenUrl: 'https://api.minimax.chat/oauth/token',
    scopes: ['profile', 'email'],
    userInfoUrl: 'https://api.minimax.chat/v1/user',
    iconUrl: 'https://minimax.chat/favicon.ico',
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    authUrl: 'https://console.groq.com/oauth/authorize',
    tokenUrl: 'https://console.groq.com/oauth/token',
    scopes: ['profile', 'email'],
    userInfoUrl: 'https://api.groq.com/v1/user',
    iconUrl: 'https://groq.com/favicon.ico',
  },
  cohere: {
    id: 'cohere',
    name: 'Cohere',
    authUrl: 'https://dashboard.cohere.com/oauth/authorize',
    tokenUrl: 'https://dashboard.cohere.com/oauth/token',
    scopes: ['profile', 'email'],
    userInfoUrl: 'https://api.cohere.com/v1/user',
    iconUrl: 'https://cohere.com/favicon.ico',
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    authUrl: 'https://auth.mistral.ai/oauth/authorize',
    tokenUrl: 'https://auth.mistral.ai/oauth/token',
    scopes: ['profile', 'email'],
    userInfoUrl: 'https://api.mistral.ai/v1/user',
    iconUrl: 'https://mistral.ai/favicon.ico',
  },
  claude: {
    id: 'claude',
    name: 'Claude (Anthropic)',
    authUrl: 'https://console.anthropic.com/oauth/authorize',
    tokenUrl: 'https://console.anthropic.com/oauth/token',
    scopes: ['profile', 'email'],
    userInfoUrl: 'https://api.anthropic.com/v1/user',
    iconUrl: 'https://anthropic.com/favicon.ico',
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    authUrl: '',
    tokenUrl: '',
    scopes: [],
    userInfoUrl: '',
    iconUrl: 'https://ollama.com/favicon.ico',
  },
}