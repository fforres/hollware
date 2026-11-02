import { MAX_ASSET_BYTES, MULTIPART_PART_BYTES, newId, UPLOAD_HOURS } from '@hollware/core'
import type { Media, UploadRow } from '../ports.ts'
import { actorOf } from './actor.ts'
import {
  adoptUpload,
  CUT_SHORT,
  isCutShort,
  NO_BUCKET,
  refused,
  tooBigForSite,
  uploadKey,
  type Described,
  type Streamed,
  type UploadOutput,
} from './assets.ts'
import type { OperationContext } from './types.ts'

export interface StartedUpload {
  readonly outcome: 'started'
  readonly upload: {
    readonly id: string
    readonly partBytes: number
    readonly parts: number
    readonly expiresAt: string
  }
}

export interface UploadedPart {
  readonly outcome: 'uploaded'
  readonly part: number
  readonly etag: string
}

type Refused = ReturnType<typeof refused>
type Unavailable = { readonly outcome: 'unavailable'; readonly problem: typeof NO_BUCKET }

const NO_UPLOAD = refused(
  'There is no upload of that id in this site: it was finished, aborted, or it expired.',
  'Start the upload again with POST /v1/uploads.',
  404,
)

const partsOf = (bytes: number, partBytes: number) => Math.ceil(bytes / partBytes)

const lengthOfPart = (upload: UploadRow, part: number) =>
  part < partsOf(upload.bytes, upload.partBytes)
    ? upload.partBytes
    : upload.bytes - upload.partBytes * (partsOf(upload.bytes, upload.partBytes) - 1)

async function ownUpload(
  media: Media,
  context: OperationContext,
  id: string,
): Promise<UploadRow | null> {
  const upload = await media.uploads.byId(context.site.key, id)
  if (upload === null || upload.createdBy !== actorOf(context).userId) return null
  return upload.expiresAt > context.clock.now().toISOString() ? upload : null
}

export async function startUpload(
  input: Described & { readonly bytes: number },
  context: OperationContext,
): Promise<StartedUpload | Refused | Unavailable> {
  const media = context.media ?? null
  if (media === null) return { outcome: 'unavailable', problem: NO_BUCKET }
  const most = Math.max(context.site.media.maxBytes, MAX_ASSET_BYTES)
  if (input.bytes > most) return tooBigForSite(input.bytes, context.site.media.maxBytes)
  const site = context.site.key
  const key = uploadKey(site, crypto.randomUUID())
  const multipartId = await media.files.startParts(key)
  const now = context.clock.now()
  const upload: UploadRow = {
    id: newId('upl'),
    site,
    key,
    multipartId,
    filename: input.filename,
    alt: input.alt,
    bytes: input.bytes,
    partBytes: MULTIPART_PART_BYTES,
    createdBy: actorOf(context).userId,
    expiresAt: new Date(now.getTime() + UPLOAD_HOURS * 3_600_000).toISOString(),
    createdAt: now.toISOString(),
  }
  await media.uploads.insert(upload)
  return {
    outcome: 'started',
    upload: {
      id: upload.id,
      partBytes: upload.partBytes,
      parts: partsOf(upload.bytes, upload.partBytes),
      expiresAt: upload.expiresAt,
    },
  }
}

export async function uploadPart(
  id: string,
  part: number,
  streamed: Streamed,
  context: OperationContext,
): Promise<UploadedPart | Refused | Unavailable> {
  const media = context.media ?? null
  if (media === null) {
    await streamed.body.cancel()
    return { outcome: 'unavailable', problem: NO_BUCKET }
  }
  const upload = await ownUpload(media, context, id)
  if (upload === null) {
    await streamed.body.cancel()
    return NO_UPLOAD
  }
  const parts = partsOf(upload.bytes, upload.partBytes)
  if (!Number.isSafeInteger(part) || part < 1 || part > parts) {
    await streamed.body.cancel()
    return refused(
      `Part ${part} is not one of this upload: it has parts 1 to ${parts}.`,
      'Send the parts numbered from 1, each of partBytes bytes but the last.',
      400,
    )
  }
  const length = lengthOfPart(upload, part)
  if (streamed.length !== length) {
    await streamed.body.cancel()
    return refused(
      `Part ${part} is ${streamed.length} bytes, and this upload expects ${length}.`,
      'Send each part of partBytes bytes, and the last with what remains of the file.',
      400,
    )
  }
  try {
    const etag = await media.files.putPart(
      upload.key,
      upload.multipartId,
      part,
      streamed.body,
      length,
    )
    return { outcome: 'uploaded', part, etag }
  } catch (error) {
    if (isCutShort(error)) return CUT_SHORT
    throw error
  }
}

export async function finishUpload(
  id: string,
  parts: readonly { readonly part: number; readonly etag: string }[],
  context: OperationContext,
): Promise<UploadOutput | Refused> {
  const media = context.media ?? null
  if (media === null) return { outcome: 'unavailable', problem: NO_BUCKET }
  const upload = await ownUpload(media, context, id)
  if (upload === null) return NO_UPLOAD
  const expected = partsOf(upload.bytes, upload.partBytes)
  const numbers = parts.map(({ part }) => part).sort((a, b) => a - b)
  if (numbers.length !== expected || numbers.some((part, at) => part !== at + 1)) {
    return refused(
      `The upload has ${expected} parts, and the list names ${numbers.length === 0 ? 'none' : numbers.join(', ')}.`,
      'List every part once, with the etag its PUT answered.',
      400,
    )
  }
  try {
    await media.files.finishParts(upload.key, upload.multipartId, parts)
    await media.uploads.delete(upload.site, upload.id)
    return await adoptUpload(media, context, upload, upload.key, upload.bytes)
  } finally {
    await media.files.delete(upload.key)
  }
}

export async function abortUpload(
  id: string,
  context: OperationContext,
): Promise<{ readonly outcome: 'aborted' } | Refused | Unavailable> {
  const media = context.media ?? null
  if (media === null) return { outcome: 'unavailable', problem: NO_BUCKET }
  const upload = await ownUpload(media, context, id)
  if (upload === null) return NO_UPLOAD
  await media.files.abortParts(upload.key, upload.multipartId)
  await media.uploads.delete(upload.site, upload.id)
  return { outcome: 'aborted' }
}

export async function abortExpiredUploads(media: Media, site: string, now: Date): Promise<number> {
  const expired = await media.uploads.expired(site, now.toISOString())
  for (const upload of expired) {
    await media.files.abortParts(upload.key, upload.multipartId).catch(() => undefined)
    await media.uploads.delete(site, upload.id)
  }
  return expired.length
}
