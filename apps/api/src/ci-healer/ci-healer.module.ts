import { Module } from '@nestjs/common'
import { CiHealerController } from './ci-healer.controller'
import { CiHealerInternalController } from './ci-healer.internal.controller'
import { CiHealerService } from './ci-healer.service'

@Module({
  controllers: [CiHealerController, CiHealerInternalController],
  providers: [CiHealerService],
  exports: [CiHealerService],
})
export class CiHealerModule {}
