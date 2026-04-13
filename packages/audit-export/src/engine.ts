export interface AuditEntry {
  id: string
  timestamp: string
  userId?: string
  action: string
  resourceType: string
  resourceId?: string
  details?: Record<string, unknown>
  ipAddress?: string
}

export interface ExportConfig {
  format: 'json' | 'csv' | 'xlsx' | 'pdf'
  dateRange?: { start: string; end: string }
  userIds?: string[]
  actions?: string[]
  resourceTypes?: string[]
}

export interface ComplianceReport {
  format: 'soc2' | 'gdpr' | 'hipaa'
  entries: AuditEntry[]
  generatedAt: string
  period: { start: string; end: string }
}

export class AuditExporter {
  async export(entries: AuditEntry[], config: ExportConfig): Promise<Buffer | string> {
    switch (config.format) {
      case 'json':
        return this.exportJson(entries)
      case 'csv':
        return this.exportCsv(entries)
      case 'xlsx':
        return this.exportXlsx(entries)
      case 'pdf':
        return this.exportPdf(entries)
      default:
        throw new Error(`Unsupported format: ${config.format}`)
    }
  }

  async filterEntries(entries: AuditEntry[], config: ExportConfig): Promise<AuditEntry[]> {
    let filtered = entries

    if (config.dateRange) {
      filtered = filtered.filter((e) => {
        const ts = new Date(e.timestamp).getTime()
        const start = new Date(config.dateRange!.start).getTime()
        const end = new Date(config.dateRange!.end).getTime()
        return ts >= start && ts <= end
      })
    }

    if (config.userIds?.length) {
      filtered = filtered.filter((e) => config.userIds!.includes(e.userId || ''))
    }

    if (config.actions?.length) {
      filtered = filtered.filter((e) => config.actions!.includes(e.action))
    }

    if (config.resourceTypes?.length) {
      filtered = filtered.filter((e) => config.resourceTypes!.includes(e.resourceType))
    }

    return filtered
  }

  async generateComplianceReport(
    entries: AuditEntry[],
    format: ComplianceReport['format'],
  ): Promise<ComplianceReport> {
    const timestamps = entries.map((e) => new Date(e.timestamp).getTime())
    const minTs = Math.min(...timestamps)
    const maxTs = Math.max(...timestamps)

    const filtered = entries.filter((e) => {
      if (format === 'gdpr') {
        return (
          e.action.includes('delete') || e.action.includes('export') || e.action.includes('access')
        )
      }
      if (format === 'hipaa') {
        return e.resourceType.includes('health') || e.resourceType.includes('patient')
      }
      return true
    })

    return {
      format,
      entries: filtered,
      generatedAt: new Date().toISOString(),
      period: {
        start: new Date(minTs).toISOString(),
        end: new Date(maxTs).toISOString(),
      },
    }
  }

  private async exportJson(entries: AuditEntry[]): Promise<string> {
    return JSON.stringify(entries, null, 2)
  }

  private async exportCsv(entries: AuditEntry[]): Promise<string> {
    const headers = [
      'id',
      'timestamp',
      'userId',
      'action',
      'resourceType',
      'resourceId',
      'ipAddress',
    ]
    const rows = entries.map((e) =>
      headers.map((h) => {
        const value = (e as unknown as Record<string, unknown>)[h]
        const str = String(value || '')
        return str.includes(',') ? `"${str}"` : str
      }),
    )

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  }

  private async exportXlsx(entries: AuditEntry[]): Promise<Buffer> {
    const xlsx = await import('xlsx')
    const worksheet = xlsx.utils.json_to_sheet(entries)
    const workbook = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Audit')

    return Buffer.from(xlsx.write(workbook, { type: 'buffer' }))
  }

  private async exportPdf(entries: AuditEntry[]): Promise<Buffer> {
    const pdf = await import('pdfkit')
    const chunks: Buffer[] = []

    const doc = new pdf.default()
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))

    doc.fontSize(16).text('Audit Report', { align: 'center' })
    doc.moveDown()

    doc.fontSize(10)

    for (const entry of entries.slice(0, 50)) {
      doc.text(
        `${entry.timestamp} | ${entry.action} | ${entry.resourceType} | ${entry.userId || 'N/A'}`,
      )
    }

    if (entries.length > 50) {
      doc.moveDown()
      doc.text(`... and ${entries.length - 50} more entries`)
    }

    doc.end()

    return Buffer.concat(chunks)
  }
}

export function createAuditExporter(): AuditExporter {
  return new AuditExporter()
}
