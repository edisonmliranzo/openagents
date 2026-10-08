import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { StudyService } from './study.service'
import { StudyController } from './study.controller'

@Module({
  imports: [PrismaModule],
  providers: [StudyService],
  controllers: [StudyController],
  exports: [StudyService],
})
export class StudyModule {}
