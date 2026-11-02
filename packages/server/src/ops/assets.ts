import {
  assetIdOf,
  assetIdsIn,
  resolveAssetReferences,
  checkSvg,
  conversionOf,
  isImageFormat,
  MAX_ASSET_BYTES,
  sniffAsset,
  srcsetOf,
  variantConversion,
  variantWidthsOf,
  type AssetFormat,
  type FileFormat,
  type ImageFormat,
} from '@hollware/core'
import type { AssetRow, Media } from '../ports.ts'
import { actorOf } from './actor.ts'
import type { OperationContext, OperationHandler } from './types.ts'

const NO_BUCKET = {
  message: 'This Hollware keeps no images: its Worker has no R2 bucket bound as MEDIA.',
  fix: 'Add { "binding": "MEDIA", "bucket_name": "<name>" } to r2_buckets in wrangler.jsonc, and run hollware deploy, which creates the bucket.',
}

export const servedKey = (site: string, id: string) => `sites/${site}/${id}`
export const originalKey = (site: string, id: string) => `originals/${site}/${id}`
export const variantKey = (site: string, id: string, width: number) =>
  `${servedKey(site, id)}/${width}`
export const uploadKey = (site: string, upload: string) => `uploads/${site}/${upload}`

export function assetView(row: AssetRow, media: Media) {
  const url = `${media.baseUrl}${row.site}/${row.id}`
  return {
    id: row.id,
    reference: `asset:${row.id}`,
    url,
    format: row.format as AssetFormat,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    widths: [...row.widths],
    srcset: srcsetOf(url, row),
    originalFormat: row.originalFormat as AssetFormat,
    originalBytes: row.originalBytes,
    alt: row.alt,
    filename: row.filename,
    createdAt: row.createdAt,
  }
}

const STATUS_OF_PROBLEM = new WeakMap<object, 400 | 413 | 415>()

const refused = (message: string, fix: string, status?: 400 | 413 | 415) => {
  const problem = { message, fix }
  if (status !== undefined) STATUS_OF_PROBLEM.set(problem, status)
  return { outcome: 'refused', problem } as const
}

type Refusal = ReturnType<typeof refused>

export function statusOfRefusal(output: { readonly problem?: object | undefined }): number {
  return output.problem === undefined ? 422 : (STATUS_OF_PROBLEM.get(output.problem) ?? 422)
}

const MAX_REDIRECTS = 5

const URL_FIX =
  'Give a public https URL that answers the file itself, or send the file in base64 as data.'

function tooBig(bytes: number): Refusal {
  return refused(
    `The file is ${bytes} bytes, more than the ${MAX_ASSET_BYTES} an image may be.`,
    'Make it smaller (fewer pixels, or a format such as WebP) and upload it again.',
    413,
  )
}

function tooBigForSite(bytes: number, most: number): Refusal {
  return refused(
    `The file is ${bytes} bytes, more than the ${most} the site takes.`,
    'Make it smaller, or raise maxBytes in the media setting of the site with update_site.',
    413,
  )
}

const NOT_TAKEN = refused(
  'This file is not one Hollware takes: an image (JPEG, PNG, WebP, AVIF, GIF or SVG), a video (MP4 or WebM) or a PDF, judged by its bytes.',
  'Export it as one of those formats and upload it again.',
  415,
)

const CUT_SHORT = refused(
  'The upload ended before the whole file arrived: nothing was kept.',
  'Send it again.',
  400,
)

export interface Streamed {
  readonly body: ReadableStream<Uint8Array>
  readonly length: number
}

const isRefusal = (value: Uint8Array | Refusal | Streamed): value is Refusal => 'outcome' in value

async function bytesOfUrl(media: Media, url: string): Promise<Uint8Array | Refusal | Streamed> {
  let at = url
  for (let hops = 0; ; hops++) {
    if (!URL.canParse(at) || new URL(at).protocol !== 'https:') {
      return refused(
        hops === 0
          ? `${url} is not an https URL.`
          : `${url} redirected to ${at}, which is not an https URL.`,
        URL_FIX,
      )
    }
    let response: Response
    try {
      response = await media.download(at)
    } catch (cause) {
      return refused(`${at} could not be fetched: ${String(cause)}.`, URL_FIX)
    }
    const location = response.headers.get('location')
    if (response.status < 300 || response.status > 399 || location === null) {
      return bytesOfResponse(at, response)
    }
    await response.body?.cancel()
    if (hops === MAX_REDIRECTS) {
      return refused(`${url} redirected more than ${MAX_REDIRECTS} times.`, URL_FIX)
    }
    at = URL.canParse(location, at) ? new URL(location, at).href : location
  }
}

async function bytesOfResponse(
  url: string,
  response: Response,
): Promise<Uint8Array | Refusal | Streamed> {
  if (!response.ok || response.body === null) {
    await response.body?.cancel()
    return refused(`${url} answered ${response.status}.`, URL_FIX)
  }
  const declared = Number(response.headers.get('content-length'))
  if (Number.isSafeInteger(declared) && declared > MAX_ASSET_BYTES) {
    return { body: response.body, length: declared }
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > MAX_ASSET_BYTES) {
      await reader.cancel()
      return refused(
        `${url} answered more than ${MAX_ASSET_BYTES} bytes without a Content-Length.`,
        'Give a URL that declares the Content-Length of the file, so Hollware streams it to R2, or send a smaller file.',
      )
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

function bytesOfBase64(data: string): Uint8Array | Refusal {
  const clean = data.replace(/\s/g, '')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) {
    return refused('data is not base64.', 'Send the file encoded in base64, with its padding.')
  }
  const binary = atob(clean)
  if (binary.length > MAX_ASSET_BYTES) return tooBig(binary.length)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const BYTES_PER_SPREAD = 0x8000

export function base64Of(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += BYTES_PER_SPREAD) {
    binary += String.fromCharCode(...bytes.subarray(start, start + BYTES_PER_SPREAD))
  }
  return btoa(binary)
}

async function sha256Of(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const IMAGES_NOT_AN_IMAGE = 9412
const IMAGES_CANNOT_DECODE = 9516
const IMAGES_NO_ALLOWANCE_LEFT = 9422

function imagesCode(error: unknown): number | null {
  const code: unknown =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : null
  if (typeof code === 'number') return code
  const match = /\b(9\d{3})\b/.exec(error instanceof Error ? error.message : String(error))
  return match === null ? null : Number(match[1])
}

const NOT_READABLE = refused(
  'Cloudflare Images could not read this file as an image: it may be damaged or cut short.',
  'Open it in an image editor, save it again, and upload that.',
)

const NO_ALLOWANCE = {
  outcome: 'unavailable',
  problem: {
    message:
      "This month's allowance of image conversions is used up (5,000 on Cloudflare's Free plan): nothing was kept.",
    fix: 'Upload it next month, set the media format of the site to "original" to keep files as they come, or move the account to the Paid plan of Images.',
  },
} as const

type UploadOutput = Awaited<ReturnType<OperationHandler<'upload_asset'>>>

interface Described {
  readonly filename: string
  readonly alt: string
}

export const uploadAsset: OperationHandler<'upload_asset'> = async (input, context) => {
  const media = context.media ?? null
  if (media === null) return { outcome: 'unavailable', problem: NO_BUCKET }
  if ((input.data === undefined) === (input.url === undefined)) {
    return refused(
      'Send the file once: as data, in base64, or as url, never both or neither.',
      'Give data with the file in base64, or url with a public https URL of it.',
    )
  }
  const original =
    input.url === undefined ? bytesOfBase64(input.data ?? '') : await bytesOfUrl(media, input.url)
  if (isRefusal(original)) return original
  if (!(original instanceof Uint8Array)) return await uploadStream(input, original, context)
  const format = sniffAsset(original)
  if (format === null) return NOT_TAKEN
  return isImageFormat(format)
    ? await keepImage(media, context, input, original, format)
    : await keepFile(media, context, input, original, format)
}

export async function uploadStream(
  described: Described,
  streamed: Streamed,
  context: OperationContext,
): Promise<UploadOutput> {
  const media = context.media ?? null
  if (media === null) {
    await streamed.body.cancel()
    return { outcome: 'unavailable', problem: NO_BUCKET }
  }
  const most = context.site.media.maxBytes
  if (streamed.length > Math.max(most, MAX_ASSET_BYTES)) {
    await streamed.body.cancel()
    return tooBigForSite(streamed.length, most)
  }
  const site = context.site.key
  const upload = uploadKey(site, crypto.randomUUID())
  try {
    try {
      await media.files.putStream(upload, streamed.body, streamed.length, OCTET_STREAM)
    } catch (error) {
      if (isCutShort(error)) return CUT_SHORT
      throw error
    }
    const size = streamed.length
    const head = await media.files.head(upload, SNIFFED_BYTES)
    const format = head === null ? null : sniffAsset(head)
    if (format === null) return NOT_TAKEN
    if (isImageFormat(format)) {
      if (size > MAX_ASSET_BYTES) return tooBig(size)
      const file = await media.files.get(upload)
      if (file === null) throw new Error(`No file at ${upload} after it was written`)
      const bytes = new Uint8Array(await new Response(file.body).arrayBuffer())
      return await keepImage(media, context, described, bytes, format)
    }
    if (size > most) return tooBigForSite(size, most)
    const sha256 = await media.files.sha256(upload)
    if (sha256 === null) throw new Error(`No file at ${upload} after it was written`)
    const existing = await media.catalog.bySha256(site, sha256)
    if (existing !== null) return { outcome: 'exists', asset: assetView(existing, media) }
    const id = await assetIdOf(site, sha256)
    await media.files.copy(upload, servedKey(site, id), format)
    return await recordFile(media, context, described, { id, sha256, format, bytes: size })
  } finally {
    await media.files.delete(upload)
  }
}

const OCTET_STREAM = 'application/octet-stream'
const SNIFFED_BYTES = 512

function isCutShort(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /network connection lost|fixedlengthstream|expected|fewer bytes|more bytes/i.test(message)
}

async function keepFile(
  media: Media,
  context: OperationContext,
  described: Described,
  bytes: Uint8Array,
  format: FileFormat,
): Promise<UploadOutput> {
  const most = context.site.media.maxBytes
  if (bytes.length > most) return tooBigForSite(bytes.length, most)
  const site = context.site.key
  const sha256 = await sha256Of(bytes)
  const existing = await media.catalog.bySha256(site, sha256)
  if (existing !== null) return { outcome: 'exists', asset: assetView(existing, media) }
  const id = await assetIdOf(site, sha256)
  await media.files.put(servedKey(site, id), bytes, format)
  return await recordFile(media, context, described, { id, sha256, format, bytes: bytes.length })
}

async function recordFile(
  media: Media,
  context: OperationContext,
  described: Described,
  file: {
    readonly id: string
    readonly sha256: string
    readonly format: FileFormat
    readonly bytes: number
  },
): Promise<UploadOutput> {
  const { row, created } = await media.catalog.insert({
    id: file.id,
    site: context.site.key,
    sha256: file.sha256,
    format: file.format,
    width: null,
    height: null,
    bytes: file.bytes,
    widths: [],
    originalFormat: file.format,
    originalBytes: file.bytes,
    alt: described.alt,
    filename: described.filename,
    createdBy: actorOf(context).userId,
    createdAt: context.clock.now().toISOString(),
  })
  return { outcome: created ? 'created' : 'exists', asset: assetView(row, media) }
}

async function keepImage(
  media: Media,
  context: OperationContext,
  described: Described,
  original: Uint8Array,
  originalFormat: ImageFormat,
): Promise<UploadOutput> {
  const sha256 = await sha256Of(original)
  const site = context.site.key
  const existing = await media.catalog.bySha256(site, sha256)
  if (existing !== null) return { outcome: 'exists', asset: assetView(existing, media) }
  const id = await assetIdOf(site, sha256)

  let served = original
  let format: string = originalFormat
  let width: number | null = null
  let height: number | null = null
  if (originalFormat === 'image/svg+xml') {
    const problem = checkSvg(new TextDecoder().decode(original))
    if (problem !== null) return refused(`This SVG is refused: ${problem.reason}.`, problem.fix)
  } else if (media.images !== null) {
    try {
      const info = await media.images.info(original)
      if ('width' in info) {
        width = info.width
        height = info.height
      }
      const conversion = conversionOf(originalFormat, width, context.site.media)
      if (conversion !== null) {
        const converted = await media.images.convert(original, conversion)
        served = converted.bytes
        format = converted.format
        if (conversion.width !== undefined && width !== null && height !== null) {
          height = Math.max(1, Math.round((height * conversion.width) / width))
          width = conversion.width
        }
      }
    } catch (error) {
      const code = imagesCode(error)
      if (code === IMAGES_NO_ALLOWANCE_LEFT) return NO_ALLOWANCE
      if (code === IMAGES_NOT_AN_IMAGE || code === IMAGES_CANNOT_DECODE) return NOT_READABLE
      throw error
    }
  }

  const variants = await variantsOf(media, original, originalFormat, format, width, context)
  await media.files.put(servedKey(site, id), served, format)
  if (context.site.media.keepOriginals) {
    await media.files.put(originalKey(site, id), original, originalFormat)
  }
  for (const variant of variants) {
    await media.files.put(variantKey(site, id, variant.width), variant.bytes, variant.format)
  }
  const { row, created } = await media.catalog.insert({
    id,
    site,
    sha256,
    format,
    width,
    height,
    bytes: served.length,
    widths: variants.map((variant) => variant.width),
    originalFormat,
    originalBytes: original.length,
    alt: described.alt,
    filename: described.filename,
    createdBy: actorOf(context).userId,
    createdAt: context.clock.now().toISOString(),
  })
  return { outcome: created ? 'created' : 'exists', asset: assetView(row, media) }
}

async function variantsOf(
  media: Media,
  original: Uint8Array,
  originalFormat: ImageFormat,
  format: string,
  width: number | null,
  context: OperationContext,
) {
  const made: { width: number; bytes: Uint8Array; format: string }[] = []
  if (media.images === null || (format !== 'image/webp' && format !== 'image/avif')) return made
  for (const copy of variantWidthsOf(format, width, context.site.media)) {
    try {
      const converted = await media.images.convert(
        original,
        variantConversion(format, originalFormat, copy, context.site.media),
      )
      made.push({ width: copy, ...converted })
    } catch (error) {
      if (imagesCode(error) === IMAGES_NO_ALLOWANCE_LEFT) break
      throw error
    }
  }
  return made
}

export const cursorOf = (row: { readonly createdAt: string; readonly id: string }) =>
  btoa(`${row.createdAt}|${row.id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function parseCursor(cursor: string | undefined) {
  if (cursor === undefined) return null
  try {
    const padded = cursor.replace(/-/g, '+').replace(/_/g, '/')
    const [createdAt, id] = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)).split('|')
    return createdAt !== undefined && id !== undefined ? { createdAt, id } : null
  } catch {
    return null
  }
}

export const listAssets: OperationHandler<'list_assets'> = async (input, context) => {
  const media = context.media ?? null
  if (media === null) return { outcome: 'ok', assets: [], nextCursor: null }
  const rows = await media.catalog.list(
    context.site.key,
    input.limit + 1,
    parseCursor(input.cursor),
  )
  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  return {
    outcome: 'ok',
    assets: page.map((row) => assetView(row, media)),
    nextCursor: rows.length > input.limit && last !== undefined ? cursorOf(last) : null,
  }
}

export const getAsset: OperationHandler<'get_asset'> = async (input, context) => {
  const media = context.media ?? null
  if (media === null) return { outcome: 'not_found' }
  const row = await media.catalog.byId(context.site.key, input.id)
  return row === null ? { outcome: 'not_found' } : { outcome: 'ok', asset: assetView(row, media) }
}

export const updateAsset: OperationHandler<'update_asset'> = async (input, context) => {
  const media = context.media ?? null
  const row = media === null ? null : await media.catalog.byId(context.site.key, input.id)
  if (media === null || row === null) return { outcome: 'not_found' }
  const alt = input.alt.trim()
  if (row.alt === alt) return { outcome: 'unchanged', asset: assetView(row, media) }
  const updated = await media.catalog.updateAlt(context.site.key, input.id, alt)
  return updated === null
    ? { outcome: 'not_found' }
    : { outcome: 'updated', asset: assetView(updated, media) }
}

export function assetUrlOf(
  context: Pick<OperationContext, 'media' | 'site'>,
): (id: string) => string {
  const base = context.media?.baseUrl
  return (id) => (base === undefined ? `asset:${id}` : `${base}${context.site.key}/${id}`)
}

export function forReaders<T>(
  context: Pick<OperationContext, 'media' | 'site' | 'view' | 'reader'>,
  value: T,
): T {
  return readsUrls(context) ? resolveAssetReferences(value, assetUrlOf(context)) : value
}

export const readsUrls = (context: Pick<OperationContext, 'view' | 'reader'>) =>
  context.reader === true || context.view === 'published'

export async function imagesNamed(
  context: Pick<OperationContext, 'media' | 'site'>,
  values: readonly unknown[],
): Promise<ReadonlyMap<string, AssetRow>> {
  const media = context.media ?? null
  const ids = assetIdsIn(values)
  if (media === null || ids.length === 0) return new Map()
  const rows = await media.catalog.byIds(context.site.key, ids)
  return new Map(rows.map((row) => [row.id, row]))
}

export function summaryImages(
  context: Pick<OperationContext, 'media' | 'site' | 'view' | 'reader'>,
  frontmatter: unknown,
  images: ReadonlyMap<string, AssetRow>,
) {
  if (!readsUrls(context)) return {}
  const urlOf = assetUrlOf(context)
  const named = assetIdsIn(frontmatter).flatMap((id) => {
    const row = images.get(id)
    if (row === undefined) return []
    const url = urlOf(id)
    return [
      [
        url,
        { width: row.width, height: row.height, srcset: srcsetOf(url, row), alt: row.alt },
      ] as const,
    ]
  })
  return named.length === 0 ? {} : { images: Object.fromEntries(named) }
}
