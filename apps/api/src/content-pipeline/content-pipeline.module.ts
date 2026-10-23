import { Module, forwardRef } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { CronModule } from '../cron/cron.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { LifeCoreModule } from '../life/life-core.module'
import { ToolsModule } from '../tools/tools.module'
import { ContentPipelineController } from './content-pipeline.controller'
import { ContentPipelineService } from './content-pipeline.service'
import { VideoRenderService } from './video-render.service'
import { BufferService } from './buffer.service'
import { CONTENT_PIPELINE_BACKEND } from '../tools/connectors/content-pipeline.tool'

@Module({
  imports: [
    forwardRef(() => AgentModule),
    CronModule,
    NotificationsModule,
    LifeCoreModule,
    forwardRef(() => ToolsModule),
  ],
  controllers: [ContentPipelineController],
  providers: [
    ContentPipelineService,
    { provide: CONTENT_PIPELINE_BACKEND, useExisting: ContentPipelineService },
    VideoRenderService,
    BufferService,
  ],
  exports: [ContentPipelineService, CONTENT_PIPELINE_BACKEND],
})
export class ContentPipelineModule {}
