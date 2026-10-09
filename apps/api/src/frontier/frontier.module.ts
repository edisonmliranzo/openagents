import { Module, forwardRef } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { PrismaModule } from '../prisma/prisma.module'
import { MemoryModule } from '../memory/memory.module'
import { UsersModule } from '../users/users.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { LibraryModule } from '../library/library.module'
import { StakesService } from './stakes.service'
import { PiiRouterService } from './pii-router.service'
import { AutopilotService } from './autopilot.service'
import { PromptRepairService } from './prompt-repair.service'
import { ConsolidationService } from './consolidation.service'
import { TimelineService } from './timeline.service'
import { ProceduralService } from './procedural.service'
import { DebateService } from './debate.service'
import { WatchService } from './watch.service'
import { RoundtableService } from './roundtable.service'
import { AutodocService } from './autodoc.service'
import { FrontierController } from './frontier.controller'

@Module({
  imports: [PrismaModule, forwardRef(() => AgentModule), MemoryModule, UsersModule, NotificationsModule, LibraryModule],
  controllers: [FrontierController],
  providers: [
    StakesService,
    PiiRouterService,
    AutopilotService,
    PromptRepairService,
    ConsolidationService,
    TimelineService,
    ProceduralService,
    DebateService,
    WatchService,
    RoundtableService,
    AutodocService,
  ],
  exports: [StakesService, PiiRouterService, AutopilotService, PromptRepairService, AutodocService],
})
export class FrontierModule {}
