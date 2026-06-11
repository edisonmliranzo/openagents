import { Module } from '@nestjs/common'
import { GoalService } from './goal.service'
import { GoalController } from './goal.controller'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  providers: [GoalService],
  controllers: [GoalController],
  exports: [GoalService],
})
export class GoalsModule {}
