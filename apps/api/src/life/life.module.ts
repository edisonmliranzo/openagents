import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { TasksModule } from '../tasks/tasks.module'
import { AgentModule } from '../agent/agent.module'
import { ToolsModule } from '../tools/tools.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { AutonomyModule } from '../autonomy/autonomy.module'
import { LifeCoreModule } from './life-core.module'
import { LifeController } from './life.controller'
import { AgentApiController } from './agent-api.controller'
import { JanitorService } from './janitor.service'
import { InboxService } from './inbox.service'
import { CrmService } from './crm.service'
import { ClipsService } from './clips.service'
import { PodcastService } from './podcast.service'
import { ReplayService } from './replay.service'
import { AnticipationService } from './anticipation.service'
import { TokensService } from './tokens.service'
import { TtsService } from './tts.service'

@Module({
  imports: [PrismaModule, TasksModule, AgentModule, ToolsModule, NotificationsModule, AutonomyModule, LifeCoreModule],
  controllers: [LifeController, AgentApiController],
  providers: [
    JanitorService,
    InboxService,
    CrmService,
    ClipsService,
    PodcastService,
    ReplayService,
    AnticipationService,
    TokensService,
    TtsService,
  ],
  exports: [TokensService, AnticipationService],
})
export class LifeModule {}
