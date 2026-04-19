import { Injectable, Logger } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class AirtableTool {
  private readonly logger = new Logger(AirtableTool.name)

  get def(): ToolDefinition {
    return {
      name: 'airtable_query',
      displayName: 'Airtable',
      description:
        'Read records from an Airtable base. Requires AIRTABLE_API_KEY in environment. Can list records or search by field value.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          base_id: {
            type: 'string',
            description: 'The Airtable base ID (e.g. "appXXXXXXXXXXXXXX").',
          },
          table_name: {
            type: 'string',
            description: 'The name of the table to query.',
          },
          filter_formula: {
            type: 'string',
            description: 'Optional Airtable formula to filter records (e.g. "{Name}=\'Alice\'").',
          },
          max_records: {
            type: 'number',
            description: 'Maximum number of records to return. Defaults to 50.',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of field names to include in the response.',
          },
        },
        required: ['base_id', 'table_name'],
      },
    }
  }

  async query(
    input: {
      base_id: string
      table_name: string
      filter_formula?: string
      max_records?: number
      fields?: string[]
    },
    _userId: string,
  ): Promise<ToolResult> {
    const { base_id, table_name, filter_formula, max_records = 50, fields } = input

    if (!base_id) return { success: false, output: null, error: 'base_id is required.' }
    if (!table_name) return { success: false, output: null, error: 'table_name is required.' }

    const apiKey = process.env.AIRTABLE_API_KEY
    if (!apiKey) {
      return { success: false, output: null, error: 'AIRTABLE_API_KEY is not configured.' }
    }

    this.logger.log(`airtable_query: base=${base_id} table=${table_name}`)

    try {
      const params = new URLSearchParams()
      if (filter_formula) params.set('filterByFormula', filter_formula)
      params.set('maxRecords', String(max_records))
      if (fields && fields.length > 0) {
        fields.forEach((f) => params.append('fields[]', f))
      }

      const encodedTable = encodeURIComponent(table_name)
      const url = `https://api.airtable.com/v0/${base_id}/${encodedTable}?${params.toString()}`

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) {
        const errText = await res.text()
        return {
          success: false,
          output: null,
          error: `Airtable error ${res.status}: ${errText.slice(0, 400)}`,
        }
      }

      const data = (await res.json()) as any
      const records = (data.records ?? []).map((r: any) => ({ id: r.id, fields: r.fields }))

      return {
        success: true,
        output: {
          records,
          total: records.length,
        },
      }
    } catch (err: any) {
      this.logger.error(`airtable_query error: ${err.message}`)
      return { success: false, output: null, error: err.message }
    }
  }
}
