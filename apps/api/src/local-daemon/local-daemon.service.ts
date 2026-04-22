import { Injectable, Logger } from '@nestjs/common'

export interface LocalDaemonConnection {
  id: string
  userId: string
  hostname: string
  status: 'connected' | 'disconnected'
  capabilities: string[]
  lastPingAt: string
}

@Injectable()
export class LocalDaemonService {
  private readonly logger = new Logger(LocalDaemonService.name)
  private connections = new Map<string, LocalDaemonConnection>()

  async registerDaemon(userId: string, hostname: string, capabilities: string[]): Promise<LocalDaemonConnection> {
    const conn: LocalDaemonConnection = {
      id: `daemon-${Date.now()}`,
      userId,
      hostname,
      status: 'connected',
      capabilities,
      lastPingAt: new Date().toISOString()
    }
    this.connections.set(conn.id, conn)
    this.logger.log(`Registered local daemon for user ${userId} on host ${hostname}`)
    return conn
  }

  async executeLocalCommand(daemonId: string, command: string): Promise<{ success: boolean; output: string }> {
    const conn = this.connections.get(daemonId)
    if (!conn || conn.status !== 'connected') {
      throw new Error('Daemon not connected')
    }

    this.logger.log(`Executing command on daemon ${daemonId}: ${command}`)
    // Simulate passing the command to a WebSocket/TCP bridge
    return { success: true, output: `Executed ${command} successfully on ${conn.hostname}` }
  }

  async ping(daemonId: string): Promise<boolean> {
    const conn = this.connections.get(daemonId)
    if (!conn) return false
    conn.lastPingAt = new Date().toISOString()
    return true
  }
}
