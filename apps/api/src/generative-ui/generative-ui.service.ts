import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface GenerativeComponent {
  id: string
  userId: string
  conversationId: string | null
  name: string
  code: string
  language: 'react' | 'html'
  props: Record<string, unknown>
  state: 'generating' | 'ready' | 'error'
  createdAt: string
  updatedAt: string
}

const MAX_CODE_CHARS = 200_000

@Injectable()
export class GenerativeUIService {
  private readonly logger = new Logger(GenerativeUIService.name)

  constructor(private prisma: PrismaService) {}

  async createComponent(input: {
    userId: string
    conversationId?: string | null
    name?: string
    code: string
    language?: 'react' | 'html'
    props?: Record<string, unknown>
  }): Promise<GenerativeComponent> {
    const code = String(input.code ?? '').trim()
    if (!code) throw new BadRequestException('code is required.')
    if (code.length > MAX_CODE_CHARS) {
      throw new BadRequestException(`code must be smaller than ${MAX_CODE_CHARS} characters.`)
    }

    const language = input.language === 'html' ? 'html' : 'react'
    const component = await this.prisma.generativeComponent.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId ?? null,
        name: (input.name ?? 'Generated component').slice(0, 120),
        code,
        language,
        props: JSON.parse(JSON.stringify(input.props ?? {})),
        state: 'ready',
      },
    })

    this.logger.log(`Created generative component ${component.id} for user ${input.userId}`)
    return this.toComponent(component)
  }

  async listForConversation(userId: string, conversationId: string): Promise<GenerativeComponent[]> {
    const components = await this.prisma.generativeComponent.findMany({
      where: { userId, conversationId },
      orderBy: { createdAt: 'asc' },
    })
    return components.map((c) => this.toComponent(c))
  }

  async listForUser(userId: string, limit = 50): Promise<GenerativeComponent[]> {
    const components = await this.prisma.generativeComponent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 200)),
    })
    return components.map((c) => this.toComponent(c))
  }

  async getComponent(userId: string, id: string): Promise<GenerativeComponent | null> {
    const component = await this.prisma.generativeComponent.findUnique({ where: { id } })
    if (!component) return null
    if (component.userId !== userId) throw new ForbiddenException('You do not own this component.')
    return this.toComponent(component)
  }

  async updateComponentProps(
    userId: string,
    id: string,
    props: Record<string, unknown>,
  ): Promise<GenerativeComponent | null> {
    const component = await this.prisma.generativeComponent.findUnique({ where: { id } })
    if (!component) return null
    if (component.userId !== userId) throw new ForbiddenException('You do not own this component.')

    const merged = { ...(component.props as Record<string, unknown>), ...(props ?? {}) }
    const updated = await this.prisma.generativeComponent.update({
      where: { id },
      data: { props: JSON.parse(JSON.stringify(merged)) },
    })
    return this.toComponent(updated)
  }

  async deleteComponent(userId: string, id: string): Promise<boolean> {
    const component = await this.prisma.generativeComponent.findUnique({ where: { id } })
    if (!component) return false
    if (component.userId !== userId) throw new ForbiddenException('You do not own this component.')
    await this.prisma.generativeComponent.delete({ where: { id } })
    return true
  }

  private toComponent(component: {
    id: string
    userId: string
    conversationId: string | null
    name: string
    code: string
    language: string
    props: unknown
    state: string
    createdAt: Date
    updatedAt: Date
  }): GenerativeComponent {
    return {
      id: component.id,
      userId: component.userId,
      conversationId: component.conversationId,
      name: component.name,
      code: component.code,
      language: component.language === 'html' ? 'html' : 'react',
      props: (component.props as Record<string, unknown>) ?? {},
      state: (component.state as GenerativeComponent['state']) ?? 'ready',
      createdAt: component.createdAt.toISOString(),
      updatedAt: component.updatedAt.toISOString(),
    }
  }
}
