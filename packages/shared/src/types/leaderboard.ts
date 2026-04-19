/**
 * Agent Performance Leaderboard Types for OpenAgents
 * Ranking agent presets by performance metrics
 */

export enum LeaderboardMetric {
  AVG_LATENCY = 'avg_latency',
  SUCCESS_RATE = 'success_rate',
  USER_RATING = 'user_rating',
  COST_EFFICIENCY = 'cost_efficiency',
  TOKEN_USAGE = 'token_usage',
  OVERALL_SCORE = 'overall_score',
}

export enum TimePeriod {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
  ALL_TIME = 'all_time',
}

export interface AgentScore {
  agentPresetId: string;
  agentPresetName: string;
  
  // Metrics
  avgLatency: number;
  successRate: number;
  userRating: number;
  costEfficiency: number;
  tokenUsage: number;
  overallScore: number;
  
  // Details
  totalSessions: number;
  successfulSessions: number;
  totalTokenUsage: number;
  totalCost: number;
  averageRating: number;
  totalRatings: number;
  
  // Ranking
  rank: number;
  previousRank?: number;
  rankChange: number;
  
  // Time
  period: TimePeriod;
  calculatedAt: Date;
}

export interface LeaderboardEntry {
  rank: number;
  agentPresetId: string;
  agentPresetName: string;
  agentPresetIcon?: string;
  overallScore: number;
  metrics: {
    avgLatency: number;
    successRate: number;
    userRating: number;
    costEfficiency: number;
  };
  trend: 'up' | 'down' | 'stable';
  rankHistory: { date: string; rank: number }[];
}

export interface Leaderboard {
  id: string;
  name: string;
  description?: string;
  metric: LeaderboardMetric | LeaderboardMetric[];
  timePeriod: TimePeriod;
  workspaceId?: string;
  isPublic: boolean;
  entries: LeaderboardEntry[];
  totalEntries: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ABTestComparison {
  id: string;
  agentPresetA: string;
  agentPresetB: string;
  metric: LeaderboardMetric;
  
  // Results
  scoreA: number;
  scoreB: number;
  winner: 'A' | 'B' | 'tie';
  confidence: number;
  sampleSize: number;
  
  // Analysis
  improvement: number;
  isStatisticallySignificant: boolean;
  
  // Time
  period: TimePeriod;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
}

export interface PerformanceSnapshot {
  agentPresetId: string;
  timestamp: Date;
  metrics: {
    avgLatency: number;
    successRate: number;
    userRating: number;
    costEfficiency: number;
    overallScore: number;
  };
  sessionCount: number;
  tokenUsage: number;
  cost: number;
}

export interface PerformanceTrend {
  agentPresetId: string;
  metric: LeaderboardMetric;
  snapshots: PerformanceSnapshot[];
  trendDirection: 'improving' | 'declining' | 'stable';
  percentChange: number;
}

export interface LeaderboardFilter {
  metric?: LeaderboardMetric[];
  timePeriod?: TimePeriod[];
  workspaceId?: string;
  minSessions?: number;
  minRatings?: number;
}

export interface LeaderboardMetrics {
  totalPresets: number;
  totalSessions: number;
  averageSuccessRate: number;
  averageLatency: number;
  topPerformers: string[];
  mostImproved: string[];
  strugglingPresets: string[];
}

export interface ComparisonRequest {
  agentPresetIds: string[];
  metric: LeaderboardMetric;
  timePeriod: TimePeriod;
  minSampleSize?: number;
}

export interface RankingWeights {
  avgLatency: number;
  successRate: number;
  userRating: number;
  costEfficiency: number;
  tokenUsage: number;
}

export type LeaderboardEventType =
  | 'leaderboard.updated'
  | 'leaderboard.rank_changed'
  | 'leaderboard.new_leader'
  | 'leaderboard.ab_test.started'
  | 'leaderboard.ab_test.completed';

export interface LeaderboardEvent {
  type: LeaderboardEventType;
  leaderboardId: string;
  agentPresetId?: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}
