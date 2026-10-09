import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { UsersService } from '../users/users.service'
import { clamp } from './frontier.util'

export interface DebateResult {
  question: string
  transcript: Array<{ seat: 'A' | 'B'; text: string }>
  verdict: { winner: 'A' | 'B' | 'tie'; merged: string; confidence: number }
  models: { a: string; b: string; judge: string }
}

@Injectable()
export class DebateService {
  private readonly logger = new Logger(DebateService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly users: UsersService,
  ) {}

  async debate(userId: string, question: string): Promise<DebateResult> {
    const settings = await this.users.getSettings(userId)
    const preferredProvider = String(settings.preferredProvider ?? 'ollama').trim().toLowerCase()
    const cloud = preferredProvider !== 'ollama'
    const seatA = cloud ? { provider: preferredProvider as any, model: settings.preferredModel ?? undefined } : { provider: 'ollama' as any, model: undefined }
    const seatB = cloud ? { provider: 'ollama' as any, model: undefined } : { provider: 'ollama' as any, model: 'hf.co/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF:Q4_K_M' }

    const ask = async (seat: 'A' | 'B', extra: string) => {
      const res = await this.llm.complete(
        [{ role: 'user', content: `${question}\n${extra}\n\nAnswer directly and honestly. If uncertain, say what could be wrong.` }],
        [],
        `You are debater ${seat} in a structured two-model debate. Give your best answer in <=200 words.`,
        seat === 'A' ? seatA.provider : seatB.provider,
        undefined,
        undefined,
        seat === 'A' ? seatA.model : seatB.model,
      )
      return res.content.trim()
    }

    const [a1, b1] = await Promise.all([ask('A', ''), ask('B', '')])
    const judgeRes = await this.llm.complete(
      [
        {
          role: 'user',
          content: `Question: ${question}\n\nAnswer A: ${clamp(a1, 1200)}\n\nAnswer B: ${clamp(b1, 1200)}\n\nReply JSON only: {"winner":"A"|"B"|"tie","confidence":0-100,"merged":"best combined answer <=200 words"}`,
        },
      ],
      [],
      'You adjudicate between two AI answers. Prefer factual accuracy, concreteness, and honesty about uncertainty. Merge the good parts of both into one answer.',
      'ollama',
    )

    let verdict = { winner: 'tie' as const, merged: a1, confidence: 50 }
    try {
      const match = judgeRes.content.match(/\{[\s\S]*\}/)
      const parsed = match ? JSON.parse(match[0]) : null
      if (parsed && typeof parsed.merged === 'string') {
        verdict = {
          winner: parsed.winner === 'A' || parsed.winner === 'B' ? parsed.winner : 'tie',
          merged: String(parsed.merged).trim(),
          confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 50)),
        }
      }
    } catch (err: any) {
      this.logger.debug(`Debate verdict parse failed: ${err?.message ?? err}`)
    }

    return {
      question,
      transcript: [
        { seat: 'A', text: a1 },
        { seat: 'B', text: b1 },
      ],
      verdict,
      models: {
        a: seatA.model ?? seatA.provider,
        b: seatB.model ?? seatB.provider,
        judge: 'phi4-mini',
      },
    }
  }
}
