import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type {
  SelfReflection,
  MetaCognitiveState,
  LearningFeedback,
  AdaptiveMemory,
  CognitiveLoad,
  UncertaintyQuantification,
  EvaluateOutputInput,
  GetMetaCognitiveStateInput,
  ProcessFeedbackInput,
  AdaptiveLearningInput,
  UncertaintyAnalysisInput,
  CognitiveLoadInput,
  ReflectionResponse,
  MetaCognitiveResponse,
  LearningResponse,
  UncertaintyResponse,
  CognitiveLoadResponse,
} from '@openagents/shared'

interface ReflectionState {
  reflections: Map<string, SelfReflection>
  metaCognitiveStates: Map<string, MetaCognitiveState>
  memories: Map<string, AdaptiveMemory>
  feedback: Map<string, LearningFeedback>
  cognitiveLoads: Map<string, CognitiveLoad>
  maxReflections: number
  maxMemories: number
  maxFeedback: number
}

@Injectable()
export class ReflectionService {
  private readonly logger = new Logger(ReflectionService.name)
  private readonly state: ReflectionState = {
    reflections: new Map(),
    metaCognitiveStates: new Map(),
    memories: new Map(),
    feedback: new Map(),
    cognitiveLoads: new Map(),
    maxReflections: 2000,
    maxMemories: 1000,
    maxFeedback: 500,
  }

  // ── Self-Reflection System ───────────────────────────────────────────────────

  evaluateOutput(input: EvaluateOutputInput): ReflectionResponse {
    const reflectionId = `reflection_${randomUUID()}`
    const now = new Date().toISOString()

    // Analyze output quality based on criteria
    const assessment = this.analyzeOutputQuality(input.output, input.criteria, input.context)

    const reflection: SelfReflection = {
      id: reflectionId,
      targetOutput: input.output.slice(0, 5000),
      reflectionType: this.determineReflectionType(input.criteria),
      assessment,
      reasoning: this.generateReflectionReasoning(input.output, assessment),
      timestamp: now,
      metadata: {
        criteria: input.criteria,
        context: input.context,
      },
    }

    this.state.reflections.set(reflectionId, reflection)
    this.pruneReflections()

    this.logger.log(`Generated reflection for output: ${input.output.slice(0, 100)}`)

    return {
      reflection,
      improvements: assessment.improvementSuggestions,
      confidence: assessment.confidence,
    }
  }

  getReflection(reflectionId: string): SelfReflection | null {
    return this.state.reflections.get(reflectionId) ?? null
  }

  getReflectionHistory(agentId: string, limit = 50): SelfReflection[] {
    return [...this.state.reflections.values()]
      .filter(r => r.metadata?.agentId === agentId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, Math.min(limit, 200))
  }

  // ── Meta-Cognition Framework ─────────────────────────────────────────────────

  getMetaCognitiveState(input: GetMetaCognitiveStateInput): MetaCognitiveResponse {
    const agentId = input.agentId
    const now = new Date().toISOString()

    // Get or create meta-cognitive state
    let state = this.state.metaCognitiveStates.get(agentId)
    if (!state) {
      state = this.initializeMetaCognitiveState(agentId)
      this.state.metaCognitiveStates.set(agentId, state)
    }

    // Update state based on recent activity
    this.updateMetaCognitiveState(state, agentId)

    // Generate recommendations
    const recommendations = this.generateMetaCognitiveRecommendations(state)
    const riskAssessment = this.assessMetaCognitiveRisks(state)

    return {
      state,
      recommendations,
      riskAssessment,
    }
  }

  updateMetaCognitiveState(state: MetaCognitiveState, agentId: string): void {
    // Update self-awareness based on recent reflections
    const recentReflections = this.getRecentReflections(agentId, 10)
    if (recentReflections.length > 0) {
      const avgConfidence = recentReflections.reduce((sum, r) => sum + r.assessment.confidence, 0) / recentReflections.length
      state.selfAwareness = Math.min(1, state.selfAwareness + (avgConfidence - 0.5) * 0.1)
    }

    // Update cognitive load
    const currentLoad = this.state.cognitiveLoads.get(agentId)
    if (currentLoad) {
      state.cognitiveLoad = currentLoad.workingMemoryUsage
    }

    // Update uncertainty based on recent uncertainty analyses
    const recentUncertainties = this.getRecentUncertainties(agentId, 5)
    if (recentUncertainties.length > 0) {
      const avgUncertainty = recentUncertainties.reduce((sum, u) => sum + u.total, 0) / recentUncertainties.length
      state.uncertainty = Math.min(1, avgUncertainty)
    }

    state.lastUpdated = new Date().toISOString()
  }

  // ── Learning from Feedback ───────────────────────────────────────────────────

  processFeedback(input: ProcessFeedbackInput): LearningResponse {
    const feedbackId = `feedback_${randomUUID()}`
    const now = new Date().toISOString()

    const feedback: LearningFeedback = {
      ...input.feedback,
      id: feedbackId,
      timestamp: now,
    }

    this.state.feedback.set(feedbackId, feedback)

    // Update memory if requested
    let updatedMemory: AdaptiveMemory | null = null
    if (input.updateMemory) {
      updatedMemory = this.updateMemoryFromFeedback(feedback)
    }

    // Apply feedback immediately if requested
    if (input.applyImmediately) {
      this.applyFeedbackImmediately(feedback)
    }

    // Calculate performance improvement
    const performanceImprovement = this.calculatePerformanceImprovement(feedback)

    this.logger.log(`Processed feedback: ${feedback.content.slice(0, 100)}`)

    return {
      updatedMemory: updatedMemory!,
      newPatterns: this.extractNewPatterns(feedback),
      performanceImprovement,
    }
  }

  getLearningHistory(agentId: string, limit = 100): LearningFeedback[] {
    return [...this.state.feedback.values()]
      .filter(f => f.metadata?.agentId === agentId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, Math.min(limit, 500))
  }

  // ── Adaptive Memory System ───────────────────────────────────────────────────

  getAdaptiveMemory(agentId: string): AdaptiveMemory | null {
    return this.state.memories.get(agentId) ?? null
  }

  addMemoryExperience(agentId: string, experience: {
    content: string
    type: 'experience' | 'lesson' | 'pattern' | 'mistake'
    tags?: string[]
  }): AdaptiveMemory {
    let memory = this.state.memories.get(agentId)
    if (!memory) {
      memory = {
        id: `memory_${randomUUID()}`,
        agentId,
        memories: [],
        patterns: [],
        lastUpdated: new Date().toISOString(),
      }
      this.state.memories.set(agentId, memory)
    }

    const memoryEntry = {
      id: `memory_entry_${randomUUID()}`,
      content: experience.content.slice(0, 2000),
      type: experience.type,
      timestamp: new Date().toISOString(),
      relevance: 1.0,
      emotionalValence: experience.type === 'mistake' ? -0.5 : 0.5,
      tags: experience.tags || [],
    }

    memory.memories.push(memoryEntry)
    memory.lastUpdated = new Date().toISOString()

    // Extract patterns from experience
    this.extractPatternsFromExperience(memory, memoryEntry)

    this.pruneMemories()

    return memory
  }

  // ── Uncertainty Analysis ─────────────────────────────────────────────────────

  analyzeUncertainty(input: UncertaintyAnalysisInput): UncertaintyResponse {
    const now = new Date().toISOString()

    // Analyze epistemic uncertainty (knowledge gaps)
    const epistemic = this.calculateEpistemicUncertainty(input.output, input.context, input.knowledgeBase)

    // Analyze aleatoric uncertainty (inherent randomness)
    const aleatoric = this.calculateAleatoricUncertainty(input.output, input.context)

    // Calculate total uncertainty
    const total = Math.min(1, epistemic + aleatoric)

    // Generate confidence interval
    const confidenceInterval: [number, number] = [Math.max(0, 1 - total - 0.1), Math.min(1, 1 - total + 0.1)]

    // Identify uncertainty sources
    const sources = this.identifyUncertaintySources(input.output, input.context)

    const quantification: UncertaintyQuantification = {
      epistemic,
      aleatoric,
      total,
      confidenceInterval,
      sources,
      timestamp: now,
    }

    // Generate mitigation strategies
    const mitigationStrategies = this.generateMitigationStrategies(quantification)

    // Determine confidence recommendation
    const confidenceRecommendation = this.determineConfidenceRecommendation(quantification)

    return {
      quantification,
      mitigationStrategies,
      confidenceRecommendation,
    }
  }

  // ── Cognitive Load Management ────────────────────────────────────────────────

  updateCognitiveLoad(input: CognitiveLoadInput): CognitiveLoadResponse {
    const agentId = input.agentId
    const now = new Date().toISOString()

    let load = this.state.cognitiveLoads.get(agentId)
    if (!load) {
      load = {
        workingMemoryUsage: 0.3,
        processingSpeed: 1.0,
        attentionSpan: 0,
        fatigueLevel: 0,
        stressLevel: 0,
        timestamp: now,
      }
      this.state.cognitiveLoads.set(agentId, load)
    }

    // Update load based on inputs
    if (input.currentTask) {
      load.workingMemoryUsage = Math.min(1, load.workingMemoryUsage + 0.2)
      load.processingSpeed = Math.max(0.5, load.processingSpeed - 0.1)
      load.attentionSpan += 1
    }

    if (input.taskComplexity) {
      load.workingMemoryUsage = Math.min(1, load.workingMemoryUsage + (input.taskComplexity * 0.3))
      load.stressLevel = Math.min(1, load.stressLevel + (input.taskComplexity * 0.2))
    }

    if (input.timePressure) {
      load.fatigueLevel = Math.min(1, load.fatigueLevel + (input.timePressure * 0.1))
      load.stressLevel = Math.min(1, load.stressLevel + (input.timePressure * 0.3))
    }

    load.timestamp = now

    // Generate recommendations
    const recommendations = this.generateCognitiveLoadRecommendations(load)

    // Calculate performance impact
    const performanceImpact = this.calculatePerformanceImpact(load)

    return {
      currentLoad: load,
      recommendations,
      performanceImpact,
    }
  }

  // ── Helper Methods ───────────────────────────────────────────────────────────

  private analyzeOutputQuality(output: string, criteria: any, context?: string): SelfReflection['assessment'] {
    const score = this.calculateQualityScore(output, criteria)
    const strengths = this.identifyStrengths(output, criteria)
    const weaknesses = this.identifyWeaknesses(output, criteria)
    const improvementSuggestions = this.generateImprovementSuggestions(weaknesses, criteria)

    return {
      score,
      strengths,
      weaknesses,
      improvementSuggestions,
      confidence: this.calculateAssessmentConfidence(output, criteria),
    }
  }

  private calculateQualityScore(output: string, criteria: any): number {
    let score = 50 // Base score

    if (criteria.accuracy) {
      score += 20
    }
    if (criteria.completeness) {
      score += 15
    }
    if (criteria.relevance) {
      score += 10
    }
    if (criteria.quality) {
      score += 5
    }

    // Adjust based on output characteristics
    if (output.length > 100) score += 5
    if (output.includes('error') || output.includes('unknown')) score -= 10

    return Math.max(0, Math.min(100, score))
  }

  private identifyStrengths(output: string, criteria: any): string[] {
    const strengths: string[] = []

    if (criteria.accuracy && output.length > 50) {
      strengths.push('Detailed and comprehensive response')
    }
    if (criteria.completeness && output.length > 200) {
      strengths.push('Well-structured and complete')
    }
    if (criteria.relevance) {
      strengths.push('Highly relevant to the task')
    }

    return strengths
  }

  private identifyWeaknesses(output: string, criteria: any): string[] {
    const weaknesses: string[] = []

    if (output.length < 50) {
      weaknesses.push('Response is too brief')
    }
    if (output.includes('I cannot') || output.includes('I do not know')) {
      weaknesses.push('Lacks confidence or knowledge')
    }
    if (!criteria.accuracy) {
      weaknesses.push('May contain inaccuracies')
    }

    return weaknesses
  }

  private generateImprovementSuggestions(weaknesses: string[], criteria: any): string[] {
    const suggestions: string[] = []

    if (weaknesses.includes('Response is too brief')) {
      suggestions.push('Provide more detailed explanations and examples')
    }
    if (weaknesses.includes('Lacks confidence')) {
      suggestions.push('Increase confidence in responses or seek clarification')
    }
    if (weaknesses.includes('May contain inaccuracies')) {
      suggestions.push('Verify facts and double-check information')
    }

    return suggestions
  }

  private determineReflectionType(criteria: any): SelfReflection['reflectionType'] {
    if (criteria.accuracy) return 'accuracy'
    if (criteria.completeness) return 'completeness'
    if (criteria.relevance) return 'relevance'
    return 'quality'
  }

  private generateReflectionReasoning(output: string, assessment: any): string {
    return `Output quality assessment: ${assessment.score}/100. 
    Strengths: ${assessment.strengths.join(', ')}. 
    Weaknesses: ${assessment.weaknesses.join(', ')}. 
    Confidence in assessment: ${assessment.confidence}.`
  }

  private calculateAssessmentConfidence(output: string, criteria: any): number {
    return Math.min(1, output.length / 1000 + 0.5)
  }

  private initializeMetaCognitiveState(agentId: string): MetaCognitiveState {
    return {
      selfAwareness: 0.5,
      uncertainty: 0.3,
      confidence: 0.7,
      knowledgeGaps: [],
      cognitiveLoad: 0.4,
      learningRate: 0.1,
      lastUpdated: new Date().toISOString(),
    }
  }

  private generateMetaCognitiveRecommendations(state: MetaCognitiveState): string[] {
    const recommendations: string[] = []

    if (state.selfAwareness < 0.5) {
      recommendations.push('Increase self-awareness through regular reflection')
    }
    if (state.uncertainty > 0.7) {
      recommendations.push('Seek additional information to reduce uncertainty')
    }
    if (state.cognitiveLoad > 0.8) {
      recommendations.push('Reduce cognitive load by breaking tasks into smaller steps')
    }
    if (state.knowledgeGaps.length > 0) {
      recommendations.push(`Address knowledge gaps: ${state.knowledgeGaps.join(', ')}`)
    }

    return recommendations
  }

  private assessMetaCognitiveRisks(state: MetaCognitiveState): MetaCognitiveResponse['riskAssessment'] {
    return {
      overconfidence: state.confidence > 0.9 && state.selfAwareness < 0.5,
      underconfidence: state.confidence < 0.3 && state.selfAwareness > 0.7,
      cognitiveOverload: state.cognitiveLoad > 0.8,
      knowledgeGaps: state.knowledgeGaps,
    }
  }

  private getRecentReflections(agentId: string, limit: number): SelfReflection[] {
    return [...this.state.reflections.values()]
      .filter(r => r.metadata?.agentId === agentId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit)
  }

  private getRecentUncertainties(agentId: string, limit: number): UncertaintyQuantification[] {
    // This would need to be implemented based on stored uncertainty analyses
    return []
  }

  private updateMemoryFromFeedback(feedback: LearningFeedback): AdaptiveMemory {
    const agentId = feedback.metadata?.agentId as string
    let memory = this.state.memories.get(agentId)

    if (!memory) {
      memory = {
        id: `memory_${randomUUID()}`,
        agentId,
        memories: [],
        patterns: [],
        lastUpdated: new Date().toISOString(),
      }
      this.state.memories.set(agentId, memory)
    }

    const memoryEntry = {
      id: `memory_entry_${randomUUID()}`,
      content: feedback.content,
      type: feedback.feedbackType === 'positive' ? 'lesson' : 'mistake',
      timestamp: new Date().toISOString(),
      relevance: feedback.priority === 'high' ? 1.0 : 0.5,
      emotionalValence: feedback.feedbackType === 'negative' ? -0.8 : 0.8,
      tags: [feedback.source, feedback.targetComponent, feedback.priority],
    }

    memory.memories.push(memoryEntry)
    memory.lastUpdated = new Date().toISOString()

    return memory
  }

  private applyFeedbackImmediately(feedback: LearningFeedback): void {
    // Apply immediate adjustments based on feedback
    this.logger.log(`Applying immediate feedback: ${feedback.content.slice(0, 100)}`)
  }

  private calculatePerformanceImprovement(feedback: LearningFeedback): number {
    // Calculate improvement based on feedback priority and type
    const baseImprovement = feedback.priority === 'high' ? 0.1 : 0.05
    return feedback.feedbackType === 'positive' ? baseImprovement : -baseImprovement
  }

  private extractNewPatterns(feedback: LearningFeedback): Array<{ trigger: string; response: string }> {
    // Extract patterns from feedback
    return [
      {
        trigger: feedback.targetComponent,
        response: feedback.content.slice(0, 100),
      },
    ]
  }

  private extractPatternsFromExperience(memory: AdaptiveMemory, entry: AdaptiveMemory['memories'][number]): void {
    // Extract patterns from the experience
    const pattern = {
      trigger: entry.type,
      response: entry.content.slice(0, 200),
      successRate: entry.type === 'mistake' ? 0.2 : 0.8,
      lastUsed: entry.timestamp,
    }
    memory.patterns.push(pattern)
  }

  private calculateEpistemicUncertainty(output: string, context: string, knowledgeBase: any): number {
    // Calculate uncertainty due to lack of knowledge
    const knowledgeCoverage = this.calculateKnowledgeCoverage(output, knowledgeBase)
    return Math.max(0, 1 - knowledgeCoverage)
  }

  private calculateAleatoricUncertainty(output: string, context: string): number {
    // Calculate uncertainty due to inherent randomness
    return output.includes('?') || output.includes('maybe') ? 0.3 : 0.1
  }

  private calculateKnowledgeCoverage(output: string, knowledgeBase: any): number {
    // Calculate how much of the output is covered by knowledge base
    return 0.7 // Placeholder
  }

  private identifyUncertaintySources(output: string, context: string): string[] {
    const sources: string[] = []

    if (output.includes('unknown')) sources.push('Knowledge gap')
    if (output.includes('maybe')) sources.push('Ambiguity')
    if (output.includes('depends')) sources.push('Context dependency')

    return sources
  }

  private generateMitigationStrategies(quantification: UncertaintyQuantification): string[] {
    const strategies: string[] = []

    if (quantification.epistemic > 0.5) {
      strategies.push('Seek additional information to reduce knowledge uncertainty')
    }
    if (quantification.aleatoric > 0.5) {
      strategies.push('Use probabilistic reasoning to handle inherent uncertainty')
    }
    if (quantification.total > 0.7) {
      strategies.push('Consider alternative approaches or expert consultation')
    }

    return strategies
  }

  private determineConfidenceRecommendation(quantification: UncertaintyQuantification): 'proceed' | 'seek_clarification' | 'escalate' {
    if (quantification.total < 0.3) return 'proceed'
    if (quantification.total < 0.7) return 'seek_clarification'
    return 'escalate'
  }

  private generateCognitiveLoadRecommendations(load: CognitiveLoad): string[] {
    const recommendations: string[] = []

    if (load.workingMemoryUsage > 0.8) {
      recommendations.push('Take a break to reduce working memory load')
    }
    if (load.processingSpeed < 0.7) {
      recommendations.push('Simplify the current task or break it down')
    }
    if (load.fatigueLevel > 0.6) {
      recommendations.push('Consider switching to a less demanding task')
    }
    if (load.stressLevel > 0.7) {
      recommendations.push('Practice stress management techniques')
    }

    return recommendations
  }

  private calculatePerformanceImpact(load: CognitiveLoad): { accuracyImpact: number; speedImpact: number; qualityImpact: number } {
    return {
      accuracyImpact: -load.workingMemoryUsage * 0.3,
      speedImpact: -load.fatigueLevel * 0.2,
      qualityImpact: -load.stressLevel * 0.25,
    }
  }

  private pruneReflections(): void {
    if (this.state.reflections.size <= this.state.maxReflections) return

    const sorted = [...this.state.reflections.entries()].sort(
      (a: [string, SelfReflection], b: [string, SelfReflection]) => a[1].timestamp.localeCompare(b[1].timestamp),
    )

    const overflow = this.state.reflections.size - this.state.maxReflections
    for (let i = 0; i < overflow; i++) {
      this.state.reflections.delete(sorted[i][0])
    }
  }

  private pruneMemories(): void {
    if (this.state.memories.size <= this.state.maxMemories) return

    const sorted = [...this.state.memories.entries()].sort(
      (a: [string, AdaptiveMemory], b: [string, AdaptiveMemory]) => a[1].lastUpdated.localeCompare(b[1].lastUpdated),
    )

    const overflow = this.state.memories.size - this.state.maxMemories
    for (let i = 0; i < overflow; i++) {
      this.state.memories.delete(sorted[i][0])
    }
  }
}
