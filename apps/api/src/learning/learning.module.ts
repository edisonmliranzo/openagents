import { Module } from '@nestjs/common';
import { LearningService } from './learning.service';
import { SkillSuggesterService } from './skill-suggester.service';
import { LearningController } from './learning.controller';

@Module({
  providers: [LearningService, SkillSuggesterService],
  controllers: [LearningController],
  exports: [LearningService, SkillSuggesterService],
})
export class LearningModule {}
