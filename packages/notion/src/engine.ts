export interface NotionConfig {
  apiKey: string
  databaseId?: string
}

export interface NotionPage {
  id: string
  title: string
  url: string
  createdTime: string
  lastEditedTime: string
  properties: Record<string, unknown>
}

export interface NotionBlock {
  id: string
  type: string
  content: string
  hasChildren: boolean
}

export interface NotionDatabase {
  id: string
  title: string
  url: string
  properties: string[]
}

export class NotionClient {
  private apiKey: string
  private baseUrl = 'https://api.notion.com/v1'

  constructor(config: NotionConfig) {
    this.apiKey = config.apiKey
  }

  async getPage(pageId: string): Promise<{ success: boolean; page?: NotionPage; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/pages/${pageId}`, {
        headers: this.getHeaders(),
      })

      if (!response.ok) {
        const error = await response.text()
        return { success: false, error }
      }

      const data = await response.json() as {
        id: string
        url: string
        created_time: string
        last_edited_time: string
        properties: Record<string, unknown>
      }

      const title = this.extractTitle(data.properties)

      return {
        success: true,
        page: {
          id: data.id,
          title,
          url: data.url,
          createdTime: data.created_time,
          lastEditedTime: data.last_edited_time,
          properties: data.properties,
        },
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to get page',
      }
    }
  }

  async getBlocks(blockId: string): Promise<{ success: boolean; blocks?: NotionBlock[]; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/blocks/${blockId}/children`, {
        headers: this.getHeaders(),
      })

      if (!response.ok) {
        const error = await response.text()
        return { success: false, error }
      }

      const data = await response.json() as {
        results: Array<{ id: string; type: string; [key: string]: unknown }>
      }

      const blocks: NotionBlock[] = data.results.map((block) => ({
        id: block.id,
        type: block.type,
        content: this.extractBlockContent(block),
        hasChildren: false,
      }))

      return { success: true, blocks }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to get blocks',
      }
    }
  }

  async createPage(input: {
    databaseId?: string
    title: string
    content?: string
    properties?: Record<string, unknown>
  }): Promise<{ success: boolean; page?: NotionPage; error?: string }> {
    try {
      const parent = input.databaseId
        ? { database_id: input.databaseId }
        : { page_id: process.env.NOTION_PARENT_PAGE_ID }

      const response = await fetch(`${this.baseUrl}/pages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          parent,
          properties: {
            Name: {
              title: [{ text: { content: input.title } }],
            },
            ...input.properties,
          },
          children: input.content
            ? [
                {
                  object: 'block',
                  type: 'paragraph',
                  paragraph: {
                    rich_text: [{ text: { content: input.content } }],
                  },
                },
              ]
            : undefined,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        return { success: false, error }
      }

      const data = await response.json() as {
        id: string
        url: string
        created_time: string
        last_edited_time: string
      }

      return {
        success: true,
        page: {
          id: data.id,
          title: input.title,
          url: data.url,
          createdTime: data.created_time,
          lastEditedTime: data.last_edited_time,
          properties: {},
        },
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create page',
      }
    }
  }

  async queryDatabase(input: {
    databaseId: string
    filter?: Record<string, unknown>
    sorts?: Array<{ property: string; direction: 'ascending' | 'descending' }>
  }): Promise<{ success: boolean; pages?: NotionPage[]; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/databases/${input.databaseId}/query`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          filter: input.filter,
          sorts: input.sorts,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        return { success: false, error }
      }

      const data = await response.json() as {
        results: Array<{
          id: string
          url: string
          created_time: string
          last_edited_time: string
          properties: Record<string, unknown>
        }>
      }

      const pages: NotionPage[] = data.results.map((page) => ({
        id: page.id,
        title: this.extractTitle(page.properties),
        url: page.url,
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time,
        properties: page.properties,
      }))

      return { success: true, pages }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to query database',
      }
    }
  }

  async appendBlocks(input: {
    blockId: string
    blocks: Array<{ type: string; content: string }>
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/blocks/${input.blockId}/children`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({
          children: input.blocks.map((block) => ({
            object: 'block',
            type: block.type,
            [block.type]: { rich_text: [{ text: { content: block.content } }] },
          })),
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        return { success: false, error }
      }

      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to append blocks',
      }
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    }
  }

  private extractTitle(properties: Record<string, unknown>): string {
    const titleProp = properties.Name || properties.Title
    if (!titleProp) return 'Untitled'

    const prop = titleProp as { title?: Array<{ plain_text: string } }
    return prop.title?.[0]?.plain_text || 'Untitled'
  }

  private extractBlockContent(block: { [key: string]: unknown }): string {
    const type = block.type as string
    const contentObj = block[type] as { rich_text?: Array<{ plain_text: string }> }
    return contentObj.rich_text?.[0]?.plain_text || ''
  }
}

export function createNotionClient(config: NotionConfig): NotionClient {
  return new NotionClient(config)
}