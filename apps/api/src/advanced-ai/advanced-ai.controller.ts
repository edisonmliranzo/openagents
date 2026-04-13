import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { ReasoningService } from './reasoning.service'
import { ReflectionService } from './reflection.service'
import type {
  CreateReasoningChainInput,
  AddReasoningStepInput,
  EvaluateOutputInput,
  GetMetaCognitiveStateInput,
  ProcessFeedbackInput,
  AdaptiveLearningInput,
  UncertaintyAnalysisInput,
  CognitiveLoadInput,
  ReasoningChainResponse,
  ThoughtTreeResponse,
  KnowledgeGraphResponse,
  ReflectionResponse,
  MetaCognitiveResponse,
  LearningResponse,
  UncertaintyResponse,
  CognitiveLoadResponse,
} from '@openagents/shared'

@ApiTags('Advanced AI')
@Controller('advanced-ai')
@UseGuards(AuthGuard('jwt'))
export class AdvancedAIController {
  constructor(
    private readonly reasoningService: ReasoningService,
    private readonly reflectionService: ReflectionService,
  ) {}

  // ── Reasoning Chain Endpoints ───────────────────────────────────────────────

  @Post('reasoning/chains')
  @ApiOperation({ summary: 'Create a new reasoning chain' })
  @ApiResponse({ status: 201, description: 'Reasoning chain created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createReasoningChain(@Body() input: CreateReasoningChainInput): Promise<ReasoningChainResponse> {
    return this.reasoningService.createReasoningChain(input)
  }

  @Post('reasoning/chains/:chainId/steps')
  @ApiOperation({ summary: 'Add a reasoning step to a chain' })
  @ApiParam({ name: 'chainId', description: 'ID of the reasoning chain' })
  @ApiResponse({ status: 200, description: 'Step added successfully' })
  @ApiResponse({ status: 404, description: 'Reasoning chain not found' })
  @ApiResponse({ status: 400, description: 'Maximum chain length reached' })
  async addReasoningStep(
    @Param('chainId') chainId: string,
    @Body() input: AddReasoningStepInput,
  ): Promise<ReasoningChainResponse> {
    return this.reasoningService.addReasoningStep(chainId, input)
  }

  @Get('reasoning/chains/:chainId')
  @ApiOperation({ summary: 'Get a reasoning chain by ID' })
  @ApiParam({ name: 'chainId', description: 'ID of the reasoning chain' })
  @ApiResponse({ status: 200, description: 'Reasoning chain retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Reasoning chain not found' })
  async getReasoningChain(@Param('chainId') chainId: string): Promise<any> {
    const chain = this.reasoningService.getReasoningChain(chainId)
    if (!chain) {
      throw new Error('Reasoning chain not found')
    }
    return chain
  }

  @Post('reasoning/chains/:chainId/complete')
  @ApiOperation({ summary: 'Complete a reasoning chain with final answer' })
  @ApiParam({ name: 'chainId', description: 'ID of the reasoning chain' })
  @ApiResponse({ status: 200, description: 'Reasoning chain completed successfully' })
  @ApiResponse({ status: 404, description: 'Reasoning chain not found' })
  async completeReasoningChain(
    @Param('chainId') chainId: string,
    @Body() body: { finalAnswer: string },
  ): Promise<ReasoningChainResponse> {
    return this.reasoningService.completeReasoningChain(chainId, body.finalAnswer)
  }

  // ── Thought Tree Endpoints ───────────────────────────────────────────────────

  @Post('reasoning/trees')
  @ApiOperation({ summary: 'Create a new thought tree' })
  @ApiResponse({ status: 201, description: 'Thought tree created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createThoughtTree(
    @Body() body: { problem: string; strategy: 'breadth-first' | 'depth-first' | 'best-first' | 'monte-carlo' },
  ): Promise<ThoughtTreeResponse> {
    return this.reasoningService.createThoughtTree(body.problem, body.strategy)
  }

  @Post('reasoning/trees/:treeId/nodes')
  @ApiOperation({ summary: 'Add a thought node to a tree' })
  @ApiParam({ name: 'treeId', description: 'ID of the thought tree' })
  @ApiResponse({ status: 200, description: 'Thought node added successfully' })
  @ApiResponse({ status: 404, description: 'Thought tree not found' })
  async addThoughtNode(
    @Param('treeId') treeId: string,
    @Body() body: { parentId: string; content: string; confidence?: number },
  ): Promise<ThoughtTreeResponse> {
    return this.reasoningService.addThoughtNode(treeId, body.parentId, body.content, body.confidence)
  }

  @Post('reasoning/trees/:treeId/evaluate')
  @ApiOperation({ summary: 'Evaluate a thought path in a tree' })
  @ApiParam({ name: 'treeId', description: 'ID of the thought tree' })
  @ApiResponse({ status: 200, description: 'Thought path evaluated successfully' })
  @ApiResponse({ status: 404, description: 'Thought tree not found' })
  @ApiResponse({ status: 400, description: 'Invalid path' })
  async evaluateThoughtPath(
    @Param('treeId') treeId: string,
    @Body() body: { path: string[] },
  ): Promise<ThoughtTreeResponse> {
    return this.reasoningService.evaluateThoughtPath(treeId, body.path)
  }

  // ── Knowledge Graph Endpoints ────────────────────────────────────────────────

  @Post('reasoning/graphs')
  @ApiOperation({ summary: 'Create a new knowledge graph' })
  @ApiResponse({ status: 201, description: 'Knowledge graph created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createKnowledgeGraph(
    @Body() body: { name: string; description?: string },
  ): Promise<KnowledgeGraphResponse> {
    return this.reasoningService.createKnowledgeGraph(body.name, body.description)
  }

  @Post('reasoning/graphs/:graphId/nodes')
  @ApiOperation({ summary: 'Add a node to a knowledge graph' })
  @ApiParam({ name: 'graphId', description: 'ID of the knowledge graph' })
  @ApiResponse({ status: 200, description: 'Node added successfully' })
  @ApiResponse({ status: 404, description: 'Knowledge graph not found' })
  async addKnowledgeNode(
    @Param('graphId') graphId: string,
    @Body() body: { type: 'concept' | 'fact' | 'procedure' | 'entity'; content: string; confidence?: number },
  ): Promise<KnowledgeGraphResponse> {
    return this.reasoningService.addKnowledgeNode(graphId, body)
  }

  @Post('reasoning/graphs/:graphId/edges')
  @ApiOperation({ summary: 'Add an edge to a knowledge graph' })
  @ApiParam({ name: 'graphId', description: 'ID of the knowledge graph' })
  @ApiResponse({ status: 200, description: 'Edge added successfully' })
  @ApiResponse({ status: 404, description: 'Knowledge graph not found' })
  @ApiResponse({ status: 400, description: 'Invalid edge' })
  async addKnowledgeEdge(
    @Param('graphId') graphId: string,
    @Body() body: {
      from: string
      to: string
      relationshipType: 'causal' | 'correlational' | 'hierarchical' | 'sequential'
      weight?: number
      confidence?: number
    },
  ): Promise<KnowledgeGraphResponse> {
    return this.reasoningService.addKnowledgeEdge(graphId, body)
  }

  // ── Self-Reflection Endpoints ────────────────────────────────────────────────

  @Post('reflection/evaluate')
  @ApiOperation({ summary: 'Evaluate output quality through self-reflection' })
  @ApiResponse({ status: 200, description: 'Output evaluated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async evaluateOutput(@Body() input: EvaluateOutputInput): Promise<ReflectionResponse> {
    return this.reflectionService.evaluateOutput(input)
  }

  @Get('reflection/:reflectionId')
  @ApiOperation({ summary: 'Get a reflection by ID' })
  @ApiParam({ name: 'reflectionId', description: 'ID of the reflection' })
  @ApiResponse({ status: 200, description: 'Reflection retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Reflection not found' })
  async getReflection(@Param('reflectionId') reflectionId: string): Promise<any> {
    const reflection = this.reflectionService.getReflection(reflectionId)
    if (!reflection) {
      throw new Error('Reflection not found')
    }
    return reflection
  }

  @Get('reflection/history/:agentId')
  @ApiOperation({ summary: 'Get reflection history for an agent' })
  @ApiParam({ name: 'agentId', description: 'ID of the agent' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit the number of results' })
  @ApiResponse({ status: 200, description: 'Reflection history retrieved successfully' })
  async getReflectionHistory(
    @Param('agentId') agentId: string,
    @Query('limit') limit?: number,
  ): Promise<any[]> {
    return this.reflectionService.getReflectionHistory(agentId, limit)
  }

  // ── Meta-Cognition Endpoints ─────────────────────────────────────────────────

  @Get('meta-cognition/:agentId')
  @ApiOperation({ summary: 'Get meta-cognitive state for an agent' })
  @ApiParam({ name: 'agentId', description: 'ID of the agent' })
  @ApiQuery({ name: 'includeHistory', required: false, description: 'Include historical data' })
  @ApiQuery({ name: 'historyLimit', required: false, description: 'Limit historical data' })
  @ApiResponse({ status: 200, description: 'Meta-cognitive state retrieved successfully' })
  async getMetaCognitiveState(@Query() query: GetMetaCognitiveStateInput): Promise<MetaCognitiveResponse> {
    return this.reflectionService.getMetaCognitiveState(query)
  }

  // ── Learning and Feedback Endpoints ──────────────────────────────────────────

  @Post('learning/feedback')
  @ApiOperation({ summary: 'Process learning feedback' })
  @ApiResponse({ status: 200, description: 'Feedback processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async processFeedback(@Body() input: ProcessFeedbackInput): Promise<LearningResponse> {
    return this.reflectionService.processFeedback(input)
  }

  @Get('learning/history/:agentId')
  @ApiOperation({ summary: 'Get learning history for an agent' })
  @ApiParam({ name: 'agentId', description: 'ID of the agent' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit the number of results' })
  @ApiResponse({ status: 200, description: 'Learning history retrieved successfully' })
  async getLearningHistory(
    @Param('agentId') agentId: string,
    @Query('limit') limit?: number,
  ): Promise<any[]> {
    return this.reflectionService.getLearningHistory(agentId, limit)
  }

  @Post('learning/memory/:agentId')
  @ApiOperation({ summary: 'Add experience to adaptive memory' })
  @ApiParam({ name: 'agentId', description: 'ID of the agent' })
  @ApiResponse({ status: 200, description: 'Memory updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async addMemoryExperience(
    @Param('agentId') agentId: string,
    @Body() body: { content: string; type: 'experience' | 'lesson' | 'pattern' | 'mistake'; tags?: string[] },
  ): Promise<any> {
    return this.reflectionService.addMemoryExperience(agentId, body)
  }

  @Get('learning/memory/:agentId')
  @ApiOperation({ summary: 'Get adaptive memory for an agent' })
  @ApiParam({ name: 'agentId', description: 'ID of the agent' })
  @ApiResponse({ status: 200, description: 'Memory retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Memory not found' })
  async getAdaptiveMemory(@Param('agentId') agentId: string): Promise<any> {
    const memory = this.reflectionService.getAdaptiveMemory(agentId)
    if (!memory) {
      throw new Error('Memory not found')
    }
    return memory
  }

  // ── Uncertainty Analysis Endpoints ───────────────────────────────────────────

  @Post('uncertainty/analyze')
  @ApiOperation({ summary: 'Analyze uncertainty in output' })
  @ApiResponse({ status: 200, description: 'Uncertainty analysis completed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async analyzeUncertainty(@Body() input: UncertaintyAnalysisInput): Promise<UncertaintyResponse> {
    return this.reflectionService.analyzeUncertainty(input)
  }

  // ── Cognitive Load Management Endpoints ──────────────────────────────────────

  @Post('cognitive-load/:agentId')
  @ApiOperation({ summary: 'Update cognitive load for an agent' })
  @ApiParam({ name: 'agentId', description: 'ID of the agent' })
  @ApiResponse({ status: 200, description: 'Cognitive load updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async updateCognitiveLoad(@Param('agentId') agentId: string, @Body() input: CognitiveLoadInput): Promise<CognitiveLoadResponse> {
    return this.reflectionService.updateCognitiveLoad({ ...input, agentId })
  }

  // ── Advanced Reasoning Methods ───────────────────────────────────────────────

  @Post('reasoning/analyze')
  @ApiOperation({ summary: 'Analyze problem and recommend reasoning strategy' })
  @ApiResponse({ status: 200, description: 'Problem analysis completed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async analyzeProblem(
    @Body() body: { problem: string; context?: any },
  ): Promise<{
    recommendedStrategy: string
    complexity: number
    estimatedSteps: number
    riskFactors: string[]
  }> {
    return this.reasoningService.analyzeProblem(body.problem, body.context)
  }

  @Post('reasoning/plan')
  @ApiOperation({ summary: 'Generate reasoning plan for a problem' })
  @ApiResponse({ status: 200, description: 'Reasoning plan generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async generateReasoningPlan(
    @Body() body: { problem: string; strategy: string },
  ): Promise<{
    steps: string[]
    milestones: string[]
    checkpoints: string[]
  }> {
    return this.reasoningService.generateReasoningPlan(body.problem, body.strategy as any)
  }
}