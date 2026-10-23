import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import { GenerativeUIService } from '../../generative-ui/generative-ui.service'

const REACT_GUIDE = `Write a single React component.

Rules:
- Export exactly one function component (e.g. "export default function Card() { ... }").
- Use Tailwind utility classes for styling — no CSS files, no imports beyond React.
- The component must render without props (it may read optional props with defaults).
- Keep it self-contained and under 150 lines.`

const HTML_GUIDE = `Write a single self-contained HTML document fragment.

Rules:
- Only inline <style> or Tailwind-style classes; no external scripts.
- It must render without any server-side data.`

@Injectable()
export class UiComponentTool {
  constructor(private generativeUi: GenerativeUIService) {}

  get def(): ToolDefinition {
    return {
      name: 'ui_component',
      displayName: 'UI Component',
      description:
        'Render an interactive UI component for the user. Use this when an answer would be clearer as a small card, chart, table, form or dashboard than as prose. The component is rendered in an isolated sandbox in the chat.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Short name for the component, e.g. "Revenue card".',
          },
          language: {
            type: 'string',
            enum: ['react', 'html'],
            description: 'Which dialect to emit. Default: react.',
          },
          code: {
            type: 'string',
            description: 'The component source code.',
          },
          props: {
            type: 'object',
            description: 'Optional initial props for the component.',
          },
        },
        required: ['code'],
      },
    }
  }

  async execute(
    input: { name?: string; language?: 'react' | 'html'; code: string; props?: Record<string, unknown> },
    userId: string,
  ): Promise<ToolResult> {
    const code = String(input?.code ?? '').trim()
    if (!code) {
      return { success: false, output: null, error: 'code is required.' }
    }

    const language = input.language === 'html' ? 'html' : 'react'

    try {
      const component = await this.generativeUi.createComponent({
        userId,
        name: input.name,
        code,
        language,
        props: input.props ?? {},
      })

      return {
        success: true,
        output: {
          id: component.id,
          name: component.name,
          language: component.language,
          code: component.code,
          props: component.props,
          guide: language === 'html' ? HTML_GUIDE : REACT_GUIDE,
        },
      }
    } catch (error: any) {
      return { success: false, output: null, error: error?.message ?? 'Failed to create the component.' }
    }
  }
}
