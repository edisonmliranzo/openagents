/**
 * Cost Tracking Types for OpenAgents
 * Token cost estimation and spend analytics
 */

export interface TokenCost {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

export interface ConversationCost {
  sessionId: string;
  userId: string;
  workspaceId?: string;
  tokenCost: TokenCost;
  model: string;
  estimatedCost: number;
  calculatedAt: Date;
  breakdown: CostBreakdown[];
}

export interface CostBreakdown {
  category: 'messages' | 'tools' | 'context' | 'other';
  description: string;
  tokens: number;
  cost: number;
}

export interface SpendSummary {
  userId: string;
  workspaceId?: string;
  period: {
    start: Date;
    end: Date;
  };
  totalSpend: number;
  totalTokens: number;
  byDay: DailySpend[];
  byWeek: WeeklySpend[];
  byMonth: MonthlySpend[];
  byModel: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface DailySpend {
  date: string;
  spend: number;
  tokens: number;
  sessions: number;
}

export interface WeeklySpend {
  week: string;
  spend: number;
  tokens: number;
  sessions: number;
}

export interface MonthlySpend {
  month: string;
  spend: number;
  tokens: number;
  sessions: number;
}

export interface CostAlert {
  id: string;
  userId: string;
  workspaceId?: string;
  type: 'daily_limit' | 'monthly_limit' | 'session_limit' | 'threshold_exceeded';
  threshold: number;
  currentSpend: number;
  isActive: boolean;
  notifyAt: number;
  notifiedAt?: Date;
  createdAt: Date;
}

export interface CostBudget {
  id: string;
  userId: string;
  workspaceId?: string;
  name: string;
  limit: number;
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'lifetime';
  currentSpend: number;
  isActive: boolean;
  alertThreshold: number;
  createdAt: Date;
}

export interface CostMetrics {
  totalSpend: number;
  totalTokens: number;
  averageCostPerSession: number;
  averageCostPerMessage: number;
  averageCostPerTool: number;
  mostExpensiveSessions: { sessionId: string; cost: number }[];
  costTrends: {
    dayOverDay: number;
    weekOverWeek: number;
    monthOverMonth: number;
  };
}

export interface LLMModelPricing {
  model: string;
  provider: string;
  inputCostPerToken: number;
  outputCostPerToken: number;
  currency: string;
  effectiveFrom: Date;
}

export interface CostFilter {
  userId?: string;
  workspaceId?: string;
  sessionId?: string;
  model?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  minCost?: number;
  maxCost?: number;
}

export interface CostReport {
  id: string;
  userId: string;
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  period: {
    start: Date;
    end: Date;
  };
  totalSpend: number;
  totalTokens: number;
  breakdown: CostBreakdown[];
  generatedAt: Date;
}

export type CostEventType =
  | 'cost.calculated'
  | 'cost.alert.triggered'
  | 'cost.budget.exceeded'
  | 'cost.report.generated';

export interface CostEvent {
  type: CostEventType;
  userId: string;
  sessionId?: string;
  amount?: number;
  timestamp: Date;
  data?: Record<string, unknown>;
}
