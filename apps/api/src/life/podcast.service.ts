import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'

@Injectable()
export class PodcastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
  ) {}

  /**
   * Build a speakable daily briefing: finished tasks, pending questions,
   * mission reports and watch alerts. Returned as plain text for TTS.
   */
  async script(userId: string, scope: 'today' | 'yesterday' = 'today'): Promise<{ script: string; sections: Record<string, number> }> {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    if (scope === 'yesterday') start.setDate(start.getDate() - 1)
    const end = new Date(start.getTime() + 24 * 3600_000)

    const [finished, failed, questions, missionEvents, inbox] = await Promise.all([
      this.prisma.agentTask.findMany({
        where: { userId, status: 'done', finishedAt: { gte: start, lt: end } },
        orderBy: { finishedAt: 'asc' },
        take: 8,
        select: { title: true, result: true },
      }),
      this.prisma.agentTask.findMany({
        where: { userId, status: 'failed', finishedAt: { gte: start, lt: end } },
        take: 5,
        select: { title: true, error: true },
      }),
      this.prisma.agentQuestion.findMany({
        where: { userId, status: 'open' },
        orderBy: { createdAt: 'asc' },
        take: 5,
        select: { question: true },
      }),
      this.prisma.missionEvent.findMany({
        where: { mission: { userId }, kind: { in: ['run_finished', 'error', 'report'] }, createdAt: { gte: start, lt: end } },
        orderBy: { createdAt: 'asc' },
        take: 10,
        select: { kind: true, message: true, mission: { select: { title: true } } },
      }),
      this.prisma.inboxDigest.findFirst({
        where: { userId, triagedAt: { gte: start, lt: end } },
        select: { summary: true },
      }),
    ])

    const facts = {
      finished: finished.map((t) => `${t.title}: ${(t.result ?? '').slice(0, 200)}`),
      failed: failed.map((t) => `${t.title}: ${(t.error ?? '').slice(0, 150)}`),
      openQuestions: questions.map((q) => q.question),
      missions: missionEvents.map((e) => `${e.mission.title}: ${e.message}`),
      inbox: inbox?.summary ?? null,
    }
    const sections = {
      finished: facts.finished.length,
      failed: facts.failed.length,
      openQuestions: facts.openQuestions.length,
      missions: facts.missions.length,
    }

    const empty = Object.values(sections).every((n) => n === 0) && !facts.inbox
    if (empty) {
      return {
        script: `Your ${scope === 'today' ? 'day so far' : 'yesterday'} was quiet. Nothing finished, no pending questions, and no mission activity. Enjoy the calm.`,
        sections,
      }
    }

    const res = await this.llm.complete(
      [
        {
          role: 'user',
          content: `Write a spoken briefing for the user about their personal AI agent's ${scope === 'today' ? 'day so far' : 'yesterday'}. Facts:\n${JSON.stringify(facts, null, 1)}\n\nRules: 90-140 words, warm and energetic like a morning show host, no greetings beyond one short opener, mention counts naturally, end by prompting them to check pending questions if any exist. Plain sentences only — no markdown, no lists, no emoji.`,
        },
      ],
      [],
      'You write concise spoken briefings. Output only the script text.',
      'ollama',
    )
    return { script: res.content.trim().slice(0, 2000), sections }
  }
}
