/**
 * Chat Message Reactions & Ratings Types for OpenAgents
 * User feedback system with A/B test scoring
 */

export enum ReactionType {
  THUMBS_UP = 'thumbs_up',
  THUMBS_DOWN = 'thumbs_down',
  HEART = 'heart',
  LAUGH = 'laugh',
  THINKING = 'thinking',
  FIRE = 'fire',
}

export enum RatingType {
  STAR_1 = 1,
  STAR_2 = 2,
  STAR_3 = 3,
  STAR_4 = 4,
  STAR_5 = 5,
}

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  type: ReactionType;
  createdAt: Date;
}

export interface MessageRating {
  id: string;
  messageId: string;
  userId: string;
  rating: RatingType;
  comment?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface ReactionSummary {
  messageId: string;
  thumbsUp: number;
  thumbsDown: number;
  hearts: number;
  laughs: number;
  thoughts: number;
  fires: number;
  totalReactions: number;
}

export interface RatingSummary {
  messageId: string;
  averageRating: number;
  totalRatings: number;
  ratingDistribution: Record<RatingType, number>;
}

export interface ABTestScore {
  agentPresetId: string;
  sessionId: string;
  positiveReactions: number;
  negativeReactions: number;
  averageRating: number;
  totalInteractions: number;
  successRate: number;
  score: number;
  calculatedAt: Date;
}

export interface ReactionAggregation {
  totalReactions: number;
  reactionsByType: Record<ReactionType, number>;
  userReactions: Record<string, ReactionType>;
}

export interface RatingAggregation {
  totalRatings: number;
  averageRating: number;
  ratingDistribution: Record<RatingType, number>;
  userRatings: Record<string, RatingType>;
}

export interface FeedbackMetrics {
  totalMessages: number;
  messagesWithReactions: number;
  messagesWithRatings: number;
  averageReactionsPerMessage: number;
  averageRating: number;
  positiveRate: number;
}

export interface ReactionFilter {
  messageId?: string;
  userId?: string;
  type?: ReactionType[];
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface RatingFilter {
  messageId?: string;
  userId?: string;
  minRating?: RatingType;
  maxRating?: RatingType;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export type ReactionEventType =
  | 'reaction.added'
  | 'reaction.removed'
  | 'rating.added'
  | 'rating.updated'
  | 'ab_test.scored';

export interface ReactionEvent {
  type: ReactionEventType;
  messageId: string;
  userId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}
