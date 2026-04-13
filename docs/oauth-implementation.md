# OAuth Implementation for LLM Providers

This document describes the OAuth authentication implementation for connecting OpenAgents to major LLM providers including OpenAI, Anthropic, Google Gemini, Minimax, and others.

## Overview

The OAuth implementation allows users to authenticate with their preferred AI service providers using OAuth 2.0 flows. This enables secure access to premium LLM features while maintaining user privacy and security.

## Supported Providers

### Currently Implemented
- **OpenAI** - ChatGPT, GPT-4, and other OpenAI models
- **Anthropic** - Claude models (Sonnet, Opus, Haiku)
- **Google Gemini** - Gemini Pro and Ultra models
- **Minimax** - Chinese LLM provider
- **Groq** - High-performance LLM inference
- **Cohere** - Enterprise LLM solutions
- **Mistral AI** - European LLM provider
- **Claude (Anthropic)** - Alternative Claude endpoint
- **Ollama** - Local LLM management (no OAuth required)

### Future Providers
- Azure OpenAI
- AWS Bedrock
- IBM Watsonx
- Hugging Face Inference API

## Architecture

### Components

1. **OAuth Types** (`packages/shared/src/types/oauth.ts`)
   - Type definitions for OAuth providers and flows
   - Provider configurations and metadata
   - State management interfaces

2. **OAuth Service** (`apps/api/src/auth/oauth.service.ts`)
   - Core OAuth flow implementation
   - Token management and refresh logic
   - Provider connection management

3. **OAuth Controller** (`apps/api/src/auth/oauth/controller.ts`)
   - REST API endpoints for OAuth flows
   - Provider discovery and management
   - Authentication callbacks

4. **Database Integration**
   - Extends existing `LlmApiKey` model
   - Stores OAuth tokens and connection metadata
   - Provider-specific configuration

## API Endpoints

### OAuth Flow Endpoints

#### 1. Initiate OAuth Authorization
```
GET /auth/oauth/authorize/:provider
```

**Parameters:**
- `provider`: OAuth provider (openai, anthropic, google, etc.)
- `redirect_uri`: Optional callback URL

**Response:**
```json
{
  "url": "https://auth.openai.com/oauth/authorize?...",
  "state": "unique-state-token"
}
```

#### 2. Handle OAuth Callback
```
GET /auth/oauth/callback
```

**Query Parameters:**
- `code`: Authorization code from provider
- `state`: State token for validation
- `error`: Error code (if any)
- `error_description`: Error description

**Response:**
```json
{
  "id": "user123-openai",
  "userId": "user123",
  "provider": "openai",
  "connectedEmail": "user@example.com",
  "isConnected": true,
  "connectedAt": "2024-01-01T00:00:00Z",
  "expiresAt": "2024-01-02T00:00:00Z",
  "scopes": ["profile", "email"]
}
```

#### 3. Get Connected Providers
```
GET /auth/oauth/connections
```

**Authentication:** JWT Bearer token required

**Response:**
```json
[
  {
    "id": "openai",
    "userId": "user123",
    "provider": "openai",
    "connectedEmail": "user@example.com",
    "isConnected": true,
    "connectedAt": "2024-01-01T00:00:00Z"
  }
]
```

#### 4. Disconnect Provider
```
POST /auth/oauth/disconnect/:provider
```

**Authentication:** JWT Bearer token required

**Response:**
```json
{
  "success": true
}
```

#### 5. Refresh Access Token
```
POST /auth/oauth/refresh/:provider
```

**Authentication:** JWT Bearer token required

**Response:**
```json
{
  "accessToken": "new-access-token",
  "success": true
}
```

#### 6. Get Available Providers
```
GET /auth/oauth/providers
```

**Response:**
```json
[
  {
    "id": "openai",
    "name": "OpenAI",
    "iconUrl": "https://openai.com/favicon.ico",
    "supportsOAuth": true
  },
  {
    "id": "anthropic",
    "name": "Anthropic",
    "iconUrl": "https://anthropic.com/favicon.ico",
    "supportsOAuth": true
  }
]
```

## Configuration

### Environment Variables

Each OAuth provider requires specific configuration:

```bash
# OpenAI OAuth
OAUTH_OPENAI_CLIENT_ID=your_openai_client_id
OAUTH_OPENAI_CLIENT_SECRET=your_openai_client_secret

# Anthropic OAuth
OAUTH_ANTHROPIC_CLIENT_ID=your_anthropic_client_id
OAUTH_ANTHROPIC_CLIENT_SECRET=your_anthropic_client_secret

# Google OAuth
OAUTH_GOOGLE_CLIENT_ID=your_google_client_id
OAUTH_GOOGLE_CLIENT_SECRET=your_google_client_secret

# Minimax OAuth
OAUTH_MINIMAX_CLIENT_ID=your_minimax_client_id
OAUTH_MINIMAX_CLIENT_SECRET=your_minimax_client_secret

# General OAuth
OAUTH_CALLBACK_URL=https://your-domain.com/auth/oauth/callback
API_URL=https://your-domain.com
```

### Provider-Specific Setup

#### OpenAI OAuth Setup
1. Register application at [OpenAI Developer Console](https://platform.openai.com/account/organization/usage)
2. Configure OAuth redirect URI: `https://your-domain.com/auth/oauth/callback`
3. Set required scopes: `profile`, `email`

#### Anthropic OAuth Setup
1. Register application at [Anthropic Console](https://console.anthropic.com/)
2. Configure OAuth redirect URI: `https://your-domain.com/auth/oauth/callback`
3. Set required scopes: `profile`, `email`

#### Google OAuth Setup
1. Create OAuth 2.0 credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Configure OAuth consent screen
3. Set authorized redirect URI: `https://your-domain.com/auth/oauth/callback`
4. Enable Google Generative AI API
5. Set required scopes:
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/generativeai`

## Security Considerations

### State Management
- OAuth state tokens are generated with UUIDs
- State expires after 10 minutes
- State validation prevents CSRF attacks

### Token Storage
- Access tokens stored encrypted in database
- Refresh tokens used for automatic token renewal
- Token expiration handled automatically

### Provider Validation
- Only whitelisted providers are supported
- Provider configurations are validated
- Invalid providers return 400 Bad Request

## Usage Examples

### Frontend Integration

```javascript
// Get available providers
const providers = await fetch('/auth/oauth/providers')
  .then(res => res.json())

// Initiate OAuth flow
const { url } = await fetch(`/auth/oauth/authorize/openai`)
  .then(res => res.json())

// Redirect user to OAuth provider
window.location.href = url

// Handle callback (server-side)
// The callback is handled automatically by the OAuth service
```

### Agent Configuration

```javascript
// Use OAuth provider in agent configuration
const agentConfig = {
  provider: 'openai',
  model: 'gpt-4',
  // OAuth credentials are automatically used
  // No need to specify API keys manually
}
```

## Error Handling

### Common OAuth Errors

1. **Invalid State**: `401 Unauthorized`
   - OAuth state token is missing or expired
   - Usually indicates a CSRF attack or session timeout

2. **Provider Error**: `401 Unauthorized`
   - OAuth provider returned an error
   - Check error description for details

3. **Invalid Provider**: `400 Bad Request`
   - Provider is not supported or configured
   - Verify provider name and configuration

4. **Token Exchange Failed**: `401 Unauthorized`
   - Failed to exchange authorization code for tokens
   - Check client credentials and redirect URI

### Error Responses

```json
{
  "statusCode": 401,
  "message": "Invalid or expired OAuth state",
  "error": "Unauthorized"
}
```

## Database Schema

The OAuth implementation extends the existing `LlmApiKey` model:

```sql
-- OAuth provider connections
ALTER TABLE "LlmApiKey" ADD COLUMN "loginEmail" TEXT;
ALTER TABLE "LlmApiKey" ADD COLUMN "loginPassword" TEXT; -- Stores refresh token
ALTER TABLE "LlmApiKey" ADD COLUMN "subscriptionPlan" TEXT;
```

## Future Enhancements

### Planned Features
1. **Multi-Provider Support**: Use multiple providers simultaneously
2. **Provider Prioritization**: Automatic failover between providers
3. **Usage Analytics**: Track provider usage and costs
4. **Provider-Specific Features**: Access to provider-specific capabilities
5. **Team Sharing**: Share provider connections across team members

### Provider Integrations
1. **Azure OpenAI**: Enterprise-grade OpenAI integration
2. **AWS Bedrock**: AWS managed LLM service
3. **Hugging Face**: Access to open-source models
4. **Local Providers**: Support for self-hosted LLMs

## Testing

### Unit Tests
- OAuth service methods
- Token exchange logic
- Provider configuration validation

### Integration Tests
- Complete OAuth flow
- Provider callback handling
- Token refresh functionality

### End-to-End Tests
- Frontend OAuth integration
- Agent provider switching
- Multi-provider scenarios

## Monitoring and Logging

### OAuth Events
- Authorization requests
- Token exchanges
- Provider connections
- Token refreshes

### Metrics
- OAuth success/failure rates
- Provider usage statistics
- Token refresh frequency
- Connection duration

### Alerts
- OAuth provider outages
- High failure rates
- Token refresh failures
- Security incidents

## Troubleshooting

### Common Issues

1. **Redirect URI Mismatch**
   - Ensure callback URL matches provider configuration
   - Check for trailing slashes and protocol differences

2. **Scope Issues**
   - Verify required scopes are configured
   - Check provider documentation for scope requirements

3. **Token Expiration**
   - Implement automatic token refresh
   - Monitor token expiration times

4. **Provider Rate Limits**
   - Implement retry logic with exponential backoff
   - Monitor provider rate limit headers

### Debug Mode
Enable debug logging for OAuth flows:
```bash
DEBUG=oauth:* npm run dev
```

This implementation provides a robust, secure, and extensible OAuth system for connecting OpenAgents to major LLM providers, enabling users to leverage their preferred AI services seamlessly.