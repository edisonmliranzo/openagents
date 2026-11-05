import { Module } from '@nestjs/common'
import { SandboxExecController } from './sandbox-exec.controller'
import { SandboxExecService } from './sandbox-exec.service'

@Module({
  controllers: [SandboxExecController],
  providers: [SandboxExecService],
  exports: [SandboxExecService],
})
export class SandboxExecModule {}
