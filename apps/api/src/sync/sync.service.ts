import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import { UserJsonStore } from '../keys-sync/user-json-store'

/**
 * End-to-end encrypted sync. The server only stores opaque client-encrypted blobs
 * (AES-GCM, key derived from a passphrase via PBKDF2 in the browser) plus routing metadata.
 */
export interface SyncDevice {
  id: string
  name: string
  platform: string
  registeredAt: string
  lastSeenAt: string
  cursor: number
  revokedAt?: string
}
export interface SyncRecord {
  key: string
  version: number
  seq: number
  blob: string
  deleted: boolean
  deviceId: string
  updatedAt: string
}
export interface SyncConflict {
  id: string
  key: string
  at: string
  /** The write that was overwritten (last-writer-wins). Still ciphertext. */
  lostVersion: number
  lostDeviceId: string
  lostBlob: string
  /** The write that won. */
  winnerVersion: number
  winnerDeviceId: string
  baseVersion: number
  resolved: boolean
}
export interface SyncKeyring { salt: string; iterations: number; check: string; createdAt: string }
interface SyncFile {
  seq: number
  devices: SyncDevice[]
  records: Record<string, SyncRecord>
  conflicts: SyncConflict[]
  keyring: SyncKeyring | null
}

export const MAX_BLOB = 262144
const MAX_DEVICES = 20
const MAX_RECORDS = 5000
const MAX_CONFLICTS = 200

export interface PushRecordInput { key: string; baseVersion: number; blob: string; deleted?: boolean }

@Injectable()
export class SyncService {
  private readonly store = new UserJsonStore<SyncFile>('SYNC_DATA_DIR', 'sync', () => ({
    seq: 0, devices: [], records: {}, conflicts: [], keyring: null,
  }))

  private active(f: SyncFile, deviceId: string) {
    const d = f.devices.find((x) => x.id === deviceId)
    if (!d) throw new NotFoundException('Unknown device; register it first')
    if (d.revokedAt) throw new ForbiddenException('Device has been revoked')
    return d
  }

  async keyring(userId: string) {
    return { keyring: (await this.store.read(userId)).keyring }
  }

  async setKeyring(userId: string, k: { salt: string; iterations: number; check: string }, reset = false) {
    return this.store.update(userId, (f) => {
      if (f.keyring && !reset) throw new BadRequestException('Passphrase already configured; pass reset=true to start over (erases synced data)')
      if (reset) { f.records = {}; f.conflicts = []; f.devices.forEach((d) => { d.cursor = 0 }) }
      f.keyring = { ...k, createdAt: new Date().toISOString() }
      return { keyring: f.keyring }
    })
  }

  async state(userId: string) {
    const f = await this.store.read(userId)
    return {
      latestSeq: f.seq,
      recordCount: Object.keys(f.records).length,
      devices: f.devices,
      unresolvedConflicts: f.conflicts.filter((c) => !c.resolved).length,
      configured: !!f.keyring,
    }
  }

  async registerDevice(userId: string, name: string, platform: string) {
    return this.store.update(userId, (f) => {
      if (f.devices.filter((d) => !d.revokedAt).length >= MAX_DEVICES) throw new BadRequestException('Device limit reached; revoke one first')
      const now = new Date().toISOString()
      const d: SyncDevice = { id: crypto.randomUUID(), name, platform, registeredAt: now, lastSeenAt: now, cursor: 0 }
      f.devices.push(d)
      return d
    })
  }

  async revokeDevice(userId: string, deviceId: string) {
    return this.store.update(userId, (f) => {
      const d = f.devices.find((x) => x.id === deviceId)
      if (!d) throw new NotFoundException('Device not found')
      d.revokedAt = d.revokedAt ?? new Date().toISOString()
      return d
    })
  }

  async push(userId: string, deviceId: string, records: PushRecordInput[]) {
    return this.store.update(userId, (f) => {
      const device = this.active(f, deviceId)
      const accepted: Array<{ key: string; version: number; seq: number }> = []
      const conflicts: SyncConflict[] = []
      const now = new Date().toISOString()
      for (const r of records) {
        if (r.blob.length > MAX_BLOB) throw new BadRequestException(`Record ${r.key} exceeds ${MAX_BLOB} chars`)
        const cur = f.records[r.key]
        if (!cur && Object.keys(f.records).length >= MAX_RECORDS) throw new BadRequestException('Record limit reached')
        const version = (cur?.version ?? 0) + 1
        if (cur && r.baseVersion !== cur.version && cur.deviceId !== deviceId) {
          // Concurrent edit from another device: last writer wins, loser preserved for review.
          const c: SyncConflict = {
            id: crypto.randomUUID(), key: r.key, at: now,
            lostVersion: cur.version, lostDeviceId: cur.deviceId, lostBlob: cur.blob,
            winnerVersion: version, winnerDeviceId: deviceId, baseVersion: r.baseVersion, resolved: false,
          }
          f.conflicts.unshift(c)
          conflicts.push(c)
        }
        f.seq += 1
        f.records[r.key] = { key: r.key, version, seq: f.seq, blob: r.blob, deleted: !!r.deleted, deviceId, updatedAt: now }
        accepted.push({ key: r.key, version, seq: f.seq })
      }
      f.conflicts = f.conflicts.slice(0, MAX_CONFLICTS)
      device.lastSeenAt = now
      return { accepted, conflicts, latestSeq: f.seq }
    })
  }

  /** Returns records changed since the device cursor (or `since`) and advances the cursor. */
  async pull(userId: string, deviceId: string, since?: number) {
    return this.store.update(userId, (f) => {
      const device = this.active(f, deviceId)
      const from = since ?? device.cursor
      const records = Object.values(f.records)
        .filter((r) => r.seq > from && r.deviceId !== deviceId)
        .sort((a, b) => a.seq - b.seq)
      device.cursor = Math.max(device.cursor, f.seq)
      device.lastSeenAt = new Date().toISOString()
      return { records, cursor: device.cursor, latestSeq: f.seq }
    })
  }

  async conflicts(userId: string, includeResolved = false) {
    const f = await this.store.read(userId)
    return f.conflicts.filter((c) => includeResolved || !c.resolved)
  }

  async resolveConflict(userId: string, id: string) {
    return this.store.update(userId, (f) => {
      const c = f.conflicts.find((x) => x.id === id)
      if (!c) throw new NotFoundException('Conflict not found')
      c.resolved = true
      return c
    })
  }
}
