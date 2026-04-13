export interface OcrConfig {
  language?: string
  enhanceImage?: boolean
}

export interface OcrInput {
  imageData: Buffer | Uint8Array | string
  language?: string
}

export interface OcrResult {
  success: boolean
  text: string
  confidence: number
  blocks: OcrBlock[]
  error?: string
}

export interface OcrBlock {
  text: string
  confidence: number
  boundingBox: BoundingBox
  lines: OcrLine[]
}

export interface OcrLine {
  text: string
  confidence: number
  boundingBox: BoundingBox
  words: OcrWord[]
}

export interface OcrWord {
  text: string
  confidence: number
  boundingBox: BoundingBox
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface PdfOcrInput {
  pdfData: Buffer | Uint8Array
  pageNumbers?: number[]
  language?: string
}

export interface PdfOcrResult {
  success: boolean
  pages: PdfPageResult[]
  error?: string
}

export interface PdfPageResult {
  pageNumber: number
  text: string
  blocks: OcrBlock[]
}

export interface TableExtractionInput {
  imageData: Buffer | Uint8Array | string
  detectTables?: boolean
}

export interface TableExtractionResult {
  success: boolean
  tables: Table[]
  error?: string
}

export interface Table {
  rows: string[][]
  boundingBox: BoundingBox
  confidence: number
}

export class OcrEngine {
  private config: OcrConfig

  constructor(config: OcrConfig = {}) {
    this.config = config
  }

  async recognize(input: OcrInput): Promise<OcrResult> {
    try {
      const language = input.language || this.config.language || 'eng'

      const tesseract = await import('tesseract.js')
      const worker = await tesseract.createWorker(language)

      const result = await worker.recognize(input.imageData)

      await worker.terminate()

      const blocks = this.parseBlocks(result.data)

      return {
        success: true,
        text: result.data.text,
        confidence: result.data.confidence,
        blocks,
      }
    } catch (err) {
      return {
        success: false,
        text: '',
        confidence: 0,
        blocks: [],
        error: err instanceof Error ? err.message : 'OCR failed',
      }
    }
  }

  async recognizePdf(input: PdfOcrInput): Promise<PdfOcrResult> {
    try {
      const pdfjs = await import('pdfjs-dist')
      const tesseract = await import('tesseract.js')

      const pdf = await pdfjs.getDocument({ data: input.pdfData }).promise
      const pages: PdfPageResult[] = []

      const pageNumbers = input.pageNumbers || Array.from({ length: pdf.numPages }, (_, i) => i + 1)

      for (const pageNum of pageNumbers) {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 2.0 })

        const canvas = new OffscreenCanvas(viewport.width, viewport.height)
        const ctx = canvas.getContext('2d')!

        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise

        const blob = await canvas.convertToBlob()
        const arrayBuffer = await blob.arrayBuffer()

        const language = input.language || this.config.language || 'eng'
        const worker = await tesseract.createWorker(language)
        const result = await worker.recognize(arrayBuffer)
        await worker.terminate()

        pages.push({
          pageNumber: pageNum,
          text: result.data.text,
          blocks: this.parseBlocks(result.data),
        })
      }

      return { success: true, pages }
    } catch (err) {
      return {
        success: false,
        pages: [],
        error: err instanceof Error ? err.message : 'PDF OCR failed',
      }
    }
  }

  async extractTables(input: TableExtractionInput): Promise<TableExtractionResult> {
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')

      const result = await worker.recognize(input.imageData)
      await worker.terminate()

      const tables = this.parseTables(result.data)

      return { success: true, tables }
    } catch (err) {
      return {
        success: false,
        tables: [],
        error: err instanceof Error ? err.message : 'Table extraction failed',
      }
    }
  }

  private parseBlocks(data: tesseract.Page): OcrBlock[] {
    return data.words.map((word) => ({
      text: word.text,
      confidence: word.confidence,
      boundingBox: {
        x: word.bbox.x0,
        y: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0,
      },
      lines: [],
    }))
  }

  private parseTables(data: tesseract.Page): Table[] {
    const tables: Table[] = []
    const lines = data.lines || []

    let currentTable: string[][] = []
    let currentRow: string[] = []

    for (const line of lines) {
      const cells = line.text.split(/\|/).map((c) => c.trim())

      if (cells.length > 1) {
        currentRow.push(...cells)
      } else if (currentRow.length > 0) {
        currentTable.push(currentRow)
        currentRow = []
      }
    }

    if (currentTable.length > 0) {
      tables.push({
        rows: currentTable,
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
        confidence: data.confidence,
      })
    }

    return tables
  }
}

export function createOcr(config?: OcrConfig): OcrEngine {
  return new OcrEngine(config)
}
