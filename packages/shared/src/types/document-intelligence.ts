// Document intelligence types
export interface DocumentExtraction {
  id: string
  userId: string
  sourceType: 'pdf' | 'docx' | 'image' | 'webpage' | 'email'
  sourceUrl: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  extractedData: ExtractedData
  confidence: number
  metadata: DocumentMetadata
  createdAt: string
  completedAt?: string
}

export interface ExtractedData {
  text: string
  structured?: Record<string, unknown>
  entities: ExtractedEntity[]
  tables: ExtractedTable[]
  images: ExtractedImage[]
}

export interface ExtractedEntity {
  type: 'person' | 'organization' | 'date' | 'location' | 'money' | 'email' | 'phone' | 'url' | 'custom'
  value: string
  confidence: number
  startIndex: number
  endIndex: number
}

export interface ExtractedTable {
  headers: string[]
  rows: string[][]
  confidence: number
}

export interface ExtractedImage {
  index: number
  description?: string
  altText?: string
  boundingBox?: BoundingBox
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface DocumentMetadata {
  title?: string
  author?: string
  createdDate?: string
  modifiedDate?: string
  pageCount?: number
  fileSize?: number
  language?: string
}

export interface ExtractionTemplate {
  id: string
  userId: string
  name: string
  description: string
  schema: Record<string, {
    type: string
    description: string
    required: boolean
    pattern?: string
  }>
  isBuiltIn: boolean
  createdAt: string
}
