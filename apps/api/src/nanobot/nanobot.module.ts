import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { MemoryModule } from '../memory/memory.module'
import { ToolsModule } from '../tools/tools.module'
import { UsersModule } from '../users/users.module'
import { AuthModule } from '../auth/auth.module'
import { NanobotController } from './nanobot.controller'
import { NanobotService } from './nanobot.service'
import { NanobotConfigService } from './config/nanobot-config.service'
import { NanobotBusService } from './bus/nanobot-bus.service'
import { NanobotSessionService } from './session/nanobot-session.service'
import { NanobotChannelsService } from './channels/nanobot-channels.service'
import { NanobotCronService } from './cron/nanobot-cron.service'
import { NanobotHeartbeatService } from './heartbeat/nanobot-heartbeat.service'
import { NanobotCliService } from './cli/nanobot-cli.service'
import { NanobotMemoryStore } from './agent/nanobot-memory.store'
import { NanobotContextService } from './agent/nanobot-context.service'
import { NanobotSkillsRegistry } from './agent/nanobot-skills.registry'
import { NanobotPersonalityService } from './agent/nanobot-personality.service'
import { NanobotRoleEngineService } from './agent/nanobot-role-engine.service'
import { NanobotAliveStateService } from './agent/nanobot-alive-state.service'
import { NanobotSubagentService } from './agent/nanobot-subagent.service'
import { NanobotBuiltinToolsService } from './agent/tools/nanobot-builtin-tools.service'
import { NanobotProviderRouterService } from './providers/nanobot-provider-router.service'
import { NanobotLoopService } from './agent/nanobot-loop.service'

@Module({
  imports: [AgentModule, MemoryModule, ToolsModule, UsersModule, AuthModule],
  controllers: [NanobotController],
  providers: [
    NanobotService,
    NanobotConfigService,
    NanobotBusService,
    NanobotSessionService,
    NanobotChannelsService,
    NanobotCronService,
    NanobotHeartbeatService,
    NanobotCliService,
    NanobotMemoryStore,
    NanobotContextService,
    NanobotSkillsRegistry,
    NanobotPersonalityService,
    NanobotRoleEngineService,
    NanobotAliveStateService,
    NanobotSubagentService,
    NanobotBuiltinToolsService,
    NanobotProviderRouterService,
    NanobotLoopService,
  ],
  exports: [NanobotConfigService, NanobotLoopService, NanobotBusService, NanobotSessionService],
})
export class NanobotModule {}
