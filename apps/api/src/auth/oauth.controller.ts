import { Controller, Get, Post, Query, Body, Param, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from './guards/jwt.guard'
import { OAuthService } from './oauth.service'
import type {
  OAuthProvider,
  OAuthCallbackParams,
  ProviderConnection,
} from '@openagents/shared'

@ApiTags('oauth')
@Controller('auth/oauth')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  /**
   * Initiate OAuth flow for a provider
   */
  @Get('authorize/:provider')
  @ApiOperation({ summary: 'Initiate OAuth authorization' })
  @ApiResponse({ status: 200, description: 'OAuth URL generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid provider' })
  async initiateOAuth(
    @Param('provider') provider: string,
    @Query('redirect_uri') redirectUri?: string,
    @Req() req?: any,
  ) {
    const userId = req?.user?.id
    const { url, state } = await this.oauthService.generateAuthUrl(provider as any, userId, redirectUri)
    return { url, state }
  }

  /**
   * Handle OAuth callback
   */
  @Get('callback')
  @ApiOperation({ summary: 'Handle OAuth callback' })
  @ApiResponse({ status: 200, description: 'OAuth callback handled successfully' })
  @ApiResponse({ status: 401, description: 'Invalid OAuth state or error' })
  async handleCallback(
    @Query() params: any,
    @Query('redirect_uri') redirectUri?: string,
  ): Promise<any> {
    return this.oauthService.handleCallback(params, redirectUri)
  }

  /**
   * Get all connected providers for the authenticated user
   */
  @Get('connections')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get connected OAuth providers' })
  @ApiResponse({ status: 200, description: 'Connected providers retrieved successfully' })
  async getConnections(@Req() req: any): Promise<any[]> {
    return this.oauthService.getConnectedProviders(req.user.id)
  }

  /**
   * Disconnect a provider
   */
  @Post('disconnect/:provider')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect OAuth provider' })
  @ApiResponse({ status: 200, description: 'Provider disconnected successfully' })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  async disconnectProvider(
    @Req() req: any,
    @Param('provider') provider: string,
  ): Promise<{ success: boolean }> {
    await this.oauthService.disconnectProvider(req.user.id, provider as any)
    return { success: true }
  }

  /**
   * Refresh access token for a provider
   */
  @Post('refresh/:provider')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh OAuth access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 404, description: 'Provider not found or no refresh token' })
  async refreshAccessToken(
    @Req() req: any,
    @Param('provider') provider: string,
  ): Promise<{ accessToken?: string; success: boolean }> {
    const accessToken = await this.oauthService.refreshAccessToken(req.user.id, provider as any)
    return { accessToken, success: !!accessToken }
  }

  /**
   * Get available OAuth providers
   */
  @Get('providers')
  @ApiOperation({ summary: 'Get available OAuth providers' })
  @ApiResponse({ status: 200, description: 'Available providers retrieved successfully' })
  async getAvailableProviders() {
    // Import the providers from the shared package
    const { OAUTH_PROVIDERS } = require('@openagents/shared')
    
    return Object.values(OAUTH_PROVIDERS).map((provider: any) => ({
      id: provider.id,
      name: provider.name,
      iconUrl: provider.iconUrl,
      supportsOAuth: !!provider.authUrl,
    }))
  }
}