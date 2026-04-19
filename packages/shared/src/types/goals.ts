/**
 * Long-Term Goal Tracking Types for OpenAgents
 * Multi-session objectives with auto-resume capabilities
 */

export enum GoalStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum GoalPriority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  CRITICAL = 3,
}

export enum GoalCategory {
  RESEARCH = 'research',
  LEARNING = 'learning',
  PROJECT = 'project',
  HABIT = 'habit',
  MILESTONE = 'milestone',
  CUSTOM = 'custom',
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: GoalStatus;
  priority: GoalPriority;
  category: GoalCategory;
  
  // Progress tracking
  progress: number; // 0-100
  completedSteps: string[];
  pendingSteps: string[];
  failedSteps: string[];
  
  // Temporal
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  dueDate?: Date;
  autoResumeAt?: Date;
  
  // Linking
  linkedSessions: string[];
  linkedMemories: string[];
  parentGoalId?: string;
  subGoalIds: string[];
  
  // Metadata
  tags: string[];
  milestones: Milestone[];
  checkpoints: Checkpoint[];
  customFields: Record<string, unknown>;
  
  // Context preservation
  context: GoalContext;
  resumePrompt?: string;
  
  // Notifications
  reminderConfig?: ReminderConfig;
  notifyOnProgress?: boolean;
  notifyOnCompletion?: boolean;
}

export interface GoalContext {
  originalPrompt: string;
  relevantFiles?: string[];
  relevantUrls?: string[];
  relevantDocuments?: string[];
  agentPreset?: string;
  variables: Record<string, unknown>;
  lastCheckpoint?: Checkpoint;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  targetDate?: Date;
  completed: boolean;
  completedAt?: Date;
  progress: number;
}

export interface Checkpoint {
  id: string;
  timestamp: Date;
  sessionId: string;
  summary: string;
  progress: number;
  nextSteps: string[];
  contextSnapshot: GoalContext;
  isAutoSave: boolean;
}

export interface ReminderConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'custom';
  customCron?: string;
  reminderTime?: string;
  channels: ('email' | 'push' | 'in_app')[];
}

export interface GoalProgressUpdate {
  goalId: string;
  progress: number;
  completedSteps?: string[];
  newCheckpoint?: Partial<Checkpoint>;
  notes?: string;
}

export interface GoalAssignment {
  goalId: string;
  assignedAgentId: string;
  task: string;
  priority: GoalPriority;
  context: GoalContext;
}

export interface GoalMetrics {
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  averageCompletionTime: number;
  goalsByCategory: Record<GoalCategory, number>;
  goalsByPriority: Record<GoalPriority, number>;
  streakDays: number;
}

export interface GoalSearchFilter {
  status?: GoalStatus[];
  category?: GoalCategory[];
  priority?: GoalPriority[];
  tags?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  hasLinkedSessions?: boolean;
}

export type GoalEventType =
  | 'goal.created'
  | 'goal.updated'
  | 'goal.progress'
  | 'goal.milestone.completed'
  | 'goal.checkpoint.saved'
  | 'goal.completed'
  | 'goal.failed'
  | 'goal.cancelled'
  | 'goal.resumed'
  | 'goal.expired';

export interface GoalEvent {
  type: GoalEventType;
  goalId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

export interface GoalTemplate {
  id: string;
  name: string;
  description: string;
  category: GoalCategory;
  defaultSteps: string[];
  suggestedTags: string[];
  reminderConfig?: Partial<ReminderConfig>;
  customFields?: Record<string, unknown>;
}
