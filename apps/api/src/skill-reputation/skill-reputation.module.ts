import { Global, Module } from '@nestjs/common'
import { NanobotModule } from '../nanobot/nanobot.module'
import { SkillReputationController } from './skill-reputation.controller'
import { SkillReputationService } from './skill-reputation.service'

@Global()
@Module({
  imports: [NanobotModule],
  controllers: [SkillReputationController],
  providers: [SkillReputationService],
  exports: [SkillReputationService],
})
export class SkillReputationModule {}
