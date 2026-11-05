import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { DocumentStore } from '../prisma/document-store.service'
import { PhoneService } from '../phone/phone.service'
import { PhoneStore } from '../phone/phone.store'

export type VoiceRole = 'caller' | 'agent' | 'human' | 'system'

export interface VoiceTurn {
  seq: number
  role: VoiceRole
  text: string
  at: string
}

export interface SteeringNote {
  id: string
  text: string
  at: string
  consumed: boolean
}

interface SessionRecord {
  id: string
  userId: string
  source: 'simulation' | 'phone'
  direction: 'inbound' | 'outbound'
  party: string
  goal: string
  status: 'active' | 'ended'
  humanTakeover: boolean
  steering: SteeringNote[]
  transcript: VoiceTurn[]
  phoneCallId?: string
  createdAt: string
  updatedAt: string
  endedAt?: string
}

const KIND = 'voice_console'
const MAX_SESSIONS = 100
const MAX_TURNS = 400

const CALLER_SCRIPT = [
  'Hi, who is this?',
  'Okay, what is this regarding exactly?',
  'How much would that cost?',
  'Can you send me details by email?',
  'Alright, that sounds reasonable. Thanks, bye.',
]

/**
 * Live-call console. Works over two sources:
 *  - `simulation`: a fully local call model (no telephony credentials required).
 *  - `phone`: mirrors a real call managed by PhoneService (Twilio provider) and writes
 *    steering notes / human-takeover to that call record so the live agent honours them.
 */
@Injectable()
export class VoiceConsoleService {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(
    private readonly docs: DocumentStore,
    private readonly phone: PhoneService,
    private readonly phoneStore: PhoneStore,
  ) {}

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn)
    this.queue = next.catch(() => undefined)
    return next
  }

  private loadAll(userId: string) {
    return this.docs.read<SessionRecord[]>(userId, KIND, () => [], 'sessions')
  }

  /** Runs `fn` on the stored session and persists the result (serialized to avoid lost updates). */
  private mutate<T>(userId: string, id: string, fn: (s: SessionRecord) => T | Promise<T>): Promise<T> {
    return this.serialize(async () => {
      const all = await this.loadAll(userId)
      const s = all.find((x) => x.id === id)
      if (!s) throw new NotFoundException('Voice session not found')
      const result = await fn(s)
      s.updatedAt = new Date().toISOString()
      await this.docs.write(userId, KIND, all, 'sessions')
      return result
    })
  }

  private push(s: SessionRecord, role: VoiceRole, text: string) {
    const seq = (s.transcript[s.transcript.length - 1]?.seq ?? 0) + 1
    s.transcript.push({ seq, role, text: text.slice(0, 2000), at: new Date().toISOString() })
    if (s.transcript.length > MAX_TURNS) s.transcript.splice(0, s.transcript.length - MAX_TURNS)
  }

  status() {
    const p = this.phone.status()
    return { telephonyConfigured: p.configured, from: p.from, simulationAvailable: true }
  }

  private async view(s: SessionRecord, after = 0) {
    let transcript = s.transcript
    let steering = s.steering
    let takeover = s.humanTakeover
    let status = s.status
    if (s.source === 'phone' && s.phoneCallId) {
      const call = await this.phoneStore.get(s.userId, s.phoneCallId)
      if (call) {
        const live = call.transcript.map((t, i) => ({ seq: i + 1, role: (t.role === 'caller' ? 'caller' : 'agent') as VoiceRole, text: t.text, at: t.at }))
        // Interleave local system/human notes (takeover markers) by timestamp.
        transcript = [...live, ...s.transcript].sort((a, b) => a.at.localeCompare(b.at)).map((t, i) => ({ ...t, seq: i + 1 }))
        steering = (call.steering ?? []).map((n, i) => ({ id: `${call.id}:${i}`, text: n.text, at: n.at, consumed: true }))
        takeover = Boolean(call.humanTakeover)
        status = ['completed', 'failed', 'rejected'].includes(call.status) ? 'ended' : 'active'
      }
    }
    return {
      id: s.id, source: s.source, direction: s.direction, party: s.party, goal: s.goal, status, humanTakeover: takeover,
      steering, phoneCallId: s.phoneCallId, createdAt: s.createdAt, updatedAt: s.updatedAt, endedAt: s.endedAt,
      lastSeq: transcript[transcript.length - 1]?.seq ?? 0,
      transcript: transcript.filter((t) => t.seq > after),
    }
  }

  async list(userId: string) {
    const all = await this.loadAll(userId)
    const out = []
    for (const s of [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      const v = await this.view(s, Number.MAX_SAFE_INTEGER)
      out.push({ ...v, transcript: undefined, turns: s.transcript.length })
    }
    return out
  }

  /** Polling feed: returns only turns with seq > `after`. */
  async get(userId: string, id: string, after = 0) {
    const s = (await this.loadAll(userId)).find((x) => x.id === id)
    if (!s) throw new NotFoundException('Voice session not found')
    return this.view(s, after)
  }

  /** Start a simulated call, or attach to a real (phone-provider) call via phoneCallId. */
  async create(userId: string, input: { direction?: 'inbound' | 'outbound'; party?: string; goal?: string; phoneCallId?: string }) {
    const now = new Date().toISOString()
    let rec: SessionRecord
    if (input.phoneCallId) {
      const call = await this.phone.get(userId, input.phoneCallId)
      rec = {
        id: randomUUID(), userId, source: 'phone', direction: call.direction, party: call.direction === 'outbound' ? call.to : call.from,
        goal: call.goal, status: 'active', humanTakeover: Boolean(call.humanTakeover), steering: [], transcript: [], phoneCallId: call.id, createdAt: now, updatedAt: now,
      }
    } else {
      const direction = input.direction ?? 'outbound'
      const goal = (input.goal ?? '').trim()
      if (!goal) throw new BadRequestException('goal is required')
      rec = {
        id: randomUUID(), userId, source: 'simulation', direction, party: (input.party ?? 'Simulated caller').trim().slice(0, 100) || 'Simulated caller',
        goal: goal.slice(0, 2000), status: 'active', humanTakeover: false, steering: [], transcript: [], createdAt: now, updatedAt: now,
      }
      this.push(rec, 'system', `Simulated ${direction} call started (no telephony credentials used).`)
      this.push(rec, 'agent', direction === 'outbound' ? `Hello, this is an AI assistant from OpenAgents calling about: ${goal.slice(0, 160)}` : 'Thanks for calling. This is an AI assistant from OpenAgents — how can I help you today?')
    }
    await this.serialize(async () => {
      const all = await this.loadAll(userId)
      all.unshift(rec)
      if (all.length > MAX_SESSIONS) all.length = MAX_SESSIONS
      await this.docs.write(userId, KIND, all, 'sessions')
    })
    return this.view(rec)
  }

  async steer(userId: string, id: string, text: string) {
    const note = text.trim()
    if (!note) throw new BadRequestException('text is required')
    const s = (await this.loadAll(userId)).find((x) => x.id === id)
    if (!s) throw new NotFoundException('Voice session not found')
    if (s.source === 'phone' && s.phoneCallId) {
      const call = await this.phoneStore.get(userId, s.phoneCallId)
      if (!call) throw new NotFoundException('Call not found')
      if (call.endedAt) throw new BadRequestException('Call has ended')
      call.steering = [...(call.steering ?? []), { text: note.slice(0, 500), at: new Date().toISOString() }].slice(-20)
      await this.phoneStore.save(call)
      return this.get(userId, id)
    }
    await this.mutate(userId, id, (x) => {
      if (x.status === 'ended') throw new BadRequestException('Call has ended')
      x.steering.push({ id: randomUUID(), text: note.slice(0, 500), at: new Date().toISOString(), consumed: false })
      this.push(x, 'system', `Operator steering note: ${note.slice(0, 500)}`)
    })
    return this.get(userId, id)
  }

  async takeover(userId: string, id: string, enabled: boolean) {
    const s = (await this.loadAll(userId)).find((x) => x.id === id)
    if (!s) throw new NotFoundException('Voice session not found')
    if (s.source === 'phone' && s.phoneCallId) {
      const call = await this.phoneStore.get(userId, s.phoneCallId)
      if (!call) throw new NotFoundException('Call not found')
      call.humanTakeover = enabled
      await this.phoneStore.save(call)
    }
    await this.mutate(userId, id, (x) => {
      if (x.source === 'simulation' && x.status === 'ended') throw new BadRequestException('Call has ended')
      x.humanTakeover = enabled
      this.push(x, 'system', enabled ? 'Human operator took over — the agent is paused.' : 'Control returned to the agent.')
    })
    return this.get(userId, id)
  }

  /** Human operator speaks while in takeover (simulation only; real calls need a media bridge). */
  async say(userId: string, id: string, text: string) {
    const msg = text.trim()
    if (!msg) throw new BadRequestException('text is required')
    await this.mutate(userId, id, (x) => {
      if (x.source !== 'simulation') throw new BadRequestException('Speaking as a human on a live phone call requires a telephony media bridge, which is not configured.')
      if (x.status === 'ended') throw new BadRequestException('Call has ended')
      if (!x.humanTakeover) throw new BadRequestException('Enable human takeover first')
      this.push(x, 'human', msg)
    })
    return this.get(userId, id)
  }

  /** Simulation: the other party says something; the agent replies unless a human has taken over. */
  async callerSays(userId: string, id: string, text?: string) {
    await this.mutate(userId, id, (x) => {
      if (x.source !== 'simulation') throw new BadRequestException('Only simulated calls accept simulated caller input')
      if (x.status === 'ended') throw new BadRequestException('Call has ended')
      const callerTurns = x.transcript.filter((t) => t.role === 'caller').length
      const said = (text ?? '').trim() || CALLER_SCRIPT[callerTurns % CALLER_SCRIPT.length]
      this.push(x, 'caller', said)
      if (x.humanTakeover) return
      const pending = x.steering.filter((n) => !n.consumed)
      pending.forEach((n) => (n.consumed = true))
      const lead = pending.length ? `Understood. ${pending.map((n) => n.text.replace(/[.!]+$/, '')).join('; ')}. ` : ''
      let body: string
      if (/bye|goodbye|thanks/i.test(said)) body = 'Thank you for your time — goodbye!'
      else if (/cost|price|how much/i.test(said)) body = 'Pricing depends on the plan; I can send exact numbers right after this call.'
      else if (/email|send/i.test(said)) body = 'Absolutely, I will email the details to you today.'
      else if (/who|what is this|regarding/i.test(said)) body = `I am calling about: ${x.goal.slice(0, 140)}.`
      else body = 'Got it, thanks for sharing that. Is there anything else you would like to know?'
      this.push(x, 'agent', lead + body)
    })
    return this.get(userId, id)
  }

  async end(userId: string, id: string) {
    const s = (await this.loadAll(userId)).find((x) => x.id === id)
    if (!s) throw new NotFoundException('Voice session not found')
    if (s.source === 'phone') {
      // Real calls end via the provider's status callback; here we only close the console session.
    }
    await this.mutate(userId, id, (x) => {
      if (x.status === 'ended') return
      x.status = 'ended'
      x.endedAt = new Date().toISOString()
      this.push(x, 'system', 'Call ended.')
    })
    return this.get(userId, id)
  }

  async remove(userId: string, id: string) {
    return this.serialize(async () => {
      const all = await this.loadAll(userId)
      if (!all.some((x) => x.id === id)) throw new NotFoundException('Voice session not found')
      await this.docs.write(userId, KIND, all.filter((x) => x.id !== id), 'sessions')
      return { ok: true }
    })
  }
}
