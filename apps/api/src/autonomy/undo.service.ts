import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ToolsService } from '../tools/tools.service'
import { planCompensation } from './autonomy-logic'

@Injectable()
export class UndoService {
  private readonly logger = new Logger(UndoService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: ToolsService,
  ) {}

  /** Called by the task runtime right after a side-effecting tool succeeds. */
  async record(userId: string, taskId: string | null, tool: string, input: Record<string, unknown>, output: unknown) {
    const compensation = planCompensation(tool, input, output)
    await this.prisma.actionJournalEntry
      .create({
        data: {
          userId,
          taskId: taskId ?? undefined,
          tool: tool.slice(0, 120),
          input: JSON.stringify(input ?? {}).slice(0, 4000),
          output: typeof output === 'string' ? output.slice(0, 4000) : JSON.stringify(output ?? {}).slice(0, 4000),
          compensation: compensation ? JSON.stringify(compensation).slice(0, 1000) : null,
        },
      })
      .catch((err) => this.logger.warn(`Journal write failed: ${err?.message ?? err}`))
  }

  list(userId: string, limit = 60) {
    return this.prisma.actionJournalEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    })
  }

  /** Undo one journaled action by executing its compensating call. */
  async undo(userId: string, id: string) {
    const entry = await this.prisma.actionJournalEntry.findFirst({ where: { id, userId } })
    if (!entry) throw new NotFoundException('Journal entry not found')
    if (entry.undoneAt) throw new BadRequestException('Already undone')
    if (!entry.compensation) {
      throw new BadRequestException('This action cannot be reverted automatically. Undo it manually in the source app.')
    }

    let comp: { tool: string; input: Record<string, unknown> }
    try {
      comp = JSON.parse(entry.compensation)
    } catch {
      throw new BadRequestException('Stored compensation is malformed')
    }

    const available = await this.tools.getAvailableForUser(userId).catch(() => [] as any[])
    if (!available.some((t: any) => t.name === comp.tool)) {
      throw new BadRequestException(`Compensating tool "${comp.tool}" is not available. Enable it and retry.`)
    }

    const res: any = await this.tools.execute(comp.tool, comp.input, userId)
    if (res?.success === false) throw new BadRequestException(`Undo failed: ${String(res?.error ?? 'tool reported failure')}`)

    await this.prisma.actionJournalEntry.update({ where: { id }, data: { undoneAt: new Date() } })
    return { ok: true, revertedWith: comp.tool }
  }

  /** Undo everything a task did, newest first. */
  async undoTask(userId: string, taskId: string) {
    const entries = await this.prisma.actionJournalEntry.findMany({
      where: { userId, taskId, undoneAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const results: Array<{ id: string; tool: string; ok: boolean; detail?: string }> = []
    for (const entry of entries) {
      if (!entry.compensation) {
        results.push({ id: entry.id, tool: entry.tool, ok: false, detail: 'no automatic compensation' })
        continue
      }
      try {
        const comp = JSON.parse(entry.compensation) as { tool: string; input: Record<string, unknown> }
        const res: any = await this.tools.execute(comp.tool, comp.input, userId)
        const ok = res?.success !== false
        if (ok) await this.prisma.actionJournalEntry.update({ where: { id: entry.id }, data: { undoneAt: new Date() } })
        results.push({ id: entry.id, tool: entry.tool, ok, detail: ok ? undefined : String(res?.error ?? 'failed') })
      } catch (err: any) {
        results.push({ id: entry.id, tool: entry.tool, ok: false, detail: String(err?.message ?? err) })
      }
    }
    return { reverted: results.filter((r) => r.ok).length, results }
  }
}
