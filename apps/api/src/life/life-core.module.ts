import { Module, forwardRef } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { AgentModule } from '../agent/agent.module'
import { SecurityModule } from '../security/security.module'
import { RulesService } from './rules.service'
import { ShadowService } from './shadow.service'
import { TtsService } from './tts.service'

/**
 * Leaf module with the approval-rule, dry-run, and TTS services so other
 * modules (task runtime, content pipeline) can consult them without a
 * circular dependency on the full LifeModule.
 */
@Module({
  imports: [PrismaModule, forwardRef(() => AgentModule), SecurityModule],
  providers: [RulesService, ShadowService, TtsService],
  exports: [RulesService, ShadowService, TtsService],
})
export class LifeCoreModule {}
