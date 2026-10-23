import { Module, forwardRef } from '@nestjs/common';
import { LearningService } from './learning.service';
import { SkillSuggesterService } from './skill-suggester.service';
import { LearningController } from './learning.controller';
import { SelfLearnService } from './self-learn.service';
import { AgentModule } from '../agent/agent.module';
import { ToolsModule } from '../tools/tools.module';
import { MemoryModule } from '../memory/memory.module';
import { LibraryModule } from '../library/library.module';
import { SELF_LEARN_BACKEND } from '../tools/connectors/self-learn.tool';

@Module({
  imports: [
    forwardRef(() => AgentModule),
    forwardRef(() => ToolsModule),
    MemoryModule,
    LibraryModule,
  ],
  providers: [LearningService, SkillSuggesterService, SelfLearnService, { provide: SELF_LEARN_BACKEND, useExisting: SelfLearnService }],
  controllers: [LearningController],
  exports: [LearningService, SkillSuggesterService, SelfLearnService, SELF_LEARN_BACKEND],
})
export class LearningModule {}
