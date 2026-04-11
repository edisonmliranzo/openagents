import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import { MemoryService } from '../../memory/memory.service'
import type { ToolDefinition } from '../tools.service'

/**
 * Memory & Personalization tools — all hidden from the UI.
 *
 * The agent uses these automatically to:
 *  - Remember contacts mentioned in conversation
 *  - Persist user preferences
 *  - Save session summaries
 *  - Search past memories
 *  - Update the user profile file (USER.md)
 */
@Injectable()
export class MemoryPersonalTool {
  constructor(private memory: MemoryService) {}

  // ── Save contact ───────────────────────────────────────────────────────────

  get saveContactDef(): ToolDefinition {
    return {
      name: 'memory_save_contact',
      displayName: 'Remember Contact',
      description: 'Save a person\'s name and context to long-term memory so the agent can reference them in future conversations.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          name:     { type: 'string', description: 'Full name of the person' },
          context:  { type: 'string', description: 'How this person relates to the user (e.g. "colleague at Acme", "sister", "client")' },
          details:  { type: 'string', description: 'Any extra details: email, role, notes, last interaction' },
        },
        required: ['name', 'context'],
      },
    }
  }

  async saveContact(input: { name: string; context: string; details?: string }, userId: string): Promise<ToolResult> {
    const content = [
      `Contact: ${input.name}`,
      `Relationship: ${input.context}`,
      input.details ? `Details: ${input.details}` : null,
    ].filter(Boolean).join(' | ')

    try {
      await this.memory.upsertFact(userId, {
        entity: `contact:${input.name.toLowerCase().replace(/\s+/g, '_')}`,
        key: 'profile',
        value: content,
        confidence: 0.9,
      })
      return { success: true, output: { saved: content } }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Failed to save contact.' }
    }
  }

  // ── Save preference ────────────────────────────────────────────────────────

  get savePreferenceDef(): ToolDefinition {
    return {
      name: 'memory_save_preference',
      displayName: 'Remember Preference',
      description: 'Save a user preference, habit, or personal fact to long-term memory. Use this whenever the user expresses a preference, shares personal info, or gives instructions that should persist.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Category: communication, work, personal, technical, dietary, etc.' },
          preference: { type: 'string', description: 'The preference or fact to remember (e.g. "prefers bullet lists over paragraphs")' },
        },
        required: ['category', 'preference'],
      },
    }
  }

  async savePreference(input: { category: string; preference: string }, userId: string): Promise<ToolResult> {
    try {
      await this.memory.upsert(userId, 'preference', `[${input.category}] ${input.preference}`, ['preference', input.category])
      await this.memory.upsertFact(userId, {
        entity: `preference:${input.category}`,
        key: input.preference.slice(0, 60),
        value: input.preference,
        confidence: 0.85,
      })
      return { success: true, output: { saved: `[${input.category}] ${input.preference}` } }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Failed to save preference.' }
    }
  }

  // ── Save session summary ───────────────────────────────────────────────────

  get saveSessionSummaryDef(): ToolDefinition {
    return {
      name: 'memory_save_session',
      displayName: 'Save Session Summary',
      description: 'Save a summary of what was accomplished in this conversation. Call this at the end of significant work sessions so the agent can reference it later.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          summary:     { type: 'string', description: 'What was discussed or accomplished (2-4 sentences)' },
          decisions:   { type: 'string', description: 'Key decisions made, if any' },
          next_steps:  { type: 'string', description: 'Follow-up actions or open items, if any' },
          tags:        { type: 'array', items: { type: 'string' }, description: 'Topic tags for future retrieval' },
        },
        required: ['summary'],
      },
    }
  }

  async saveSessionSummary(
    input: { summary: string; decisions?: string; next_steps?: string; tags?: string[] },
    userId: string,
  ): Promise<ToolResult> {
    const parts = [input.summary]
    if (input.decisions?.trim()) parts.push(`Decisions: ${input.decisions}`)
    if (input.next_steps?.trim()) parts.push(`Next steps: ${input.next_steps}`)
    const content = parts.join(' | ')
    const tags = ['session-summary', ...(input.tags ?? [])]

    try {
      await this.memory.writeEvent(userId, {
        kind: 'conversation',
        summary: content,
        tags,
        confidence: 0.9,
      })
      return { success: true, output: { saved: content } }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Failed to save session summary.' }
    }
  }

  // ── Search memories ────────────────────────────────────────────────────────

  get searchDef(): ToolDefinition {
    return {
      name: 'memory_search',
      displayName: 'Search Memory',
      description: 'Search the user\'s long-term memory for facts, contacts, preferences, or past sessions matching a query.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          query:          { type: 'string', description: 'What to look for (person name, topic, preference, etc.)' },
          min_confidence: { type: 'number', description: 'Minimum confidence threshold 0-1 (default 0.4)' },
        },
        required: ['query'],
      },
    }
  }

  async search(input: { query: string; min_confidence?: number }, userId: string): Promise<ToolResult> {
    try {
      const result = await this.memory.queryTiered(userId, {
        query: input.query,
        minConfidence: input.min_confidence ?? 0.4,
      })
      return { success: true, output: result }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Memory search failed.' }
    }
  }

  // ── Get user profile ───────────────────────────────────────────────────────

  get getProfileDef(): ToolDefinition {
    return {
      name: 'memory_get_profile',
      displayName: 'Get User Profile',
      description: 'Read the current USER.md profile file — name, preferences, role, model settings, and any facts the agent has saved about the user.',
      requiresApproval: false,
      hidden: true,
      inputSchema: { type: 'object', properties: {} },
    }
  }

  async getProfile(_input: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const content = await this.memory.readFile(userId, 'USER.md')
      return { success: true, output: { content } }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Could not read USER.md.' }
    }
  }

  // ── Update user profile ────────────────────────────────────────────────────

  get updateProfileDef(): ToolDefinition {
    return {
      name: 'memory_update_profile',
      displayName: 'Update User Profile',
      description: 'Append a new fact or section to the USER.md profile. Use this to persist important user information discovered during conversation.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          key:   { type: 'string', description: 'Profile field name (e.g. "timezone", "preferred_language", "job_title")' },
          value: { type: 'string', description: 'Value to set' },
        },
        required: ['key', 'value'],
      },
    }
  }

  async updateProfile(input: { key: string; value: string }, userId: string): Promise<ToolResult> {
    try {
      await this.memory.upsertFact(userId, {
        entity: 'user_profile',
        key: input.key,
        value: input.value,
        confidence: 0.95,
      })
      await this.memory.syncFiles(userId)
      return { success: true, output: { updated: `${input.key} = ${input.value}` } }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Failed to update profile.' }
    }
  }
}
