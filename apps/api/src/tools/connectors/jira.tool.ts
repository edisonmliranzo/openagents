import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class JiraTool {
  private get baseUrl(): string | undefined {
    return process.env.JIRA_BASE_URL // e.g. https://yourorg.atlassian.net
  }

  private get token(): string | undefined {
    return process.env.JIRA_API_TOKEN
  }

  private get email(): string | undefined {
    return process.env.JIRA_EMAIL
  }

  private async call(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    if (!this.baseUrl) throw new Error('JIRA_BASE_URL not set')
    if (!this.token || !this.email) throw new Error('JIRA_EMAIL and JIRA_API_TOKEN must be set')

    const credentials = Buffer.from(`${this.email}:${this.token}`).toString('base64')
    const res = await fetch(`${this.baseUrl}/rest/api/3${path}`, {
      method,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Jira ${method} ${path} → ${res.status}: ${text}`)
    }
    return res.status === 204 ? null : (res.json() as Promise<unknown>)
  }

  // ── Create issue ──────────────────────────────────────────────────────────

  readonly createIssueDef: ToolDefinition = {
    name: 'jira_create_issue',
    displayName: 'Jira: Create Issue',
    description: 'Create a new issue in a Jira project.',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      required: ['project_key', 'summary', 'issue_type'],
      properties: {
        project_key: { type: 'string', description: 'Jira project key (e.g. "OA")' },
        summary:     { type: 'string', description: 'Issue title' },
        issue_type:  { type: 'string', description: 'Issue type name (e.g. "Bug", "Story", "Task")' },
        description: { type: 'string', description: 'Issue description (plain text)' },
        priority:    { type: 'string', description: 'Priority name (e.g. "High", "Medium", "Low")' },
        assignee_id: { type: 'string', description: 'Atlassian account ID of assignee' },
        labels:      { type: 'array', items: { type: 'string' }, description: 'Label strings' },
      },
    },
  }

  async createIssue(input: {
    project_key: string
    summary: string
    issue_type: string
    description?: string
    priority?: string
    assignee_id?: string
    labels?: string[]
  }): Promise<ToolResult> {
    try {
      const body: Record<string, unknown> = {
        fields: {
          project: { key: input.project_key },
          summary: input.summary,
          issuetype: { name: input.issue_type },
          ...(input.description ? {
            description: {
              type: 'doc',
              version: 1,
              content: [{ type: 'paragraph', content: [{ type: 'text', text: input.description }] }],
            },
          } : {}),
          ...(input.priority ? { priority: { name: input.priority } } : {}),
          ...(input.assignee_id ? { assignee: { id: input.assignee_id } } : {}),
          ...(input.labels?.length ? { labels: input.labels } : {}),
        },
      }
      const data = await this.call('/issue', 'POST', body) as { id: string; key: string; self: string }
      return { success: true, output: `Created issue ${data.key}: ${this.baseUrl}/browse/${data.key}` }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }

  // ── Update issue status ───────────────────────────────────────────────────

  readonly transitionIssueDef: ToolDefinition = {
    name: 'jira_transition_issue',
    displayName: 'Jira: Transition Issue',
    description: 'Move a Jira issue to a new status by applying a transition.',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      required: ['issue_key', 'transition_id'],
      properties: {
        issue_key:     { type: 'string', description: 'Issue key (e.g. "OA-42")' },
        transition_id: { type: 'string', description: 'Transition ID (get from jira_list_transitions)' },
      },
    },
  }

  async transitionIssue(input: { issue_key: string; transition_id: string }): Promise<ToolResult> {
    try {
      await this.call(`/issue/${input.issue_key}/transitions`, 'POST', {
        transition: { id: input.transition_id },
      })
      return { success: true, output: `Issue ${input.issue_key} transitioned.` }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }

  // ── List issues via JQL ───────────────────────────────────────────────────

  readonly searchIssuesDef: ToolDefinition = {
    name: 'jira_search_issues',
    displayName: 'Jira: Search Issues',
    description: 'Search Jira issues using JQL (Jira Query Language).',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      required: ['jql'],
      properties: {
        jql:      { type: 'string', description: 'JQL query (e.g. "project = OA AND status = \\"In Progress\\"")' },
        max_results: { type: 'number', description: 'Max results to return (default 20, max 50)' },
      },
    },
  }

  async searchIssues(input: { jql: string; max_results?: number }): Promise<ToolResult> {
    try {
      const maxResults = Math.min(input.max_results ?? 20, 50)
      const params = new URLSearchParams({
        jql: input.jql,
        maxResults: String(maxResults),
        fields: 'summary,status,assignee,priority,issuetype',
      })
      const data = await this.call(`/search?${params}`) as {
        issues: Array<{
          key: string
          fields: {
            summary: string
            status: { name: string }
            assignee?: { displayName: string }
            priority?: { name: string }
          }
        }>
        total: number
      }
      if (data.issues.length === 0) return { success: true, output: 'No issues found.' }
      const lines = data.issues.map((i) =>
        `${i.key} [${i.fields.status.name}] ${i.fields.summary}${i.fields.assignee ? ` → ${i.fields.assignee.displayName}` : ''}`,
      )
      return { success: true, output: `${lines.join('\n')}\n(${data.total} total)` }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }

  // ── Add comment ───────────────────────────────────────────────────────────

  readonly addCommentDef: ToolDefinition = {
    name: 'jira_add_comment',
    displayName: 'Jira: Add Comment',
    description: 'Add a comment to a Jira issue.',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      required: ['issue_key', 'body'],
      properties: {
        issue_key: { type: 'string', description: 'Issue key (e.g. "OA-42")' },
        body:      { type: 'string', description: 'Comment text' },
      },
    },
  }

  async addComment(input: { issue_key: string; body: string }): Promise<ToolResult> {
    try {
      await this.call(`/issue/${input.issue_key}/comment`, 'POST', {
        body: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: input.body }] }],
        },
      })
      return { success: true, output: `Comment added to ${input.issue_key}.` }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }

  // ── List transitions ──────────────────────────────────────────────────────

  readonly listTransitionsDef: ToolDefinition = {
    name: 'jira_list_transitions',
    displayName: 'Jira: List Transitions',
    description: 'List available status transitions for a Jira issue.',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      required: ['issue_key'],
      properties: {
        issue_key: { type: 'string', description: 'Issue key (e.g. "OA-42")' },
      },
    },
  }

  async listTransitions(input: { issue_key: string }): Promise<ToolResult> {
    try {
      const data = await this.call(`/issue/${input.issue_key}/transitions`) as {
        transitions: Array<{ id: string; name: string; to: { name: string } }>
      }
      if (data.transitions.length === 0) return { success: true, output: 'No transitions available.' }
      const lines = data.transitions.map((t) => `${t.id}: ${t.name} → ${t.to.name}`)
      return { success: true, output: lines.join('\n') }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }
}
