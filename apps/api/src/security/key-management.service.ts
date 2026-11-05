import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import { UserJsonStore } from '../keys-sync/user-json-store'

/**
 * Envelope encryption (enc:v2:)
 *
 *   plaintext --AES-256-GCM(dataKey vN)--> enc:v2:<dataKeyVersion>:<iv>:<tag>:<ciphertext>
 *   dataKey   --AES-256-GCM(masterKey vM, aad=userId)--> wrapped (stored per user)
 *
 * Legacy `enc:v1:` values (hex iv:tag:ct, master key used directly) remain decryptable via `decrypt()`.
 * Rotating the master key only re-wraps data keys, so existing enc:v2 values never need re-encrypting.
 */

export const ENC_V1_PREFIX = 'enc:v1:'
export const ENC_V2_PREFIX = 'enc:v2:'

/** Pluggable key-management provider. Implement for AWS KMS / GCP KMS and register in KeyManagementService. */
export interface KmsProvider {
  readonly id: string
  /** Wrap (encrypt) a data key under master key `masterVersion`. */
  wrap(dataKey: Buffer, masterVersion: number, aad: string): Promise<string>
  unwrap(wrapped: string, masterVersion: number, aad: string): Promise<Buffer>
  /** Raw key for legacy enc:v1 values (local provider only). */
  legacyKey?(): Buffer
  describe(): { id: string; source: string; byok: boolean }
}

export class LocalKmsProvider implements KmsProvider {
  readonly id = 'local'
  private readonly base: Buffer
  private readonly source: string
  private readonly byok: boolean

  constructor(config: ConfigService) {
    const byokRaw = (config.get<string>('KMS_MASTER_KEY') ?? '').trim()
    const raw =
      byokRaw ||
      (config.get<string>('ENCRYPTION_KEY') ?? '').trim() ||
      (config.get<string>('JWT_SECRET') ?? '').trim() ||
      'openagents-local-dev-key'
    this.byok = !!byokRaw
    this.source = byokRaw ? 'KMS_MASTER_KEY' : 'ENCRYPTION_KEY/JWT_SECRET'
    const hex = raw.replace(/^0x/i, '')
    this.base = /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, 'hex') : crypto.createHash('sha256').update(raw).digest()
    // Same derivation as users.service so legacy enc:v1 values keep decrypting.
    this.legacy = (config.get<string>('ENCRYPTION_KEY') ?? '').trim() || (config.get<string>('JWT_SECRET') ?? '').trim() || 'openagents-local-dev-key'
  }

  private readonly legacy: string

  legacyKey(): Buffer {
    const hex = this.legacy.replace(/^0x/i, '')
    return /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, 'hex') : crypto.createHash('sha256').update(this.legacy).digest()
  }

  private master(version: number): Buffer {
    if (version <= 1) return this.base
    return Buffer.from(crypto.hkdfSync('sha256', this.base, 'openagents-kms', `master:v${version}`, 32))
  }

  async wrap(dataKey: Buffer, masterVersion: number, aad: string): Promise<string> {
    const iv = crypto.randomBytes(12)
    const c = crypto.createCipheriv('aes-256-gcm', this.master(masterVersion), iv)
    c.setAAD(Buffer.from(aad))
    const ct = Buffer.concat([c.update(dataKey), c.final()])
    return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64')).join('.')
  }

  async unwrap(wrapped: string, masterVersion: number, aad: string): Promise<Buffer> {
    const [iv, tag, ct] = wrapped.split('.').map((s) => Buffer.from(s, 'base64'))
    const d = crypto.createDecipheriv('aes-256-gcm', this.master(masterVersion), iv)
    d.setAAD(Buffer.from(aad))
    d.setAuthTag(tag)
    return Buffer.concat([d.update(ct), d.final()])
  }

  describe() {
    return { id: this.id, source: this.source, byok: this.byok }
  }
}

interface DataKeyRecord {
  version: number
  wrapped: string
  masterVersion: number
  createdAt: string
}
interface UserKeyFile {
  dataKeys: DataKeyRecord[]
}
export interface RotationEvent {
  id: string
  at: string
  by: string
  fromMasterVersion: number
  toMasterVersion: number
  rewrappedUsers: number
  rewrappedKeys: number
  newDataKeys: boolean
  failed: number
}
interface MasterFile {
  currentVersion: number
  history: RotationEvent[]
}

@Injectable()
export class KeyManagementService {
  private readonly logger = new Logger(KeyManagementService.name)
  private readonly providers = new Map<string, KmsProvider>()
  private readonly provider: KmsProvider
  private readonly userKeys = new UserJsonStore<UserKeyFile>('KEYS_DATA_DIR', 'keys', () => ({ dataKeys: [] }))
  private readonly master = new UserJsonStore<MasterFile>('KEYS_DATA_DIR', 'keys', () => ({ currentVersion: 1, history: [] }))
  private static readonly MASTER_ID = '_master'

  constructor(private readonly config: ConfigService) {
    const local = new LocalKmsProvider(config)
    this.registerProvider(local)
    const wanted = (config.get<string>('KMS_PROVIDER') ?? 'local').trim().toLowerCase()
    this.provider = this.providers.get(wanted) ?? local
    if (wanted !== this.provider.id) this.logger.warn(`KMS_PROVIDER "${wanted}" not registered; using local`)
  }

  registerProvider(p: KmsProvider) {
    this.providers.set(p.id, p)
  }

  private async masterVersion() {
    return (await this.master.read(KeyManagementService.MASTER_ID)).currentVersion
  }

  private async ensureDataKey(userId: string): Promise<UserKeyFile> {
    const mv = await this.masterVersion()
    return this.userKeys.update(userId, async (f) => {
      if (!f.dataKeys.length) {
        const key = crypto.randomBytes(32)
        f.dataKeys.push({ version: 1, wrapped: await this.provider.wrap(key, mv, userId), masterVersion: mv, createdAt: new Date().toISOString() })
      }
      return JSON.parse(JSON.stringify(f)) as UserKeyFile
    })
  }

  private async dataKey(userId: string, rec: DataKeyRecord) {
    return this.provider.unwrap(rec.wrapped, rec.masterVersion, userId)
  }

  async encrypt(userId: string, plain: string): Promise<string> {
    const f = await this.ensureDataKey(userId)
    const rec = f.dataKeys[f.dataKeys.length - 1]
    const key = await this.dataKey(userId, rec)
    const iv = crypto.randomBytes(12)
    const c = crypto.createCipheriv('aes-256-gcm', key, iv)
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
    return `${ENC_V2_PREFIX}${rec.version}:${[iv, c.getAuthTag(), ct].map((b) => b.toString('base64')).join(':')}`
  }

  /** Decrypts enc:v2 (envelope) and legacy enc:v1 values; non-prefixed values are returned unchanged. */
  async decrypt(userId: string, value: string): Promise<string> {
    if (value.startsWith(ENC_V2_PREFIX)) {
      const [ver, iv, tag, ct] = value.slice(ENC_V2_PREFIX.length).split(':')
      const f = await this.ensureDataKey(userId)
      const rec = f.dataKeys.find((k) => k.version === Number(ver))
      if (!rec) throw new BadRequestException('Unknown data key version')
      const d = crypto.createDecipheriv('aes-256-gcm', await this.dataKey(userId, rec), Buffer.from(iv, 'base64'))
      d.setAuthTag(Buffer.from(tag, 'base64'))
      return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8')
    }
    if (value.startsWith(ENC_V1_PREFIX)) {
      const legacy = this.provider.legacyKey?.()
      if (!legacy) throw new BadRequestException('Legacy values require the local provider')
      const [iv, tag, ct] = value.slice(ENC_V1_PREFIX.length).split(':')
      // users.service writes hex parts; oauth.service writes base64 parts.
      const enc = /^[0-9a-f]+$/i.test(iv) && iv.length === 24 ? 'hex' : 'base64'
      const d = crypto.createDecipheriv('aes-256-gcm', legacy, Buffer.from(iv, enc))
      d.setAuthTag(Buffer.from(tag, enc))
      return Buffer.concat([d.update(Buffer.from(ct, enc)), d.final()]).toString('utf8')
    }
    return value
  }

  async status(userId: string) {
    const [f, m] = await Promise.all([this.ensureDataKey(userId), this.master.read(KeyManagementService.MASTER_ID)])
    return {
      provider: this.provider.describe(),
      availableProviders: [...this.providers.keys()],
      format: { current: 'enc:v2', legacy: ['enc:v1'] },
      masterKeyVersion: m.currentVersion,
      dataKeyVersion: f.dataKeys[f.dataKeys.length - 1].version,
      dataKeys: f.dataKeys.map((k) => ({ version: k.version, masterVersion: k.masterVersion, createdAt: k.createdAt })),
      lastRotation: m.history[0] ?? null,
    }
  }

  async history() {
    return (await this.master.read(KeyManagementService.MASTER_ID)).history
  }

  /** Owner-only: bump master key version, re-wrap every user's data keys; optionally add a fresh data key version. */
  async rotate(actorId: string, opts: { rotateDataKeys?: boolean } = {}): Promise<RotationEvent> {
    const m = await this.master.read(KeyManagementService.MASTER_ID)
    const from = m.currentVersion
    const to = from + 1
    const ids = (await this.userKeys.listIds()).filter((i) => i !== KeyManagementService.MASTER_ID)
    let users = 0
    let keys = 0
    let failed = 0
    const staged: Array<{ id: string; file: UserKeyFile }> = []
    // Stage all re-wraps first so a failure cannot leave a mix of master versions.
    for (const id of ids) {
      const file = await this.userKeys.read(id)
      try {
        const next: DataKeyRecord[] = []
        for (const k of file.dataKeys) {
          const raw = await this.provider.unwrap(k.wrapped, k.masterVersion, id)
          next.push({ ...k, wrapped: await this.provider.wrap(raw, to, id), masterVersion: to })
        }
        if (opts.rotateDataKeys && next.length) {
          const nk = crypto.randomBytes(32)
          next.push({ version: next[next.length - 1].version + 1, wrapped: await this.provider.wrap(nk, to, id), masterVersion: to, createdAt: new Date().toISOString() })
        }
        staged.push({ id, file: { dataKeys: next } })
        users++
        keys += file.dataKeys.length
      } catch (e: any) {
        failed++
        this.logger.error(`Re-wrap failed for a user: ${e?.message ?? 'error'}`)
      }
    }
    if (failed) throw new BadRequestException(`Rotation aborted: ${failed} user key file(s) could not be re-wrapped; nothing changed.`)
    for (const s of staged) await this.userKeys.update(s.id, (f) => { f.dataKeys = s.file.dataKeys })
    const event: RotationEvent = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      by: actorId,
      fromMasterVersion: from,
      toMasterVersion: to,
      rewrappedUsers: users,
      rewrappedKeys: keys,
      newDataKeys: !!opts.rotateDataKeys,
      failed,
    }
    await this.master.update(KeyManagementService.MASTER_ID, (mf) => {
      mf.currentVersion = to
      mf.history = [event, ...mf.history].slice(0, 100)
    })
    return event
  }
}
