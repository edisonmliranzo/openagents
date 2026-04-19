import { Injectable, Logger } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

export type HubSpotObjectType = 'contacts' | 'companies' | 'deals'

@Injectable()
export class HubSpotTool {
  private readonly logger = new Logger(HubSpotTool.name)

  get def(): ToolDefinition {
    return {
      name: 'hubspot_search',
      displayName: 'HubSpot CRM',
      description:
        'Search HubSpot CRM for contacts, companies, or deals. Requires HUBSPOT_ACCESS_TOKEN in environment.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          object_type: {
            type: 'string',
            enum: ['contacts', 'companies', 'deals'],
            description: 'The type of HubSpot object to search. Defaults to "contacts".',
          },
          query: {
            type: 'string',
            description: 'The search query string.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return. Defaults to 10.',
          },
        },
        required: ['query'],
      },
    }
  }

  async search(
    input: {
      object_type?: HubSpotObjectType
      query: string
      limit?: number
    },
    _userId: string,
  ): Promise<ToolResult> {
    const { object_type = 'contacts', query, limit = 10 } = input

    if (!query) return { success: false, output: null, error: 'query is required.' }

    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN
    if (!accessToken) {
      return { success: false, output: null, error: 'HUBSPOT_ACCESS_TOKEN is not configured.' }
    }

    this.logger.log(`hubspot_search: type=${object_type} query=${query}`)

    try {
      const url = `https://api.hubapi.com/crm/v3/objects/${object_type}/search`

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          query,
          limit,
          properties: ['firstname', 'lastname', 'email', 'company', 'name', 'dealname', 'amount'],
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        return {
          success: false,
          output: null,
          error: `HubSpot error ${res.status}: ${errText.slice(0, 400)}`,
        }
      }

      const data = (await res.json()) as any
      const results = (data.results ?? []).map((r: any) => ({ id: r.id, properties: r.properties }))

      return {
        success: true,
        output: {
          results,
          total: data.total ?? results.length,
        },
      }
    } catch (err: any) {
      this.logger.error(`hubspot_search error: ${err.message}`)
      return { success: false, output: null, error: err.message }
    }
  }
}
