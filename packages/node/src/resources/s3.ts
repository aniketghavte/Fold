// packages/node/src/resources/s3.ts
// S3Resource — maps VFS paths to S3 objects.
// Also works with S3-compatible services (R2, MinIO, etc.)
// Requires: npm install @aws-sdk/client-s3

import type { Resource, Entry, FileStat } from '@fold/core'

// Lazy-load AWS SDK to keep it as optional peer dep
let S3ClientModule: typeof import('@aws-sdk/client-s3') | null = null
async function getS3Module() {
  if (!S3ClientModule) {
    S3ClientModule = await import('@aws-sdk/client-s3')
  }
  return S3ClientModule
}

/**
 * Configuration for S3Resource.
 */
export interface S3Config {
  /** S3 bucket name */
  bucket: string
  /** AWS region (default: us-east-1) */
  region?: string
  /** Optional root prefix within the bucket */
  prefix?: string
  /** Custom endpoint for R2, MinIO, etc. */
  endpoint?: string
}

/**
 * S3Resource — maps VFS operations to S3 (or S3-compatible) objects.
 *
 * @example
 * ```ts
 * const ws = new Workspace({
 *   '/s3': new S3Resource({ bucket: 'my-bucket' }),
 *   '/r2': new S3Resource({ bucket: 'my-r2', endpoint: 'https://xxx.r2.cloudflarestorage.com' }),
 * })
 * await ws.execute('ls /s3/reports/')
 * await ws.execute('cp /s3/report.csv /notes/may-report.csv')
 * ```
 */
export class S3Resource implements Resource {
  private client: import('@aws-sdk/client-s3').S3Client | null = null
  private bucket: string
  private prefix: string
  private region: string
  private endpoint?: string

  constructor(config: S3Config) {
    this.bucket = config.bucket
    this.prefix = config.prefix ?? ''
    this.region = config.region ?? 'us-east-1'
    this.endpoint = config.endpoint
  }

  private async getClient(): Promise<import('@aws-sdk/client-s3').S3Client> {
    if (!this.client) {
      const { S3Client } = await getS3Module()
      this.client = new S3Client({
        region: this.region,
        endpoint: this.endpoint,
      })
    }
    return this.client
  }

  private key(vfsPath: string): string {
    return (this.prefix + vfsPath.replace(/^\//, '')).replace(/^\//, '')
  }

  async list(vfsPath: string): Promise<Entry[]> {
    const s3 = await getS3Module()
    const client = await this.getClient()
    const prefix = this.key(vfsPath)
    const res = await client.send(
      new s3.ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix ? prefix + '/' : '',
        Delimiter: '/',
      })
    )
    const files = (res.Contents ?? [])
      .filter(obj => obj.Key !== prefix + '/') // exclude the directory marker itself
      .map(obj => ({
        name: obj.Key!.split('/').pop()!,
        path: '/' + obj.Key!.replace(this.prefix, ''),
        type: 'file' as const,
        size: obj.Size,
        modifiedAt: obj.LastModified,
      }))
    const dirs = (res.CommonPrefixes ?? []).map(p => ({
      name: p.Prefix!.split('/').filter(Boolean).pop()!,
      path: '/' + p.Prefix!.replace(this.prefix, '').replace(/\/$/, ''),
      type: 'directory' as const,
    }))
    return [...dirs, ...files]
  }

  async read(vfsPath: string): Promise<Buffer> {
    const s3 = await getS3Module()
    const client = await this.getClient()
    const res = await client.send(
      new s3.GetObjectCommand({ Bucket: this.bucket, Key: this.key(vfsPath) })
    )
    const chunks: Buffer[] = []
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  async write(vfsPath: string, data: Buffer): Promise<void> {
    const s3 = await getS3Module()
    const client = await this.getClient()
    await client.send(
      new s3.PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(vfsPath),
        Body: data,
      })
    )
  }

  async stat(vfsPath: string): Promise<FileStat> {
    try {
      const s3 = await getS3Module()
      const client = await this.getClient()
      const res = await client.send(
        new s3.HeadObjectCommand({ Bucket: this.bucket, Key: this.key(vfsPath) })
      )
      return {
        type: 'file',
        size: res.ContentLength,
        modifiedAt: res.LastModified,
        exists: true,
      }
    } catch {
      return { type: 'file', exists: false }
    }
  }

  async delete(vfsPath: string): Promise<void> {
    const s3 = await getS3Module()
    const client = await this.getClient()
    await client.send(
      new s3.DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(vfsPath) })
    )
  }
}
