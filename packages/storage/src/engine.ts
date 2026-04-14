export interface StorageConfig {
  provider: 's3' | 'gcs' | 'local'
  bucket?: string
  region?: string
  endpoint?: string
  accessKeyId?: string
  secretAccessKey?: string
}

export interface StorageObject {
  key: string
  body: Buffer | Uint8Array | string
  contentType?: string
  metadata?: Record<string, string>
}

export interface StorageResult {
  success: boolean
  url?: string
  error?: string
}

export interface ListResult {
  success: boolean
  objects?: StorageObject[]
  error?: string
}

export class CloudStorage {
  private config: StorageConfig

  constructor(config: StorageConfig) {
    this.config = config
  }

  async upload(obj: StorageObject): Promise<StorageResult> {
    try {
      if (this.config.provider === 's3') {
        return await this.uploadS3(obj)
      } else if (this.config.provider === 'gcs') {
        return await this.uploadGCS(obj)
      } else {
        return await this.uploadLocal(obj)
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      }
    }
  }

  async download(key: string): Promise<{ success: boolean; data?: Buffer; error?: string }> {
    try {
      if (this.config.provider === 's3') {
        return await this.downloadS3(key)
      } else if (this.config.provider === 'gcs') {
        return await this.downloadGCS(key)
      } else {
        return await this.downloadLocal(key)
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Download failed',
      }
    }
  }

  async delete(key: string): Promise<StorageResult> {
    try {
      if (this.config.provider === 's3') {
        return await this.deleteS3(key)
      } else if (this.config.provider === 'gcs') {
        return await this.deleteGCS(key)
      } else {
        return await this.deleteLocal(key)
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Delete failed',
      }
    }
  }

  async list(prefix?: string): Promise<ListResult> {
    try {
      if (this.config.provider === 's3') {
        return await this.listS3(prefix)
      } else if (this.config.provider === 'gcs') {
        return await this.listGCS(prefix)
      } else {
        return await this.listLocal(prefix)
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'List failed',
      }
    }
  }

  getUrl(key: string): string {
    if (this.config.provider === 'local') {
      return `/storage/${key}`
    }

    const bucket = this.config.bucket || ''
    const region = this.config.region || 'us-east-1'

    if (this.config.provider === 's3') {
      return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
    }

    return `https://storage.googleapis.com/${bucket}/${key}`
  }

  private async uploadS3(obj: StorageObject): Promise<StorageResult> {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')

    const client = new S3Client({
      region: this.config.region || 'us-east-1',
      credentials: this.config.accessKeyId
        ? {
            accessKeyId: this.config.accessKeyId,
            secretAccessKey: this.config.secretAccessKey || '',
          }
        : undefined,
    })

    await client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: obj.key,
        Body: obj.body,
        ContentType: obj.contentType,
        Metadata: obj.metadata,
      }),
    )

    return { success: true, url: this.getUrl(obj.key) }
  }

  private async uploadGCS(_obj: StorageObject): Promise<StorageResult> {
    return { success: false, error: 'GCS not implemented' }
  }

  private async uploadLocal(obj: StorageObject): Promise<StorageResult> {
    const { writeFile, mkdir } = await import('fs/promises')
    const { dirname } = await import('path')

    const dir = dirname(`./storage/${obj.key}`)
    await mkdir(dir, { recursive: true })
    await writeFile(`./storage/${obj.key}`, obj.body)

    return { success: true, url: this.getUrl(obj.key) }
  }

  private async downloadS3(
    _key: string,
  ): Promise<{ success: boolean; data?: Buffer; error?: string }> {
    return { success: false, error: 'S3 download not implemented' }
  }

  private async downloadGCS(
    _key: string,
  ): Promise<{ success: boolean; data?: Buffer; error?: string }> {
    return { success: false, error: 'GCS download not implemented' }
  }

  private async downloadLocal(
    key: string,
  ): Promise<{ success: boolean; data?: Buffer; error?: string }> {
    const { readFile } = await import('fs/promises')
    try {
      const data = await readFile(`./storage/${key}`)
      return { success: true, data }
    } catch {
      return { success: false, error: 'File not found' }
    }
  }

  private async deleteS3(_key: string): Promise<StorageResult> {
    return { success: false, error: 'S3 delete not implemented' }
  }

  private async deleteGCS(_key: string): Promise<StorageResult> {
    return { success: false, error: 'GCS delete not implemented' }
  }

  private async deleteLocal(key: string): Promise<StorageResult> {
    const { unlink } = await import('fs/promises')
    try {
      await unlink(`./storage/${key}`)
      return { success: true }
    } catch {
      return { success: false, error: 'File not found' }
    }
  }

  private async listS3(_prefix?: string): Promise<ListResult> {
    return { success: false, objects: [] }
  }

  private async listGCS(_prefix?: string): Promise<ListResult> {
    return { success: false, objects: [] }
  }

  private async listLocal(_prefix?: string): Promise<ListResult> {
    return { success: true, objects: [] }
  }
}

export function createStorage(config: StorageConfig): CloudStorage {
  return new CloudStorage(config)
}
