import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { UsersModule } from '../users/users.module'
import { CostModule } from '../cost/cost.module'
import { BoardroomService } from './boardroom.service'
import { BoardroomController } from './boardroom.controller'

@Module({
  imports: [AgentModule, UsersModule, CostModule],
  providers: [BoardroomService],
  controllers: [BoardroomController],
  exports: [BoardroomService],
})
export class BoardroomModule {}
