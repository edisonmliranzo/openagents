import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { UsersService } from '../users/users.service'
import type { LLMProvider } from '@openagents/shared'
import { clamp } from './frontier.util'
import { scoreConsensus } from '../war-rooms/consensus'
import {
  DEFAULT_DEBATE_TERMINATION,
  estimateTokens,
  evaluateTermination,
  type TerminationCondition,
  type TerminationState,
} from '../war-rooms/termination'

export interface DebateSeat {
  seat: string
  provider: string
  model?: string
}

export interface MultiDebateResult {
  question: string
  seats: DebateSeat[]
  answers: Array<{ seat: string; text: string; error?: string }>
  critiques: Array<{ seat: string; text: string; error?: string }>
  verdict: { winner: string; confidence: number; synthesis: string; rationale: string }
  judge: DebateSeat
  durationMs: number
  /** Set when a termination condition fired before the critique round. */
  stoppedEarly?: string
}

const SEAT_NAMES = ['A', 'B', 'C']

/**
 * Multi-model debate: 2-3 providers the user has keys for answer independently,
 * critique each other in one round, then a judge synthesizes a final answer.
 */
@Injectable()
export class MultiDebateService {
  private readonly logger = new Logger(MultiDebateService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly users: UsersService,
  ) {}

  /** Providers usable for debate (active keys; ollama always considered available if configured). */
  async availableProviders(userId: string): Promise<string[]> {
    const rows = await this.prisma.llmApiKey.findMany({
      where: { userId, isActive: true },
      select: { provider: true, apiKey: true, loginPassword: true },
    })
    return rows.filter((r) => r.provider === 'ollama' || r.apiKey || r.loginPassword).map((r) => r.provider)
  }

  private async resolveSeats(userId: string, models?: string[]): Promise<DebateSeat[]> {
    const available = await this.availableProviders(userId)
    const settings = await this.users.getSettings(userId).catch(() => null as any)
    let picks: Array<{ provider: string; model?: string }> = []
    if (Array.isArray(models) && models.length) {
      for (const raw of models.slice(0, 3)) {
        const [provider, ...rest] = String(raw).split(':')
        const p = provider.trim().toLowerCase()
        if (!available.includes(p)) throw new BadRequestException(`No active API key for provider "${p}"`)
        picks.push({ provider: p, model: rest.join(':').trim() || undefined })
      }
    } else {
      const preferred = String(settings?.preferredProvider ?? '').toLowerCase()
      const ordered = [...available].sort((a, b) => (a === preferred ? -1 : b === preferred ? 1 : 0))
      picks = ordered.slice(0, 3).map((p) => ({
        provider: p,
        model: p === preferred ? settings?.preferredModel ?? undefined : undefined,
      }))
    }
    if (picks.length < 2) {
      throw new BadRequestException('Debate needs at least 2 providers with active API keys (add keys in Settings).')
    }
    return picks.map((p, i) => ({ seat: SEAT_NAMES[i], ...p }))
  }

  private async ask(userId: string, seat: DebateSeat, system: string, prompt: string): Promise<string> {
    const key = seat.provider === 'ollama' ? null : await this.users.getRawLlmKey(userId, seat.provider).catch(() => null)
    const res = await this.llm.complete(
      [{ role: 'user', content: prompt }],
      [],
      system,
      seat.provider as LLMProvider,
      key?.apiKey ?? key?.loginPassword ?? undefined,
      key?.baseUrl ?? undefined,
      seat.model,
    )
    return String(res.content ?? '').trim()
  }

  async run(
    userId: string,
    question: string,
    models?: string[],
    options: { termination?: TerminationCondition } = {},
  ): Promise<MultiDebateResult> {
    const started = Date.now()
    const termination = options.termination ?? DEFAULT_DEBATE_TERMINATION
    const q = clamp(question.trim(), 4000)
    if (!q) throw new BadRequestException('question required')
    const seats = await this.resolveSeats(userId, models)

    // Round 1: independent answers.
    const answers = await Promise.all(
      seats.map(async (s) => {
        try {
          const text = await this.ask(
            userId,
            s,
            `You are debater ${s.seat} in a structured multi-model debate. Answer independently in <=250 words. Be concrete and state uncertainty.`,
            q,
          )
          return { seat: s.seat, text }
        } catch (e: any) {
          return { seat: s.seat, text: '', error: String(e?.message ?? e).slice(0, 200) }
        }
      }),
    )
    const valid = answers.filter((a) => a.text)
    if (valid.length < 1) throw new BadRequestException('All debaters failed to answer.')

    // Termination check (AutoGen-style): when the seats already agree, the
    // critique round is pure cost — skip it and go straight to the judge.
    const termState: TerminationState = {
      round: 1,
      messageCount: valid.length,
      tokensUsed: estimateTokens(valid.map((a) => a.text)),
      elapsedMs: Date.now() - started,
      contributions: valid.map((a) => ({ name: a.seat, text: a.text })),
    }
    const verdict1 = evaluateTermination(termination, termState, { scoreConsensus })
    const stoppedEarly = verdict1.stop ? (verdict1.reason ?? 'Termination condition met.') : null
    if (stoppedEarly) {
      this.logger.log(`Debate stopped early: ${stoppedEarly}`)
    }

    let critiques: Array<{ seat: string; text: string; error?: string }> = []
    if (!verdict1.stop) {
      // Round 2: each seat critiques the others.
      critiques = await Promise.all(
        seats.map(async (s) => {
          const own = answers.find((a) => a.seat === s.seat)
          const others = valid.filter((a) => a.seat !== s.seat)
          if (!own?.text || !others.length) return { seat: s.seat, text: '', error: 'skipped' }
          try {
            const text = await this.ask(
              userId,
              s,
              `You are debater ${s.seat}. Critique the other answers: point out factual errors, gaps, and strengths. Then say if you revise your own position. <=200 words.`,
              `Question: ${q}\n\nYour answer:\n${clamp(own.text, 1500)}\n\n${others
                .map((o) => `Answer ${o.seat}:\n${clamp(o.text, 1500)}`)
                .join('\n\n')}`,
            )
            return { seat: s.seat, text }
          } catch (e: any) {
            return { seat: s.seat, text: '', error: String(e?.message ?? e).slice(0, 200) }
          }
        }),
      )
    }

    // Judge: the first seat (user's preferred provider) synthesizes.
    const judge = seats[0]
    let verdict: MultiDebateResult['verdict'] = {
      winner: 'tie',
      confidence: 50,
      synthesis: valid[0].text,
      rationale: 'Judge unavailable; showing first answer.',
    }
    try {
      const judgeText = await this.ask(
        userId,
        judge,
        'You are an impartial judge. Weigh factual accuracy, reasoning, and honesty about uncertainty. Ignore which seat you were.',
        `Question: ${q}\n\n${valid.map((a) => `Answer ${a.seat}:\n${clamp(a.text, 1500)}`).join('\n\n')}\n\n${critiques
          .filter((c) => c.text)
          .map((c) => `Critique by ${c.seat}:\n${clamp(c.text, 1000)}`)
          .join('\n\n')}${stoppedEarly ? `\n\n(The debate stopped after the opening round: ${stoppedEarly})` : ''}\n\nReply JSON only: {"winner":"A"|"B"|"C"|"tie","confidence":0-100,"rationale":"<=60 words","synthesis":"best final answer <=300 words"}`,
      )
      const m = judgeText.match(/\{[\s\S]*\}/)
      const parsed = m ? JSON.parse(m[0]) : null
      if (parsed && typeof parsed.synthesis === 'string') {
        verdict = {
          winner: SEAT_NAMES.includes(parsed.winner) ? parsed.winner : 'tie',
          confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 50)),
          synthesis: parsed.synthesis.trim(),
          rationale: String(parsed.rationale ?? '').trim(),
        }
      } else if (judgeText) {
        verdict = { ...verdict, synthesis: judgeText, rationale: 'Unstructured judge output.' }
      }
    } catch (e: any) {
      this.logger.debug(`Judge failed: ${e?.message ?? e}`)
    }

    return {
      question: q,
      seats,
      answers,
      critiques,
      verdict,
      judge,
      durationMs: Date.now() - started,
      ...(stoppedEarly ? { stoppedEarly } : {}),
    }
  }
}
