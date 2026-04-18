import { AuditSeverity, AuditCategory } from '@openagents/shared'
import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { OrchestrationService, OrchestrationPlan, AgentTask } from './orchestration.service'
import { AuditService } from '../security/audit.service'

export interface CreateOrchestrationPlanDto {
  objective: string
  context?: any
}

export interface UpdateTaskDto {
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: any
  error?: string
}

@ApiTags('orchestration')
@Controller('orchestration')
@UseGuards(AuthGuard('jwt'))
export class OrchestrationController {
  constructor(
    private readonly orchestrationService: OrchestrationService,
    private readonly auditService: AuditService,
  ) {}

  @Post('plans')
  @ApiOperation({ summary: 'Create an orchestration plan' })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        objective: { type: 'string', description: 'The objective to orchestrate' },
        context: { type: 'object', description: 'Additional context for the objective', nullable: true }
      }
    }
  })
  @ApiResponse({ status: 201, description: 'Orchestration plan created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createPlan(
    @Body() createPlanDto: CreateOrchestrationPlanDto,
    @Param('userId') userId: string,
  ): Promise<OrchestrationPlan> {
    const plan = await this.orchestrationService.createOrchestrationPlan(
      userId,
      createPlanDto.objective,
      createPlanDto.context,
    )

    await this.auditService.logEvent(userId, {
      category: AuditCategory.ORCHESTRATION,
      action: 'plan_created',
      resource: plan.id,
      severity: AuditSeverity.LOW,
      description: `Orchestration plan created: ${createPlanDto.objective}`,
      timestamp: new Date(),
    })

    return plan
  }

  @Get('plans/:planId')
  @ApiOperation({ summary: 'Get orchestration plan status' })
  @ApiParam({ name: 'planId', description: 'ID of the orchestration plan' })
  @ApiResponse({ status: 200, description: 'Orchestration plan retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async getPlan(@Param('planId') planId: string, @Param('userId') userId: string): Promise<OrchestrationPlan | null> {
    const plan = this.orchestrationService.getPlanStatus(planId)

    await this.auditService.logEvent(userId, {
      category: AuditCategory.ORCHESTRATION,
      action: 'plan_accessed',
      resource: planId,
      severity: AuditSeverity.LOW,
      description: `Orchestration plan accessed: ${planId}`,
      timestamp: new Date(),
    })

    return plan
  }

  @Get('plans')
  @ApiOperation({ summary: 'List all active orchestration plans' })
  @ApiResponse({ status: 200, description: 'Active plans retrieved successfully' })
  async listPlans(@Param('userId') userId: string): Promise<OrchestrationPlan[]> {
    const plans = this.orchestrationService.listActivePlans()

    await this.auditService.logEvent(userId, {
      category: AuditCategory.ORCHESTRATION,
      action: 'plans_listed',
      resource: 'all',
      severity: AuditSeverity.LOW,
      description: 'Listed active orchestration plans',
      timestamp: new Date(),
    })

    return plans
  }

  @Post('plans/:planId/execute')
  @ApiOperation({ summary: 'Execute an orchestration plan' })
  @ApiParam({ name: 'planId', description: 'ID of the orchestration plan' })
  @ApiResponse({ status: 200, description: 'Plan execution initiated successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async executePlan(@Param('planId') planId: string, @Param('userId') userId: string): Promise<void> {
    await this.orchestrationService.executePlan(planId, userId)

    await this.auditService.logEvent(userId, {
      category: AuditCategory.ORCHESTRATION,
      action: 'plan_executed',
      resource: planId,
      severity: AuditSeverity.MEDIUM,
      description: `Orchestration plan executed: ${planId}`,
      timestamp: new Date(),
    })
  }

  @Put('plans/:planId/cancel')
  @ApiOperation({ summary: 'Cancel an orchestration plan' })
  @ApiParam({ name: 'planId', description: 'ID of the orchestration plan' })
  @ApiResponse({ status: 200, description: 'Plan cancelled successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async cancelPlan(@Param('planId') planId: string, @Param('userId') userId: string): Promise<boolean> {
    const result = this.orchestrationService.cancelPlan(planId, userId)

    await this.auditService.logEvent(userId, {
      category: AuditCategory.ORCHESTRATION,
      action: 'plan_cancelled',
      resource: planId,
      severity: AuditSeverity.MEDIUM,
      description: `Orchestration plan cancelled: ${planId}`,
      timestamp: new Date(),
    })

    return result
  }

  @Get('plans/:planId/tasks')
  @ApiOperation({ summary: 'Get all tasks for an orchestration plan' })
  @ApiParam({ name: 'planId', description: 'ID of the orchestration plan' })
  @ApiResponse({ status: 200, description: 'Tasks retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async getPlanTasks(@Param('planId') planId: string, @Param('userId') userId: string): Promise<AgentTask[]> {
    const plan = this.orchestrationService.getPlanStatus(planId)
    
    if (!plan) {
      return []
    }

    await this.auditService.logEvent(userId, {
      category: AuditCategory.ORCHESTRATION,
      action: 'tasks_accessed',
      resource: planId,
      severity: AuditSeverity.LOW,
      description: `Tasks accessed for plan: ${planId}`,
      timestamp: new Date(),
    })

    return plan.tasks
  }

  @Get('plans/:planId/execution-order')
  @ApiOperation({ summary: 'Get execution order for an orchestration plan' })
  @ApiParam({ name: 'planId', description: 'ID of the orchestration plan' })
  @ApiResponse({ status: 200, description: 'Execution order retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async getExecutionOrder(@Param('planId') planId: string, @Param('userId') userId: string): Promise<string[]> {
    const plan = this.orchestrationService.getPlanStatus(planId)
    
    if (!plan) {
      return []
    }

    await this.auditService.logEvent(userId, {
      category: AuditCategory.ORCHESTRATION,
      action: 'execution_order_accessed',
      resource: planId,
      severity: AuditSeverity.LOW,
      description: `Execution order accessed for plan: ${planId}`,
      timestamp: new Date(),
    })

    return plan.executionOrder
  }

  @Get('health')
  @ApiOperation({ summary: 'Get orchestration system health status' })
  @ApiResponse({ status: 200, description: 'Health status retrieved successfully' })
  async getHealthStatus(@Param('userId') userId: string): Promise<{ activePlans: number; totalTasks: number; systemStatus: string }> {
    const plans = this.orchestrationService.listActivePlans()
    const totalTasks = plans.reduce((sum, plan) => sum + plan.tasks.length, 0)

    const systemStatus = plans.length > 0 ? 'active' : 'idle'

    await this.auditService.logEvent(userId, {
      category: AuditCategory.ORCHESTRATION,
      action: 'health_checked',
      resource: 'system',
      severity: AuditSeverity.LOW,
      description: 'Orchestration health status checked',
      timestamp: new Date(),
    })

    return {
      activePlans: plans.length,
      totalTasks,
      systemStatus,
    }
  }

  @Delete('plans/:planId')
  @ApiOperation({ summary: 'Delete an orchestration plan' })
  @ApiParam({ name: 'planId', description: 'ID of the orchestration plan' })
  @ApiResponse({ status: 200, description: 'Plan deleted successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async deletePlan(@Param('planId') planId: string, @Param('userId') userId: string): Promise<boolean> {
    const plan = this.orchestrationService.getPlanStatus(planId)
    
    if (!plan) {
      return false
    }

    // Cancel the plan first if it's running
    if (plan.status === 'executing') {
      this.orchestrationService.cancelPlan(planId, userId)
    }

    // Note: In a real implementation, you might want to store plans in a database
    // For now, we'll just cancel and mark as failed

    await this.auditService.logEvent(userId, {
      category: AuditCategory.ORCHESTRATION,
      action: 'plan_deleted',
      resource: planId,
      severity: AuditSeverity.MEDIUM,
      description: `Orchestration plan deleted: ${planId}`,
      timestamp: new Date(),
    })

    return true
  }
}