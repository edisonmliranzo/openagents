import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import type { LLMProvider } from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PhoneCallRecord, PhoneStore } from './phone.store'

const MAX_TURNS = 30
const AUDIO_TTL_MS = 5 * 60 * 1000

/** Emergency/short numbers (any country) and premium-rate prefixes we never dial. */
const EMERGENCY = new Set(['911', '112', '999', '000', '110', '118', '119', '100', '101', '102', '103', '108', '15', '17', '18', '933', '988'])
const PREMIUM_PREFIXES = [
  '+1900', '+1976', // US/CA premium
  '+4490', '+4491', '+4498', '+4487', '+4470', // UK premium/personal numbers
  '+33897', '+33899', '+3489', '+34803', '+34806', '+34807', '+3989', '+49900', '+49137', '+61190', '+5290', '+57901',
  '+881', '+882', '+883', // international/satellite
]

export function checkDialable(raw: string): string {
  const to = String(raw ?? '').replace(/[\s().-]/g, '')
  const digits = to.replace(/^\+/, '')
  if (EMERGENCY.has(digits)) throw new BadRequestException('Emergency numbers cannot be dialed by the agent.')
  if (!/^\+[1-9]\d{7,14}$/.test(to)) throw new BadRequestException('Number must be in E.164 format, e.g. +15551234567.')
  if (PREMIUM_PREFIXES.some((p) => to.startsWith(p))) throw new BadRequestException('Premium-rate numbers are blocked.')
  return to
}

const xml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)

@Injectable()
export class PhoneService {
  private readonly logger = new Logger(PhoneService.name)
  private readonly audio = new Map<string, { buf: Buffer; mime: string; exp: number }>()

  constructor(
    private readonly store: PhoneStore,
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------- config ----------
  private get sid() { return (process.env.TWILIO_ACCOUNT_SID ?? '').trim() }
  private get token() { return (process.env.TWILIO_AUTH_TOKEN ?? '').trim() }
  private get fromNumber() { return (process.env.TWILIO_PHONE_NUMBER ?? '').trim() }
  get publicBase() { return (process.env.API_PUBLIC_URL ?? '').trim().replace(/\/+$/, '') }
  private hookUrl(p: string) { return `${this.publicBase}/api/v1/phone/twilio/${p}` }

  status() {
    return { configured: Boolean(this.sid && this.token && this.fromNumber && this.publicBase), from: this.fromNumber || null }
  }

  // ---------- user-facing ----------
  list(userId: string) { return this.store.list(userId) }

  async get(userId: string, id: string) {
    const call = await this.store.get(userId, id)
    if (!call) throw new NotFoundException('Call not found')
    return call
  }

  async request(userId: string, to: string, goal: string) {
    const number = checkDialable(to)
    const g = String(goal ?? '').trim()
    if (!g) throw new BadRequestException('goal is required')
    const now = new Date().toISOString()
    const record: PhoneCallRecord = {
      id: randomUUID(), userId, direction: 'outbound', to: number, from: this.fromNumber, goal: g.slice(0, 2000),
      status: 'pending_approval', transcript: [], createdAt: now, updatedAt: now,
    }
    await this.store.save(record)
    await this.notifications.create(userId, 'Phone call needs approval', `Call ${number}: ${g.slice(0, 160)}`, 'warning').catch(() => undefined)
    return record
  }

  async reject(userId: string, id: string) {
    const call = await this.get(userId, id)
    if (call.status !== 'pending_approval') throw new BadRequestException('Call is not awaiting approval')
    call.status = 'rejected'
    return this.store.save(call)
  }

  async approve(userId: string, id: string) {
    const call = await this.get(userId, id)
    if (call.status !== 'pending_approval') throw new BadRequestException('Call is not awaiting approval')
    checkDialable(call.to) // re-check at dial time
    if (!this.status().configured) {
      throw new ServiceUnavailableException('Twilio is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, API_PUBLIC_URL).')
    }
    call.approvedAt = new Date().toISOString()
    call.status = 'dialing'
    call.from = this.fromNumber
    await this.store.save(call)
    try {
      const body = new URLSearchParams({
        To: call.to,
        From: this.fromNumber,
        Url: this.hookUrl(`voice/${call.id}`),
        Method: 'POST',
        StatusCallback: this.hookUrl(`status/${call.id}`),
        StatusCallbackMethod: 'POST',
      })
      body.append('StatusCallbackEvent', 'completed')
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.sid)}/Calls.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.sid}:${this.token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message ?? `Twilio error ${res.status}`)
      call.twilioSid = data.sid
    } catch (e: any) {
      call.status = 'failed'
      call.error = String(e?.message ?? e).slice(0, 300)
    }
    return this.store.save(call)
  }

  // ---------- Twilio signature ----------
  validateSignature(url: string, params: Record<string, unknown>, signature: string | undefined): boolean {
    if (!this.token || !signature) return false
    const data = Object.keys(params ?? {}).sort().reduce((acc, k) => acc + k + String((params as any)[k] ?? ''), url)
    const expected = createHmac('sha1', this.token).update(Buffer.from(data, 'utf8')).digest('base64')
    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  // ---------- TwiML flow ----------
  async voiceTwiml(callId: string): Promise<string> {
    const call = await this.store.getById(callId)
    if (!call || call.status === 'rejected' || call.status === 'pending_approval') return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>'
    call.status = 'in_progress'
    const opener = await this.reply(call, null)
    await this.store.save(call)
    return this.gatherTwiml(call, opener)
  }

  async inboundTwiml(params: Record<string, any>): Promise<string> {
    const userId = (process.env.TWILIO_INBOUND_USER_ID ?? '').trim()
    if (!userId) {
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this OpenAgents line is not accepting calls right now.</Say><Hangup/></Response>`
    }
    const now = new Date().toISOString()
    const call: PhoneCallRecord = {
      id: randomUUID(), userId, direction: 'inbound', to: String(params.To ?? this.fromNumber), from: String(params.From ?? 'unknown'),
      goal: 'Answer the caller politely on behalf of the user, take a message, and find out what they need.',
      status: 'in_progress', twilioSid: params.CallSid, transcript: [], createdAt: now, updatedAt: now,
    }
    const opener = await this.reply(call, null)
    await this.store.save(call)
    return this.gatherTwiml(call, opener)
  }

  async gatherResult(callId: string, params: Record<string, any>): Promise<string> {
    const call = await this.store.getById(callId)
    if (!call) return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>'
    const speech = String(params.SpeechResult ?? '').trim()
    if (!speech) {
      return this.gatherTwiml(call, 'Sorry, I did not catch that. Could you repeat?')
    }
    call.transcript.push({ role: 'caller', text: speech.slice(0, 2000), at: new Date().toISOString() })
    const turns = call.transcript.filter((t) => t.role === 'caller').length
    let text = await this.reply(call, speech)
    const done = /\[END_CALL\]/i.test(text) || turns >= MAX_TURNS
    text = text.replace(/\[END_CALL\]/gi, '').trim() || 'Thank you, goodbye.'
    await this.store.save(call)
    if (done) {
      // Inbound calls have no per-call status callback, so finalize here.
      if (call.direction === 'inbound') void this.finish(call, 'completed')
      return `<?xml version="1.0" encoding="UTF-8"?><Response>${await this.speakTag(call, text)}<Hangup/></Response>`
    }
    return this.gatherTwiml(call, text)
  }

  async statusCallback(callId: string, params: Record<string, any>) {
    const call = await this.store.getById(callId)
    if (!call) return
    const st = String(params.CallStatus ?? '')
    if (!['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(st)) return
    await this.finish(call, st === 'completed' ? 'completed' : 'failed', st === 'completed' ? undefined : st)
  }


  private async finish(call: PhoneCallRecord, status: 'completed' | 'failed', error?: string) {
    if (call.endedAt) return
    call.status = status
    call.endedAt = new Date().toISOString()
    if (error) call.error = error
    call.summary = await this.summarize(call)
    await this.store.save(call)
    const who = call.direction === 'outbound' ? call.to : call.from
    await this.notifications
      .create(call.userId, `Phone call ${status === 'completed' ? 'finished' : 'failed'} (${who})`, (call.summary ?? call.error ?? '').slice(0, 300), status === 'completed' ? 'info' : 'warning')
      .catch(() => undefined)
  }

  private async gatherTwiml(call: PhoneCallRecord, say: string): Promise<string> {
    const action = xml(this.hookUrl(`gather/${call.id}`))
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" speechTimeout="auto" method="POST" action="${action}">${await this.speakTag(call, say)}</Gather><Redirect method="POST">${action}</Redirect></Response>`
  }

  // ---------- LLM ----------
  private async llmSettings(userId: string) {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } }).catch(() => null)
    return { provider: (settings?.preferredProvider ?? 'ollama') as LLMProvider, model: settings?.preferredModel ?? undefined }
  }

  private async reply(call: PhoneCallRecord, _speech: string | null): Promise<string> {
    const { provider, model } = await this.llmSettings(call.userId)
    const system = [
      `You are an AI phone assistant from OpenAgents speaking on a live ${call.direction} phone call on behalf of your user.`,
      `Goal: ${call.goal}`,
      'Speak naturally in 1-3 short sentences per turn. Never invent personal data you were not given. Disclose you are an AI assistant if asked.',
      'When the goal is achieved or the other party wants to end, say a brief goodbye and append [END_CALL].',
    ].join('\n')
    const messages = call.transcript.map((t) => ({ role: t.role === 'caller' ? 'user' : 'assistant', content: t.text })) as any[]
    if (!messages.length) messages.push({ role: 'user', content: '(The call has just connected. Open the conversation.)' })
    let text = ''
    try {
      const res = await this.llm.complete(messages, [], system, provider, undefined, undefined, model)
      text = (res.content ?? '').trim()
    } catch (e: any) {
      this.logger.warn(`LLM reply failed: ${e?.message}`)
    }
    if (!text) text = call.transcript.length ? 'Sorry, could you say that again?' : 'Hello, this is an AI assistant calling on behalf of my user.'
    call.transcript.push({ role: 'agent', text: text.replace(/\[END_CALL\]/gi, '').trim().slice(0, 1500), at: new Date().toISOString() })
    return text.slice(0, 1500)
  }

  private async summarize(call: PhoneCallRecord): Promise<string> {
    if (!call.transcript.length) return call.error ? `Call did not connect (${call.error}).` : 'No conversation recorded.'
    const { provider, model } = await this.llmSettings(call.userId)
    const transcript = call.transcript.map((t) => `${t.role === 'agent' ? 'Agent' : 'Other party'}: ${t.text}`).join('\n')
    try {
      const res = await this.llm.complete(
        [{ role: 'user', content: `Goal: ${call.goal}\n\nTranscript:\n${transcript.slice(0, 12000)}\n\nSummarize the call in 2-4 bullets: outcome vs goal, key facts, follow-ups.` }],
        [], 'You summarize phone calls concisely.', provider, undefined, undefined, model,
      )
      const text = (res.content ?? '').trim()
      if (text) return text
    } catch { /* fall through */ }
    return transcript.slice(0, 600)
  }

  // ---------- TTS (Fish Audio) via short-lived signed URL ----------
  private async speakTag(call: PhoneCallRecord, text: string): Promise<string> {
    const url = await this.fishAudioUrl(text).catch(() => null)
    return url ? `<Play>${xml(url)}</Play>` : `<Say>${xml(text)}</Say>`
  }

  private async fishAudioUrl(text: string): Promise<string | null> {
    const key = (process.env.FISH_API_KEY ?? '').trim()
    if (!key || !this.publicBase || !this.token) return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const body: Record<string, unknown> = { text: text.slice(0, 1500), format: 'mp3' }
      const ref = (process.env.FISH_REFERENCE_ID ?? '').trim()
      if (ref) body.reference_id = ref
      const res = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) return null
      const buf = Buffer.from(await res.arrayBuffer())
      if (!buf.length) return null
      this.pruneAudio()
      const id = randomUUID()
      const exp = Date.now() + AUDIO_TTL_MS
      this.audio.set(id, { buf, mime: 'audio/mpeg', exp })
      return `${this.publicBase}/api/v1/phone/audio/${id}?exp=${exp}&sig=${this.signAudio(id, exp)}`
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  private signAudio(id: string, exp: number) {
    return createHmac('sha256', this.token).update(`${id}.${exp}`).digest('hex')
  }

  private pruneAudio() {
    const now = Date.now()
    for (const [k, v] of this.audio) if (v.exp < now) this.audio.delete(k)
  }

  getAudio(id: string, exp: string, sig: string) {
    const e = Number(exp)
    if (!e || e < Date.now() || !this.token) return null
    const expected = Buffer.from(this.signAudio(id, e))
    const given = Buffer.from(String(sig ?? ''))
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
    return this.audio.get(id) ?? null
  }
}
