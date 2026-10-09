import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { AutodocService } from './autodoc.service'
import { clamp } from './frontier.util'

const DEFAULT_PERSONAS = [
  { name: 'Researcher', personaPrompt: 'You chase evidence, sources, and numbers. You distrust gut feeling.' },
  { name: 'Builder', personaPrompt: 'You think in systems, feasibility, and concrete steps. You hate hand-waving.' },
  { name: 'Skeptic', personaPrompt: 'You hunt for failure modes, hidden costs, and what could go wrong. You are not negative — you are careful.' },
]

@Injectable()
export class RoundtableService {
  private readonly logger = new Logger(RoundtableService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly autodoc: AutodocService,
  ) {}

  async convene(userId: string, topic: string): Promise<{ minutes: string; artifactId: string | null; speakers: string[] }> {
    const specialists = await this.prisma.specialistAgent.findMany({ where: { userId, enabled: true }, take: 3 })
    const seats = specialists.length
      ? specialists.map((s) => ({ name: s.name, persona: s.personaPrompt || s.role }))
      : DEFAULT_PERSONAS.map((p) => ({ name: p.name, persona: p.personaPrompt }))

    const speak = async (seat: { name: string; persona: string }, prompt: string) => {
      const res = await this.llm.complete(
        [{ role: 'user', content: prompt }],
        [],
        `${seat.persona}\n\nYou are one voice at a roundtable. Stay in character. <=120 words.`,
        'ollama',
      )
      return { name: seat.name, text: res.content.trim() }
    }

    const round1 = await Promise.all(seats.map((s) => speak(s, `Topic: ${topic}\n\nGive your opening take.`)))
    const digest1 = round1.map((r) => `${r.name}: ${clamp(r.text, 400)}`).join('\n\n')
    const round2 = await Promise.all(
      seats.map((s) => speak(s, `Topic: ${topic}\n\nOpening takes:\n${digest1}\n\nWhere you agree, where you push back, and the one thing that changes your mind.`)),
    )

    const transcript = [...round1, ...round2].map((r) => `${r.name}: ${r.text}`).join('\n\n')
    const judged = await this.llm.complete(
      [{ role: 'user', content: `Topic: ${topic}\n\nRoundtable transcript:\n${clamp(transcript, 3500)}\n\nWrite the minutes (markdown): ## Consensus, ## Disagreements, ## Action items.` }],
      [],
      'You moderate a multi-persona roundtable and write crisp minutes that capture decisions and real disagreements.',
      'ollama',
    )
    const minutes = judged.content.trim() || transcript

    let artifactId: string | null = null
    try {
      const artifact = await this.prisma.artifact.create({
        data: {
          userId,
          title: `Roundtable: ${clamp(topic, 60)}`,
          type: 'report',
          status: 'done',
          summary: clamp(minutes, 480),
          labels: JSON.stringify(['roundtable']),
        },
      })
      artifactId = artifact.id
    } catch (err: any) {
      this.logger.debug(`Roundtable artifact skipped: ${err?.message ?? err}`)
    }

    await this.autodoc
      .record(userId, {
        task: `Roundtable on "${clamp(topic, 60)}"`,
        steps: [...round1.map((r) => `Opening — ${r.name}: ${clamp(r.text, 160)}`), ...round2.map((r) => `Rebuttal — ${r.name}: ${clamp(r.text, 160)}`)],
        result: minutes,
        source: 'roundtable',
      })
      .catch(() => undefined)

    return { minutes, artifactId, speakers: seats.map((s) => s.name) }
  }
}
