import { Module } from '@nestjs/common'
import { BrowserAutomationService } from './browser-automation.service'
import { BrowserAutomationController } from './browser-automation.controller'

@Module({
  providers: [BrowserAutomationService],
  controllers: [BrowserAutomationController],
  exports: [BrowserAutomationService],
})
export class BrowserAutomationModule {}
