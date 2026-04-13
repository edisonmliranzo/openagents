import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type {
  ReasoningStrategy,
  ReasoningStep,
  ReasoningChain,
  ThoughtNode,
  ThoughtTree,
  KnowledgeGraph,
  GraphEdge,
  ReasoningContext,
  CreateReasoningChainInput,
  AddReasoningStepInput,
  ReasoningChainResponse,
  ThoughtTreeResponse,
  KnowledgeGraphResponse,
} from '@openagents/shared'
import { ReflectionService } from './reflection.service'

interface ReasoningState {
  chains: Map<string, ReasoningChain>
  trees: Map<string, ThoughtTree>
  graphs: Map<string, KnowledgeGraph>
  maxChains: number
  maxTrees: number
  maxGraphs: number
}

@Injectable()
export class ReasoningService {
  private readonly logger = new Logger(ReasoningService.name)
  constructor(private readonly reflectionService: ReflectionService) {}
  private readonly state: ReasoningState = {
    chains: new Map(),
    trees: new Map(),
    graphs: new Map(),
    maxChains: 1000,
    maxTrees: 500,
    maxGraphs: 200,
  }

  // ── Chain-of-Thought Reasoning ───────────────────────────────────────────────

  createReasoningChain(input: CreateReasoningChainInput): ReasoningChainResponse {
    const chainId = `chain_${randomUUID()}`
    const now = new Date().toISOString()

    const chain: ReasoningChain = {
      id: chainId,
      problem: input.problem.slice(0, 2000),
      strategy: input.strategy,
      steps: [],
      confidence: 0.5, // Initial confidence
      createdAt: now,
      metadata: {
        maxSteps: input.maxSteps || 20,
        qualityThreshold: input.qualityThreshold || 0.7,
        context: input.context,
        agentContext: input.agentContext,
      },
    }

    this.state.chains.set(chainId, chain)
    this.pruneChains()

    this.logger.log(`Created ${input.strategy} reasoning chain for: ${input.problem.slice(0, 100)}`)

    return {
      chain,
      status: 'in-progress',
      nextAction: 'continue',
    }
  }

  addReasoningStep(chainId: string, input: AddReasoningStepInput): ReasoningChainResponse {
    const chain = this.state.chains.get(chainId)
    if (!chain) throw new NotFoundException(`Reasoning chain "${chainId}" not found`)

    if (chain.steps.length >= (chain.metadata?.maxSteps as number || 20)) {
      throw new BadRequestException('Maximum chain length reached')
    }

    const step: ReasoningStep = {
      id: `step_${randomUUID()}`,
      content: input.content.slice(0, 5000),
      reasoningType: chain.strategy,
      confidence: Math.max(0, Math.min(1, input.confidence ?? 0.8)),
      metadata: input.metadata,
      timestamp: new Date().toISOString(),
      previousSteps: chain.steps.length > 0 ? [chain.steps[chain.steps.length - 1].id] : [],
    }

    chain.steps.push(step)

    // Update chain confidence based on step confidence
    const avgConfidence = chain.steps.reduce((sum: number, s: ReasoningStep) => sum + s.confidence, 0) / chain.steps.length
    chain.confidence = avgConfidence

    // Check if chain should be completed
    const status = this.evaluateChainCompletion(chain)
    const nextAction = status === 'completed' ? undefined : 'continue'

    return {
      chain,
      status,
      nextAction,
    }
  }

  getReasoningChain(chainId: string): ReasoningChain | null {
    return this.state.chains.get(chainId) ?? null
  }

  completeReasoningChain(chainId: string, finalAnswer: string): ReasoningChainResponse {
    const chain = this.state.chains.get(chainId)
    if (!chain) throw new NotFoundException(`Reasoning chain "${chainId}" not found`)

    chain.finalAnswer = finalAnswer.slice(0, 10000)
    chain.completedAt = new Date().toISOString()
    chain.qualityScore = this.calculateQualityScore(chain)

    const agentContext = this.getChainAgentContext(chain, chainId)
    const reflection = this.reflectionService.evaluateOutput({
      output: chain.finalAnswer,
      criteria: {
        accuracy: true,
        completeness: true,
        relevance: true,
        quality: true,
      },
      context: chain.problem,
      agentContext,
      outputType: 'final-answer',
    })

    chain.metadata = {
      ...chain.metadata,
      completionReflectionId: reflection.reflection.id,
    }

    if (agentContext?.agentId && reflection.reflection.assessment.score < 70) {
      this.reflectionService.processFeedback({
        feedback: {
          source: 'self',
          feedbackType: 'corrective',
          content: `Reasoning chain ${chainId} completed with reflection score ${reflection.reflection.assessment.score}. ${reflection.improvements.join(' ')}`.trim(),
          targetComponent: 'output',
          priority: reflection.reflection.assessment.score < 50 ? 'high' : 'medium',
          metadata: {
            ...agentContext,
            chainId,
            reflectionId: reflection.reflection.id,
          },
        },
        updateMemory: true,
        applyImmediately: true,
        agentContext,
      })
    }

    return {
      chain,
      status: 'completed',
    }
  }

  // ── Tree-of-Thought Reasoning ────────────────────────────────────────────────

  createThoughtTree(problem: string, strategy: 'breadth-first' | 'depth-first' | 'best-first' | 'monte-carlo'): ThoughtTreeResponse {
    const treeId = `tree_${randomUUID()}`
    const now = new Date().toISOString()

    const rootNode: ThoughtNode = {
      id: `node_${randomUUID()}`,
      content: problem.slice(0, 1000),
      parentIds: [],
      childIds: [],
      confidence: 0.8,
      explorationDepth: 0,
      createdAt: now,
    }

    const tree: ThoughtTree = {
      id: treeId,
      rootProblem: problem.slice(0, 2000),
      nodes: [rootNode],
      edges: [],
      explorationStrategy: strategy,
      createdAt: now,
    }

    this.state.trees.set(treeId, tree)
    this.pruneTrees()

    this.logger.log(`Created ${strategy} thought tree for: ${problem.slice(0, 100)}`)

    return {
      tree,
      status: 'active',
      rootNode,
    }
  }

  addThoughtNode(treeId: string, parentId: string, content: string, confidence?: number): ThoughtTreeResponse {
    const tree = this.state.trees.get(treeId)
    if (!tree) throw new NotFoundException(`Thought tree "${treeId}" not found`)

    const parent = tree.nodes.find((n: ThoughtNode) => n.id === parentId)
    if (!parent) throw new NotFoundException(`Parent node "${parentId}" not found`)

    const node: ThoughtNode = {
      id: `node_${randomUUID()}`,
      content: content.slice(0, 2000),
      parentIds: [parentId],
      childIds: [],
      confidence: Math.max(0, Math.min(1, confidence ?? 0.7)),
      explorationDepth: parent.explorationDepth + 1,
      createdAt: new Date().toISOString(),
    }

    // Connect to parent
    parent.childIds.push(node.id)
    tree.edges.push({
      from: parentId,
      to: node.id,
      weight: node.confidence,
    })

    tree.nodes.push(node)

    // Update tree exploration
    this.updateTreeExploration(tree)

    return {
      tree,
      status: 'active',
      selectedNode: node,
    }
  }

  evaluateThoughtPath(treeId: string, path: string[]): ThoughtTreeResponse {
    const tree = this.state.trees.get(treeId)
    if (!tree) throw new NotFoundException(`Thought tree "${treeId}" not found`)

    const nodes = path
      .map(id => tree.nodes.find((n: ThoughtNode) => n.id === id))
      .filter((node): node is ThoughtNode => Boolean(node))
    if (nodes.length !== path.length) {
      throw new BadRequestException('Invalid path: some nodes not found')
    }

    // Calculate path value
    const pathValue = nodes.reduce((sum, node) => sum + node.confidence, 0) / nodes.length

    tree.bestPath = path
    tree.completedAt = new Date().toISOString()

    return {
      tree,
      status: 'completed',
      pathValue,
      selectedNode: nodes[nodes.length - 1],
    }
  }

  // ── Graph-of-Thought Reasoning ───────────────────────────────────────────────

  createKnowledgeGraph(name: string, description?: string): KnowledgeGraphResponse {
    const graphId = `graph_${randomUUID()}`
    const now = new Date().toISOString()

    const graph: KnowledgeGraph = {
      id: graphId,
      nodes: [],
      edges: [],
      createdAt: now,
      lastUpdated: now,
    }

    this.state.graphs.set(graphId, graph)
    this.pruneGraphs()

    this.logger.log(`Created knowledge graph: ${name}`)

    return {
      graph,
      status: 'active',
    }
  }

  addKnowledgeNode(graphId: string, node: {
    type: 'concept' | 'fact' | 'procedure' | 'entity'
    content: string
    confidence?: number
  }): KnowledgeGraphResponse {
    const graph = this.state.graphs.get(graphId)
    if (!graph) throw new NotFoundException(`Knowledge graph "${graphId}" not found`)

    const newNode = {
      id: `kg_node_${randomUUID()}`,
      type: node.type,
      content: node.content.slice(0, 1000),
      confidence: Math.max(0, Math.min(1, node.confidence ?? 0.8)),
      lastUpdated: new Date().toISOString(),
    }

    graph.nodes.push(newNode)
    graph.lastUpdated = new Date().toISOString()

    return {
      graph,
      status: 'active',
      addedNode: newNode,
    }
  }

  addKnowledgeEdge(graphId: string, edge: {
    from: string
    to: string
    relationshipType: 'causal' | 'correlational' | 'hierarchical' | 'sequential'
    weight?: number
    confidence?: number
  }): KnowledgeGraphResponse {
    const graph = this.state.graphs.get(graphId)
    if (!graph) throw new NotFoundException(`Knowledge graph "${graphId}" not found`)

    const fromNode = graph.nodes.find((n: any) => n.id === edge.from)
    const toNode = graph.nodes.find((n: any) => n.id === edge.to)

    if (!fromNode || !toNode) {
      throw new BadRequestException('Invalid edge: source or target node not found')
    }

    const newEdge: GraphEdge = {
      from: edge.from,
      to: edge.to,
      weight: edge.weight ?? 0.5,
      relationshipType: edge.relationshipType,
      confidence: Math.max(0, Math.min(1, edge.confidence ?? 0.7)),
    }

    graph.edges.push(newEdge)
    graph.lastUpdated = new Date().toISOString()

    return {
      graph,
      status: 'active',
      addedEdge: newEdge,
    }
  }

  // ── Advanced Reasoning Methods ───────────────────────────────────────────────

  analyzeProblem(problem: string, context?: ReasoningContext): {
    recommendedStrategy: ReasoningStrategy
    complexity: number
    estimatedSteps: number
    riskFactors: string[]
  } {
    // Analyze problem complexity and recommend strategy
    const length = problem.length
    const complexity = Math.min(1, length / 2000) // Normalize to 0-1
    const wordCount = problem.split(/\s+/).length

    let recommendedStrategy: ReasoningStrategy
    let estimatedSteps: number
    const riskFactors: string[] = []

    if (complexity < 0.3) {
      recommendedStrategy = 'chain-of-thought'
      estimatedSteps = Math.ceil(wordCount / 50)
    } else if (complexity < 0.7) {
      recommendedStrategy = 'tree-of-thought'
      estimatedSteps = Math.ceil(wordCount / 30)
      if ((context?.cognitiveState?.cognitiveLoad ?? 0) > 0.8) {
        riskFactors.push('High cognitive load detected')
      }
    } else {
      recommendedStrategy = 'graph-of-thought'
      estimatedSteps = Math.ceil(wordCount / 20)
      riskFactors.push('High complexity problem')
      if (!context?.availableKnowledge) {
        riskFactors.push('Limited knowledge base')
      }
    }

    return {
      recommendedStrategy,
      complexity,
      estimatedSteps,
      riskFactors,
    }
  }

  generateReasoningPlan(problem: string, strategy: ReasoningStrategy): {
    steps: string[]
    milestones: string[]
    checkpoints: string[]
  } {
    const steps: string[] = []
    const milestones: string[] = []
    const checkpoints: string[] = []

    switch (strategy) {
      case 'chain-of-thought':
        steps.push(
          'Understand the problem statement',
          'Identify key constraints and requirements',
          'Break down into sub-problems',
          'Solve each sub-problem sequentially',
          'Combine solutions into final answer'
        )
        milestones.push('Problem analysis complete', 'Solution synthesis')
        checkpoints.push('Sub-problem validation', 'Intermediate result verification')
        break

      case 'tree-of-thought':
        steps.push(
          'Define root problem',
          'Generate multiple solution approaches',
          'Explore each approach in parallel',
          'Evaluate approach quality',
          'Select best approach path'
        )
        milestones.push('Approach generation', 'Quality evaluation', 'Path selection')
        checkpoints.push('Approach diversity check', 'Quality threshold validation')
        break

      case 'graph-of-thought':
        steps.push(
          'Identify core concepts',
          'Map concept relationships',
          'Build knowledge graph',
          'Find optimal reasoning paths',
          'Synthesize connected insights'
        )
        milestones.push('Concept identification', 'Graph construction', 'Path optimization')
        checkpoints.push('Relationship validation', 'Graph consistency check')
        break

      case 'react':
        steps.push(
          'Thought generation',
          'Action planning',
          'Observation gathering',
          'Reflection and adjustment',
          'Iterative improvement'
        )
        milestones.push('Initial plan', 'Observation integration', 'Final refinement')
        checkpoints.push('Action feasibility', 'Observation relevance')
        break

      case 'plan-and-solve':
        steps.push(
          'Problem decomposition',
          'Strategy planning',
          'Implementation execution',
          'Result verification',
          'Solution optimization'
        )
        milestones.push('Decomposition complete', 'Plan finalized', 'Execution complete')
        checkpoints.push('Component validation', 'Integration testing')
        break
    }

    return { steps, milestones, checkpoints }
  }

  // ── Helper Methods ───────────────────────────────────────────────────────────

  private evaluateChainCompletion(chain: ReasoningChain): 'completed' | 'in-progress' | 'failed' {
    const maxSteps = chain.metadata?.maxSteps as number || 20
    const qualityThreshold = chain.metadata?.qualityThreshold as number || 0.7

    if (chain.steps.length >= maxSteps) {
      return chain.confidence >= qualityThreshold ? 'completed' : 'failed'
    }

    // Check if chain has reached sufficient quality
    if (chain.confidence >= qualityThreshold && chain.steps.length >= 3) {
      return 'completed'
    }

    return 'in-progress'
  }

  private calculateQualityScore(chain: ReasoningChain): number {
    if (chain.steps.length === 0) return 0

    const confidenceScore = chain.confidence
    const completenessScore = Math.min(1, chain.steps.length / 10) // Normalize to 0-1
    const coherenceScore = this.calculateCoherenceScore(chain.steps)

    return (confidenceScore * 0.5) + (completenessScore * 0.3) + (coherenceScore * 0.2)
  }

  private calculateCoherenceScore(steps: ReasoningStep[]): number {
    if (steps.length < 2) return 1

    let coherence = 0
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1]
      const curr = steps[i]

      // Simple coherence check based on content overlap
      const prevWords = new Set(prev.content.toLowerCase().split(/\W+/))
      const currWords = new Set(curr.content.toLowerCase().split(/\W+/))

      const overlap = [...prevWords].filter(word => currWords.has(word)).length
      const total = new Set([...prevWords, ...currWords]).size
      const overlapRatio = total > 0 ? overlap / total : 0

      coherence += overlapRatio
    }

    return coherence / (steps.length - 1)
  }

  private updateTreeExploration(tree: ThoughtTree): void {
    // Update exploration based on strategy
    switch (tree.explorationStrategy) {
      case 'breadth-first':
        // Ensure all nodes at current depth are explored before going deeper
        break
      case 'depth-first':
        // Focus on deepest unexplored paths
        break
      case 'best-first':
        // Prioritize highest confidence paths
        tree.nodes.sort((a: ThoughtNode, b: ThoughtNode) => b.confidence - a.confidence)
        break
      case 'monte-carlo':
        // Random exploration with bias toward promising paths
        break
    }
  }

  private getChainAgentContext(chain: ReasoningChain, chainId: string): CreateReasoningChainInput['agentContext'] | undefined {
    const metadataAgentContext = chain.metadata?.agentContext as CreateReasoningChainInput['agentContext'] | undefined
    if (!metadataAgentContext?.agentId) {
      return undefined
    }

    return {
      ...metadataAgentContext,
      chainId: metadataAgentContext.chainId ?? chainId,
    }
  }

  private pruneChains(): void {
    if (this.state.chains.size <= this.state.maxChains) return

    const sorted = [...this.state.chains.entries()].sort(
      (a: [string, ReasoningChain], b: [string, ReasoningChain]) => a[1].createdAt.localeCompare(b[1].createdAt),
    )

    const overflow = this.state.chains.size - this.state.maxChains
    for (let i = 0; i < overflow; i++) {
      this.state.chains.delete(sorted[i][0])
    }
  }

  private pruneTrees(): void {
    if (this.state.trees.size <= this.state.maxTrees) return

    const sorted = [...this.state.trees.entries()].sort(
      (a: [string, ThoughtTree], b: [string, ThoughtTree]) => a[1].createdAt.localeCompare(b[1].createdAt),
    )

    const overflow = this.state.trees.size - this.state.maxTrees
    for (let i = 0; i < overflow; i++) {
      this.state.trees.delete(sorted[i][0])
    }
  }

  private pruneGraphs(): void {
    if (this.state.graphs.size <= this.state.maxGraphs) return

    const sorted = [...this.state.graphs.entries()].sort(
      (a: [string, KnowledgeGraph], b: [string, KnowledgeGraph]) => a[1].createdAt.localeCompare(b[1].createdAt),
    )

    const overflow = this.state.graphs.size - this.state.maxGraphs
    for (let i = 0; i < overflow; i++) {
      this.state.graphs.delete(sorted[i][0])
    }
  }
}
