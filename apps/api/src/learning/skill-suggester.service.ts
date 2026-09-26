import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const MIN_FREQUENCY = 4
const MIN_CONFIDENCE = 0.5
const SUGGESTION_TYPES = ['behavior', 'skill', 'context']

@Injectable()
export class SkillSuggesterService {
  private readonly logger = new Logger(SkillSuggesterService.name)

  constructor(private readonly prisma: PrismaService) {}

  /** Turn high-frequency learned patterns into pending skill suggestions. */
  async generateSuggestions(userId: string) {
    const patterns = await this.prisma.learnedPattern.findMany({
      where: {
        userId,
        frequency: { gte: MIN_FREQUENCY },
        confidence: { gte: MIN_CONFIDENCE },
        type: { in: SUGGESTION_TYPES },
      },
      orderBy: [{ frequency: 'desc' }, { confidence: 'desc' }],
      take: 10,
    })

    const existing = await this.prisma.skillSuggestion.findMany({
      where: { userId },
      select: { sourcePattern: true },
    })
    const seen = new Set(existing.map((row) => row.sourcePattern))

    const created = []
    for (const pattern of patterns) {
      if (!pattern.pattern || seen.has(pattern.pattern)) continue
      const examples = this.parseExamples(pattern.examples)
      const suggestion = await this.prisma.skillSuggestion.create({
        data: {
          userId,
          name: this.titleCase(pattern.pattern).slice(0, 100),
          description: `Your agent noticed this repeated ${pattern.frequency}x (confidence ${(pattern.confidence * 100).toFixed(0)}%). Approve to save it as a reusable skill.`,
          steps: JSON.stringify(examples.slice(0, 5)),
          tags: JSON.stringify([pattern.type, 'auto-suggested']),
          sourcePattern: pattern.pattern,
          status: 'pending',
        },
      })
      created.push(suggestion)
    }
    if (created.length > 0) {
      this.logger.log(`Generated ${created.length} skill suggestion(s) for user ${userId}.`)
    }
    return created
  }

  async listSuggestions(userId: string, status = 'pending') {
    const rows = await this.prisma.skillSuggestion.findMany({
      where: { userId, status },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    if (status === 'pending' && rows.length === 0) {
      const fresh = await this.generateSuggestions(userId)
      if (fresh.length > 0) return fresh
    }
    return rows
  }

  /** Approve a suggestion: materialize it as a reusable UserSkill. */
  async approve(userId: string, id: string) {
    const suggestion = await this.prisma.skillSuggestion.findFirst({ where: { id, userId } })
    if (!suggestion) throw new BadRequestException('Suggestion not found.')
    const skill = await this.prisma.userSkill.create({
      data: {
        userId,
        name: suggestion.name,
        description: suggestion.description,
        steps: suggestion.steps,
        tags: suggestion.tags,
      },
    })
    await this.prisma.skillSuggestion.update({ where: { id: suggestion.id }, data: { status: 'approved' } })
    return skill
  }

  async dismiss(userId: string, id: string) {
    const suggestion = await this.prisma.skillSuggestion.findFirst({ where: { id, userId } })
    if (!suggestion) throw new BadRequestException('Suggestion not found.')
    return this.prisma.skillSuggestion.update({ where: { id: suggestion.id }, data: { status: 'dismissed' } })
  }

  private parseExamples(raw: string | null | undefined): string[] {
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
    } catch {
      return []
    }
  }

  private titleCase(value: string): string {
    const cleaned = value.replace(/[_-]+/g, ' ').trim()
    if (!cleaned) return 'New skill'
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }
}
