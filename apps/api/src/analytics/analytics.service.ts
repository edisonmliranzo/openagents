import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  AnalyticsSummary,
  TokenUsageMetrics,
  CostAnalysis,
  PerformanceMetrics,
  UsageTrends,
  PredictiveAnalytics,
} from '@openagents/shared'

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name)

  constructor(private prisma: PrismaService) {}

  /**
   * Get comprehensive analytics summary for a user
   */
  async getAnalyticsSummary(userId: string, timeframe: '7d' | '30d' | '90d' = '30d'): Promise<AnalyticsSummary> {
    const [tokenUsage, costAnalysis, performance, trends, predictions] = await Promise.all([
      this.getTokenUsageMetrics(userId, timeframe),
      this.getCostAnalysis(userId, timeframe),
      this.getPerformanceMetrics(userId, timeframe),
      this.getUsageTrends(userId, timeframe),
      this.getPredictiveAnalytics(userId, timeframe),
    ])

    return {
      tokenUsage,
      costAnalysis,
      performance,
      trends,
      predictions,
      generatedAt: new Date().toISOString(),
    }
  }

  /**
   * Get detailed token usage metrics
   */
  async getTokenUsageMetrics(userId: string, timeframe: string): Promise<TokenUsageMetrics> {
    const endDate = new Date()
    const startDate = new Date()
    
    if (timeframe === '7d') startDate.setDate(endDate.getDate() - 7)
    else if (timeframe === '30d') startDate.setDate(endDate.getDate() - 30)
    else if (timeframe === '90d') startDate.setDate(endDate.getDate() - 90)

    // Get token usage by agent
    const agentUsage = await this.prisma.$queryRaw<
      Array<{ agent_id: string; agent_name: string; total_tokens: number; input_tokens: number; output_tokens: number }>
    >`
      SELECT 
        a.id as agent_id,
        a.name as agent_name,
        SUM(mu.total_tokens) as total_tokens,
        SUM(mu.input_tokens) as input_tokens,
        SUM(mu.output_tokens) as output_tokens
      FROM agent_usage mu
      JOIN agents a ON mu.agent_id = a.id
      WHERE a.user_id = ${userId}
        AND mu.created_at >= ${startDate}
        AND mu.created_at <= ${endDate}
      GROUP BY a.id, a.name
      ORDER BY total_tokens DESC
    `

    // Get daily usage trends
    const dailyUsage = await this.prisma.$queryRaw<
      Array<{ date: string; total_tokens: number }>
    >`
      SELECT 
        DATE(mu.created_at) as date,
        SUM(mu.total_tokens) as total_tokens
      FROM agent_usage mu
      JOIN agents a ON mu.agent_id = a.id
      WHERE a.user_id = ${userId}
        AND mu.created_at >= ${startDate}
        AND mu.created_at <= ${endDate}
      GROUP BY DATE(mu.created_at)
      ORDER BY date ASC
    `

    const totalTokens = agentUsage.reduce((sum, agent) => sum + Number(agent.total_tokens), 0)
    const totalInputTokens = agentUsage.reduce((sum, agent) => sum + Number(agent.input_tokens), 0)
    const totalOutputTokens = agentUsage.reduce((sum, agent) => sum + Number(agent.output_tokens), 0)

    return {
      totalTokens,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      byAgent: agentUsage.map(agent => ({
        agentId: agent.agent_id,
        agentName: agent.agent_name,
        totalTokens: Number(agent.total_tokens),
        inputTokens: Number(agent.input_tokens),
        outputTokens: Number(agent.output_tokens),
      })),
      dailyTrends: dailyUsage.map(day => ({
        date: day.date,
        totalTokens: Number(day.total_tokens),
      })),
      averageDailyTokens: Math.round(totalTokens / (timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90)),
    }
  }

  /**
   * Get detailed cost analysis
   */
  async getCostAnalysis(userId: string, timeframe: string): Promise<CostAnalysis> {
    const endDate = new Date()
    const startDate = new Date()
    
    if (timeframe === '7d') startDate.setDate(endDate.getDate() - 7)
    else if (timeframe === '30d') startDate.setDate(endDate.getDate() - 30)
    else if (timeframe === '90d') startDate.setDate(endDate.getDate() - 90)

    // Get cost by model
    const modelCosts = await this.prisma.$queryRaw<
      Array<{ model: string; total_cost: number; total_tokens: number }>
    >`
      SELECT 
        mu.model,
        SUM(mu.estimated_cost) as total_cost,
        SUM(mu.total_tokens) as total_tokens
      FROM agent_usage mu
      JOIN agents a ON mu.agent_id = a.id
      WHERE a.user_id = ${userId}
        AND mu.created_at >= ${startDate}
        AND mu.created_at <= ${endDate}
      GROUP BY mu.model
      ORDER BY total_cost DESC
    `

    const totalCost = modelCosts.reduce((sum, model) => sum + Number(model.total_cost), 0)
    const totalTokens = modelCosts.reduce((sum, model) => sum + Number(model.total_tokens), 0)

    // Calculate cost per million tokens
    const costPerMillion = totalTokens > 0 ? (totalCost / totalTokens) * 1000000 : 0

    // Get cost trends
    const dailyCosts = await this.prisma.$queryRaw<
      Array<{ date: string; total_cost: number }>
    >`
      SELECT 
        DATE(mu.created_at) as date,
        SUM(mu.estimated_cost) as total_cost
      FROM agent_usage mu
      JOIN agents a ON mu.agent_id = a.id
      WHERE a.user_id = ${userId}
        AND mu.created_at >= ${startDate}
        AND mu.created_at <= ${endDate}
      GROUP BY DATE(mu.created_at)
      ORDER BY date ASC
    `

    // Optimization suggestions
    const suggestions = this.generateCostOptimizationSuggestions(modelCosts, totalCost)

    return {
      totalCost,
      costByModel: modelCosts.map(model => ({
        model: model.model,
        totalCost: Number(model.total_cost),
        totalTokens: Number(model.total_tokens),
        costPerMillionTokens: Number(model.total_tokens) > 0 
          ? (Number(model.total_cost) / Number(model.total_tokens)) * 1000000 
          : 0,
      })),
      dailyTrends: dailyCosts.map(day => ({
        date: day.date,
        totalCost: Number(day.total_cost),
      })),
      averageDailyCost: totalCost / (timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90),
      costPerMillionTokens: costPerMillion,
      projectedMonthlyCost: totalCost * (30 / (timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90)),
      optimizationSuggestions: suggestions,
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(userId: string, timeframe: string): Promise<PerformanceMetrics> {
    const endDate = new Date()
    const startDate = new Date()
    
    if (timeframe === '7d') startDate.setDate(endDate.getDate() - 7)
    else if (timeframe === '30d') startDate.setDate(endDate.getDate() - 30)
    else if (timeframe === '90d') startDate.setDate(endDate.getDate() - 90)

    // Get response time metrics
    const responseTimes = await this.prisma.$queryRaw<
      Array<{ agent_id: string; agent_name: string; avg_response_time: number; p95_response_time: number }>
    >`
      SELECT 
        a.id as agent_id,
        a.name as agent_name,
        AVG(ar.response_time_ms) as avg_response_time,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ar.response_time_ms) as p95_response_time
      FROM agent_requests ar
      JOIN agents a ON ar.agent_id = a.id
      WHERE a.user_id = ${userId}
        AND ar.created_at >= ${startDate}
        AND ar.created_at <= ${endDate}
      GROUP BY a.id, a.name
    `

    // Get success rates
    const successRates = await this.prisma.$queryRaw<
      Array<{ agent_id: string; agent_name: string; success_rate: number; total_requests: number }>
    >`
      SELECT 
        a.id as agent_id,
        a.name as agent_name,
        COUNT(CASE WHEN ar.status = 'completed' THEN 1 END)::float / COUNT(*) as success_rate,
        COUNT(*) as total_requests
      FROM agent_requests ar
      JOIN agents a ON ar.agent_id = a.id
      WHERE a.user_id = ${userId}
        AND ar.created_at >= ${startDate}
        AND ar.created_at <= ${endDate}
      GROUP BY a.id, a.name
    `

    // Get tool usage metrics
    const toolUsage = await this.prisma.$queryRaw<
      Array<{ tool_name: string; usage_count: number; avg_execution_time: number }>
    >`
      SELECT 
        tu.tool_name,
        COUNT(*) as usage_count,
        AVG(tu.execution_time_ms) as avg_execution_time
      FROM tool_usage tu
      JOIN agent_requests ar ON tu.request_id = ar.id
      JOIN agents a ON ar.agent_id = a.id
      WHERE a.user_id = ${userId}
        AND ar.created_at >= ${startDate}
        AND ar.created_at <= ${endDate}
      GROUP BY tu.tool_name
      ORDER BY usage_count DESC
      LIMIT 10
    `

    const avgResponseTime = responseTimes.reduce((sum, r) => sum + Number(r.avg_response_time), 0) / responseTimes.length
    const p95ResponseTime = responseTimes.reduce((sum, r) => sum + Number(r.p95_response_time), 0) / responseTimes.length
    const avgSuccessRate = successRates.reduce((sum, s) => sum + Number(s.success_rate), 0) / successRates.length

    return {
      avgResponseTimeMs: Math.round(avgResponseTime),
      p95ResponseTimeMs: Math.round(p95ResponseTime),
      avgSuccessRate: Math.round(avgSuccessRate * 100 * 100) / 100,
      totalRequests: successRates.reduce((sum, s) => sum + Number(s.total_requests), 0),
      byAgent: responseTimes.map(rt => {
        const success = successRates.find(s => s.agent_id === rt.agent_id)
        return {
          agentId: rt.agent_id,
          agentName: rt.agent_name,
          avgResponseTimeMs: Math.round(Number(rt.avg_response_time)),
          p95ResponseTimeMs: Math.round(Number(rt.p95_response_time)),
          successRate: success ? Math.round(Number(success.success_rate) * 100 * 100) / 100 : 0,
          totalRequests: success ? Number(success.total_requests) : 0,
        }
      }),
      topTools: toolUsage.map(tool => ({
        toolName: tool.tool_name,
        usageCount: Number(tool.usage_count),
        avgExecutionTimeMs: Math.round(Number(tool.avg_execution_time)),
      })),
    }
  }

  /**
   * Get usage trends and patterns
   */
  async getUsageTrends(userId: string, timeframe: string): Promise<UsageTrends> {
    const endDate = new Date()
    const startDate = new Date()
    
    if (timeframe === '7d') startDate.setDate(endDate.getDate() - 7)
    else if (timeframe === '30d') startDate.setDate(endDate.getDate() - 30)
    else if (timeframe === '90d') startDate.setDate(endDate.getDate() - 90)

    // Get hourly usage patterns
    const hourlyPatterns = await this.prisma.$queryRaw<
      Array<{ hour: number; avg_requests: number }>
    >`
      SELECT 
        EXTRACT(HOUR FROM ar.created_at) as hour,
        AVG(request_count) as avg_requests
      FROM (
        SELECT 
          DATE_TRUNC('hour', ar.created_at) as hour_time,
          COUNT(*) as request_count
        FROM agent_requests ar
        JOIN agents a ON ar.agent_id = a.id
        WHERE a.user_id = ${userId}
          AND ar.created_at >= ${startDate}
          AND ar.created_at <= ${endDate}
        GROUP BY DATE_TRUNC('hour', ar.created_at)
      ) hourly_counts
      GROUP BY EXTRACT(HOUR FROM hour_time)
      ORDER BY hour
    `

    // Get daily active users (if team)
    const dailyActiveUsers = await this.prisma.$queryRaw<
      Array<{ date: string; active_users: number }>
    >`
      SELECT 
        DATE(ar.created_at) as date,
        COUNT(DISTINCT ar.user_id) as active_users
      FROM agent_requests ar
      JOIN agents a ON ar.agent_id = a.id
      WHERE a.user_id = ${userId}
        AND ar.created_at >= ${startDate}
        AND ar.created_at <= ${endDate}
      GROUP BY DATE(ar.created_at)
      ORDER BY date ASC
    `

    // Get peak usage times
    const peakHours = hourlyPatterns
      .sort((a, b) => Number(b.avg_requests) - Number(a.avg_requests))
      .slice(0, 3)
      .map(p => ({
        hour: Number(p.hour),
        avgRequests: Math.round(Number(p.avg_requests)),
      }))

    return {
      peakUsageHours: peakHours,
      hourlyPatterns: hourlyPatterns.map(p => ({
        hour: Number(p.hour),
        avgRequests: Math.round(Number(p.avg_requests)),
      })),
      dailyActiveUsers: dailyActiveUsers.map(d => ({
        date: d.date,
        activeUsers: Number(d.active_users),
      })),
      growthRate: await this.calculateGrowthRate(userId, timeframe),
    }
  }

  /**
   * Get predictive analytics and forecasts
   */
  async getPredictiveAnalytics(userId: string, timeframe: string): Promise<PredictiveAnalytics> {
    const currentMetrics = await this.getTokenUsageMetrics(userId, timeframe)
    const costMetrics = await this.getCostAnalysis(userId, timeframe)

    // Calculate projections
    const daysInPeriod = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90
    const dailyTokenGrowth = 1.05 // 5% daily growth assumption
    const projectedTokens = Math.round(currentMetrics.totalTokens * Math.pow(dailyTokenGrowth, 30))
    const projectedCost = costMetrics.totalCost * Math.pow(1.02, 30) // 2% daily cost growth

    // Anomaly detection
    const anomalies = await this.detectAnomalies(userId, timeframe)

    // Resource recommendations
    const recommendations = this.generateResourceRecommendations(currentMetrics, costMetrics)

    return {
      projectedMonthlyTokens: projectedTokens,
      projectedMonthlyCost: projectedCost,
      confidenceScore: 0.85, // Based on historical data quality
      anomalies,
      recommendations,
      trendDirection: projectedTokens > currentMetrics.totalTokens ? 'increasing' : 'decreasing',
      growthRate: ((projectedTokens - currentMetrics.totalTokens) / currentMetrics.totalTokens) * 100,
    }
  }

  /**
   * Detect usage anomalies
   */
  private async detectAnomalies(userId: string, timeframe: string): Promise<Array<{ type: string; severity: 'low' | 'medium' | 'high'; description: string; value: number }>> {
    const anomalies = []
    
    // Check for sudden spikes in usage
    const recentUsage = await this.prisma.$queryRaw<
      Array<{ date: string; total_tokens: number }>
    >`
      SELECT 
        DATE(mu.created_at) as date,
        SUM(mu.total_tokens) as total_tokens
      FROM agent_usage mu
      JOIN agents a ON mu.agent_id = a.id
      WHERE a.user_id = ${userId}
        AND mu.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(mu.created_at)
      ORDER BY date DESC
    `

    if (recentUsage.length >= 2) {
      const today = Number(recentUsage[0].total_tokens)
      const yesterday = Number(recentUsage[1].total_tokens)
      const change = ((today - yesterday) / yesterday) * 100

      if (Math.abs(change) > 50) {
        const severity: 'low' | 'medium' | 'high' = change > 100 ? 'high' : 'medium'
        anomalies.push({
          type: 'usage_spike',
          severity,
          description: `Token usage ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(Math.round(change))}% compared to yesterday`,
          value: Math.round(change),
        })
      }
    }

    // Check for cost anomalies
    const recentCosts = await this.prisma.$queryRaw<
      Array<{ date: string; total_cost: number }>
    >`
      SELECT 
        DATE(mu.created_at) as date,
        SUM(mu.estimated_cost) as total_cost
      FROM agent_usage mu
      JOIN agents a ON mu.agent_id = a.id
      WHERE a.user_id = ${userId}
        AND mu.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(mu.created_at)
      ORDER BY date DESC
    `

    if (recentCosts.length >= 2) {
      const todayCost = Number(recentCosts[0].total_cost)
      const yesterdayCost = Number(recentCosts[1].total_cost)
      const costChange = ((todayCost - yesterdayCost) / yesterdayCost) * 100

      if (Math.abs(costChange) > 30) {
        const severity: 'low' | 'medium' | 'high' = costChange > 50 ? 'high' : 'medium'
        anomalies.push({
          type: 'cost_anomaly',
          severity,
          description: `Cost ${costChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(Math.round(costChange))}% compared to yesterday`,
          value: Math.round(costChange),
        })
      }
    }

    return anomalies
  }

  /**
   * Generate cost optimization suggestions
   */
  private generateCostOptimizationSuggestions(
    modelCosts: Array<{ model: string; total_cost: number; total_tokens: number }>,
    totalCost: number,
  ): string[] {
    const suggestions = []

    // Find most expensive models
    const expensiveModels = modelCosts
      .filter(m => Number(m.total_cost) > totalCost * 0.3)
      .map(m => m.model)

    if (expensiveModels.length > 0) {
      suggestions.push(`Consider using cheaper alternatives to ${expensiveModels.join(', ')} for non-critical tasks`)
    }

    // Check for inefficient token usage
    const avgCostPerMillion = totalCost > 0 ? (modelCosts.reduce((sum, m) => sum + Number(m.total_cost), 0) / modelCosts.reduce((sum, m) => sum + Number(m.total_tokens), 0)) * 1000000 : 0
    
    if (avgCostPerMillion > 10) {
      suggestions.push('Your average cost per million tokens is high. Consider optimizing prompts or using smaller models')
    }

    return suggestions
  }

  /**
   * Generate resource recommendations
   */
  private generateResourceRecommendations(
    tokenMetrics: TokenUsageMetrics,
    costMetrics: CostAnalysis,
  ): string[] {
    const recommendations = []

    if (costMetrics.projectedMonthlyCost > 1000) {
      recommendations.push('Consider reserved capacity or volume discounts for high usage')
    }

    if (tokenMetrics.averageDailyTokens > 1000000) {
      recommendations.push('High daily token usage detected. Consider implementing caching strategies')
    }

    if (costMetrics.costByModel.length > 5) {
      recommendations.push('Using many different models. Consider standardizing on 2-3 models for better pricing')
    }

    return recommendations
  }

  /**
   * Calculate growth rate
   */
  private async calculateGrowthRate(userId: string, timeframe: string): Promise<number> {
    const endDate = new Date()
    const startDate = new Date()
    
    if (timeframe === '7d') {
      startDate.setDate(endDate.getDate() - 14)
    } else if (timeframe === '30d') {
      startDate.setDate(endDate.getDate() - 60)
    } else {
      startDate.setDate(endDate.getDate() - 180)
    }

    const growthData = await this.prisma.$queryRaw<
      Array<{ period: string; total_tokens: number }>
    >`
      SELECT 
        CASE 
          WHEN mu.created_at >= ${endDate} - INTERVAL '${timeframe}' THEN 'current'
          ELSE 'previous'
        END as period,
        SUM(mu.total_tokens) as total_tokens
      FROM agent_usage mu
      JOIN agents a ON mu.agent_id = a.id
      WHERE a.user_id = ${userId}
        AND mu.created_at >= ${startDate}
        AND mu.created_at <= ${endDate}
      GROUP BY period
    `

    const current = growthData.find((d: { period: string; total_tokens: number }) => d.period === 'current')
    const previous = growthData.find((d: { period: string; total_tokens: number }) => d.period === 'previous')

    if (current && previous && Number(previous.total_tokens) > 0) {
      return Math.round(((Number(current.total_tokens) - Number(previous.total_tokens)) / Number(previous.total_tokens)) * 100 * 100) / 100
    }

    return 0
  }
}