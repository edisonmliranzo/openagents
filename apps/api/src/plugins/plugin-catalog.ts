export interface McpServerTemplate {
  key: string
  name: string
  description: string
  category: string
  command: string
  args: string[]
  requiresEnv?: string[]
}

/**
 * Curated plugin catalog — installable MCP servers that extend the agent.
 * Commands use npx so installs are one-click on Windows/macOS/Linux.
 */
export const PLUGIN_CATALOG: McpServerTemplate[] = [
  {
    key: 'filesystem',
    name: 'Filesystem',
    description: 'Read, search, and edit files in an approved directory.',
    category: 'productivity',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
  },
  {
    key: 'fetch',
    name: 'Web Fetch',
    description: 'Fast page fetching with JS-to-markdown conversion for research.',
    category: 'research',
    command: 'uvx',
    args: ['mcp-server-fetch'],
  },
  {
    key: 'memory',
    name: 'Knowledge Graph Memory',
    description: 'Persistent entity-relationship memory across conversations.',
    category: 'memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
  },
  {
    key: 'github',
    name: 'GitHub',
    description: 'Repos, issues, PRs, and code search via the official GitHub MCP server.',
    category: 'developer',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    requiresEnv: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
  },
  {
    key: 'sqlite',
    name: 'SQLite',
    description: 'Query and analyze local SQLite databases.',
    category: 'data',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
  },
  {
    key: 'postgres',
    name: 'Postgres',
    description: 'Read-only SQL access to a Postgres database.',
    category: 'data',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    requiresEnv: ['POSTGRES_PLUGIN_URL'],
  },
  {
    key: 'brave-search',
    name: 'Brave Search',
    description: 'Web and local search powered by the Brave Search API.',
    category: 'research',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    requiresEnv: ['BRAVE_API_KEY'],
  },
  {
    key: 'slack',
    name: 'Slack',
    description: 'Channels, messages, and workspace search.',
    category: 'communication',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    requiresEnv: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
  },
  {
    key: 'puppeteer',
    name: 'Browser Automation',
    description: 'Drive a real headless browser: navigate, click, screenshot.',
    category: 'automation',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
  },
  {
    key: 'time',
    name: 'Time & Zones',
    description: 'Clock, timezone conversion, and date math.',
    category: 'utility',
    command: 'uvx',
    args: ['mcp-server-time'],
  },
]
