/**
 * Agent Run Scheduler Types for OpenAgents
 * Schedule recurring agent runs with cron expressions
 */

export enum ScheduleFrequency {
  ONCE = 'once',
  MINUTELY = 'minutely',
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
  CUSTOM = 'custom',
}

export enum ScheduleStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum OutputDelivery {
  EMAIL = 'email',
  MEMORY = 'memory',
  WEBHOOK = 'webhook',
  FILE = 'file',
  DASHBOARD = 'dashboard',
}

export interface CronSchedule {
  expression: string;
  timezone: string;
  description?: string;
  nextRunAt: Date;
  lastRunAt?: Date;
}

export interface Schedule {
  id: string;
  userId: string;
  workspaceId?: string;
  name: string;
  description?: string;
  
  // Timing
  frequency: ScheduleFrequency;
  cronExpression?: string;
  timezone: string;
  startsAt: Date;
  endsAt?: Date;
  nextRunAt: Date;
  lastRunAt?: Date;
  
  // Task
  agentPreset: string;
  prompt: string;
  variables?: Record<string, unknown>;
  maxDuration?: number;
  
  // Output
  outputDelivery: OutputDelivery[];
  emailRecipients?: string[];
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
  memoryKey?: string;
  
  // Status
  status: ScheduleStatus;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  lastError?: string;
  
  // Metadata
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface ScheduledRun {
  id: string;
  scheduleId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  output?: string;
  error?: string;
  duration?: number;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
  outputDelivered: OutputDelivery[];
  metadata?: Record<string, unknown>;
}

export interface ScheduleExecution {
  id: string;
  scheduleId: string;
  scheduledTime: Date;
  actualStartTime: Date;
  endTime?: Date;
  status: 'skipped' | 'queued' | 'running' | 'completed' | 'failed';
  reason?: string;
}

export interface ScheduleHistory {
  scheduleId: string;
  executions: ScheduleExecution[];
  statistics: {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    averageLatency: number;
  };
}

export interface ScheduleFilter {
  userId?: string;
  workspaceId?: string;
  status?: ScheduleStatus[];
  frequency?: ScheduleFrequency[];
  tags?: string[];
  agentPreset?: string;
}

export interface ScheduleMetrics {
  totalSchedules: number;
  activeSchedules: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageLatency: number;
  schedulesByFrequency: Record<ScheduleFrequency, number>;
}

export interface ScheduleNotification {
  scheduleId: string;
  type: 'upcoming' | 'failed' | 'completed' | 'paused';
  recipients: string[];
  message: string;
  scheduledFor: Date;
}

export type ScheduleEventType =
  | 'schedule.created'
  | 'schedule.updated'
  | 'schedule.deleted'
  | 'schedule.paused'
  | 'schedule.resumed'
  | 'schedule.run.started'
  | 'schedule.run.completed'
  | 'schedule.run.failed';

export interface ScheduleEvent {
  type: ScheduleEventType;
  scheduleId: string;
  runId?: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}
