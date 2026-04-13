import { sql } from 'drizzle-orm'
import {
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  pgTable,
  varchar,
  index,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`now()`),
})

export const apiKeys = pgTable(
  'api_keys',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    name: varchar('name', { length: 255 }).notNull(),
    key: varchar('key', { length: 255 }).notNull(),
    prefix: varchar('prefix', { length: 20 }).notNull(),
    lastUsedAt: timestamp('last_used_at'),
    expiresAt: timestamp('expires_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_api_keys_user_id').on(table.userId),
  }),
)

export const workspaces = pgTable(
  'workspaces',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    ownerId: varchar('owner_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    settings: jsonb('settings'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    ownerIdIdx: index('idx_workspaces_owner_id').on(table.ownerId),
  }),
)

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workspaceId: varchar('workspace_id', { length: 36 })
      .notNull()
      .references(() => workspaces.id),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    role: varchar('role', { length: 50 }).notNull().default('member'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    workspaceIdIdx: index('idx_workspace_members_workspace_id').on(table.workspaceId),
    userIdIdx: index('idx_workspace_members_user_id').on(table.userId),
  }),
)

export const conversations = pgTable(
  'conversations',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    workspaceId: varchar('workspace_id', { length: 36 }).references(() => workspaces.id),
    title: varchar('title', { length: 500 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
    lastMessageAt: timestamp('last_message_at'),
  },
  (table) => ({
    userIdIdx: index('idx_conversations_user_id').on(table.userId),
    workspaceIdIdx: index('idx_conversations_workspace_id').on(table.workspaceId),
  }),
)

export const messages = pgTable(
  'messages',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    conversationId: varchar('conversation_id', { length: 36 })
      .notNull()
      .references(() => conversations.id),
    role: varchar('role', { length: 20 }).notNull(),
    content: text('content').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('done'),
    toolCallJson: jsonb('tool_call_json'),
    toolResultJson: jsonb('tool_result_json'),
    metadata: jsonb('metadata'),
    tokens: integer('tokens'),
    costUsd: real('cost_usd'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    conversationIdIdx: index('idx_messages_conversation_id').on(table.conversationId),
  }),
)

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    conversationId: varchar('conversation_id', { length: 36 })
      .notNull()
      .references(() => conversations.id),
    agentConfigJson: jsonb('agent_config_json').notNull(),
    status: varchar('status', { length: 30 }).notNull().default('idle'),
    startedAt: timestamp('started_at'),
    finishedAt: timestamp('finished_at'),
    error: text('error'),
    totalTokens: integer('total_tokens'),
    totalCostUsd: real('total_cost_usd'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    conversationIdIdx: index('idx_agent_runs_conversation_id').on(table.conversationId),
  }),
)

export const agents = pgTable(
  'agents',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    workspaceId: varchar('workspace_id', { length: 36 }).references(() => workspaces.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    provider: varchar('provider', { length: 50 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    systemPrompt: text('system_prompt'),
    temperature: real('temperature'),
    maxTokens: integer('max_tokens'),
    enabledTools: jsonb('enabled_tools'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_agents_user_id').on(table.userId),
    workspaceIdIdx: index('idx_agents_workspace_id').on(table.workspaceId),
  }),
)

export const tools = pgTable(
  'tools',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    name: varchar('name', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    description: text('description').notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    inputSchema: jsonb('input_schema').notNull(),
    source: varchar('source', { length: 20 }).notNull().default('builtin'),
    serverId: varchar('server_id', { length: 36 }),
    originalName: varchar('original_name', { length: 255 }),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_tools_user_id').on(table.userId),
  }),
)

export const connectedTools = pgTable(
  'connected_tools',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    toolId: varchar('tool_id', { length: 36 })
      .notNull()
      .references(() => tools.id),
    status: varchar('status', { length: 20 }).notNull().default('available'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_connected_tools_user_id').on(table.userId),
    toolIdIdx: index('idx_connected_tools_tool_id').on(table.toolId),
  }),
)

export const memoryEvents = pgTable(
  'memory_events',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    kind: varchar('kind', { length: 50 }).notNull(),
    summary: text('summary').notNull(),
    payload: jsonb('payload'),
    sourceRef: varchar('source_ref', { length: 500 }),
    tags: jsonb('tags'),
    piiRedacted: boolean('pii_redacted').notNull().default(false),
    confidence: real('confidence').notNull().default(1.0),
    effectiveConfidence: real('effective_confidence'),
    freshUntil: timestamp('fresh_until'),
    conflictGroup: varchar('conflict_group', { length: 36 }),
    reinforcedAt: timestamp('reinforced_at'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_memory_events_user_id').on(table.userId),
  }),
)

export const memoryFacts = pgTable(
  'memory_facts',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    entity: varchar('entity', { length: 255 }).notNull(),
    key: varchar('key', { length: 255 }).notNull(),
    value: text('value').notNull(),
    sourceRef: varchar('source_ref', { length: 500 }),
    confidence: real('confidence').notNull().default(1.0),
    effectiveConfidence: real('effective_confidence'),
    freshUntil: timestamp('fresh_until'),
    conflictGroup: varchar('conflict_group', { length: 36 }),
    reinforcedAt: timestamp('reinforced_at'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_memory_facts_user_id').on(table.userId),
    entityKeyIdx: index('idx_memory_facts_entity_key').on(table.entity, table.key),
  }),
)

export const memoryConflicts = pgTable(
  'memory_conflicts',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    entity: varchar('entity', { length: 255 }).notNull(),
    key: varchar('key', { length: 255 }).notNull(),
    existingValue: text('existing_value').notNull(),
    incomingValue: text('incoming_value').notNull(),
    existingSourceRef: varchar('existing_source_ref', { length: 500 }),
    incomingSourceRef: varchar('incoming_source_ref', { length: 500 }),
    status: varchar('status', { length: 20 }).notNull().default('open'),
    severity: varchar('severity', { length: 20 }).notNull().default('low'),
    confidenceDelta: real('confidence_delta').notNull().default(0),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_memory_conflicts_user_id').on(table.userId),
  }),
)

export const workflows = pgTable(
  'workflows',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    workspaceId: varchar('workspace_id', { length: 36 }).references(() => workspaces.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    enabled: boolean('enabled').notNull().default(true),
    version: integer('version').notNull().default(1),
    triggerJson: jsonb('trigger_json').notNull(),
    stepsJson: jsonb('steps_json').notNull(),
    budgetUsd: real('budget_usd'),
    webhookOutboxJson: jsonb('webhook_outbox_json'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
    lastRunAt: timestamp('last_run_at'),
    nextRunAt: timestamp('next_run_at'),
  },
  (table) => ({
    userIdIdx: index('idx_workflows_user_id').on(table.userId),
    workspaceIdIdx: index('idx_workflows_workspace_id').on(table.workspaceId),
  }),
)

export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    workflowId: varchar('workflow_id', { length: 36 })
      .notNull()
      .references(() => workflows.id),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    triggerKind: varchar('trigger_kind', { length: 30 }).notNull(),
    status: varchar('status', { length: 30 }).notNull().default('queued'),
    startedAt: timestamp('started_at'),
    finishedAt: timestamp('finished_at'),
    error: text('error'),
    inputJson: jsonb('input_json'),
    stateJson: jsonb('state_json'),
    stepResultsJson: jsonb('step_results_json'),
    accumulatedCostUsd: real('accumulated_cost_usd'),
    budgetExhausted: boolean('budget_exhausted'),
    sourceEvent: varchar('source_event', { length: 500 }),
    idempotencyKey: varchar('idempotency_key', { length: 100 }),
    rerunOfRunId: varchar('rerun_of_run_id', { length: 36 }),
    resumeStepId: varchar('resume_step_id', { length: 36 }),
    lastOutputJson: jsonb('last_output_json'),
  },
  (table) => ({
    workflowIdIdx: index('idx_workflow_runs_workflow_id').on(table.workflowId),
    userIdIdx: index('idx_workflow_runs_user_id').on(table.userId),
    statusIdx: index('idx_workflow_runs_status').on(table.status),
  }),
)

export const policies = pgTable(
  'policies',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    workspaceId: varchar('workspace_id', { length: 36 }).references(() => workspaces.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    rulesJson: jsonb('rules_json').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_policies_user_id').on(table.userId),
    workspaceIdIdx: index('idx_policies_workspace_id').on(table.workspaceId),
  }),
)

export const approvals = pgTable(
  'approvals',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    conversationId: varchar('conversation_id', { length: 36 }).references(() => conversations.id),
    workflowRunId: varchar('workflow_run_id', { length: 36 }).references(() => workflowRuns.id),
    toolName: varchar('tool_name', { length: 255 }).notNull(),
    toolInputJson: jsonb('tool_input_json').notNull(),
    reason: text('reason'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    decision: varchar('decision', { length: 20 }),
    decidedBy: varchar('decided_by', { length: 36 }),
    decidedAt: timestamp('decided_at'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_approvals_user_id').on(table.userId),
    conversationIdIdx: index('idx_approvals_conversation_id').on(table.conversationId),
    workflowRunIdIdx: index('idx_approvals_workflow_run_id').on(table.workflowRunId),
    statusIdx: index('idx_approvals_status').on(table.status),
  }),
)

export const connectors = pgTable(
  'connectors',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    provider: varchar('provider', { length: 50 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('connected'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at'),
    accountEmail: varchar('account_email', { length: 255 }),
    scopes: jsonb('scopes'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_connectors_user_id').on(table.userId),
  }),
)

export const connectorHealth = pgTable(
  'connector_health',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    connectorId: varchar('connector_id', { length: 36 })
      .notNull()
      .references(() => connectors.id),
    status: varchar('status', { length: 20 }).notNull(),
    lastSuccessAt: timestamp('last_success_at'),
    lastFailureAt: timestamp('last_failure_at'),
    lastError: text('last_error'),
    p95LatencyMs: integer('p95_latency_ms'),
    rateLimitHits: integer('rate_limit_hits').notNull().default(0),
    failureStreak: integer('failure_streak').notNull().default(0),
    alertsJson: jsonb('alerts_json'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    connectorIdIdx: index('idx_connector_health_connector_id').on(table.connectorId),
  }),
)

export const webhooks = pgTable(
  'webhooks',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    workspaceId: varchar('workspace_id', { length: 36 }).references(() => workspaces.id),
    name: varchar('name', { length: 255 }).notNull(),
    url: varchar('url', { length: 500 }).notNull(),
    events: jsonb('events').notNull(),
    secret: varchar('secret', { length: 255 }),
    enabled: boolean('enabled').notNull().default(true),
    headersJson: jsonb('headers_json'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_webhooks_user_id').on(table.userId),
    workspaceIdIdx: index('idx_webhooks_workspace_id').on(table.workspaceId),
  }),
)

export const triggers = pgTable(
  'triggers',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    workflowId: varchar('workflow_id', { length: 36 })
      .notNull()
      .references(() => workflows.id),
    kind: varchar('kind', { length: 30 }).notNull(),
    configJson: jsonb('config_json').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    lastFiredAt: timestamp('last_fired_at'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    workflowIdIdx: index('idx_triggers_workflow_id').on(table.workflowId),
  }),
)

export const skillRegistry = pgTable(
  'skill_registry',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    version: varchar('version', { length: 20 }).notNull(),
    manifestJson: jsonb('manifest_json').notNull(),
    source: varchar('source', { length: 20 }).notNull().default('local'),
    registryUrl: varchar('registry_url', { length: 500 }),
    installedAt: timestamp('installed_at'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_skill_registry_user_id').on(table.userId),
  }),
)

export const packs = pgTable(
  'packs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    version: varchar('version', { length: 20 }).notNull(),
    manifestJson: jsonb('manifest_json').notNull(),
    isPublic: boolean('is_public').notNull().default(false),
    authorName: varchar('author_name', { length: 255 }),
    authorUrl: varchar('author_url', { length: 500 }),
    downloadCount: integer('download_count').notNull().default(0),
    rating: real('rating'),
    installedAt: timestamp('installed_at'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_packs_user_id').on(table.userId),
  }),
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).references(() => users.id),
    workspaceId: varchar('workspace_id', { length: 36 }).references(() => workspaces.id),
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }).notNull(),
    resourceId: varchar('resource_id', { length: 36 }),
    metadata: jsonb('metadata'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_audit_logs_user_id').on(table.userId),
    workspaceIdIdx: index('idx_audit_logs_workspace_id').on(table.workspaceId),
    resourceIdx: index('idx_audit_logs_resource').on(table.resourceType, table.resourceId),
    createdAtIdx: index('idx_audit_logs_created_at').on(table.createdAt),
  }),
)

export const sessions = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    token: varchar('token', { length: 255 }).notNull().unique(),
    refreshToken: varchar('refresh_token', { length: 255 }),
    expiresAt: timestamp('expires_at'),
    lastUsedAt: timestamp('last_used_at'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_sessions_user_id').on(table.userId),
    tokenIdx: index('idx_sessions_token').on(table.token),
  }),
)

export const notifications = pgTable(
  'notifications',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body'),
    link: varchar('link', { length: 500 }),
    read: boolean('read').notNull().default(false),
    readAt: timestamp('read_at'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_notifications_user_id').on(table.userId),
  }),
)

export const metrics = pgTable(
  'metrics',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).references(() => users.id),
    workspaceId: varchar('workspace_id', { length: 36 }).references(() => workspaces.id),
    metricType: varchar('metric_type', { length: 50 }).notNull(),
    value: real('value').notNull(),
    tags: jsonb('tags'),
    timestamp: timestamp('timestamp').notNull(),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_metrics_user_id').on(table.userId),
    workspaceIdIdx: index('idx_metrics_workspace_id').on(table.workspaceId),
    typeTimestampIdx: index('idx_metrics_type_timestamp').on(table.metricType, table.timestamp),
  }),
)

export const handoffs = pgTable(
  'handoffs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    conversationId: varchar('conversation_id', { length: 36 })
      .notNull()
      .references(() => conversations.id),
    fromUserId: varchar('from_user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    toUserId: varchar('to_user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    notes: text('notes'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    respondedAt: timestamp('responded_at'),
  },
  (table) => ({
    conversationIdIdx: index('idx_handoffs_conversation_id').on(table.conversationId),
    fromUserIdIdx: index('idx_handoffs_from_user_id').on(table.fromUserId),
    toUserIdIdx: index('idx_handoffs_to_user_id').on(table.toUserId),
  }),
)

export const channels = pgTable(
  'channels',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    workspaceId: varchar('workspace_id', { length: 36 }).references(() => workspaces.id),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    configJson: jsonb('config_json').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_channels_user_id').on(table.userId),
    workspaceIdIdx: index('idx_channels_workspace_id').on(table.workspaceId),
  }),
)

export const playbooks = pgTable(
  'playbooks',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    workspaceId: varchar('workspace_id', { length: 36 }).references(() => workspaces.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    version: varchar('version', { length: 20 }).notNull(),
    stepsJson: jsonb('steps_json').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_playbooks_user_id').on(table.userId),
    workspaceIdIdx: index('idx_playbooks_workspace_id').on(table.workspaceId),
  }),
)

export const crons = pgTable(
  'crons',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    workflowId: varchar('workflow_id', { length: 36 })
      .notNull()
      .references(() => workflows.id),
    cronExpression: varchar('cron_expression', { length: 100 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    nextRunAt: timestamp('next_run_at'),
    lastRunAt: timestamp('last_run_at'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    workflowIdIdx: index('idx_crons_workflow_id').on(table.workflowId),
  }),
)

export const agentVersions = pgTable(
  'agent_versions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    agentId: varchar('agent_id', { length: 36 })
      .notNull()
      .references(() => agents.id),
    version: integer('version').notNull(),
    configJson: jsonb('config_json').notNull(),
    changelog: text('changelog'),
    isCurrent: boolean('is_current').notNull().default(false),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    agentIdIdx: index('idx_agent_versions_agent_id').on(table.agentId),
  }),
)

export const artifacts = pgTable(
  'artifacts',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    conversationId: varchar('conversation_id', { length: 36 }).references(() => conversations.id),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }),
    size: integer('size').notNull(),
    storageKey: varchar('storage_key', { length: 500 }).notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_artifacts_user_id').on(table.userId),
    conversationIdIdx: index('idx_artifacts_conversation_id').on(table.conversationId),
  }),
)

export const lineage = pgTable(
  'lineage',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    runId: varchar('run_id', { length: 36 }).notNull(),
    parentRunId: varchar('parent_run_id', { length: 36 }),
    workflowId: varchar('workflow_id', { length: 36 }),
    workflowRunId: varchar('workflow_run_id', { length: 36 }),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    eventData: jsonb('event_data'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdIdx: index('idx_lineage_user_id').on(table.userId),
    runIdIdx: index('idx_lineage_run_id').on(table.runId),
  }),
)

export type User = typeof users.$inferSelect
export type ApiKey = typeof apiKeys.$inferSelect
export type Workspace = typeof workspaces.$inferSelect
export type WorkspaceMember = typeof workspaceMembers.$inferSelect
export type Conversation = typeof conversations.$inferSelect
export type Message = typeof messages.$inferSelect
export type AgentRun = typeof agentRuns.$inferSelect
export type Agent = typeof agents.$inferSelect
export type Tool = typeof tools.$inferSelect
export type ConnectedTool = typeof connectedTools.$inferSelect
export type MemoryEvent = typeof memoryEvents.$inferSelect
export type MemoryFact = typeof memoryFacts.$inferSelect
export type MemoryConflict = typeof memoryConflicts.$inferSelect
export type Workflow = typeof workflows.$inferSelect
export type WorkflowRun = typeof workflowRuns.$inferSelect
export type Policy = typeof policies.$inferSelect
export type Approval = typeof approvals.$inferSelect
export type Connector = typeof connectors.$inferSelect
export type ConnectorHealthEntry = typeof connectorHealth.$inferSelect
export type Webhook = typeof webhooks.$inferSelect
export type Trigger = typeof triggers.$inferSelect
export type SkillRegistry = typeof skillRegistry.$inferSelect
export type Pack = typeof packs.$inferSelect
export type AuditLog = typeof auditLogs.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Notification = typeof notifications.$inferSelect
export type Metric = typeof metrics.$inferSelect
export type Handoff = typeof handoffs.$inferSelect
export type Channel = typeof channels.$inferSelect
export type Playbook = typeof playbooks.$inferSelect
export type Cron = typeof crons.$inferSelect
export type AgentVersion = typeof agentVersions.$inferSelect
export type Artifact = typeof artifacts.$inferSelect
export type LineageEvent = typeof lineage.$inferSelect
