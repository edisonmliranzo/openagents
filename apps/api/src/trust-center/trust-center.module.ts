import { Module } from '@nestjs/common'
import { PrivacyModule } from '../privacy/privacy.module'
import { TrustCenterController } from './trust-center.controller'
import { TrustCenterService } from './trust-center.service'

@Module({
  imports: [PrivacyModule],
  controllers: [TrustCenterController],
  providers: [TrustCenterService],
  exports: [TrustCenterService],
})
export class TrustCenterModule {}
