import { BadRequestException, Injectable } from '@nestjs/common'
import { ApprovalsService } from '../approvals/approvals.service'
import { PolicyService } from '../policy/policy.service'
import { ToolsService } from '../tools/tools.service'

export interface PlanAndActInput {
  userId: string
  query: string
  toolName?: string
  toolInput?: Record<string, unknown>
}

@Injectable()
export class ResearchService {
  constructor(
    private approvals: ApprovalsService,
    private policy: PolicyService,
    private tools: ToolsService,
  ) {}

  async planAndAct(input: PlanAndActInput) {
    const query = (input.query ?? '').trim()
    if (!input.userId?.trim()) throw new BadRequestException('userId is required')
    if (!query) throw new BadRequestException('query is required')

    const plan = [
      `Clarify objective: ${query}`,
      'Collect evidence from tools or known sources',
      'Synthesize concise answer',
      'Execute safe action if requested',
    ]

    const toolName = (input.toolName ?? '').trim()
    const toolInput = input.toolInput ?? {}

    let approvalRequired = false
    let policyReason = 'No action requested.'

    if (toolName) {
      const decision = this.policy.evaluate({
        action: `execute ${toolName}`,
        toolName,
        scope: /delete|remove|update|create|send|post|write/i.test(toolName)
          ? 'external_write'
          : 'external_read',
        sensitivity: 'internal',
        reversible: !/delete|remove|drop|terminate/i.test(toolName),
        estimatedCostUsd: 1,
      })
      approvalRequired = decision.decision === 'confirm' || decision.decision === 'block'
      policyReason = decision.reason ?? policyReason
    }

    if (!toolName) {
      return {
        mode: 'research_only',
        plan,
        approval: {
          required: false,
          reason: 'No tool action requested.',
        },
        action: null,
        answer: `Research plan created for: "${query}"`,
      }
    }

    if (approvalRequired) {
      const risk = this.approvals.scoreToolRisk({
        toolName,
        toolInput,
        requiresApprovalByPolicy: true,
        outsideAutonomyWindow: false,
      })
      return {
        mode: 'plan_then_approval',
        plan,
        approval: {
          required: true,
          reason: policyReason,
          risk,
        },
        action: null,
        answer: 'Approval required before executing action.',
      }
    }

    const execution = await this.tools.execute(toolName, toolInput, input.userId)
    return {
      mode: 'plan_then_act',
      plan,
      approval: {
        required: false,
        reason: policyReason,
      },
      action: {
        toolName,
        success: execution.success,
        output: execution.output ?? null,
        error: execution.error ?? null,
      },
      answer: execution.success
        ? 'Action executed successfully with plan-and-act flow.'
        : `Action failed: ${execution.error ?? 'unknown error'}`,
    }
  }
}
