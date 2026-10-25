import { Module } from '@nestjs/common'
import { SystemSetupController } from './system-setup.controller'
import { SystemSetupService } from './system-setup.service'

/** Leaf module: only depends on the global PrismaModule. */
@Module({
  controllers: [SystemSetupController],
  providers: [SystemSetupService],
  exports: [SystemSetupService],
})
export class SystemSetupModule {}
