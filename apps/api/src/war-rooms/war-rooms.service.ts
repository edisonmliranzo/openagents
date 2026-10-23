import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { MultiDebateService } from '../frontier/multi-debate.service'
import { scoreConsensus, type ConsensusResult } from './consensus'

export interface WarRoomMessage {
  id: string
  role: 'agent' | 'user' | 'system'
  agentName: string | null
  content: string
  meta: Record<string, unknown> | null
  createdAt: string
}

export interface WarRoom {
  id: string
  name: string
  topic: string | null
  status: 'active' | 'concluded' | 'failed'
  agents: string[]
  consensus: ConsensusResult | null
  verdict: { winner: string; confidence: number; synthesis: string; rationale: string } | null
  transcript: WarRoomMessage[]
  createdAt: string
  updatedAt: string
}

@Injectable()
export class WarRoomService {
  private readonly logger = new Logger(WarRoomService.name)

  constructor(
    private prisma: PrismaService,
    private debate: MultiDebateService,
  ) {}

  async createRoom(
    userId: string,
    name: string,
    agents: string[] = [],
    topic?: string,
  ): Promise<WarRoom> {
    const room = await this.prisma.warRoom.create({
      data: {
        userId,
        name: name?.trim() || 'War Room',
        topic: topic?.trim() || null,
        agents: JSON.stringify(agents ?? []),
      },
    })
    this.logger.log(`Created War Room ${room.id} for user ${userId}`)
    return this.toWarRoom(room, [])
  }

  async listRooms(userId: string): Promise<WarRoom[]> {
    const rooms = await this.prisma.warRoom.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    return rooms.map((room) => this.toWarRoom(room, room.messages))
  }

  async getRoom(userId: string, roomId: string): Promise<WarRoom | null> {
    const room = await this.prisma.warRoom.findFirst({
      where: { id: roomId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    if (!room) return null
    return this.toWarRoom(room, room.messages)
  }

  async deleteRoom(userId: string, roomId: string): Promise<boolean> {
    const room = await this.prisma.warRoom.findFirst({ where: { id: roomId, userId } })
    if (!room) return false
    await this.prisma.warRoom.delete({ where: { id: roomId } })
    return true
  }

  /** Appends a message to the room transcript. */
  async broadcastMessage(
    userId: string,
    roomId: string,
    agentName: string,
    content: string,
    role: 'agent' | 'user' | 'system' = 'agent',
  ): Promise<WarRoom | null> {
    const room = await this.prisma.warRoom.findFirst({ where: { id: roomId, userId } })
    if (!room) return null

    await this.prisma.warRoomMessage.create({
      data: {
        warRoomId: roomId,
        role,
        agentName: agentName?.trim() || null,
        content: content ?? '',
      },
    })

    return this.getRoom(userId, roomId)
  }

  /**
   * Runs a real multi-model debate in this room: the seats answer, critique
   * each other, a judge synthesises a verdict, and a deterministic consensus
   * score is computed from how much the contributions overlap.
   */
  async runDebate(
    userId: string,
    roomId: string,
    question: string,
    models?: string[],
  ): Promise<WarRoom> {
    const room = await this.prisma.warRoom.findFirst({ where: { id: roomId, userId } })
    if (!room) throw new NotFoundException('War room not found')

    const topic = question?.trim() || room.topic || room.name
    if (!topic) throw new BadRequestException('A question is required to run a war room.')

    let result
    try {
      result = await this.debate.run(userId, topic, models)
    } catch (error: any) {
      await this.prisma.warRoom.update({
        where: { id: roomId },
        data: { status: 'failed' },
      })
      throw error instanceof BadRequestException
        ? error
        : new BadRequestException(error?.message ?? 'The debate could not be run.')
    }

    // Persist each seat's answer and critique.
    const messages: Array<{ role: string; agentName: string; content: string; meta?: Record<string, unknown> }> = []

    for (const answer of result.answers) {
      if (!answer.text) continue
      messages.push({
        role: 'agent',
        agentName: this.seatLabel(result.seats, answer.seat),
        content: answer.text,
        meta: { phase: 'answer', seat: answer.seat },
      })
    }

    for (const critique of result.critiques) {
      if (!critique.text) continue
      messages.push({
        role: 'agent',
        agentName: this.seatLabel(result.seats, critique.seat),
        content: critique.text,
        meta: { phase: 'critique', seat: critique.seat },
      })
    }

    messages.push({
      role: 'system',
      agentName: 'Judge',
      content: result.verdict.synthesis,
      meta: {
        phase: 'verdict',
        winner: result.verdict.winner,
        confidence: result.verdict.confidence,
        rationale: result.verdict.rationale,
        ...(result.stoppedEarly ? { stoppedEarly: result.stoppedEarly } : {}),
      },
    })

    await this.prisma.warRoomMessage.createMany({
      data: messages.map((message) => ({
        warRoomId: roomId,
        role: message.role,
        agentName: message.agentName,
        content: message.content,
        meta: message.meta ? JSON.stringify(message.meta) : null,
      })),
    })

    const consensus = scoreConsensus(
      result.answers
        .filter((a) => a.text)
        .map((a) => ({ name: this.seatLabel(result.seats, a.seat), text: a.text })),
    )

    const updated = await this.prisma.warRoom.update({
      where: { id: roomId },
      data: {
        topic,
        status: 'concluded',
        agents: JSON.stringify(result.seats.map((s) => s.seat)),
        consensus: JSON.parse(JSON.stringify(consensus)),
      },
    })

    return this.getRoom(userId, roomId) ?? this.toWarRoom(updated, [])
  }

  async concludeRoom(userId: string, roomId: string): Promise<WarRoom | null> {
    const room = await this.prisma.warRoom.findFirst({ where: { id: roomId, userId } })
    if (!room) return null
    if (room.status !== 'concluded') {
      await this.prisma.warRoom.update({ where: { id: roomId }, data: { status: 'concluded' } })
    }
    return this.getRoom(userId, roomId)
  }

  private seatLabel(seats: Array<{ seat: string; provider: string; model?: string }>, seat: string): string {
    const found = seats.find((s) => s.seat === seat)
    if (!found) return `Seat ${seat}`
    return found.model ? `${seat} (${found.provider}:${found.model})` : `${seat} (${found.provider})`
  }

  private toWarRoom(
    room: {
      id: string
      name: string
      topic: string | null
      status: string
      agents: unknown
      consensus: unknown
      createdAt: Date
      updatedAt: Date
    },
    messages: Array<{
      id: string
      role: string
      agentName: string | null
      content: string
      meta: string | null
      createdAt: Date
    }>,
  ): WarRoom {
    const consensus = this.parseJson<ConsensusResult | null>(room.consensus)

    const transcript = messages.map((message) => ({
      id: message.id,
      role: (message.role as WarRoomMessage['role']) ?? 'agent',
      agentName: message.agentName,
      content: message.content,
      meta: this.parseJson<Record<string, unknown> | null>(message.meta),
      createdAt: message.createdAt.toISOString(),
    }))

    return {
      id: room.id,
      name: room.name,
      topic: room.topic,
      status: (room.status as WarRoom['status']) ?? 'active',
      agents: this.parseJson<string[]>(room.agents) ?? [],
      consensus,
      verdict: this.findVerdict(transcript),
      transcript,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
    }
  }

  /** The judge's verdict is stored on the transcript's system message. */
  private findVerdict(transcript: WarRoomMessage[]): WarRoom['verdict'] {
    for (let i = transcript.length - 1; i >= 0; i -= 1) {
      const message = transcript[i]
      if (message.role !== 'system') continue
      const meta = message.meta
      if (!meta || meta.phase !== 'verdict') continue
      return {
        winner: String(meta.winner ?? 'tie'),
        confidence: Number(meta.confidence ?? 0),
        synthesis: message.content,
        rationale: String(meta.rationale ?? ''),
      }
    }
    return null
  }

  private parseJson<T>(value: unknown): T | null {
    if (value === null || value === undefined) return null
    if (typeof value === 'object') return value as T
    if (typeof value !== 'string') return null
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }
}
