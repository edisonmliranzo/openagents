import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type {
  AdaptiveMemory,
  AdaptiveMemoryRetrievalInput,
  AdaptiveMemoryRetrievalResponse,
  AgentBehaviorAdjustment,
  AgentBehaviorProfile,
  CognitiveLoad,
  CognitiveLoadInput,
  CognitiveLoadResponse,
  EvaluateOutputInput,
  EvaluationCriterion,
  GetMetaCognitiveStateInput,
  LearningFeedback,
  LearningResponse,
  MetaCognitiveResponse,
  MetaCognitiveState,
  ProcessFeedbackInput,
  ReasoningStrategy,
  ReflectionEvaluatorResult,
  ReflectionResponse,
  SelfReflection,
  UncertaintyAnalysisInput,
  UncertaintyQuantification,
  UncertaintyResponse,
} from '@openagents/shared'

type ReflectionAssessment = SelfReflection['assessment']

const COMMON_STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'been',
  'before',
  'being',
  'between',
  'could',
  'does',
  'from',
  'have',
  'into',
  'just',
  'more',
  'only',
  'over',
  'same',
  'some',
  'such',
  'than',
  'that',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'under',
  'very',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
  'your',
])

interface ReflectionState {
  reflections: Map<string, SelfReflection>
  metaCognitiveStates: Map<string, MetaCognitiveState>
  memories: Map<string, AdaptiveMemory>
  feedback: Map<string, LearningFeedback>
  cognitiveLoads: Map<string, CognitiveLoad>
  uncertainties: Map<string, UncertaintyQuantification[]>
  behaviorProfiles: Map<string, AgentBehaviorProfile>
  maxReflections: number
  maxMemories: number
  maxFeedback: number
  maxUncertaintiesPerAgent: number
  maxBehaviorAdjustments: number
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
    uncertainties: new Map(),
    behaviorProfiles: new Map(),
    maxReflections: 2000,
    maxMemories: 1000,
    maxFeedback: 500,
    maxUncertaintiesPerAgent: 100,
    maxBehaviorAdjustments: 20,
  }

  evaluateOutput(input: EvaluateOutputInput): ReflectionResponse {
    const output = this.requireNonEmptyText(input.output, 'output', 10000)
    const context = this.normalizeOptionalText(input.context, 8000)
    const reflectionId = `reflection_${randomUUID()}`
    const now = new Date().toISOString()
    const criteria = this.normalizeCriteria(input.criteria)
    const assessment = this.analyzeOutputQuality(output, criteria, context)

    const reflection: SelfReflection = {
      id: reflectionId,
      targetOutput: output.slice(0, 5000),
      reflectionType: this.determineReflectionType(criteria, assessment.evaluatorBreakdown),
      assessment,
      reasoning: this.generateReflectionReasoning(assessment),
      timestamp: now,
      metadata: {
        criteria,
        context,
        outputType: input.outputType ?? 'final-answer',
        ...input.agentContext,
      },
    }

    this.state.reflections.set(reflectionId, reflection)
    this.pruneReflections()

    this.logger.log(
      `Generated reflection ${reflectionId} for ${input.agentContext?.agentId ?? 'anonymous-agent'}`,
    )

    return {
      reflection,
      improvements: assessment.improvementSuggestions,
      confidence: assessment.confidence,
    }
  }

  getReflection(reflectionId: string): SelfReflection | null {
    return this.state.reflections.get(reflectionId) ?? null
  }

  getReflectionHistory(agentId: string, limit: number | string = 50): SelfReflection[] {
    const normalizedAgentId = this.normalizeIdentifier(agentId, 'agentId')
    const normalizedLimit = this.normalizeLimit(limit, 50, 200)

    return [...this.state.reflections.values()]
      .filter((reflection) => reflection.metadata?.agentId === normalizedAgentId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, normalizedLimit)
  }

  getMetaCognitiveState(input: GetMetaCognitiveStateInput): MetaCognitiveResponse {
    const agentId = this.normalizeIdentifier(input.agentId, 'agentId')

    let state = this.state.metaCognitiveStates.get(agentId)
    if (!state) {
      state = this.initializeMetaCognitiveState()
      this.state.metaCognitiveStates.set(agentId, state)
    }

    this.updateMetaCognitiveState(state, agentId)

    const historyLimit = this.normalizeLimit(input.historyLimit, 10, 50)
    const includeHistory = this.coerceBoolean(input.includeHistory)
    const behaviorProfile = this.getOrCreateBehaviorProfile(agentId)

    return {
      state,
      recommendations: this.generateMetaCognitiveRecommendations(state, behaviorProfile),
      riskAssessment: this.assessMetaCognitiveRisks(state),
      behaviorProfile,
      history: includeHistory
        ? {
            reflections: this.getRecentReflections(agentId, historyLimit),
            uncertainties: this.getRecentUncertainties(agentId, historyLimit),
            feedback: this.getRecentFeedback(agentId, historyLimit),
          }
        : undefined,
    }
  }

  processFeedback(input: ProcessFeedbackInput): LearningResponse {
    const feedbackContent = this.requireNonEmptyText(
      input.feedback.content,
      'feedback.content',
      4000,
    )
    const feedbackId = `feedback_${randomUUID()}`
    const now = new Date().toISOString()

    const feedback: LearningFeedback = {
      ...input.feedback,
      content: feedbackContent,
      id: feedbackId,
      timestamp: now,
      metadata: {
        ...input.feedback.metadata,
        ...input.agentContext,
      },
    }

    this.state.feedback.set(feedbackId, feedback)
    this.pruneFeedback()

    let updatedMemory: AdaptiveMemory | null = null
    if (input.updateMemory) {
      updatedMemory = this.updateMemoryFromFeedback(feedback)
    }

    const appliedAdjustments = input.applyImmediately ? this.applyFeedbackImmediately(feedback) : []
    const performanceImprovement = this.calculatePerformanceImprovement(feedback)

    this.logger.log(
      `Processed feedback ${feedbackId} for ${feedback.metadata?.agentId ?? 'anonymous-agent'}`,
    )

    return {
      updatedMemory,
      newPatterns: this.extractNewPatterns(feedback),
      performanceImprovement,
      appliedAdjustments,
    }
  }

  getLearningHistory(agentId: string, limit: number | string = 100): LearningFeedback[] {
    const normalizedAgentId = this.normalizeIdentifier(agentId, 'agentId')
    const normalizedLimit = this.normalizeLimit(limit, 100, 500)

    return [...this.state.feedback.values()]
      .filter((feedback) => feedback.metadata?.agentId === normalizedAgentId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, normalizedLimit)
  }

  getAdaptiveMemory(agentId: string): AdaptiveMemory | null {
    return this.state.memories.get(this.normalizeIdentifier(agentId, 'agentId')) ?? null
  }

  addMemoryExperience(
    agentId: string,
    experience: {
      content: string
      type: 'experience' | 'lesson' | 'pattern' | 'mistake'
      tags?: string[]
    },
  ): AdaptiveMemory {
    const normalizedAgentId = this.normalizeIdentifier(agentId, 'agentId')
    const memory = this.getOrCreateMemory(normalizedAgentId)

    const memoryEntry: AdaptiveMemory['memories'][number] = {
      id: `memory_entry_${randomUUID()}`,
      content: this.requireNonEmptyText(experience.content, 'experience.content', 2000),
      type: experience.type,
      timestamp: new Date().toISOString(),
      relevance: 1,
      emotionalValence: experience.type === 'mistake' ? -0.5 : 0.5,
      tags: this.normalizeTags(experience.tags),
    }

    memory.memories.push(memoryEntry)
    memory.lastUpdated = new Date().toISOString()

    this.extractPatternsFromExperience(memory, memoryEntry)
    this.pruneMemoryEntries(memory)
    this.pruneMemories()

    return memory
  }

  retrieveRelevantMemories(input: AdaptiveMemoryRetrievalInput): AdaptiveMemoryRetrievalResponse {
    const agentId = this.normalizeIdentifier(input.agentId, 'agentId')
    const query = this.requireNonEmptyText(input.query, 'query', 500)

    const memory = this.state.memories.get(agentId)
    if (!memory) {
      return {
        matches: [],
        suggestedPatterns: [],
      }
    }

    const queryTokens = this.tokenize(query)
    const tagSet = new Set<string>(this.normalizeTags(input.tags))
    const limit = this.normalizeLimit(input.limit, 5, 20)

    const matches: AdaptiveMemoryRetrievalResponse['matches'] = memory.memories
      .map((entry: AdaptiveMemory['memories'][number]) => ({
        memory: entry,
        score: this.calculateMemoryMatchScore(entry, queryTokens, tagSet),
      }))
      .filter((match: AdaptiveMemoryRetrievalResponse['matches'][number]) => match.score > 0)
      .sort(
        (
          a: AdaptiveMemoryRetrievalResponse['matches'][number],
          b: AdaptiveMemoryRetrievalResponse['matches'][number],
        ) => b.score - a.score,
      )
      .slice(0, limit)

    const suggestedPatterns: AdaptiveMemoryRetrievalResponse['suggestedPatterns'] = memory.patterns
      .map((pattern: AdaptiveMemory['patterns'][number]) => ({
        pattern,
        score: this.calculatePatternMatchScore(pattern, queryTokens),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ pattern }) => pattern)
      .slice(0, limit)

    return {
      matches,
      suggestedPatterns,
    }
  }

  analyzeUncertainty(input: UncertaintyAnalysisInput): UncertaintyResponse {
    const output = this.requireNonEmptyText(input.output, 'output', 10000)
    const context = this.requireNonEmptyText(input.context, 'context', 8000)
    const now = new Date().toISOString()
    const knowledgeCoverage = this.calculateKnowledgeCoverage(output, input.knowledgeBase)
    const epistemic = this.calculateEpistemicUncertainty(knowledgeCoverage)
    const aleatoric = this.calculateAleatoricUncertainty(output, context)
    const total = Math.min(1, epistemic + aleatoric)
    const confidenceInterval: [number, number] = [
      Math.max(0, 1 - total - 0.1),
      Math.min(1, 1 - total + 0.1),
    ]
    const sources = this.identifyUncertaintySources(output, context, knowledgeCoverage)

    const quantification: UncertaintyQuantification = {
      epistemic,
      aleatoric,
      total,
      confidenceInterval,
      sources,
      timestamp: now,
      knowledgeCoverage,
      metadata: {
        ...input.agentContext,
        outputExcerpt: output.slice(0, 200),
      },
    }

    const agentId = input.agentContext?.agentId
    if (agentId) {
      this.storeUncertainty(agentId, quantification)
    }

    return {
      quantification,
      mitigationStrategies: this.generateMitigationStrategies(quantification),
      confidenceRecommendation: this.determineConfidenceRecommendation(quantification),
    }
  }

  updateCognitiveLoad(input: CognitiveLoadInput): CognitiveLoadResponse {
    const agentId = this.normalizeIdentifier(input.agentId, 'agentId')
    const now = new Date().toISOString()
    const load = this.getOrCreateCognitiveLoad(agentId, now)
    const taskComplexity = this.normalizeUnitInterval(input.taskComplexity, 'taskComplexity')
    const timePressure = this.normalizeUnitInterval(input.timePressure, 'timePressure')
    const recoveryMinutes = this.normalizeNonNegativeNumber(
      input.recoveryMinutes,
      'recoveryMinutes',
    )
    const currentTask = this.normalizeOptionalText(input.currentTask, 1000)

    this.applyCognitiveLoadDecay(load, now, recoveryMinutes)

    if (currentTask) {
      load.workingMemoryUsage = Math.min(1, load.workingMemoryUsage + 0.18)
      load.processingSpeed = Math.max(0.5, load.processingSpeed - 0.08)
      load.attentionSpan += 1
    }

    if (typeof taskComplexity === 'number') {
      load.workingMemoryUsage = Math.min(1, load.workingMemoryUsage + taskComplexity * 0.25)
      load.stressLevel = Math.min(1, load.stressLevel + taskComplexity * 0.18)
    }

    if (typeof timePressure === 'number') {
      load.fatigueLevel = Math.min(1, load.fatigueLevel + timePressure * 0.08)
      load.stressLevel = Math.min(1, load.stressLevel + timePressure * 0.25)
    }

    if (input.taskCompleted) {
      load.workingMemoryUsage = Math.max(0.1, load.workingMemoryUsage - 0.25)
      load.fatigueLevel = Math.max(0, load.fatigueLevel - 0.1)
      load.stressLevel = Math.max(0, load.stressLevel - 0.12)
      load.processingSpeed = Math.min(1, load.processingSpeed + 0.12)
      load.attentionSpan = Math.max(0, load.attentionSpan - 1)
    }

    load.timestamp = now

    return {
      currentLoad: load,
      recommendations: this.generateCognitiveLoadRecommendations(load),
      performanceImpact: this.calculatePerformanceImpact(load),
    }
  }

  getBehaviorProfile(agentId: string): AgentBehaviorProfile {
    return this.getOrCreateBehaviorProfile(this.normalizeIdentifier(agentId, 'agentId'))
  }

  private analyzeOutputQuality(
    output: string,
    criteria: Partial<Record<EvaluationCriterion, boolean>>,
    context?: string,
  ): ReflectionAssessment {
    const requestedDimensions = this.getRequestedCriteria(criteria)
    const evaluatorBreakdown = requestedDimensions.map((dimension) =>
      this.evaluateDimension(dimension, output, context),
    )
    const score = Math.round(
      evaluatorBreakdown.reduce((sum, evaluator) => sum + evaluator.score, 0) /
        evaluatorBreakdown.length,
    )

    return {
      score,
      strengths: this.collectStrengths(evaluatorBreakdown),
      weaknesses: this.collectWeaknesses(evaluatorBreakdown),
      improvementSuggestions: this.generateImprovementSuggestions(evaluatorBreakdown),
      confidence: this.calculateAssessmentConfidence(output, evaluatorBreakdown),
      evaluatorBreakdown,
    }
  }

  private normalizeCriteria(
    criteria?: Partial<Record<EvaluationCriterion, boolean>>,
  ): Partial<Record<EvaluationCriterion, boolean>> {
    const normalized = { ...(criteria ?? {}) }
    if (!Object.values(normalized).some(Boolean)) {
      normalized.quality = true
    }
    return normalized
  }

  private getRequestedCriteria(
    criteria: Partial<Record<EvaluationCriterion, boolean>>,
  ): EvaluationCriterion[] {
    return Object.entries(criteria)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([dimension]) => dimension as EvaluationCriterion)
  }

  private evaluateDimension(
    dimension: EvaluationCriterion,
    output: string,
    context?: string,
  ): ReflectionEvaluatorResult {
    switch (dimension) {
      case 'accuracy':
        return this.evaluateAccuracy(output, context)
      case 'completeness':
        return this.evaluateCompleteness(output)
      case 'relevance':
        return this.evaluateRelevance(output, context)
      case 'quality':
        return this.evaluateQuality(output)
      case 'clarity':
        return this.evaluateClarity(output)
      case 'grounding':
        return this.evaluateGrounding(output, context)
      case 'safety':
        return this.evaluateSafety(output)
    }
  }

  private evaluateAccuracy(output: string, context?: string): ReflectionEvaluatorResult {
    let score = 72
    const findings: string[] = []
    const overlap = this.calculateTokenOverlap(output, context ?? '')

    if (this.containsHedging(output)) {
      score -= 12
      findings.push('Contains hedging language that weakens factual confidence')
    }
    if (/\b(error|unknown|unverified|guess)\b/i.test(output)) {
      score -= 18
      findings.push('Signals uncertainty or unresolved factual gaps')
    }
    if (/\d/.test(output)) {
      score += 6
      findings.push('Uses concrete details instead of purely generic phrasing')
    }
    if (this.containsEvidenceMarkers(output)) {
      score += 6
      findings.push('Includes concrete anchors such as citations, code, or structured evidence')
    }
    if (context && overlap > 0.2) {
      score += 8
      findings.push('Stays aligned with the supplied context')
    }
    if (this.containsUnsupportedAbsoluteClaims(output) && !this.containsEvidenceMarkers(output)) {
      score -= 10
      findings.push('Makes high-certainty claims without enough supporting evidence')
    }

    return {
      name: 'HeuristicAccuracyEvaluator',
      dimension: 'accuracy',
      score: this.clampScore(score),
      confidence: context ? 0.78 : 0.68,
      findings: findings.length > 0 ? findings : ['No strong accuracy signals were detected'],
    }
  }

  private evaluateCompleteness(output: string): ReflectionEvaluatorResult {
    let score = 40
    const findings: string[] = []
    const sentenceCount = output.split(/[.!?]+/).filter(Boolean).length

    score += Math.min(35, output.length / 12)
    score += Math.min(20, sentenceCount * 4)

    if (output.length < 80) {
      findings.push('Response is brief relative to the likely task scope')
    } else {
      findings.push('Response provides enough surface area to cover multiple facets')
    }

    if (/(\n- |\n\* |\n\d+\. )/.test(output)) {
      score += 10
      findings.push('Structured formatting improves coverage and scanability')
    }

    return {
      name: 'CompletenessEvaluator',
      dimension: 'completeness',
      score: this.clampScore(score),
      confidence: 0.82,
      findings,
    }
  }

  private evaluateRelevance(output: string, context?: string): ReflectionEvaluatorResult {
    const overlap = this.calculateTokenOverlap(output, context ?? '')
    const score = context ? this.clampScore(45 + overlap * 55) : 70
    const findings = context
      ? overlap >= 0.2
        ? ['Response meaningfully overlaps with the task context']
        : ['Response has weak lexical overlap with the provided context']
      : ['No explicit context provided, so relevance was inferred from the output alone']

    return {
      name: 'ContextRelevanceEvaluator',
      dimension: 'relevance',
      score,
      confidence: context ? 0.8 : 0.62,
      findings,
    }
  }

  private evaluateQuality(output: string): ReflectionEvaluatorResult {
    let score = 68
    const findings: string[] = []

    if (this.hasStructuredFormatting(output)) {
      score += 10
      findings.push('Uses explicit structure to organize the response')
    }
    if (output.length > 160) {
      score += 8
      findings.push('Provides enough detail for a substantive answer')
    }
    if (/\b(next step|action items?|implementation|example)\b/i.test(output)) {
      score += 6
      findings.push('Includes actionable guidance instead of only abstract commentary')
    }
    if (/[.!?]$/.test(output.trim())) {
      score += 4
    }
    if (/(TODO|placeholder|lorem ipsum)/i.test(output)) {
      score -= 20
      findings.push('Contains placeholder-style language')
    }
    if (/(.)\1{6,}/.test(output)) {
      score -= 8
      findings.push('Contains repetitive phrasing that weakens polish')
    }

    return {
      name: 'ResponseQualityEvaluator',
      dimension: 'quality',
      score: this.clampScore(score),
      confidence: 0.76,
      findings:
        findings.length > 0 ? findings : ['Output quality is acceptable but not distinctive'],
    }
  }

  private evaluateClarity(output: string): ReflectionEvaluatorResult {
    const sentences = output
      .split(/[.!?]+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean)
    const averageSentenceLength =
      sentences.length > 0
        ? sentences.reduce((sum, sentence) => sum + sentence.split(/\s+/).length, 0) /
          sentences.length
        : output.split(/\s+/).length

    let score = 80
    const findings: string[] = []

    if (averageSentenceLength > 28) {
      score -= 18
      findings.push('Sentence length is high, which may reduce readability')
    } else {
      findings.push('Sentence sizing stays readable')
    }

    if (/(very very|really really|basically|kind of)/i.test(output)) {
      score -= 10
      findings.push('Contains filler language that softens clarity')
    }

    return {
      name: 'ClarityEvaluator',
      dimension: 'clarity',
      score: this.clampScore(score),
      confidence: 0.74,
      findings,
    }
  }

  private evaluateGrounding(output: string, context?: string): ReflectionEvaluatorResult {
    const overlap = this.calculateTokenOverlap(output, context ?? '')
    let score = context ? 42 + overlap * 58 : 60
    const findings: string[] = []

    if (/`[^`]+`/.test(output) || /"[^"]+"/.test(output)) {
      score += 6
      findings.push('Uses concrete quoted or code-like anchors')
    }
    if (context && overlap < 0.15) {
      findings.push('Grounding is weak because few terms connect back to context')
    } else if (context) {
      findings.push('Grounding is supported by contextual term overlap')
    } else {
      findings.push('No external grounding context was provided')
    }

    return {
      name: 'GroundingEvaluator',
      dimension: 'grounding',
      score: this.clampScore(score),
      confidence: context ? 0.77 : 0.58,
      findings,
    }
  }

  private evaluateSafety(output: string): ReflectionEvaluatorResult {
    let score = 88
    const findings: string[] = ['No obvious risky language was detected']

    if (/\b(bypass|exploit|exfiltrate|drop table|disable auth)\b/i.test(output)) {
      score -= 35
      findings[0] = 'Contains potentially unsafe or high-risk language'
    }
    if (
      /\b(api[_-]?key|password|secret|token)\b/i.test(output) &&
      /(=|:)\s*['"]?[A-Za-z0-9_\-]{8,}/.test(output)
    ) {
      score -= 25
      findings[0] = 'Contains secret-like material that should not be exposed directly'
    }

    return {
      name: 'SafetyEvaluator',
      dimension: 'safety',
      score: this.clampScore(score),
      confidence: 0.65,
      findings,
    }
  }

  private collectStrengths(evaluatorBreakdown: ReflectionEvaluatorResult[]): string[] {
    return evaluatorBreakdown
      .filter((result) => result.score >= 75)
      .map((result) => result.findings[0] ?? `Strong ${result.dimension}`)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 5)
  }

  private collectWeaknesses(evaluatorBreakdown: ReflectionEvaluatorResult[]): string[] {
    return evaluatorBreakdown
      .filter((result) => result.score < 60)
      .map((result) => result.findings[0] ?? `Needs better ${result.dimension}`)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 5)
  }

  private generateImprovementSuggestions(
    evaluatorBreakdown: ReflectionEvaluatorResult[],
  ): string[] {
    const suggestions = evaluatorBreakdown
      .filter((result) => result.score < 70)
      .map((result) => {
        switch (result.dimension) {
          case 'accuracy':
            return 'Verify claims against a concrete source or explicitly state unresolved gaps'
          case 'completeness':
            return 'Cover the missing steps, edge cases, or rationale before finalizing the response'
          case 'relevance':
            return 'Anchor more of the answer directly to the stated task context'
          case 'quality':
            return 'Tighten the structure so the answer feels deliberate instead of generic'
          case 'clarity':
            return 'Shorten dense sentences and remove filler phrasing'
          case 'grounding':
            return 'Reference the provided context or concrete evidence more directly'
          case 'safety':
            return 'Remove or reframe risky instructions and add safer alternatives'
        }
      })

    return suggestions
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 5)
  }

  private determineReflectionType(
    criteria: Partial<Record<EvaluationCriterion, boolean>>,
    evaluatorBreakdown: ReflectionEvaluatorResult[],
  ): SelfReflection['reflectionType'] {
    const requestedPrimaryTypes: SelfReflection['reflectionType'][] = [
      'accuracy',
      'completeness',
      'relevance',
      'quality',
    ]
    const requested = requestedPrimaryTypes.filter((type) => criteria[type])
    if (requested.length === 1) {
      return requested[0]
    }

    const ranked = [...evaluatorBreakdown].sort((a, b) => a.score - b.score)
    const weakest = ranked[0]?.dimension
    if (weakest === 'accuracy' || weakest === 'completeness' || weakest === 'relevance') {
      return weakest
    }

    return 'quality'
  }

  private generateReflectionReasoning(assessment: ReflectionAssessment): string {
    const weakestDimensions = assessment.evaluatorBreakdown
      .slice()
      .sort((a: ReflectionEvaluatorResult, b: ReflectionEvaluatorResult) => a.score - b.score)
      .slice(0, 2)
      .map((result: ReflectionEvaluatorResult) => `${result.dimension}=${result.score}`)
      .join(', ')

    return `Assessment ${assessment.score}/100 with ${assessment.confidence.toFixed(2)} confidence. Weakest dimensions: ${weakestDimensions || 'none'}.`
  }

  private calculateAssessmentConfidence(
    output: string,
    evaluatorBreakdown: ReflectionEvaluatorResult[],
  ): number {
    const evaluatorConfidence =
      evaluatorBreakdown.reduce((sum, result) => sum + result.confidence, 0) /
      evaluatorBreakdown.length
    const lengthConfidence = Math.min(1, 0.45 + output.length / 2500)
    const coverageConfidence = Math.min(1, 0.55 + evaluatorBreakdown.length * 0.08)
    return Math.min(
      1,
      Number(
        (evaluatorConfidence * 0.55 + lengthConfidence * 0.2 + coverageConfidence * 0.25).toFixed(
          2,
        ),
      ),
    )
  }

  private initializeMetaCognitiveState(): MetaCognitiveState {
    return {
      selfAwareness: 0.5,
      uncertainty: 0.3,
      confidence: 0.65,
      knowledgeGaps: [],
      cognitiveLoad: 0.35,
      learningRate: 0.1,
      lastUpdated: new Date().toISOString(),
    }
  }

  private updateMetaCognitiveState(state: MetaCognitiveState, agentId: string): void {
    const recentReflections = this.getRecentReflections(agentId, 10)
    const recentUncertainties = this.getRecentUncertainties(agentId, 10)
    const recentFeedback = this.getRecentFeedback(agentId, 10)
    const currentLoad = this.state.cognitiveLoads.get(agentId)
    const behaviorProfile = this.getOrCreateBehaviorProfile(agentId)

    if (recentReflections.length > 0) {
      const averageReflectionConfidence =
        recentReflections.reduce((sum, reflection) => sum + reflection.assessment.confidence, 0) /
        recentReflections.length
      const averageReflectionScore =
        recentReflections.reduce((sum, reflection) => sum + reflection.assessment.score / 100, 0) /
        recentReflections.length
      const calibrationGap = Math.abs(averageReflectionConfidence - averageReflectionScore)

      state.selfAwareness = this.clampUnit(1 - calibrationGap)
    }

    if (currentLoad) {
      state.cognitiveLoad = this.clampUnit(
        currentLoad.workingMemoryUsage * 0.45 +
          currentLoad.fatigueLevel * 0.2 +
          currentLoad.stressLevel * 0.25 +
          Math.max(0, 1 - currentLoad.processingSpeed) * 0.1,
      )
    }

    if (recentUncertainties.length > 0) {
      state.uncertainty = this.clampUnit(
        recentUncertainties.reduce((sum, uncertainty) => sum + uncertainty.total, 0) /
          recentUncertainties.length,
      )
    }

    const recentScore =
      recentReflections.length > 0
        ? recentReflections.reduce((sum, reflection) => sum + reflection.assessment.score, 0) /
          recentReflections.length /
          100
        : 0.65
    state.confidence = this.clampUnit(
      recentScore * 0.55 +
        (1 - state.uncertainty) * 0.25 +
        behaviorProfile.verificationThreshold * 0.1 -
        state.cognitiveLoad * 0.15,
    )

    state.learningRate = this.clampUnit(
      0.08 +
        Math.min(5, recentFeedback.length) * 0.04 +
        behaviorProfile.activeAdjustments.length * 0.01,
    )

    state.knowledgeGaps = this.extractKnowledgeGaps(recentUncertainties, recentFeedback)
    state.lastUpdated = new Date().toISOString()
  }

  private generateMetaCognitiveRecommendations(
    state: MetaCognitiveState,
    behaviorProfile: AgentBehaviorProfile,
  ): string[] {
    const recommendations: string[] = []

    if (state.selfAwareness < 0.55) {
      recommendations.push('Calibrate confidence against recent output scores before proceeding')
    }
    if (state.uncertainty > 0.65) {
      recommendations.push(
        'Pause for clarification or collect more evidence before answering decisively',
      )
    }
    if (state.cognitiveLoad > 0.75) {
      recommendations.push('Reduce scope or serialize the next steps to prevent overload')
    }
    if (state.knowledgeGaps.length > 0) {
      recommendations.push(`Resolve knowledge gaps first: ${state.knowledgeGaps.join(', ')}`)
    }
    if (behaviorProfile.activeAdjustments.length > 0) {
      recommendations.push(
        'Apply the most recent behavior adjustment before starting another long reasoning cycle',
      )
    }
    if (behaviorProfile.preferredReasoningStrategy) {
      recommendations.push(
        `Prefer ${behaviorProfile.preferredReasoningStrategy} when the task is ambiguous or multi-step`,
      )
    }

    return recommendations.length > 0
      ? recommendations
      : ['Current calibration looks stable; proceed and keep monitoring confidence drift']
  }

  private assessMetaCognitiveRisks(
    state: MetaCognitiveState,
  ): MetaCognitiveResponse['riskAssessment'] {
    return {
      overconfidence: state.confidence > 0.85 && state.selfAwareness < 0.55,
      underconfidence: state.confidence < 0.35 && state.selfAwareness > 0.7,
      cognitiveOverload: state.cognitiveLoad > 0.8,
      knowledgeGaps: state.knowledgeGaps,
    }
  }

  private getRecentReflections(agentId: string, limit: number): SelfReflection[] {
    return [...this.state.reflections.values()]
      .filter((reflection) => reflection.metadata?.agentId === agentId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit)
  }

  private getRecentUncertainties(agentId: string, limit: number): UncertaintyQuantification[] {
    return [...(this.state.uncertainties.get(agentId) ?? [])]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit)
  }

  private getRecentFeedback(agentId: string, limit: number): LearningFeedback[] {
    return [...this.state.feedback.values()]
      .filter((feedback) => feedback.metadata?.agentId === agentId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit)
  }

  private updateMemoryFromFeedback(feedback: LearningFeedback): AdaptiveMemory | null {
    const agentId =
      typeof feedback.metadata?.agentId === 'string' ? feedback.metadata.agentId : null
    if (!agentId) {
      return null
    }

    const memory = this.getOrCreateMemory(agentId)
    const memoryEntry: AdaptiveMemory['memories'][number] = {
      id: `memory_entry_${randomUUID()}`,
      content: feedback.content,
      type: feedback.feedbackType === 'positive' ? 'lesson' : 'mistake',
      timestamp: new Date().toISOString(),
      relevance: feedback.priority === 'critical' ? 1 : feedback.priority === 'high' ? 0.85 : 0.6,
      emotionalValence: feedback.feedbackType === 'negative' ? -0.8 : 0.8,
      tags: [feedback.source, feedback.targetComponent, feedback.priority],
    }

    memory.memories.push(memoryEntry)
    memory.lastUpdated = new Date().toISOString()
    this.extractPatternsFromExperience(memory, memoryEntry)
    this.pruneMemoryEntries(memory)

    return memory
  }

  private applyFeedbackImmediately(feedback: LearningFeedback): AgentBehaviorAdjustment[] {
    const agentId =
      typeof feedback.metadata?.agentId === 'string' ? feedback.metadata.agentId : null
    if (!agentId) {
      return []
    }

    const behaviorProfile = this.getOrCreateBehaviorProfile(agentId)
    const priorityWeight = this.getPriorityWeight(feedback.priority)
    const adjustments: AgentBehaviorAdjustment[] = []

    if (feedback.feedbackType !== 'positive') {
      behaviorProfile.verificationThreshold = this.clampUnit(
        behaviorProfile.verificationThreshold + priorityWeight * 0.05,
      )
      adjustments.push(
        this.createBehaviorAdjustment(agentId, {
          category: 'reasoning',
          action: 'raise_verification_threshold',
          description: 'Require stronger verification before finalizing responses',
          strength: priorityWeight,
          sourceFeedbackId: feedback.id,
        }),
      )

      behaviorProfile.escalationThreshold = this.clampUnit(
        behaviorProfile.escalationThreshold - priorityWeight * 0.06,
      )
      adjustments.push(
        this.createBehaviorAdjustment(agentId, {
          category: 'escalation',
          action: 'lower_escalation_threshold',
          description: 'Escalate or seek clarification earlier on uncertain tasks',
          strength: priorityWeight,
          sourceFeedbackId: feedback.id,
        }),
      )
    }

    if (feedback.targetComponent === 'behavior') {
      behaviorProfile.maxRetryDepth = Math.max(
        1,
        behaviorProfile.maxRetryDepth - (feedback.priority === 'critical' ? 1 : 0),
      )
      adjustments.push(
        this.createBehaviorAdjustment(agentId, {
          category: 'execution',
          action: 'reduce_retry_depth',
          description: 'Avoid repeating failing execution patterns without new evidence',
          strength: priorityWeight,
          sourceFeedbackId: feedback.id,
        }),
      )
    }

    const preferredStrategy = this.inferPreferredReasoningStrategy(feedback.content)
    if (preferredStrategy) {
      behaviorProfile.preferredReasoningStrategy = preferredStrategy
      adjustments.push(
        this.createBehaviorAdjustment(agentId, {
          category: 'reasoning',
          action: 'prefer_reasoning_strategy',
          description: `Bias future work toward ${preferredStrategy}`,
          strength: Math.max(0.4, priorityWeight),
          sourceFeedbackId: feedback.id,
        }),
      )
    }

    if (feedback.feedbackType === 'positive' && feedback.targetComponent === 'output') {
      adjustments.push(
        this.createBehaviorAdjustment(agentId, {
          category: 'prompting',
          action: 'reinforce_output_pattern',
          description: 'Preserve the current response pattern as a successful template',
          strength: priorityWeight,
          sourceFeedbackId: feedback.id,
        }),
      )
    }

    if (adjustments.length > 0) {
      behaviorProfile.activeAdjustments = [...behaviorProfile.activeAdjustments, ...adjustments]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, this.state.maxBehaviorAdjustments)
      behaviorProfile.lastUpdated = new Date().toISOString()
    }

    return adjustments
  }

  private calculatePerformanceImprovement(feedback: LearningFeedback): number {
    const baseImprovement =
      feedback.priority === 'critical'
        ? 0.14
        : feedback.priority === 'high'
          ? 0.1
          : feedback.priority === 'medium'
            ? 0.06
            : 0.03

    return feedback.feedbackType === 'positive' ? baseImprovement : -baseImprovement
  }

  private extractNewPatterns(
    feedback: LearningFeedback,
  ): Array<{ trigger: string; response: string }> {
    return [
      {
        trigger: `${feedback.targetComponent}:${feedback.feedbackType}`,
        response: feedback.content.slice(0, 120),
      },
    ]
  }

  private extractPatternsFromExperience(
    memory: AdaptiveMemory,
    entry: AdaptiveMemory['memories'][number],
  ): void {
    const existingPattern = memory.patterns.find(
      (pattern: AdaptiveMemory['patterns'][number]) => pattern.trigger === entry.type,
    )
    if (!existingPattern) {
      memory.patterns.push({
        trigger: entry.type,
        response: entry.content.slice(0, 200),
        successRate: entry.type === 'mistake' ? 0.2 : 0.8,
        lastUsed: entry.timestamp,
      })
      return
    }

    const nextSuccessRate =
      entry.type === 'mistake'
        ? Math.max(0, existingPattern.successRate - 0.1)
        : Math.min(1, existingPattern.successRate + 0.05)

    existingPattern.response = entry.content.slice(0, 200)
    existingPattern.successRate = nextSuccessRate
    existingPattern.lastUsed = entry.timestamp
  }

  private calculateEpistemicUncertainty(knowledgeCoverage: number): number {
    return Math.max(0, 1 - knowledgeCoverage)
  }

  private calculateAleatoricUncertainty(output: string, context: string): number {
    const hedgingMatches =
      output.match(/\b(maybe|perhaps|possibly|depends|unclear|roughly)\b/gi) ?? []
    const questionMarks = output.match(/\?/g)?.length ?? 0
    const contextPenalty = context.trim().length < 40 ? 0.06 : 0

    return this.clampUnit(
      0.08 + hedgingMatches.length * 0.07 + questionMarks * 0.04 + contextPenalty,
    )
  }

  private calculateKnowledgeCoverage(
    output: string,
    knowledgeBase: UncertaintyAnalysisInput['knowledgeBase'],
  ): number {
    if (!knowledgeBase?.nodes?.length) {
      return 0.2
    }

    const outputTokens = this.tokenize(output)
    if (outputTokens.size === 0) {
      return 0.2
    }

    const knowledgeTokens = knowledgeBase.nodes.reduce<Set<string>>(
      (tokens, node: UncertaintyAnalysisInput['knowledgeBase']['nodes'][number]) => {
        for (const token of this.tokenize(node.content)) {
          tokens.add(token)
        }
        return tokens
      },
      new Set<string>(),
    )

    const overlap = [...outputTokens].filter((token) => knowledgeTokens.has(token)).length
    return this.clampUnit(overlap / outputTokens.size)
  }

  private identifyUncertaintySources(
    output: string,
    context: string,
    knowledgeCoverage: number,
  ): string[] {
    const sources: string[] = []

    if (knowledgeCoverage < 0.45) {
      sources.push('Knowledge gap')
    }
    if (/\b(maybe|perhaps|possibly|unclear)\b/i.test(output)) {
      sources.push('Ambiguity')
    }
    if (/\b(depends|if|unless)\b/i.test(output) || context.trim().length < 40) {
      sources.push('Context dependency')
    }

    return sources
  }

  private generateMitigationStrategies(quantification: UncertaintyQuantification): string[] {
    const strategies: string[] = []

    if ((quantification.knowledgeCoverage ?? 1) < 0.5) {
      strategies.push(
        'Consult additional knowledge or a stronger source of truth before final output',
      )
    }
    if (quantification.aleatoric > 0.4) {
      strategies.push(
        'Present outcomes as ranges or scenarios rather than as a single definitive claim',
      )
    }
    if (quantification.total > 0.7) {
      strategies.push('Escalate early or request clarification before taking irreversible action')
    }

    return strategies
  }

  private determineConfidenceRecommendation(
    quantification: UncertaintyQuantification,
  ): 'proceed' | 'seek_clarification' | 'escalate' {
    if (quantification.total < 0.3) return 'proceed'
    if (quantification.total < 0.7) return 'seek_clarification'
    return 'escalate'
  }

  private generateCognitiveLoadRecommendations(load: CognitiveLoad): string[] {
    const recommendations: string[] = []

    if (load.workingMemoryUsage > 0.8) {
      recommendations.push('Reduce active context by splitting the task into smaller checkpoints')
    }
    if (load.processingSpeed < 0.7) {
      recommendations.push('Slow down the task cadence and prioritize fewer decisions per step')
    }
    if (load.fatigueLevel > 0.6) {
      recommendations.push('Schedule recovery time before attempting another high-complexity task')
    }
    if (load.stressLevel > 0.7) {
      recommendations.push(
        'Escalate uncertainty sooner instead of continuing to grind through ambiguity',
      )
    }

    return recommendations
  }

  private calculatePerformanceImpact(
    load: CognitiveLoad,
  ): CognitiveLoadResponse['performanceImpact'] {
    return {
      accuracyImpact: Number((-load.workingMemoryUsage * 0.3).toFixed(2)),
      speedImpact: Number((-load.fatigueLevel * 0.2).toFixed(2)),
      qualityImpact: Number((-load.stressLevel * 0.25).toFixed(2)),
    }
  }

  private pruneReflections(): void {
    if (this.state.reflections.size <= this.state.maxReflections) return

    const sorted = [...this.state.reflections.entries()].sort((a, b) =>
      a[1].timestamp.localeCompare(b[1].timestamp),
    )
    const overflow = this.state.reflections.size - this.state.maxReflections

    for (let index = 0; index < overflow; index += 1) {
      this.state.reflections.delete(sorted[index][0])
    }
  }

  private pruneMemories(): void {
    if (this.state.memories.size <= this.state.maxMemories) return

    const sorted = [...this.state.memories.entries()].sort((a, b) =>
      a[1].lastUpdated.localeCompare(b[1].lastUpdated),
    )
    const overflow = this.state.memories.size - this.state.maxMemories

    for (let index = 0; index < overflow; index += 1) {
      this.state.memories.delete(sorted[index][0])
    }
  }

  private pruneMemoryEntries(memory: AdaptiveMemory): void {
    if (memory.memories.length > 200) {
      memory.memories = memory.memories
        .sort((a: AdaptiveMemory['memories'][number], b: AdaptiveMemory['memories'][number]) =>
          b.timestamp.localeCompare(a.timestamp),
        )
        .slice(0, 200)
    }

    if (memory.patterns.length > 50) {
      memory.patterns = memory.patterns
        .sort((a: AdaptiveMemory['patterns'][number], b: AdaptiveMemory['patterns'][number]) =>
          b.lastUsed.localeCompare(a.lastUsed),
        )
        .slice(0, 50)
    }
  }

  private pruneFeedback(): void {
    if (this.state.feedback.size <= this.state.maxFeedback) return

    const sorted = [...this.state.feedback.entries()].sort((a, b) =>
      a[1].timestamp.localeCompare(b[1].timestamp),
    )
    const overflow = this.state.feedback.size - this.state.maxFeedback

    for (let index = 0; index < overflow; index += 1) {
      this.state.feedback.delete(sorted[index][0])
    }
  }

  private storeUncertainty(agentId: string, quantification: UncertaintyQuantification): void {
    const existing = this.state.uncertainties.get(agentId) ?? []
    existing.push(quantification)
    this.state.uncertainties.set(
      agentId,
      existing
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, this.state.maxUncertaintiesPerAgent),
    )
  }

  private getOrCreateMemory(agentId: string): AdaptiveMemory {
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

    return memory
  }

  private getOrCreateBehaviorProfile(agentId: string): AgentBehaviorProfile {
    let profile = this.state.behaviorProfiles.get(agentId)
    if (!profile) {
      profile = {
        agentId,
        verificationThreshold: 0.72,
        escalationThreshold: 0.75,
        maxRetryDepth: 3,
        activeAdjustments: [],
        lastUpdated: new Date().toISOString(),
      }
      this.state.behaviorProfiles.set(agentId, profile)
    }

    return profile
  }

  private getOrCreateCognitiveLoad(agentId: string, now: string): CognitiveLoad {
    let load = this.state.cognitiveLoads.get(agentId)
    if (!load) {
      load = {
        workingMemoryUsage: 0.3,
        processingSpeed: 1,
        attentionSpan: 0,
        fatigueLevel: 0,
        stressLevel: 0,
        timestamp: now,
      }
      this.state.cognitiveLoads.set(agentId, load)
    }

    return load
  }

  private applyCognitiveLoadDecay(load: CognitiveLoad, now: string, recoveryMinutes = 0): void {
    const elapsedMs = Math.max(0, Date.parse(now) - Date.parse(load.timestamp))
    const elapsedMinutes = elapsedMs / 60000 + Math.max(0, recoveryMinutes)
    if (elapsedMinutes <= 0) {
      return
    }

    const decay = Math.min(0.6, elapsedMinutes * 0.02)
    load.workingMemoryUsage = Math.max(0.1, load.workingMemoryUsage - decay)
    load.fatigueLevel = Math.max(0, load.fatigueLevel - decay * 0.7)
    load.stressLevel = Math.max(0, load.stressLevel - decay * 0.8)
    load.processingSpeed = Math.min(1, load.processingSpeed + decay * 0.25)
    load.attentionSpan = Math.max(0, load.attentionSpan - Math.ceil(elapsedMinutes / 30))
  }

  private extractKnowledgeGaps(
    recentUncertainties: UncertaintyQuantification[],
    recentFeedback: LearningFeedback[],
  ): string[] {
    const gaps = new Set<string>()

    for (const uncertainty of recentUncertainties) {
      for (const source of uncertainty.sources) {
        if (source === 'Knowledge gap') {
          gaps.add('external evidence')
        }
        if (source === 'Context dependency') {
          gaps.add('task context')
        }
      }
    }

    for (const feedback of recentFeedback) {
      if (feedback.targetComponent === 'knowledge' || feedback.feedbackType === 'corrective') {
        gaps.add(feedback.targetComponent)
      }
    }

    return [...gaps].slice(0, 6)
  }

  private calculateMemoryMatchScore(
    entry: AdaptiveMemory['memories'][number],
    queryTokens: Set<string>,
    tags: Set<string>,
  ): number {
    const contentTokens = this.tokenize(entry.content)
    const overlap =
      queryTokens.size === 0
        ? 0
        : [...queryTokens].filter((token) => contentTokens.has(token)).length / queryTokens.size

    const entryTags = new Set<string>(entry.tags.map((tag: string) => tag.toLowerCase()))
    const tagOverlap =
      tags.size === 0 ? 0 : [...tags].filter((tag) => entryTags.has(tag)).length / tags.size

    const ageDays = Math.max(0, (Date.now() - Date.parse(entry.timestamp)) / 86400000)
    const recencyScore = 1 / (1 + ageDays / 30)

    return Number(
      (overlap * 0.5 + tagOverlap * 0.2 + entry.relevance * 0.2 + recencyScore * 0.1).toFixed(3),
    )
  }

  private calculatePatternMatchScore(
    pattern: AdaptiveMemory['patterns'][number],
    queryTokens: Set<string>,
  ): number {
    if (queryTokens.size === 0) return 0

    const triggerTokens = this.tokenize(`${pattern.trigger} ${pattern.response}`)
    const overlap =
      [...queryTokens].filter((token) => triggerTokens.has(token)).length / queryTokens.size

    return overlap + pattern.successRate * 0.2
  }

  private calculateTokenOverlap(left: string, right: string): number {
    const leftTokens = this.tokenize(left)
    const rightTokens = this.tokenize(right)

    if (leftTokens.size === 0 || rightTokens.size === 0) {
      return 0
    }

    const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length
    return overlap / Math.max(leftTokens.size, rightTokens.size)
  }

  private tokenize(value: string): Set<string> {
    return new Set(
      value
        .toLowerCase()
        .split(/\W+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !COMMON_STOP_WORDS.has(token)),
    )
  }

  private containsHedging(value: string): boolean {
    return /\b(maybe|perhaps|possibly|i think|i believe|unclear|not sure)\b/i.test(value)
  }

  private containsEvidenceMarkers(value: string): boolean {
    return /\[[^\]]+\]\([^)]+\)|`[^`]+`|https?:\/\/|according to\b|for example\b/i.test(value)
  }

  private containsUnsupportedAbsoluteClaims(value: string): boolean {
    return /\b(always|never|definitely|guaranteed|prove[sd]?|certainly)\b/i.test(value)
  }

  private hasStructuredFormatting(value: string): boolean {
    return /(\n- |\n\* |\n\d+\. )/.test(value)
  }

  private clampScore(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)))
  }

  private clampUnit(value: number): number {
    return Math.max(0, Math.min(1, Number(value.toFixed(2))))
  }

  private normalizeIdentifier(value: unknown, fieldName: string): string {
    return this.requireNonEmptyText(value, fieldName, 200)
  }

  private requireNonEmptyText(value: unknown, fieldName: string, maxLength: number): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a string`)
    }

    const normalized = value.trim()
    if (!normalized) {
      throw new BadRequestException(`${fieldName} must not be empty`)
    }

    return normalized.slice(0, maxLength)
  }

  private normalizeOptionalText(value: unknown, maxLength: number): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }

    const normalized = value.trim()
    return normalized ? normalized.slice(0, maxLength) : undefined
  }

  private normalizeTags(tags?: string[]): string[] {
    return [
      ...new Set(
        (tags ?? [])
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 20),
      ),
    ]
  }

  private normalizeLimit(value: unknown, fallback: number, max: number): number {
    if (value === undefined || value === null || value === '') {
      return fallback
    }

    const numericValue = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numericValue)) {
      throw new BadRequestException('Limit must be a valid number')
    }

    return Math.max(1, Math.min(max, Math.floor(numericValue)))
  }

  private coerceBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value
    }
    if (typeof value === 'string') {
      return value.trim().toLowerCase() === 'true'
    }
    return false
  }

  private normalizeUnitInterval(value: unknown, fieldName: string): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined
    }

    const numericValue = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numericValue)) {
      throw new BadRequestException(`${fieldName} must be a valid number`)
    }

    return this.clampUnit(numericValue)
  }

  private normalizeNonNegativeNumber(value: unknown, fieldName: string): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined
    }

    const numericValue = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numericValue)) {
      throw new BadRequestException(`${fieldName} must be a valid number`)
    }

    return Math.max(0, numericValue)
  }

  private getPriorityWeight(priority: LearningFeedback['priority']): number {
    switch (priority) {
      case 'critical':
        return 1
      case 'high':
        return 0.8
      case 'medium':
        return 0.55
      case 'low':
        return 0.35
      default:
        return 0.35
    }
  }

  private inferPreferredReasoningStrategy(content: string): ReasoningStrategy | undefined {
    const normalized = content.toLowerCase()

    if (normalized.includes('tree-of-thought') || /\btree\b/.test(normalized))
      return 'tree-of-thought'
    if (normalized.includes('graph-of-thought') || /\bgraph\b/.test(normalized))
      return 'graph-of-thought'
    if (normalized.includes('react')) return 'react'
    if (normalized.includes('plan-and-solve') || normalized.includes('plan and solve'))
      return 'plan-and-solve'
    if (normalized.includes('chain-of-thought') || /\bchain\b/.test(normalized))
      return 'chain-of-thought'

    return undefined
  }

  private createBehaviorAdjustment(
    agentId: string,
    adjustment: Omit<AgentBehaviorAdjustment, 'id' | 'agentId' | 'createdAt'>,
  ): AgentBehaviorAdjustment {
    return {
      id: `adjustment_${randomUUID()}`,
      agentId,
      createdAt: new Date().toISOString(),
      ...adjustment,
    }
  }
}
