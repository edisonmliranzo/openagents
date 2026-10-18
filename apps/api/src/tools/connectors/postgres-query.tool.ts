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

    const trimmed = query.trim().replace(/;+\s*$/, '')
    const upperTrimmed = trimmed.toUpperCase()

    // Reject multi-statement stacked queries
    if (trimmed.includes(';')) {
      return { success: false, output: null, error: 'Multi-statement queries are not allowed.' }
    }

    // Only allow read-only queries
    if (
      !upperTrimmed.startsWith('SELECT') &&
      !upperTrimmed.startsWith('WITH') &&
      !upperTrimmed.startsWith('EXPLAIN')
    ) {
      return { success: false, output: null, error: 'Only SELECT queries are allowed.' }
    }

    // Block writable CTEs, DDL/DML, and dangerous server-side file functions
    if (
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|COPY|GRANT|REVOKE|CREATE|CALL|DO|SET|PG_READ_FILE|PG_READ_BINARY_FILE|PG_LS_DIR|PG_STAT_FILE|LO_IMPORT|LO_EXPORT|DBLINK)\b/i.test(
        trimmed,
      )
    ) {
      return {
        success: false,
        output: null,
        error: 'Write operations and privileged database functions are not permitted.',
      }
    }

    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 1000))

    // Append LIMIT if it's a SELECT and no LIMIT already present
    let finalQuery = trimmed
    if (upperTrimmed.startsWith('SELECT') && !/\bLIMIT\b/i.test(upperTrimmed)) {
      finalQuery = `${trimmed} LIMIT ${safeLimit}`
    }

    this.logger.log(`postgres_query: executing read-only query`)

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client } = require('pg')
      const client = new Client({ connectionString, statement_timeout: 15000 })
      await client.connect()

      try {
        await client.query('BEGIN TRANSACTION READ ONLY')
        const result = await client.query(finalQuery)
        await client.query('ROLLBACK')
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
