import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface ConversationTemplate {
  id: string
  userId: string | null // null = global
  name: string
  description: string
  category: string
  systemPrompt?: string
  starterMessages: string[]
  tools: string[]
  personality?: string
  tags: string[]
  isPublic: boolean
  useCount: number
  createdAt: string
}

const BUILT_IN_TEMPLATES: Omit<ConversationTemplate, 'id' | 'createdAt'>[] = [
  {
    userId: null,
    name: 'Research Assistant',
    description: 'Deep web research with multi-source verification',
    category: 'research',
    systemPrompt: 'You are a thorough research assistant. For every claim, use web_search to find 3+ sources. Cross-reference facts. Cite all sources.',
    starterMessages: ['Research the latest developments in...', 'Compare and contrast...', 'What are the top trends in...'],
    tools: ['web_search', 'web_fetch', 'deep_research', 'notes_create'],
    tags: ['research', 'analysis'],
    isPublic: true,
    useCount: 0,
  },
  {
    userId: null,
    name: 'Code Assistant',
    description: 'Full-stack coding with testing and deployment',
    category: 'development',
    systemPrompt: 'You are a senior full-stack developer. Write clean, tested, production-ready code. Always include error handling.',
    starterMessages: ['Build a...', 'Debug this code...', 'Write tests for...', 'Optimize this function...'],
    tools: ['code_execute', 'web_search', 'github_create_issue', 'shell_execute'],
    tags: ['coding', 'development'],
    isPublic: true,
    useCount: 0,
  },
  {
    userId: null,
    name: 'Content Creator',
    description: 'Blog posts, social media, marketing copy, and SEO',
    category: 'writing',
    systemPrompt: 'You are an expert content strategist. Create engaging, SEO-optimized content. Always research current trends first.',
    starterMessages: ['Write a blog post about...', 'Create social media posts for...', 'Draft a newsletter about...'],
    tools: ['web_search', 'image_generate', 'notes_create'],
    tags: ['content', 'marketing', 'writing'],
    isPublic: true,
    useCount: 0,
  },
  {
    userId: null,
    name: 'Business Analyst',
    description: 'Market analysis, competitor research, business strategy',
    category: 'business',
    systemPrompt: 'You are a business analyst. Use data-driven insights. Research competitors and market trends. Provide actionable recommendations.',
    starterMessages: ['Analyze the market for...', 'Create a business plan for...', 'Compare competitors in...'],
    tools: ['web_search', 'web_fetch', 'deep_research', 'notes_create'],
    tags: ['business', 'strategy', 'analytics'],
    isPublic: true,
    useCount: 0,
  },
  {
    userId: null,
    name: 'Learning Coach',
    description: 'Personalized learning paths with progress tracking',
    category: 'education',
    systemPrompt: 'You are a patient, encouraging learning coach. Break complex topics into small steps. Use examples, analogies, and quizzes. Track progress.',
    starterMessages: ['Teach me about...', 'Create a learning plan for...', 'Quiz me on...'],
    tools: ['web_search', 'memory_save_preference', 'notes_create'],
    tags: ['learning', 'education', 'tutoring'],
    isPublic: true,
    useCount: 0,
  },
  {
    userId: null,
    name: 'Project Manager',
    description: 'Task breakdown, timeline planning, and progress tracking',
    category: 'productivity',
    systemPrompt: 'You are an experienced project manager. Break projects into milestones and tasks. Set realistic timelines. Track blockers.',
    starterMessages: ['Plan a project for...', 'Break down this project...', 'Create a sprint plan for...'],
    tools: ['web_search', 'notes_create', 'calendar_create_event'],
    personality: 'professional',
    tags: ['project', 'planning', 'management'],
    isPublic: true,
    useCount: 0,
  },
]

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name)
  /** The built-in kits are code, not user data — they stay in memory. */
  private builtins = new Map<string, ConversationTemplate>()

  constructor(private prisma: PrismaService) {
    // Built-in templates are code, not data — they stay in memory and are
    // merged with the user's own persisted templates on every read.
    for (const template of BUILT_IN_TEMPLATES) {
      const id = `tmpl-${template.name.toLowerCase().replace(/\s+/g, '-')}`
      this.builtins.set(id, {
        ...template,
        id,
        createdAt: new Date().toISOString(),
      })
    }
  }

  private async loadUserTemplates(userId?: string): Promise<ConversationTemplate[]> {
    if (!userId) return []
    const rows = await this.prisma.conversationTemplate.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      name: row.name,
      description: row.description,
      category: row.category,
      systemPrompt: row.systemPrompt ?? undefined,
      starterMessages: (row.starterMessages as string[]) ?? [],
      tools: (row.tools as string[]) ?? [],
      personality: row.personality ?? undefined,
      tags: (row.tags as string[]) ?? [],
      isPublic: row.isPublic,
      useCount: row.useCount,
      createdAt: row.createdAt.toISOString(),
    }))
  }

  async list(userId?: string, category?: string): Promise<ConversationTemplate[]> {
    const userTemplates = await this.loadUserTemplates(userId)
    const all = [...this.builtins.values(), ...userTemplates]
    return all
      .filter((t) => t.isPublic || t.userId === userId)
      .filter((t) => !category || t.category === category)
      .sort((a, b) => b.useCount - a.useCount)
  }

  async get(templateId: string, userId?: string): Promise<ConversationTemplate | null> {
    const builtin = this.builtins.get(templateId)
    if (builtin) return builtin

    const row = await this.prisma.conversationTemplate.findUnique({ where: { id: templateId } })
    if (!row) return null
    if (!row.isPublic && row.userId !== userId) return null
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      description: row.description,
      category: row.category,
      systemPrompt: row.systemPrompt ?? undefined,
      starterMessages: (row.starterMessages as string[]) ?? [],
      tools: (row.tools as string[]) ?? [],
      personality: row.personality ?? undefined,
      tags: (row.tags as string[]) ?? [],
      isPublic: row.isPublic,
      useCount: row.useCount,
      createdAt: row.createdAt.toISOString(),
    }
  }

  async create(input: {
    userId: string
    name: string
    description: string
    category: string
    systemPrompt?: string
    starterMessages?: string[]
    tools?: string[]
    personality?: string
    tags?: string[]
    isPublic?: boolean
  }): Promise<ConversationTemplate> {
    const row = await this.prisma.conversationTemplate.create({
      data: {
        userId: input.userId,
        name: input.name,
        description: input.description,
        category: input.category,
        systemPrompt: input.systemPrompt ?? null,
        starterMessages: JSON.parse(JSON.stringify(input.starterMessages ?? [])),
        tools: JSON.parse(JSON.stringify(input.tools ?? [])),
        personality: input.personality ?? null,
        tags: JSON.parse(JSON.stringify(input.tags ?? [])),
        isPublic: input.isPublic ?? false,
      },
    })

    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      description: row.description,
      category: row.category,
      systemPrompt: row.systemPrompt ?? undefined,
      starterMessages: (row.starterMessages as string[]) ?? [],
      tools: (row.tools as string[]) ?? [],
      personality: row.personality ?? undefined,
      tags: (row.tags as string[]) ?? [],
      isPublic: row.isPublic,
      useCount: row.useCount,
      createdAt: row.createdAt.toISOString(),
    }
  }

  async recordUse(templateId: string): Promise<void> {
    const builtin = this.builtins.get(templateId)
    if (builtin) {
      builtin.useCount += 1
      return
    }
    await this.prisma.conversationTemplate
      .update({ where: { id: templateId }, data: { useCount: { increment: 1 } } })
      .catch(() => undefined)
  }

  async delete(templateId: string, userId: string): Promise<boolean> {
    if (this.builtins.has(templateId)) return false
    const row = await this.prisma.conversationTemplate.findFirst({ where: { id: templateId, userId } })
    if (!row) return false
    await this.prisma.conversationTemplate.delete({ where: { id: templateId } })
    return true
  }

  async getCategories(userId?: string): Promise<string[]> {
    const all = [...this.builtins.values(), ...(await this.loadUserTemplates(userId))]
    return [...new Set(all.map((t) => t.category))]
  }
}
