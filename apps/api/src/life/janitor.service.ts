import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { promises as fs } from 'node:fs'
import { isAbsolute, join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { PrismaService } from '../prisma/prisma.service'
import { buildJanitorPlan, type JanitorFileEntry } from './life-logic'

@Injectable()
export class JanitorService {
  private readonly logger = new Logger(JanitorService.name)

  constructor(private readonly prisma: PrismaService) {}

  private resolve(folder: string): string {
    const raw = String(folder ?? '').trim()
    if (!raw) throw new BadRequestException('Give a folder path.')
    const home = homedir()
    const expanded = raw.startsWith('~') ? join(home, raw.slice(1)) : raw
    const abs = isAbsolute(expanded) ? expanded : join(home, expanded)
    const normAbs = abs.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    const normHome = home.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    const normCwd = process.cwd().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

    // Refuse roots, paths outside user home directory, or paths inside the running application repository
    const danger = [dirname(home), home, 'C:\\', 'C:/', '/']
    if (
      danger.some((d) => abs.toLowerCase() === d.toLowerCase()) ||
      !normAbs.startsWith(`${normHome}/`) ||
      normAbs.startsWith(normCwd) ||
      /(^|\/)(\.git|node_modules|\.env)(\/|$)/i.test(normAbs)
    ) {
      throw new BadRequestException('Choose a specific user folder inside your home directory (e.g. ~/Downloads), outside the application directory.')
    }
    return abs
  }

  /** Scan a folder and store a tidy plan (nothing is moved yet). */
  async scan(userId: string, folder: string) {
    const abs = this.resolve(folder)
    const entries = await fs.readdir(abs, { withFileTypes: true })
    const files: JanitorFileEntry[] = []
    for (const e of entries) {
      if (!e.isFile() || e.name.startsWith('.')) continue
      try {
        const st = await fs.stat(join(abs, e.name))
        files.push({ name: e.name, sizeBytes: st.size, modifiedAt: st.mtime })
      } catch {
        // vanished mid-scan; skip
      }
    }
    const plan = buildJanitorPlan(abs, files)
    const run = await this.prisma.janitorRun.create({
      data: { userId, folder: abs, plan: JSON.stringify(plan), status: 'planned' },
    })
    return { id: run.id, folder: abs, scanned: files.length, moves: plan }
  }

  /** Apply a scanned plan, moving/renaming one file at a time. */
  async apply(userId: string, runId: string) {
    const run = await this.prisma.janitorRun.findFirst({ where: { id: runId, userId } })
    if (!run) throw new NotFoundException('Scan not found')
    if (run.status === 'applied') throw new BadRequestException('This plan was already applied')

    const plan = JSON.parse(run.plan) as Array<{ from: string; to: string; action: string }>
    let applied = 0
    const errors: string[] = []
    for (const move of plan) {
      try {
        await fs.mkdir(dirname(move.to), { recursive: true })
        await fs.rename(move.from, move.to)
        applied += 1
      } catch (err: any) {
        errors.push(`${move.from}: ${String(err?.message ?? err)}`)
      }
    }
    await this.prisma.janitorRun.update({
      where: { id: run.id },
      data: {
        status: errors.length && applied === 0 ? 'failed' : 'applied',
        appliedAt: new Date(),
        error: errors.length ? errors.slice(0, 10).join('; ').slice(0, 1000) : null,
      },
    })
    this.logger.log(`Janitor applied ${applied}/${plan.length} moves in ${run.folder}`)
    return { applied, total: plan.length, errors: errors.slice(0, 10) }
  }

  list(userId: string) {
    return this.prisma.janitorRun.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 })
  }
}
