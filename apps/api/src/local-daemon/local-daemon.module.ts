import { Module } from '@nestjs/common'
import { LocalDaemonService } from './local-daemon.service'
import { LocalDaemonController } from './local-daemon.controller'

@Module({
  providers: [LocalDaemonService],
  controllers: [LocalDaemonController],
  exports: [LocalDaemonService],
})
export class LocalDaemonModule {}
