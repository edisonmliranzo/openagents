import { Module } from '@nestjs/common'
import { LessonsStore } from './lessons.store'

/**
 * The lessons store lives in its own module so both `AgentModule` (which reads
 * the prompt block) and `ReflectionModule` (which writes it) can depend on it
 * without an import cycle.
 */
@Module({
  providers: [LessonsStore],
  exports: [LessonsStore],
})
export class LessonsStoreModule {}
