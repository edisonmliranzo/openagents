import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class LinearTool {
  private get token(): string | undefined {
    return process.env.LINEAR_API_KEY
  }

  private async graphql(query: string, variables?: Record<string, unknown>): Promise<unknown> {
    if (!this.token) throw new Error('LINEAR_API_KEY not set')
    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.token,
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) throw new Error(`Linear API ${res.status}: ${res.statusText}`)
    const json = await res.json() as { data?: unknown; errors?: Array<{ message: string }> }
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
    return json.data
  }

  // ── Create issue ──────────────────────────────────────────────────────────

  readonly createIssueDef: ToolDefinition = {
    name: 'linear_create_issue',
    displayName: 'Linear: Create Issue',
    description: 'Create a new issue in a Linear team.',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      required: ['team_id', 'title'],
      properties: {
        team_id:     { type: 'string', description: 'Linear team ID' },
        title:       { type: 'string' },
        description: { type: 'string', description: 'Issue description (markdown)' },
        priority:    { type: 'number', description: '0=no priority, 1=urgent, 2=high, 3=medium, 4=low' },
        assignee_id: { type: 'string', description: 'Assignee user ID (optional)' },
      },
    },
  }

  async createIssue(input: { team_id: string; title: string; description?: string; priority?: number; assignee_id?: string }): Promise<ToolResult> {
    try {
      const data = await this.graphql(`
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            issue { id identifier url title }
          }
        }
      `, {
        input: {
          teamId: input.team_id,
          title: input.title,
          description: input.description,
          priority: input.priority,
          assigneeId: input.assignee_id,
        },
      }) as { issueCreate: { issue: { identifier: string; url: string } } }
      const issue = data.issueCreate.issue
      return { success: true, output: `Created ${issue.identifier}: ${issue.url}` }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }

  // ── Update issue status ───────────────────────────────────────────────────

  readonly updateStatusDef: ToolDefinition = {
    name: 'linear_update_status',
    displayName: 'Linear: Update Issue Status',
    description: 'Change the workflow state of a Linear issue.',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      required: ['issue_id', 'state_id'],
      properties: {
        issue_id: { type: 'string', description: 'Linear issue ID' },
        state_id: { type: 'string', description: 'Workflow state ID' },
      },
    },
  }

  async updateStatus(input: { issue_id: string; state_id: string }): Promise<ToolResult> {
    try {
      await this.graphql(`
        mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            issue { identifier url }
          }
        }
      `, { id: input.issue_id, input: { stateId: input.state_id } })
      return { success: true, output: `Issue ${input.issue_id} updated.` }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }

  // ── List issues by project ────────────────────────────────────────────────

  readonly listIssuesDef: ToolDefinition = {
    name: 'linear_list_issues',
    displayName: 'Linear: List Issues',
    description: 'List issues in a Linear team, optionally filtered by project or state.',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      required: ['team_id'],
      properties: {
        team_id:    { type: 'string' },
        project_id: { type: 'string', description: 'Filter by project ID' },
        state:      { type: 'string', description: 'Filter by state name (e.g. "In Progress")' },
      },
    },
  }

  async listIssues(input: { team_id: string; project_id?: string; state?: string }): Promise<ToolResult> {
    try {
      const filter: Record<string, unknown> = { team: { id: { eq: input.team_id } } }
      if (input.project_id) filter['project'] = { id: { eq: input.project_id } }
      if (input.state) filter['state'] = { name: { eq: input.state } }

      const data = await this.graphql(`
        query ListIssues($filter: IssueFilter) {
          issues(filter: $filter, first: 25) {
            nodes { identifier title url state { name } assignee { name } }
          }
        }
      `, { filter }) as { issues: { nodes: Array<{ identifier: string; title: string; url: string; state: { name: string }; assignee?: { name: string } }> } }

      const issues = data.issues.nodes
      if (issues.length === 0) return { success: true, output: 'No issues found.' }
      const lines = issues.map((i) => `${i.identifier} [${i.state.name}] ${i.title}${i.assignee ? ` → ${i.assignee.name}` : ''} ${i.url}`)
      return { success: true, output: lines.join('\n') }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }

  // ── Add comment ───────────────────────────────────────────────────────────

  readonly addCommentDef: ToolDefinition = {
    name: 'linear_add_comment',
    displayName: 'Linear: Add Comment',
    description: 'Add a comment to a Linear issue.',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      required: ['issue_id', 'body'],
      properties: {
        issue_id: { type: 'string' },
        body:     { type: 'string', description: 'Comment text (markdown)' },
      },
    },
  }

  async addComment(input: { issue_id: string; body: string }): Promise<ToolResult> {
    try {
      await this.graphql(`
        mutation AddComment($input: CommentCreateInput!) {
          commentCreate(input: $input) { comment { id } }
        }
      `, { input: { issueId: input.issue_id, body: input.body } })
      return { success: true, output: 'Comment added.' }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }
}
