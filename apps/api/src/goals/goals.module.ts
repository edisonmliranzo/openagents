import { Module } from '@nestjs/common'
import { GoalService } from './goal.service'
import { GoalPlannerService } from './goal-planner.service'
import { GoalController } from './goal.controller'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  providers: [GoalService, GoalPlannerService],
  controllers: [GoalController],
  exports: [GoalService, GoalPlannerService],
})
export class GoalsModule {}
