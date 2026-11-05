import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { SkillRegistryModule } from '../skill-registry/skill-registry.module'
import { SkillMiningController } from './skill-mining.controller'
import { SkillMiningService } from './skill-mining.service'

@Module({
  imports: [PrismaModule, SkillRegistryModule],
  providers: [SkillMiningService],
  controllers: [SkillMiningController],
  exports: [SkillMiningService],
})
export class SkillMiningModule {}
