import { Injectable, Logger } from '@nestjs/common'

export interface WarRoom {
  id: string
  name: string
  userId: string
  status: 'active' | 'consensus_reached' | 'failed'
  agents: string[]
  transcript: Array<{ role: string, agentName: string, content: string }>
}

@Injectable()
export class WarRoomService {
  private readonly logger = new Logger(WarRoomService.name)
  private rooms = new Map<string, WarRoom>()

  async createRoom(userId: string, name: string, agents: string[]): Promise<WarRoom> {
    const room: WarRoom = {
      id: `war-room-${Date.now()}`,
      name,
      userId,
      status: 'active',
      agents,
      transcript: []
    }
    this.rooms.set(room.id, room)
    this.logger.log(`Created War Room ${room.id} with ${agents.length} agents`)
    return room
  }

  async broadcastMessage(roomId: string, agentName: string, content: string): Promise<WarRoom | null> {
    const room = this.rooms.get(roomId)
    if (!room) return null

    room.transcript.push({ role: 'agent', agentName, content })
    this.logger.log(`Agent ${agentName} broadcasted to War Room ${roomId}`)
    return room
  }

  async concludeRoom(roomId: string): Promise<WarRoom | null> {
    const room = this.rooms.get(roomId)
    if (!room) return null

    room.status = 'consensus_reached'
    this.logger.log(`War Room ${roomId} concluded with consensus`)
    return room
  }
}
