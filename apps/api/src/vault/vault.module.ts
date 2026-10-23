import { Module } from '@nestjs/common'
import { VaultService } from './vault.service'
import { VaultController } from './vault.controller'
import { SecurityModule } from '../security/security.module'

@Module({
  imports: [SecurityModule],
  providers: [VaultService],
  controllers: [VaultController],
  exports: [VaultService],
})
export class VaultModule {}
