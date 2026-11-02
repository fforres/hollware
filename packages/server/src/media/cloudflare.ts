import type { Conversion } from '@hollware/core'
import type {
  AssetCatalog,
  AssetFiles,
  AssetRow,
  ImageConverter,
  ImageInfo,
  Media,
} from '../ports.ts'

const streamOf = (bytes: Uint8Array): ReadableStream<Uint8Array> => new Blob([bytes]).stream()

const hex = (digest: ArrayBuffer) =>
  [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

function partOf(range: R2Range | undefined, size: number) {
  if (range === undefined) return null
  if ('suffix' in range && range.suffix !== undefined) {
    const length = Math.min(range.suffix, size)
    return { offset: size - length, length }
  }
  const offset = 'offset' in range && range.offset !== undefined ? range.offset : 0
  const length = 'length' in range && range.length !== undefined ? range.length : size - offset
  return { offset, length }
}

export function r2Files(bucket: R2Bucket): AssetFiles {
  const putStream = async (
    key: string,
    body: ReadableStream<Uint8Array>,
    length: number,
    contentType: string,
  ) => {
    const fixed = new FixedLengthStream(length)
    const [piped, put] = await Promise.allSettled([
      body.pipeTo(fixed.writable),
      bucket.put(key, fixed.readable, { httpMetadata: { contentType } }),
    ])
    if (put.status === 'rejected') throw put.reason
    if (piped.status === 'rejected') throw piped.reason
  }
  return {
    async put(key, bytes, contentType) {
      await bucket.put(key, bytes, { httpMetadata: { contentType } })
    },
    async get(key, range) {
      const object = range === undefined ? await bucket.get(key) : await bucket.get(key, { range })
      if (object === null) return null
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
        size: object.size,
        range: range === undefined ? null : partOf(object.range, object.size),
      }
    },
    putStream,
    async head(key, length) {
      const object = await bucket.get(key, { range: { offset: 0, length } })
      return object === null ? null : new Uint8Array(await object.arrayBuffer())
    },
    async sha256(key) {
      const object = await bucket.get(key)
      if (object === null) return null
      const digest = new crypto.DigestStream('SHA-256')
      await object.body.pipeTo(digest)
      return hex(await digest.digest)
    },
    async copy(from, to, contentType) {
      const object = await bucket.get(from)
      if (object === null) throw new Error(`No file at ${from} to copy`)
      await putStream(to, object.body, object.size, contentType)
    },
    async delete(key) {
      await bucket.delete(key)
    },
  }
}

export interface ImagesLike {
  info(stream: ReadableStream<Uint8Array>): Promise<unknown>
  input(stream: ReadableStream<Uint8Array>): TransformerLike
}

interface TransformerLike {
  transform(transform: { width: number; fit: 'scale-down' }): TransformerLike
  output(options: {
    format: 'image/webp' | 'image/avif'
    quality: number
    anim: boolean
  }): Promise<{ image(): ReadableStream<Uint8Array>; contentType(): string }>
}

export function imagesConverter(images: ImagesLike): ImageConverter {
  return {
    async info(bytes): Promise<ImageInfo> {
      const info = await images.info(streamOf(bytes))
      if (typeof info !== 'object' || info === null) throw new Error('Images answered no info')
      const format = Reflect.get(info, 'format')
      if (format === 'image/svg+xml') return { format }
      const width = Reflect.get(info, 'width')
      const height = Reflect.get(info, 'height')
      if (typeof format !== 'string' || typeof width !== 'number' || typeof height !== 'number') {
        throw new Error('Images answered an info without format, width and height')
      }
      return { format, width, height }
    },
    async convert(bytes, conversion: Conversion) {
      let transformer = images.input(streamOf(bytes))
      if (conversion.width !== undefined) {
        transformer = transformer.transform({ width: conversion.width, fit: 'scale-down' })
      }
      const result = await transformer.output({
        format: conversion.format,
        quality: conversion.quality,
        anim: conversion.anim,
      })
      const converted = new Uint8Array(await new Response(result.image()).arrayBuffer())
      return { bytes: converted, format: result.contentType() }
    },
  }
}

interface Row {
  readonly id: string
  readonly site_id: string
  readonly sha256: string
  readonly format: string
  readonly width: number | null
  readonly height: number | null
  readonly bytes: number
  readonly widths: string
  readonly original_format: string
  readonly original_bytes: number
  readonly alt: string
  readonly filename: string
  readonly created_by: string
  readonly created_at: string
}

export function widthsOf(text: string): number[] {
  try {
    const parsed: unknown = JSON.parse(text)
    return Array.isArray(parsed)
      ? parsed.filter((width): width is number => Number.isSafeInteger(width) && width > 0)
      : []
  } catch {
    return []
  }
}

const rowOf = (row: Row): AssetRow => ({
  id: row.id,
  site: row.site_id,
  sha256: row.sha256,
  format: row.format,
  width: row.width,
  height: row.height,
  bytes: row.bytes,
  widths: widthsOf(row.widths),
  originalFormat: row.original_format,
  originalBytes: row.original_bytes,
  alt: row.alt,
  filename: row.filename,
  createdBy: row.created_by,
  createdAt: row.created_at,
})

export function d1Catalog(db: D1Database): AssetCatalog {
  const byId = async (site: string, id: string) => {
    const row = await db
      .prepare('SELECT * FROM assets WHERE site_id = ? AND id = ?')
      .bind(site, id)
      .first<Row>()
    return row === null ? null : rowOf(row)
  }
  return {
    byId,
    async byIds(site, ids) {
      const rows: AssetRow[] = []
      for (let start = 0; start < ids.length; start += 90) {
        const slice = ids.slice(start, start + 90)
        const { results } = await db
          .prepare(
            `SELECT * FROM assets WHERE site_id = ? AND id IN (${slice.map(() => '?').join(', ')})`,
          )
          .bind(site, ...slice)
          .all<Row>()
        rows.push(...results.map(rowOf))
      }
      return rows
    },
    async updateAlt(site, id, alt) {
      const row = await db
        .prepare(
          'UPDATE assets SET alt = ?3, updated_at = ?4 WHERE site_id = ?1 AND id = ?2 RETURNING *',
        )
        .bind(site, id, alt, new Date().toISOString())
        .first<Row>()
      return row === null ? null : rowOf(row)
    },
    async bySha256(site, sha256) {
      const row = await db
        .prepare('SELECT * FROM assets WHERE site_id = ? AND sha256 = ?')
        .bind(site, sha256)
        .first<Row>()
      return row === null ? null : rowOf(row)
    },
    async insert(asset) {
      const written = await db
        .prepare(
          `INSERT INTO assets (id, site_id, sha256, format, width, height, bytes, widths,
             original_format, original_bytes, alt, filename, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (site_id, sha256) DO NOTHING
           RETURNING *`,
        )
        .bind(
          asset.id,
          asset.site,
          asset.sha256,
          asset.format,
          asset.width,
          asset.height,
          asset.bytes,
          JSON.stringify(asset.widths),
          asset.originalFormat,
          asset.originalBytes,
          asset.alt,
          asset.filename,
          asset.createdBy,
          asset.createdAt,
          asset.createdAt,
        )
        .first<Row>()
      if (written !== null) return { row: rowOf(written), created: true }
      const existing = await db
        .prepare('SELECT * FROM assets WHERE site_id = ? AND sha256 = ?')
        .bind(asset.site, asset.sha256)
        .first<Row>()
      if (existing === null) throw new Error(`No asset of ${asset.sha256} after a conflict`)
      return { row: rowOf(existing), created: false }
    },
    async list(site, limit, cursor) {
      const statement =
        cursor === null
          ? db
              .prepare(
                'SELECT * FROM assets WHERE site_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
              )
              .bind(site, limit)
          : db
              .prepare(
                `SELECT * FROM assets WHERE site_id = ? AND (created_at, id) < (?, ?)
                 ORDER BY created_at DESC, id DESC LIMIT ?`,
              )
              .bind(site, cursor.createdAt, cursor.id, limit)
      const { results } = await statement.all<Row>()
      return results.map(rowOf)
    },
  }
}

export interface MediaEnv {
  readonly DB: D1Database
  readonly HOLLWARE_PUBLIC_URL?: string
  readonly MEDIA?: R2Bucket
  readonly IMAGES?: ImagesBinding
}

export function mediaOfEnv(env: MediaEnv): Media | null {
  if (env.MEDIA === undefined || env.HOLLWARE_PUBLIC_URL === undefined) return null
  return {
    files: r2Files(env.MEDIA),
    images: env.IMAGES === undefined ? null : imagesConverter(env.IMAGES),
    catalog: d1Catalog(env.DB),
    baseUrl: `${env.HOLLWARE_PUBLIC_URL.replace(/\/$/, '')}/assets/`,
    download: (url) => fetch(url, { redirect: 'manual', headers: { accept: 'image/*' } }),
  }
}
