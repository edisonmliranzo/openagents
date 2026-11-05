import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { UsersModule } from '../users/users.module'
import { CostModule } from '../cost/cost.module'
import { SmartRouterService } from './smart-router.service'
import { SmartRouterController } from './smart-router.controller'

@Module({
  imports: [AgentModule, UsersModule, CostModule],
  providers: [SmartRouterService],
  controllers: [SmartRouterController],
  exports: [SmartRouterService],
})
export class SmartRouterModule {}
