import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { DocumentStore } from '../prisma/document-store.service'
import { PrivacyService } from '../privacy/privacy.service'

const RETENTION_KIND = 'trust-retention'
const REQUEST_KIND = 'trust-request'
const CONFIRM_TTL_MS = 24 * 60 * 60 * 1000

export interface RetentionSettings {
  /** Days to keep conversations; null = keep until deleted by the user. */
  conversationsDays: number | null
  /** Recorded preferences that are NOT automatically enforced yet. */
  auditLogDays: number | null
  memoriesDays: number | null
  updatedAt: string | null
}

export interface DataRequest {
  id: string
  type: 'export' | 'delete'
  status: 'completed' | 'pending_confirmation' | 'expired' | 'processed'
  note?: string
  createdAt: string
  completedAt?: string
  expiresAt?: string
  result?: Record<string, unknown>
}

const has = (...names: string[]) => names.some((n) => !!(process.env[n] ?? '').trim())

@Injectable()
export class TrustCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docs: DocumentStore,
    private readonly privacy: PrivacyService,
  ) {}

  /** Statements here must match code that exists. `evidence` points at the implementation. */
  posture() {
    return {
      generatedAt: new Date().toISOString(),
      controls: [
        { id: 'encryption-at-rest', title: 'AES-256-GCM encryption for sensitive data', status: 'implemented', scope: 'Sensitive memories (privacy vault) and values encrypted by the users service (enc:v1). Not full-disk or whole-database encryption: configure that at the database/host layer.', evidence: 'apps/api/src/privacy/privacy.service.ts, apps/api/src/users/users.service.ts' },
        { id: 'hsts', title: 'HTTP Strict Transport Security', status: 'implemented', scope: 'API responses send Strict-Transport-Security: max-age=31536000; includeSubDomains; preload, plus nosniff, no-referrer and a restrictive CSP.', evidence: 'apps/api/src/main.ts' },
        { id: 'ssrf', title: 'SSRF protection for outbound fetches', status: 'implemented', scope: 'Private/loopback/link-local addresses are blocked, DNS is resolved and re-checked, redirects are capped. Applied to the frontier fetch helpers and marketplace URL permission checks; other connectors use their own clients.', evidence: 'apps/api/src/frontier/safe-fetch.ts' },
        { id: 'rate-limiting', title: 'Rate limiting', status: 'implemented', scope: 'Global throttling guard (300 requests/minute per client by default).', evidence: 'apps/api/src/app.module.ts' },
        { id: 'audit-log', title: 'Audit log', status: 'implemented', scope: 'Agent and system actions are recorded per user in a database table. The log is not cryptographically hash-chained.', evidence: 'apps/api/src/audit/audit.service.ts' },
        { id: 'authn', title: 'Authentication and per-user data scoping', status: 'implemented', scope: 'JWT authentication on all non-public endpoints; data access is scoped to the authenticated user; password hashes use bcrypt.', evidence: 'apps/api/src/auth' },
        { id: 'data-subject-rights', title: 'Self-serve data export and deletion', status: 'implemented', scope: 'Full JSON export and password-confirmed account data deletion (see data requests below).', evidence: 'apps/api/src/privacy/privacy.service.ts' },
        { id: 'local-only', title: 'Local-only inference mode', status: 'implemented', scope: 'Users can force all LLM calls to a local Ollama model so prompts do not leave the host.', evidence: 'apps/api/src/privacy/privacy.service.ts' },
      ],
      notClaimed: [
        'No SOC 2 / ISO 27001 / HIPAA certification or third-party audit is claimed.',
        'No automated penetration-test report is published.',
        'Audit log entries are not tamper-evident (no hash chain).',
        'Retention for audit logs and memories is recorded as a preference only; automatic purge currently covers conversations.',
      ],
    }
  }

  subprocessors() {
    const rows = [
      { name: 'OpenAI', purpose: 'LLM inference (when an OpenAI model is selected)', data: 'Prompts and tool outputs sent to the model', location: 'Per provider', active: has('OPENAI_API_KEY') },
      { name: 'Anthropic', purpose: 'LLM inference (when a Claude model is selected)', data: 'Prompts and tool outputs sent to the model', location: 'Per provider', active: has('ANTHROPIC_API_KEY') },
      { name: 'Google (Gemini)', purpose: 'LLM inference (when a Gemini model is selected)', data: 'Prompts and tool outputs sent to the model', location: 'Per provider', active: has('GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY') },
      { name: 'Stripe', purpose: 'Payments and billing', data: 'Billing email, payment metadata (card data is handled by Stripe)', location: 'Per provider', active: has('STRIPE_SECRET_KEY') },
      { name: 'Twilio', purpose: 'SMS / WhatsApp / phone channel', data: 'Phone numbers and message content', location: 'Per provider', active: has('TWILIO_ACCOUNT_SID') },
      { name: 'Brave Search', purpose: 'Web search tool', data: 'Search queries', location: 'Per provider', active: has('BRAVE_SEARCH_API_KEY') },
      { name: 'ElevenLabs', purpose: 'Text-to-speech', data: 'Text to be spoken', location: 'Per provider', active: has('ELEVENLABS_API_KEY') },
      { name: 'Cloudflare', purpose: 'Edge delivery / tunnel', data: 'Request traffic in transit', location: 'Global', active: has('CLOUDFLARE_TUNNEL_TOKEN', 'CF_TUNNEL_TOKEN') },
      { name: 'Ollama (self-hosted)', purpose: 'Local LLM inference', data: 'None leaves your host', location: 'Your infrastructure', active: has('OLLAMA_BASE_URL', 'OLLAMA_HOST') },
    ]
    return {
      note: 'Derived from integrations present in the code and which are configured on this deployment. The deployment operator should review this list before sharing it with customers.',
      subprocessors: rows,
    }
  }

  // ── Retention ─────────────────────────────────────────────────────────────

  async getRetention(userId: string): Promise<RetentionSettings & { enforced: Record<string, boolean> }> {
    const s = await this.docs.read<RetentionSettings>(userId, RETENTION_KIND, () => ({ conversationsDays: null, auditLogDays: null, memoriesDays: null, updatedAt: null }))
    return { ...s, enforced: { conversationsDays: true, auditLogDays: false, memoriesDays: false } }
  }

  async setRetention(userId: string, patch: Partial<Pick<RetentionSettings, 'conversationsDays' | 'auditLogDays' | 'memoriesDays'>>) {
    const cur = await this.getRetention(userId)
    const norm = (v: unknown, prev: number | null) => (v === undefined ? prev : v === null ? null : Math.min(3650, Math.max(1, Math.round(Number(v)))))
    const next: RetentionSettings = {
      conversationsDays: norm(patch.conversationsDays, cur.conversationsDays),
      auditLogDays: norm(patch.auditLogDays, cur.auditLogDays),
      memoriesDays: norm(patch.memoriesDays, cur.memoriesDays),
      updatedAt: new Date().toISOString(),
    }
    await this.docs.write(userId, RETENTION_KIND, next)
    return this.getRetention(userId)
  }

  /** Deletes the caller's conversations older than the configured window. dryRun by default. */
  async applyRetention(userId: string, dryRun: boolean) {
    const s = await this.getRetention(userId)
    if (!s.conversationsDays) return { dryRun, conversationsDays: null, matched: 0, deleted: 0 }
    const cutoff = new Date(Date.now() - s.conversationsDays * 86_400_000)
    const where = { userId, updatedAt: { lt: cutoff } }
    const matched = await this.prisma.conversation.count({ where })
    let deleted = 0
    if (!dryRun && matched > 0) deleted = (await this.prisma.conversation.deleteMany({ where })).count
    return { dryRun, conversationsDays: s.conversationsDays, cutoff: cutoff.toISOString(), matched, deleted }
  }

  // ── DPA ───────────────────────────────────────────────────────────────────

  generateDpa(customerName: string, userId?: string) {
    const customer = customerName.replace(/[\r\n#`<>]/g, ' ').trim().slice(0, 120) || '[Customer name]'
    const provider = (process.env.OPENAGENTS_LEGAL_ENTITY ?? '').trim().replace(/[\r\n#`<>]/g, ' ').slice(0, 120) || 'OpenAgents (the operator of this deployment)'
    const date = new Date().toISOString().slice(0, 10)
    const posture = this.posture()
    const subs = this.subprocessors().subprocessors.filter((s) => s.active)
    void userId
    const md = [
      `# Data Processing Addendum`,
      ``,
      `**Customer:** ${customer}  `,
      `**Provider:** ${provider}  `,
      `**Effective date:** ${date}`,
      ``,
      `> Template generated by the OpenAgents Trust Center. It is not legal advice; have counsel review before signing.`,
      ``,
      `## 1. Scope and roles`,
      `This Addendum applies to personal data that the Provider processes on behalf of the Customer through OpenAgents (conversations, memories, files, workflow data and account data). For that data the Customer is the controller and the Provider is the processor.`,
      ``,
      `## 2. Processing instructions`,
      `The Provider processes personal data only to deliver the OpenAgents service and on the Customer's documented instructions (including configuration choices such as local-only inference and retention settings).`,
      ``,
      `## 3. Security measures`,
      `The Provider maintains the following measures as currently implemented:`,
      ...posture.controls.map((c) => `- **${c.title}.** ${c.scope}`),
      ``,
      `The Provider does not currently claim: ${posture.notClaimed.join(' ')}`,
      ``,
      `## 4. Subprocessors`,
      subs.length
        ? `The Customer authorises the following subprocessors that are enabled on this deployment:`
        : `No third-party subprocessors are currently enabled on this deployment.`,
      ...subs.map((s) => `- **${s.name}** — ${s.purpose} (${s.data}).`),
      ``,
      `The Provider will make updates to this list available in the Trust Center.`,
      ``,
      `## 5. Data subject rights`,
      `The Provider supplies self-serve tooling for export and deletion of user data (Trust Center → Data requests) and will assist the Customer in responding to data subject requests.`,
      ``,
      `## 6. Retention and deletion`,
      `Customers can configure retention windows in the Trust Center. On request, or on termination, personal data is deleted using the self-serve delete flow, except where retention is required by law.`,
      ``,
      `## 7. Personal data breaches`,
      `The Provider will notify the Customer without undue delay after becoming aware of a personal data breach affecting Customer data and will provide information reasonably needed to meet notification obligations.`,
      ``,
      `## 8. Audits`,
      `The Provider will make available information reasonably necessary to demonstrate compliance with this Addendum, including the audit log exposed in the product.`,
      ``,
      `## 9. Signatures`,
      ``,
      `| | Customer: ${customer} | Provider: ${provider} |`,
      `|---|---|---|`,
      `| Name | | |`,
      `| Title | | |`,
      `| Signature | | |`,
      `| Date | | |`,
      ``,
    ].join('\n')
    return { filename: `openagents-dpa-${customer.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'customer'}-${date}.md`, markdown: md }
  }

  // ── Data requests ─────────────────────────────────────────────────────────

  async listRequests(userId: string) {
    const keys = await this.docs.listKeys(userId, REQUEST_KIND)
    const out: DataRequest[] = []
    for (const key of keys) {
      const r = await this.docs.read<DataRequest | null>(userId, REQUEST_KIND, () => null, key)
      if (!r) continue
      if (r.status === 'pending_confirmation' && r.expiresAt && Date.parse(r.expiresAt) < Date.now()) r.status = 'expired'
      out.push(r)
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async createRequest(userId: string, type: 'export' | 'delete', note?: string) {
    const now = new Date()
    const req: DataRequest = {
      id: randomUUID(),
      type,
      status: type === 'export' ? 'completed' : 'pending_confirmation',
      note: note?.slice(0, 300),
      createdAt: now.toISOString(),
    }
    if (type === 'export') {
      const bundle = await this.privacy.exportAll(userId)
      req.completedAt = now.toISOString()
      req.result = {
        conversations: bundle.conversations?.length ?? 0,
        memories: bundle.memories?.length ?? 0,
        artifacts: (bundle as any).artifacts?.length ?? 0,
      }
    } else {
      req.expiresAt = new Date(now.getTime() + CONFIRM_TTL_MS).toISOString()
    }
    await this.docs.write(userId, REQUEST_KIND, req, req.id)
    return req
  }

  async downloadExport(userId: string, requestId: string) {
    const req = await this.docs.read<DataRequest | null>(userId, REQUEST_KIND, () => null, requestId)
    if (!req || req.type !== 'export') throw new NotFoundException('Export request not found.')
    return this.privacy.exportAll(userId)
  }

  /** Executes a pending delete request after password confirmation. Irreversible. */
  async confirmDelete(userId: string, requestId: string, password: string) {
    const req = await this.docs.read<DataRequest | null>(userId, REQUEST_KIND, () => null, requestId)
    if (!req || req.type !== 'delete') throw new NotFoundException('Delete request not found.')
    if (req.status !== 'pending_confirmation') throw new BadRequestException(`Request is ${req.status}.`)
    if (req.expiresAt && Date.parse(req.expiresAt) < Date.now()) throw new BadRequestException('Request expired; create a new one.')
    if (!password) throw new UnauthorizedException('Password is required.')
    // privacy.deleteAll verifies the password (bcrypt) before deleting anything.
    const result = await this.privacy.deleteAll(userId, password)
    // Best effort: user-scoped docs may already be removed by the wipe.
    req.status = 'processed'
    req.completedAt = new Date().toISOString()
    await this.docs.write(userId, REQUEST_KIND, req, req.id).catch(() => undefined)
    return { request: req, result }
  }
}
