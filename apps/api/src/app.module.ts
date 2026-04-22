import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { ConversationsModule } from './conversations/conversations.module'
import { AgentModule } from './agent/agent.module'
import { ToolsModule } from './tools/tools.module'
import { ApprovalsModule } from './approvals/approvals.module'
import { MemoryModule } from './memory/memory.module'
import { SessionsModule } from './sessions/sessions.module'
import { UsersModule } from './users/users.module'
import { AuditModule } from './audit/audit.module'
import { NotificationsModule } from './notifications/notifications.module'
import { CronModule } from './cron/cron.module'
import { PrismaModule } from './prisma/prisma.module'
import { NanobotModule } from './nanobot/nanobot.module'
import { SystemModule } from './system/system.module'
import { LabsModule } from './labs/labs.module'
import { WhatsAppModule } from './channels/whatsapp/whatsapp.module'
import { TelegramModule } from './channels/telegram/telegram.module'
import { SlackModule } from './channels/slack/slack.module'
import { DiscordModule } from './channels/discord/discord.module'
import { PlatformModule } from './platform/platform.module'
import { HealthModule } from './health/health.module'
import { WorkflowsModule } from './workflows/workflows.module'
import { MissionControlModule } from './mission-control/mission-control.module'
import { PlaybooksModule } from './playbooks/playbooks.module'
import { AgentVersionsModule } from './agent-versions/agent-versions.module'
import { HandoffsModule } from './handoffs/handoffs.module'
import { SkillReputationModule } from './skill-reputation/skill-reputation.module'
import { DataLineageModule } from './lineage/lineage.module'
import { PolicyModule } from './policy/policy.module'
import { ExtractionModule } from './extraction/extraction.module'
import { CiHealerModule } from './ci-healer/ci-healer.module'
import { ConnectorsModule } from './connectors/connectors.module'
import { SkillRegistryModule } from './skill-registry/skill-registry.module'
import { WebhooksModule } from './webhooks/webhooks.module'
import { MetricsModule } from './metrics/metrics.module'
import { TriggersModule } from './triggers/triggers.module'
import { WorkspacesModule } from './workspaces/workspaces.module'
import { AgentPresetsModule } from './agent-presets/agent-presets.module'
import { ArtifactsModule } from './artifacts/artifacts.module'
import { PacksModule } from './packs/packs.module'
import { ResearchModule } from './research/research.module'
import { AnomalyModule } from './anomaly/anomaly.module'
import { CollaborationModule } from './collaboration/collaboration.module'
import { AdvancedAIModule } from './advanced-ai/advanced-ai.module'
import { AnalyticsModule } from './analytics/analytics.module'
import { SecurityModule } from './security/security.module'
import { OrchestrationModule } from './orchestration/orchestration.module'
import { LearningModule } from './learning/learning.module'
import { WsModule } from './events/ws.module'
import { ApiKeysModule } from './apikeys/apikeys.module'
import { ExportModule } from './export/export.module'
import { AbTestingModule } from './ab-testing/ab-testing.module'
import { StreamingModule } from './streaming/streaming.module'
import { VisionModule } from './vision/vision.module'
import { DelegationModule } from './delegation/delegation.module'
import { GoalsModule } from './goals/goals.module'
import { ConversationSearchModule } from './conversation-search/search.module'
import { TemplatesModule } from './templates/templates.module'
import { PinsModule } from './pins/pins.module'
import { ReactionsModule } from './reactions/reactions.module'
import { CostModule } from './cost/cost.module'
import { SchedulerModule } from './scheduler/scheduler.module'
import { ToolBuilderModule } from './tool-builder/tool-builder.module'
import { GenerativeUIModule } from './generative-ui/generative-ui.module'
import { BrowserAutomationModule } from './browser-automation/browser-automation.module'
import { ProactiveAgentsModule } from './proactive-agents/proactive-agents.module'
import { WebRTCVoiceModule } from './webrtc-voice/webrtc-voice.module'
import { WarRoomsModule } from './war-rooms/war-rooms.module'
import { LocalDaemonModule } from './local-daemon/local-daemon.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // BullModule disabled for local dev (requires Redis).
    // Enable when running with Docker: BullModule.forRoot({ redis: process.env.REDIS_URL })
    PrismaModule,
    MissionControlModule,
    DataLineageModule,
    PolicyModule,
    ExtractionModule,
    CiHealerModule,
    ConnectorsModule,
    SkillRegistryModule,
    HandoffsModule,
    SkillReputationModule,
    AuthModule,
    ConversationsModule,
    AgentModule,
    ToolsModule,
    ApprovalsModule,
    MemoryModule,
    SessionsModule,
    UsersModule,
    AuditModule,
    NotificationsModule,
    CronModule,
    NanobotModule,
    SystemModule,
    LabsModule,
    WhatsAppModule,
    TelegramModule,
    SlackModule,
    DiscordModule,
    PlatformModule,
    HealthModule,
    WorkflowsModule,
    PlaybooksModule,
    AgentVersionsModule,
    WebhooksModule,
    MetricsModule,
    TriggersModule,
    WorkspacesModule,
    AgentPresetsModule,
    ArtifactsModule,
    PacksModule,
    ResearchModule,
    AnomalyModule,
    CollaborationModule,
    AdvancedAIModule,
    AnalyticsModule,
    SecurityModule,
    OrchestrationModule,
    LearningModule,
    WsModule,
    ApiKeysModule,
    ExportModule,
    AbTestingModule,
    StreamingModule,
    VisionModule,
    DelegationModule,
    GoalsModule,
    ConversationSearchModule,
    TemplatesModule,
    PinsModule,
    ReactionsModule,
    CostModule,
    SchedulerModule,
    ToolBuilderModule,
    GenerativeUIModule,
    BrowserAutomationModule,
    ProactiveAgentsModule,
    WebRTCVoiceModule,
    WarRoomsModule,
    LocalDaemonModule,
  ],
})
export class AppModule {}
