import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LearnedPattern {
  id: string;
  userId: string;
  pattern: string;
  type: 'preference' | 'behavior' | 'context' | 'skill';
  frequency: number;
  confidence: number;
  examples: string[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface LearningStats {
  sessions: number;
  patternsLearned: number;
  preferences: number;
  contextScore: number;
  improvementRate: number;
  topPatterns: string[];
}

export interface InteractionEntry {
  userId: string;
  input: string;
  output: string;
  context?: string;
  timestamp: number;
  channel?: string;
  model?: string;
  success?: boolean;
  feedback?: number;
}

@Injectable()
export class LearningService implements OnModuleInit {
  private readonly logger = new Logger(LearningService.name);
  private readonly PATTERN_WEIGHTS = {
    preference: 2.0,
    behavior: 1.5,
    context: 1.0,
    skill: 3.0,
  };

  private readonly MIN_CONFIDENCE = 0.3;
  private readonly MIN_FREQUENCY = 3;
  private readonly MAX_PATTERNS_PER_USER = 100;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    this.logger.log('🧠 Learning Service initialized - Agent will improve over time');
  }

  /**
   * Track a user interaction for learning
   */
  async trackInteraction(entry: InteractionEntry): Promise<void> {
    try {
      // Store raw interaction
      await this.prisma.learningInteraction.create({
        data: {
          userId: entry.userId,
          input: entry.input.slice(0, 10000),
          output: entry.output.slice(0, 10000),
          context: entry.context?.slice(0, 2000),
          channel: entry.channel,
          model: entry.model,
          success: entry.success,
          feedback: entry.feedback,
          timestamp: new Date(entry.timestamp),
        },
      });

      // Extract and learn patterns from this interaction
      await this.extractPatterns(entry);

      // Update session statistics
      await this.updateSessionStats(entry.userId);

      // Increment learning score
      await this.updateLearningScore(entry.userId);

    } catch (error) {
      this.logger.error('Failed to track interaction', error);
    }
  }

  /**
   * Extract patterns from user interactions
   */
  private async extractPatterns(entry: InteractionEntry): Promise<void> {
    const patterns = this.analyzeInteraction(entry);

    for (const pattern of patterns) {
      const existing = await this.prisma.learnedPattern.findFirst({
        where: {
          userId: entry.userId,
          pattern: pattern.pattern,
          type: pattern.type,
        },
      });

      if (existing) {
        // Update existing pattern
        const newFrequency = existing.frequency + 1;
        const newConfidence = Math.min(1.0, existing.confidence + 0.1);
        const examples = [...existing.examples, pattern.example].slice(-10);

        await this.prisma.learnedPattern.update({
          where: { id: existing.id },
          data: {
            frequency: newFrequency,
            confidence: newConfidence,
            examples,
            updatedAt: new Date(),
          },
        });
      } else {
        // Create new pattern
        await this.prisma.learnedPattern.create({
          data: {
            userId: entry.userId,
            pattern: pattern.pattern,
            type: pattern.type,
            frequency: 1,
            confidence: this.MIN_CONFIDENCE,
            examples: [pattern.example],
            metadata: pattern.metadata,
          },
        });

        // Cleanup old patterns if needed
        await this.cleanupPatterns(entry.userId);
      }
    }
  }

  /**
   * Analyze interaction and extract meaningful patterns
   */
  private analyzeInteraction(entry: InteractionEntry): Array<{
    pattern: string;
    type: 'preference' | 'behavior' | 'context' | 'skill';
    example: string;
    metadata?: Record<string, any>;
  }> {
    const patterns: Array<{
      pattern: string;
      type: 'preference' | 'behavior' | 'context' | 'skill';
      example: string;
      metadata?: Record<string, any>;
    }> = [];

    const input = entry.input.toLowerCase();
    const output = entry.output;

    // Extract preferences (what user likes)
    if (/\b(please|could you|i'd like|i prefer|i want)\b/i.test(input)) {
      const preferenceMatch = input.match(/i(?:'d like to| prefer| want)?\s*(.+?)(?:\.|$)/i);
      if (preferenceMatch) {
        patterns.push({
          pattern: `pref:${preferenceMatch[1].trim().slice(0, 100)}`,
          type: 'preference',
          example: entry.input.slice(0, 200),
        });
      }
    }

    // Extract communication style preferences
    if (/\b(concise|brief|short|detailed|verbose|explain)\b/i.test(input)) {
      const style = input.match(/\b(concise|brief|short|detailed|verbose|explain)\b/i)?.[1] || 'normal';
      patterns.push({
        pattern: `style:${style}`,
        type: 'preference',
        example: entry.input.slice(0, 200),
        metadata: { channel: entry.channel },
      });
    }

    // Extract context patterns (what topics they work on)
    const contextKeywords = [
      'coding', 'programming', 'code', 'software', 'git', 'debug',
      'writing', 'documentation', 'content', 'blog', 'article',
      'research', 'analysis', 'data', 'report', 'metrics',
      'email', 'calendar', 'schedule', 'meeting', 'task',
      'design', 'ui', 'ux', 'mockup', 'wireframe',
      'testing', 'test', 'qa', 'quality',
      'deployment', 'devops', 'ci', 'cd', 'docker', 'kubernetes',
    ];

    for (const keyword of contextKeywords) {
      if (input.includes(keyword)) {
        patterns.push({
          pattern: `context:${keyword}`,
          type: 'context',
          example: entry.input.slice(0, 200),
        });
      }
    }

    // Extract behavior patterns (how they use the agent)
    if (/\b(why|how|what|when|where)\b/i.test(input)) {
      patterns.push({
        pattern: 'behavior:question_asking',
        type: 'behavior',
        example: entry.input.slice(0, 200),
      });
    }

    if (/\b(do|make|create|generate|build|write|implement)\b/i.test(input)) {
      patterns.push({
        pattern: 'behavior:task_creation',
        type: 'behavior',
        example: entry.input.slice(0, 200),
      });
    }

    // Extract skill development (successful completions)
    if (entry.success !== false && output.length > 50) {
      const skillIndicators = [
        { pattern: /```[\s\S]*?```/g, skill: 'code_generation' },
        { pattern: /^(?:here's|below|following|making)/im, skill: 'structured_output' },
        { pattern: /\d+\s*(?:steps|phase|milestone)/i, skill: 'breakdown_planning' },
        { pattern: /^(?:step\s*\d+|first|second|finally)/im, skill: 'stepwise_execution' },
      ];

      for (const indicator of skillIndicators) {
        if (indicator.pattern.test(output)) {
          patterns.push({
            pattern: `skill:${indicator.skill}`,
            type: 'skill',
            example: entry.input.slice(0, 200),
            metadata: { channel: entry.channel },
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Update session statistics for a user
   */
  private async updateSessionStats(userId: string): Promise<void> {
    const stats = await this.prisma.learningStats.findUnique({
      where: { userId },
    });

    if (stats) {
      await this.prisma.learningStats.update({
        where: { userId },
        data: {
          totalInteractions: { increment: 1 },
          lastActiveAt: new Date(),
        },
      });
    } else {
      await this.prisma.learningStats.create({
        data: {
          userId,
          totalInteractions: 1,
          learningScore: 10, // Start with base score
          lastActiveAt: new Date(),
        },
      });
    }
  }

  /**
   * Update learning score based on interaction quality
   */
  private async updateLearningScore(userId: string): Promise<void> {
    const stats = await this.prisma.learningStats.findUnique({
      where: { userId },
    });

    if (!stats) return;

    // Calculate score increment based on patterns learned
    const recentPatterns = await this.prisma.learnedPattern.count({
      where: {
        userId,
        updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    const scoreIncrement = 1 + (recentPatterns * 0.5);
    const newScore = Math.min(1000, stats.learningScore + scoreIncrement);

    await this.prisma.learningStats.update({
      where: { userId },
      data: { learningScore: newScore },
    });
  }

  /**
   * Get learning statistics for a user
   */
  async getStats(userId: string): Promise<LearningStats> {
    const stats = await this.prisma.learningStats.findUnique({
      where: { userId },
    });

    const patterns = await this.prisma.learnedPattern.findMany({
      where: { userId, confidence: { gte: this.MIN_CONFIDENCE } },
      orderBy: { frequency: 'desc' },
      take: 10,
    });

    const preferences = patterns.filter(p => p.type === 'preference').length;
    const contextScore = this.calculateContextScore(patterns);
    const improvementRate = this.calculateImprovementRate(stats);

    return {
      sessions: stats?.totalInteractions || 0,
      patternsLearned: patterns.length,
      preferences,
      contextScore,
      improvementRate,
      topPatterns: patterns.slice(0, 5).map(p => p.pattern),
    };
  }

  /**
   * Get learned patterns for context injection
   */
  async getContextPatterns(userId: string, maxPatterns = 10): Promise<string[]> {
    const patterns = await this.prisma.learnedPattern.findMany({
      where: {
        userId,
        confidence: { gte: this.MIN_CONFIDENCE },
        frequency: { gte: this.MIN_FREQUENCY },
      },
      orderBy: [
        { confidence: 'desc' },
        { frequency: 'desc' },
      ],
      take: maxPatterns,
    });

    return patterns.map(p => {
      switch (p.type) {
        case 'preference':
          return `User preference: ${p.pattern.replace('pref:', '')}`;
        case 'context':
          return `User works on: ${p.pattern.replace('context:', '')}`;
        case 'skill':
          return `User uses agent for: ${p.pattern.replace('skill:', '')}`;
        default:
          return p.pattern;
      }
    });
  }

  /**
   * Get enhanced system prompt with learned context
   */
  async getEnhancedSystemPrompt(userId: string, basePrompt: string): Promise<string> {
    const patterns = await this.getContextPatterns(userId);

    if (patterns.length === 0) {
      return basePrompt;
    }

    const learningContext = `
    
---
## 📚 Learned User Context (Adaptive)

The user has interacted with you before. Based on their history:

${patterns.map(p => `- ${p}`).join('\n')}

*This context helps provide personalized responses.*
---`;

    return basePrompt + learningContext;
  }

  /**
   * Calculate context understanding score (0-100)
   */
  private calculateContextScore(patterns: any[]): number {
    if (patterns.length === 0) return 0;

    const avgConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
    const typeDiversity = new Set(patterns.map(p => p.type)).size;
    const diversityBonus = (typeDiversity / 4) * 20;

    return Math.min(100, Math.round((avgConfidence * 80) + diversityBonus));
  }

  /**
   * Calculate improvement rate based on recent activity
   */
  private calculateImprovementRate(stats: any): number {
    if (!stats || !stats.lastActiveAt) return 0;

    const daysSinceActive = Math.floor(
      (Date.now() - new Date(stats.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceActive > 7) return 0;

    // Improvement rate based on learning score (capped at 100%)
    return Math.min(100, Math.round((stats.learningScore || 0) / 10));
  }

  /**
   * Cleanup old patterns when limit is exceeded
   */
  private async cleanupPatterns(userId: string): Promise<void> {
    const count = await this.prisma.learnedPattern.count({
      where: { userId },
    });

    if (count > this.MAX_PATTERNS_PER_USER) {
      // Delete lowest confidence patterns first
      const toDelete = await this.prisma.learnedPattern.findMany({
        where: { userId },
        orderBy: [
          { confidence: 'asc' },
          { frequency: 'asc' },
        ],
        take: count - this.MAX_PATTERNS_PER_USER,
      });

      await this.prisma.learnedPattern.deleteMany({
        where: {
          id: { in: toDelete.map(p => p.id) },
        },
      });
    }
  }

  /**
   * Clear all learning data for a user
   */
  async clearUserLearning(userId: string): Promise<void> {
    await Promise.all([
      this.prisma.learnedPattern.deleteMany({ where: { userId } }),
      this.prisma.learningInteraction.deleteMany({ where: { userId } }),
      this.prisma.learningStats.deleteMany({ where: { userId } }),
    ]);

    this.logger.log(`Cleared learning data for user ${userId}`);
  }
}
