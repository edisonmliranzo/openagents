import { Injectable, Logger } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class PostgresQueryTool {
  private readonly logger = new Logger(PostgresQueryTool.name)

  get def(): ToolDefinition {
    return {
      name: 'postgres_query',
      displayName: 'PostgreSQL Query',
      description:
        'Execute a read-only SQL query against a configured PostgreSQL database. The connection string must be set as CUSTOM_POSTGRES_URL in environment.',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The SQL SELECT query to execute.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of rows to return. Defaults to 100.',
          },
        },
        required: ['query'],
      },
    }
  }

  async query(
    input: {
      query: string
      limit?: number
    },
    _userId: string,
  ): Promise<ToolResult> {
    const { query, limit = 100 } = input

    if (!query) {
      return { success: false, output: null, error: 'query is required.' }
    }

    const connectionString = process.env.CUSTOM_POSTGRES_URL
    if (!connectionString) {
      return { success: false, output: null, error: 'CUSTOM_POSTGRES_URL not configured.' }
    }

    const trimmed = query.trim()
    const upperTrimmed = trimmed.toUpperCase()

    // Only allow read-only queries
    if (
      !upperTrimmed.startsWith('SELECT') &&
      !upperTrimmed.startsWith('WITH') &&
      !upperTrimmed.startsWith('EXPLAIN')
    ) {
      return { success: false, output: null, error: 'Only SELECT queries are allowed.' }
    }

    // Append LIMIT if it's a SELECT and no LIMIT already present
    let finalQuery = trimmed
    if (upperTrimmed.startsWith('SELECT') && !upperTrimmed.includes('LIMIT')) {
      finalQuery = `${trimmed} LIMIT ${limit}`
    }

    this.logger.log(`postgres_query: executing query`)

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client } = require('pg')
      const client = new Client({ connectionString })
      await client.connect()

      try {
        const result = await client.query(finalQuery)
        const fields = result.fields?.map((f: any) => f.name) ?? []
        return {
          success: true,
          output: {
            rows: result.rows,
            rowCount: result.rowCount ?? result.rows.length,
            fields,
          },
        }
      } finally {
        await client.end()
      }
    } catch (err: any) {
      this.logger.error(`postgres_query error: ${err.message}`)
      return { success: false, output: null, error: err.message }
    }
  }
}
