import { Module } from '@nestjs/common'
import { ConnectorsController } from './connectors.controller'
import { ConnectorsService } from './connectors.service'
import { ConnectorOAuthController } from './oauth.controller'
import { ConnectorOAuthService } from './oauth.service'

@Module({
  // OAuth controller first so `oauth/callback` is matched before any `:connectorId` routes.
  controllers: [ConnectorOAuthController, ConnectorsController],
  providers: [ConnectorsService, ConnectorOAuthService],
  exports: [ConnectorsService, ConnectorOAuthService],
})
export class ConnectorsModule {}
