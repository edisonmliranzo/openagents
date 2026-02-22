import { Injectable } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  NanobotMarketplaceExportPack,
  NanobotMarketplaceVerifyResult,
  NanobotSignedMarketplacePack,
  NanobotSkillSignature,
} from '../types'

@Injectable()
export class NanobotSigningService {
  private readonly algorithm = 'HMAC-SHA256' as const
  private readonly secret = (process.env.SKILL_SIGNING_SECRET ?? 'openagents-dev-skill-signing-secret').trim()
  private readonly keyId = (process.env.SKILL_SIGNING_KEY_ID ?? 'local-dev').trim()

  signPack(pack: NanobotMarketplaceExportPack): NanobotSkillSignature {
    const signedAt = new Date().toISOString()
    const normalized = this.normalizePack(pack)
    return {
      algorithm: this.algorithm,
      keyId: this.keyId,
      signedAt,
      value: this.signValue(normalized, signedAt),
    }
  }

  attachSignature(pack: NanobotMarketplaceExportPack): NanobotSignedMarketplacePack {
    return {
      ...this.normalizePack(pack),
      signature: this.signPack(pack),
    }
  }

  verifyPack(pack: NanobotSignedMarketplacePack): NanobotMarketplaceVerifyResult {
    if (!pack || typeof pack !== 'object') {
      return {
        valid: false,
        reason: 'Pack payload is missing.',
        signature: this.fallbackSignature(),
      }
    }
    const signature = pack.signature
    if (!signature) {
      return {
        valid: false,
        reason: 'Missing signature.',
        signature: this.fallbackSignature(),
      }
    }

    if (signature.algorithm !== this.algorithm) {
      return {
        valid: false,
        reason: `Unsupported signature algorithm: ${signature.algorithm}.`,
        signature,
      }
    }

    const normalized = this.normalizePack(pack)
    const expected = this.signValue(normalized, signature.signedAt)
    const actual = signature.value.trim()
    if (!expected || !actual) {
      return { valid: false, reason: 'Invalid signature payload.', signature }
    }

    const expectedBuffer = Buffer.from(expected, 'hex')
    const actualBuffer = Buffer.from(actual, 'hex')
    if (expectedBuffer.length !== actualBuffer.length) {
      return { valid: false, reason: 'Signature length mismatch.', signature }
    }

    const valid = timingSafeEqual(expectedBuffer, actualBuffer)
    return {
      valid,
      reason: valid ? null : 'Signature verification failed.',
      signature,
    }
  }

  private signValue(pack: NanobotMarketplaceExportPack, signedAt: string) {
    const payload = `${signedAt}\n${this.stableStringify(pack)}`
    return createHmac('sha256', this.secret).update(payload).digest('hex')
  }

  private normalizePack(pack: any): NanobotMarketplaceExportPack {
    const skills = Array.isArray(pack?.skills) ? pack.skills : []
    return {
      id: typeof pack?.id === 'string' ? pack.id : '',
      version: typeof pack?.version === 'string' ? pack.version : '',
      title: typeof pack?.title === 'string' ? pack.title : '',
      description: typeof pack?.description === 'string' ? pack.description : '',
      generatedAt: typeof pack?.generatedAt === 'string' ? pack.generatedAt : '',
      ...(typeof pack?.personaProfileId === 'string' && pack.personaProfileId
        ? { personaProfileId: pack.personaProfileId }
        : {}),
      skills: skills.map((skill: any) => ({
        id: typeof skill?.id === 'string' ? skill.id : '',
        title: typeof skill?.title === 'string' ? skill.title : '',
        description: typeof skill?.description === 'string' ? skill.description : '',
        tools: Array.isArray(skill?.tools)
          ? skill.tools.filter((entry: unknown): entry is string => typeof entry === 'string')
          : [],
        ...(typeof skill?.promptAppendix === 'string' && skill.promptAppendix
          ? { promptAppendix: skill.promptAppendix }
          : {}),
      })),
    }
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value)
    if (typeof value === 'string') return JSON.stringify(value)

    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.stableStringify(entry)).join(',')}]`
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort((a, b) => a[0].localeCompare(b[0]))
      const rendered = entries.map(([key, v]) => `${JSON.stringify(key)}:${this.stableStringify(v)}`)
      return `{${rendered.join(',')}}`
    }

    return JSON.stringify(String(value))
  }

  private fallbackSignature(): NanobotSkillSignature {
    return {
      algorithm: this.algorithm,
      keyId: this.keyId,
      signedAt: new Date().toISOString(),
      value: '',
    }
  }
}
