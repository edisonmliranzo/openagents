import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class GithubTool {
  private get token(): string | undefined {
    return process.env.GITHUB_TOKEN
  }

  private async call(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`GitHub ${method} ${path} → ${res.status}: ${text}`)
    }
    return res.json() as Promise<unknown>
  }

  // ── Create issue ──────────────────────────────────────────────────────────

  readonly createIssueDef: ToolDefinition = {
    name: 'github_create_issue',
    displayName: 'GitHub: Create Issue',
    description: 'Create a new issue in a GitHub repository.',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      required: ['owner', 'repo', 'title'],
      properties: {
        owner:  { type: 'string', description: 'Repository owner (user or org)' },
        repo:   { type: 'string', description: 'Repository name' },
        title:  { type: 'string', description: 'Issue title' },
        body:   { type: 'string', description: 'Issue body (markdown)' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Label names' },
      },
    },
  }

  async createIssue(input: { owner: string; repo: string; title: string; body?: string; labels?: string[] }): Promise<ToolResult> {
    try {
      const issue = await this.call(`/repos/${input.owner}/${input.repo}/issues`, 'POST', {
        title: input.title,
        body: input.body,
        labels: input.labels,
      }) as { html_url: string; number: number }
      return { success: true, output: `Created issue #${issue.number}: ${issue.html_url}` }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }

  // ── List open PRs ─────────────────────────────────────────────────────────

  readonly listPRsDef: ToolDefinition = {
    name: 'github_list_prs',
    displayName: 'GitHub: List Open PRs',
    description: 'List open pull requests in a repository.',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      required: ['owner', 'repo'],
      properties: {
        owner: { type: 'string' },
        repo:  { type: 'string' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
      },
    },
  }

  async listPRs(input: { owner: string; repo: string; state?: string }): Promise<ToolResult> {
    try {
      const state = input.state ?? 'open'
      const prs = await this.call(`/repos/${input.owner}/${input.repo}/pulls?state=${state}&per_page=20`) as Array<{ number: number; title: string; html_url: string; user: { login: string } }>
      if (prs.length === 0) return { success: true, output: 'No pull requests found.' }
      const lines = prs.map((pr) => `#${pr.number} — ${pr.title} (by ${pr.user.login}) ${pr.html_url}`)
      return { success: true, output: lines.join('\n') }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }

  // ── Add PR comment ────────────────────────────────────────────────────────

  readonly addCommentDef: ToolDefinition = {
    name: 'github_add_comment',
    displayName: 'GitHub: Add Comment',
    description: 'Add a comment to a GitHub issue or pull request.',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      required: ['owner', 'repo', 'issue_number', 'body'],
      properties: {
        owner:        { type: 'string' },
        repo:         { type: 'string' },
        issue_number: { type: 'number', description: 'Issue or PR number' },
        body:         { type: 'string', description: 'Comment text (markdown)' },
      },
    },
  }

  async addComment(input: { owner: string; repo: string; issue_number: number; body: string }): Promise<ToolResult> {
    try {
      const comment = await this.call(
        `/repos/${input.owner}/${input.repo}/issues/${input.issue_number}/comments`,
        'POST',
        { body: input.body },
      ) as { html_url: string }
      return { success: true, output: `Comment added: ${comment.html_url}` }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }

  // ── Get file ──────────────────────────────────────────────────────────────

  readonly getFileDef: ToolDefinition = {
    name: 'github_get_file',
    displayName: 'GitHub: Get File',
    description: 'Read a file from a GitHub repository.',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      required: ['owner', 'repo', 'path'],
      properties: {
        owner: { type: 'string' },
        repo:  { type: 'string' },
        path:  { type: 'string', description: 'File path in the repository' },
        ref:   { type: 'string', description: 'Branch, tag, or commit SHA (default: main)' },
      },
    },
  }

  async getFile(input: { owner: string; repo: string; path: string; ref?: string }): Promise<ToolResult> {
    try {
      const qs = input.ref ? `?ref=${input.ref}` : ''
      const file = await this.call(`/repos/${input.owner}/${input.repo}/contents/${input.path}${qs}`) as { content?: string; encoding?: string; name: string }
      if (!file.content || file.encoding !== 'base64') {
        return { success: false, output: '', error: 'File content not available or not text.' }
      }
      const decoded = Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8')
      return { success: true, output: decoded }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }

  // ── Create PR ─────────────────────────────────────────────────────────────

  readonly createPRDef: ToolDefinition = {
    name: 'github_create_pr',
    displayName: 'GitHub: Create Pull Request',
    description: 'Open a new pull request.',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      required: ['owner', 'repo', 'title', 'head', 'base'],
      properties: {
        owner: { type: 'string' },
        repo:  { type: 'string' },
        title: { type: 'string' },
        body:  { type: 'string' },
        head:  { type: 'string', description: 'Branch to merge from' },
        base:  { type: 'string', description: 'Branch to merge into (e.g. main)' },
      },
    },
  }

  async createPR(input: { owner: string; repo: string; title: string; body?: string; head: string; base: string }): Promise<ToolResult> {
    try {
      const pr = await this.call(`/repos/${input.owner}/${input.repo}/pulls`, 'POST', {
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base,
      }) as { html_url: string; number: number }
      return { success: true, output: `Created PR #${pr.number}: ${pr.html_url}` }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }
}
