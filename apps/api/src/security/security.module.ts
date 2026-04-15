import { Module } from '@nestjs/common'
import { EncryptionService } from './encryption.service'
import { AuditService } from './audit.service'
import { ComplianceService } from './compliance.service'
import { SecurityController } from './security.controller'

@Module({
  providers: [EncryptionService, AuditService, ComplianceService],
  controllers: [SecurityController],
  exports: [EncryptionService, AuditService, ComplianceService],
})
export class SecurityModule {}