import { Module } from '@nestjs/common'
import { CostService } from './cost.service'
import { CostController } from './cost.controller'
import { ModelRouterService } from './model-router.service'

@Module({
  providers: [CostService, ModelRouterService],
  controllers: [CostController],
  exports: [CostService, ModelRouterService],
})
export class CostModule {}
