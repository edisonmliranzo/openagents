import { Module } from '@nestjs/common'
import { EncryptionService } from './encryption.service'
import { AuditService } from './audit.service'
import { ComplianceService } from './compliance.service'
import { SecurityController } from './security.controller'
import { KeyManagementService } from './key-management.service'
import { KeyManagementController } from './key-management.controller'

@Module({
  providers: [EncryptionService, AuditService, ComplianceService, KeyManagementService],
  controllers: [SecurityController, KeyManagementController],
  exports: [EncryptionService, AuditService, ComplianceService, KeyManagementService],
})
export class SecurityModule {}