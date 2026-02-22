import { Global, Module } from '@nestjs/common'
import { DataLineageController } from './lineage.controller'
import { DataLineageService } from './lineage.service'

@Global()
@Module({
  controllers: [DataLineageController],
  providers: [DataLineageService],
  exports: [DataLineageService],
})
export class DataLineageModule {}
