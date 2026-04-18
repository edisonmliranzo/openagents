import { AuditSeverity, AuditCategory } from '@openagents/shared'
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../security/audit.service'

export interface AgentTask {
  id: string
  agentId: string
  objective: string
  input: any
  dependencies: string[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: any
  error?: string
  priority: number
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
}

export interface OrchestrationPlan {
  id: string
  objective: string
  tasks: AgentTask[]
  executionOrder: string[]
  status: 'planning' | 'executing' | 'completed' | 'failed'
  createdAt: Date
  completedAt?: Date
}

@Injectable()
export class OrchestrationService {
  private readonly logger = new Logger(OrchestrationService.name)
  private activePlans: Map<string, OrchestrationPlan> = new Map()

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * Create an orchestration plan for a complex objective
   */
  async createOrchestrationPlan(
    userId: string,
    objective: string,
    context?: any,
  ): Promise<OrchestrationPlan> {
    const planId = this.generateId()
    
    // Analyze objective and break it down into tasks
    const tasks = await this.analyzeObjective(objective, context)
    
    // Determine execution order based on dependencies
    const executionOrder = this.topologicalSort(tasks)
    
    const plan: OrchestrationPlan = {
      id: planId,
      objective,
      tasks,
      executionOrder,
      status: 'planning',
      createdAt: new Date(),
    }
    
    this.activePlans.set(planId, plan)
    
    // Log orchestration creation
    await this.auditService.logEvent(userId, {
      category: AuditCategory.ORCHESTRATION,
      action: 'plan_created',
      resource: planId,
      severity: AuditSeverity.LOW,
      description: `Orchestration plan created for: ${objective}`,
      timestamp: new Date(),
      metadata: { taskCount: tasks.length, planId },
    })
    
    return plan
  }

  /**
   * Execute an orchestration plan
   */
  async executePlan(planId: string, userId: string): Promise<void> {
    const plan = this.activePlans.get(planId)
    if (!plan) {
      throw new Error(`Plan ${planId} not found`)
    }
    
    plan.status = 'executing'
    
    for (const taskId of plan.executionOrder) {
      const task = plan.tasks.find(t => t.id === taskId)
      if (!task) continue
      
      // Wait for dependencies to complete
      await this.waitForDependencies(task, plan)
      
      // Execute task
      await this.executeTask(task, userId)
      
      // Check if task succeeded
      if (task.status === 'failed') {
        plan.status = 'failed'
        await this.handleTaskFailure(task, plan, userId)
        break
      }
    }
    
    if (plan.status !== 'failed') {
      plan.status = 'completed'
      plan.completedAt = new Date()
    }
    
    // Log completion
    await this.auditService.logEvent(userId, {
      category: AuditCategory.ORCHESTRATION,
      action: 'plan_completed',
      resource: planId,
      severity: AuditSeverity.LOW,
      description: `Orchestration plan ${plan.status}`,
      timestamp: new Date(),
    })
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: AgentTask, userId: string): Promise<void> {
    task.status = 'running'
    task.startedAt = new Date()
    
    try {
      // Simulate agent execution (would integrate with actual agent service)
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const result = { 
        message: `Task "${task.objective}" completed successfully`,
        timestamp: new Date().toISOString(),
        input: task.input,
      }
      
      task.result = result
      task.status = 'completed'
      task.completedAt = new Date()
      
      this.logger.log(`Task ${task.id} completed successfully`)
    } catch (error) {
      task.status = 'failed'
      task.error = error instanceof Error ? error.message : 'Unknown error'
      task.completedAt = new Date()
      
      this.logger.error(`Task ${task.id} failed: ${task.error}`)
    }
  }

  /**
   * Wait for all dependencies of a task to complete
   */
  private async waitForDependencies(
    task: AgentTask,
    plan: OrchestrationPlan,
  ): Promise<void> {
    for (const depId of task.dependencies) {
      const depTask = plan.tasks.find(t => t.id === depId)
      if (!depTask) continue
      
      // Wait for dependency to complete
      while (depTask.status === 'running' || depTask.status === 'pending') {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      // Check if dependency failed
      if (depTask.status === 'failed') {
        throw new Error(`Dependency ${depId} failed`)
      }
    }
  }

  /**
   * Analyze objective and break it down into tasks
   */
  private async analyzeObjective(
    objective: string,
    context?: any,
  ): Promise<AgentTask[]> {
    const tasks: AgentTask[] = []
    
    // Example: Break down complex objectives
    if (objective.toLowerCase().includes('research') && objective.toLowerCase().includes('report')) {
      // Research and report generation workflow
      tasks.push({
        id: this.generateId(),
        agentId: 'researcher',
        objective: 'Research the topic',
        input: { query: objective, context },
        dependencies: [],
        status: 'pending',
        priority: 1,
        createdAt: new Date(),
      })
      
      tasks.push({
        id: this.generateId(),
        agentId: 'analyst',
        objective: 'Analyze research findings',
        input: { researchResults: '{{task1.result}}', context },
        dependencies: [tasks[0].id],
        status: 'pending',
        priority: 2,
        createdAt: new Date(),
      })
      
      tasks.push({
        id: this.generateId(),
        agentId: 'writer',
        objective: 'Generate comprehensive report',
        input: { analysis: '{{task2.result}}', context },
        dependencies: [tasks[1].id],
        status: 'pending',
        priority: 3,
        createdAt: new Date(),
      })
    } else if (objective.toLowerCase().includes('analyze') && objective.toLowerCase().includes('data')) {
      // Data analysis workflow
      tasks.push({
        id: this.generateId(),
        agentId: 'data-collector',
        objective: 'Collect relevant data',
        input: { source: objective, context },
        dependencies: [],
        status: 'pending',
        priority: 1,
        createdAt: new Date(),
      })
      
      tasks.push({
        id: this.generateId(),
        agentId: 'data-analyst',
        objective: 'Analyze collected data',
        input: { data: '{{task1.result}}', context },
        dependencies: [tasks[0].id],
        status: 'pending',
        priority: 2,
        createdAt: new Date(),
      })
    } else {
      // Default single task
      tasks.push({
        id: this.generateId(),
        agentId: 'general-assistant',
        objective: 'Complete the task',
        input: { objective, context },
        dependencies: [],
        status: 'pending',
        priority: 1,
        createdAt: new Date(),
      })
    }
    
    return tasks
  }

  /**
   * Sort tasks based on dependencies (topological sort)
   */
  private topologicalSort(tasks: AgentTask[]): string[] {
    const sorted: string[] = []
    const visited = new Set<string>()
    
    const visit = (task: AgentTask) => {
      if (visited.has(task.id)) return
      
      // Visit dependencies first
      for (const depId of task.dependencies) {
        const depTask = tasks.find(t => t.id === depId)
        if (depTask) {
          visit(depTask)
        }
      }
      
      visited.add(task.id)
      sorted.push(task.id)
    }
    
    // Sort by priority first, then by dependencies
    const sortedByPriority = [...tasks].sort((a, b) => a.priority - b.priority)
    
    for (const task of sortedByPriority) {
      visit(task)
    }
    
    return sorted
  }

  /**
   * Handle task failure with recovery strategies
   */
  private async handleTaskFailure(
    task: AgentTask,
    plan: OrchestrationPlan,
    userId: string,
  ): Promise<void> {
    // Log failure
    await this.auditService.logEvent(userId, {
      category: AuditCategory.ORCHESTRATION,
      action: 'task_failed',
      resource: task.id,
      severity: AuditSeverity.HIGH,
      description: `Task failed: ${task.error}`,
      timestamp: new Date(),
      metadata: { taskId: task.id, planId: plan.id, error: task.error },
    })
    
    // Attempt recovery strategies
    const recoveryStrategies = [
      'retry_with_different_agent',
      'simplify_objective',
      'request_human_intervention',
    ]
    
    for (const strategy of recoveryStrategies) {
      try {
        const recovered = await this.applyRecoveryStrategy(
          strategy,
          task,
          plan,
          userId,
        )
        
        if (recovered) {
          this.logger.log(`Recovered from task failure using ${strategy}`)
          return
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        this.logger.warn(`Recovery strategy ${strategy} failed: ${errorMsg}`)
      }
    }
    
    // If all recovery strategies failed, mark plan as failed
    this.logger.error(`All recovery strategies failed for task ${task.id}`)
  }

  /**
   * Apply recovery strategy for failed task
   */
  private async applyRecoveryStrategy(
    strategy: string,
    task: AgentTask,
    plan: OrchestrationPlan,
    userId: string,
  ): Promise<boolean> {
    switch (strategy) {
      case 'retry_with_different_agent':
        // Try with a different agent
        const backupAgent = await this.findBackupAgent(task.agentId)
        if (backupAgent) {
          task.agentId = backupAgent.id
          task.status = 'pending'
          task.error = undefined
          await this.executeTask(task, userId)
          return (task.status as string) === 'completed'
        }
        return false
        
      case 'simplify_objective':
        // Simplify the task objective
        task.objective = `Simplified: ${task.objective}`
        task.status = 'pending'
        task.error = undefined
        await this.executeTask(task, userId)
        return (task.status as string) === 'completed'
        
      case 'request_human_intervention':
        // Create a task for human review
        await this.createHumanInterventionTask(task, plan, userId)
        return false // Human intervention required
        
      default:
        return false
    }
  }

  /**
   * Find backup agent for failed task
   */
  private async findBackupAgent(agentId: string): Promise<{ id: string } | null> {
    // For now, return a mock backup agent
    // In production, this would query available agents
    return { id: `${agentId}-backup` }
  }

  /**
   * Create human intervention task
   */
  private async createHumanInterventionTask(
    task: AgentTask,
    plan: OrchestrationPlan,
    userId: string,
  ): Promise<void> {
    // Log the human intervention need (notification schema may differ)
    this.logger.warn(`Human intervention required for task: ${task.objective}`)
  }

  /**
   * Get orchestration plan status
   */
  getPlanStatus(planId: string): OrchestrationPlan | null {
    return this.activePlans.get(planId) || null
  }

  /**
   * List all active orchestration plans
   */
  listActivePlans(): OrchestrationPlan[] {
    return Array.from(this.activePlans.values()).filter(
      plan => plan.status === 'executing' || plan.status === 'planning',
    )
  }

  /**
   * Cancel an orchestration plan
   */
  cancelPlan(planId: string, userId: string): boolean {
    const plan = this.activePlans.get(planId)
    if (!plan) return false
    
    plan.status = 'failed'
    plan.completedAt = new Date()
    
    // Cancel any running tasks
    for (const task of plan.tasks) {
      if (task.status === 'running') {
        task.status = 'failed'
        task.error = 'Plan cancelled by user'
        task.completedAt = new Date()
      }
    }
    
    // Log cancellation
    this.auditService.logEvent(userId, {
      category: AuditCategory.ORCHESTRATION,
      action: 'plan_cancelled',
      resource: planId,
      severity: AuditSeverity.MEDIUM,
      description: 'Orchestration plan cancelled by user',
      timestamp: new Date(),
    })
    
    return true
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}