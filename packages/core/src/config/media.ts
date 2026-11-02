import { DEFAULT_MAX_FILE_BYTES, MAX_FILE_BYTES } from '../media/index.ts'
import type { Problems } from './config-error.ts'
import type { ResolvedMedia } from './types.ts'
import { isRecord, keyPath, wrongType } from './values.ts'

export const MEDIA_FORMATS = ['webp', 'avif', 'original'] as const

/** The narrowest an image may be scaled down to: smaller would blur on every screen. */
export const MEDIA_MIN_WIDTH = 320
/** The widest: past it the binding's area limit comes first, and no page shows more. */
export const MEDIA_MAX_WIDTH = 8192

/** The most narrower copies an image gets: each one is a conversion, and the month has a limit. */
export const MEDIA_MAX_WIDTHS = 4

export const DEFAULT_MEDIA: ResolvedMedia = {
  format: 'webp',
  quality: 85,
  maxWidth: 2400,
  widths: [640, 1280],
  keepOriginals: true,
  maxBytes: DEFAULT_MAX_FILE_BYTES,
}

const FIX =
  'Declare it as { format: "webp", quality: 85, maxWidth: 2400, widths: [640, 1280], keepOriginals: true, maxBytes: 104857600 }, or remove it.'

export function mediaWidths(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > MEDIA_MAX_WIDTHS) return null
  const widths: number[] = []
  for (const width of value) {
    if (!isWhole(width) || width < MEDIA_MIN_WIDTH || width > MEDIA_MAX_WIDTH) return null
    if (widths.includes(width)) return null
    widths.push(width)
  }
  return widths.sort((a, b) => a - b)
}

export function readMedia(path: string, raw: unknown, problems: Problems): ResolvedMedia {
  if (raw === undefined || raw === null) return DEFAULT_MEDIA
  if (!isRecord(raw)) {
    problems.add(path, wrongType(raw, 'an object'), FIX)
    return DEFAULT_MEDIA
  }
  let { format, quality, maxWidth, widths, keepOriginals, maxBytes } = DEFAULT_MEDIA
  const rawFormat = raw['format']
  if (rawFormat !== undefined) {
    if (MEDIA_FORMATS.some((candidate) => candidate === rawFormat)) {
      format = rawFormat as ResolvedMedia['format']
    } else {
      problems.add(
        keyPath(path, 'format'),
        wrongType(rawFormat, '"webp", "avif" or "original"'),
        'Use "webp" or "avif" to convert the images a site receives, or "original" to keep them as they came.',
      )
    }
  }
  const rawQuality = raw['quality']
  if (rawQuality !== undefined) {
    if (isWhole(rawQuality) && rawQuality >= 1 && rawQuality <= 100) quality = rawQuality
    else {
      problems.add(
        keyPath(path, 'quality'),
        `${show(rawQuality)} is not a whole number from 1 to 100`,
        'Give the quality of photographs, 85 by default; PNG images are always kept lossless.',
      )
    }
  }
  const rawWidth = raw['maxWidth']
  if (rawWidth !== undefined) {
    if (isWhole(rawWidth) && rawWidth >= MEDIA_MIN_WIDTH && rawWidth <= MEDIA_MAX_WIDTH) {
      maxWidth = rawWidth
    } else {
      problems.add(
        keyPath(path, 'maxWidth'),
        `${show(rawWidth)} is not a whole number of pixels from ${MEDIA_MIN_WIDTH} to ${MEDIA_MAX_WIDTH}`,
        'Give the widest an image may be; a wider one is scaled down, never up.',
      )
    }
  }
  const rawWidths = raw['widths']
  if (rawWidths !== undefined) {
    const read = mediaWidths(rawWidths)
    if (read !== null) widths = read
    else {
      problems.add(
        keyPath(path, 'widths'),
        `${Array.isArray(rawWidths) ? 'this list' : wrongType(rawWidths, 'a list')} is not up to ${MEDIA_MAX_WIDTHS} different whole numbers of pixels from ${MEDIA_MIN_WIDTH} to ${MEDIA_MAX_WIDTH}`,
        'Give the widths of the narrower copies made of each image for srcset, such as [640, 1280], or [] for none.',
      )
    }
  }
  const rawKeep = raw['keepOriginals']
  if (typeof rawKeep === 'boolean') keepOriginals = rawKeep
  else if (rawKeep !== undefined) {
    problems.add(
      keyPath(path, 'keepOriginals'),
      wrongType(rawKeep, 'true or false'),
      'Use true to keep each file as it was uploaded, or false to keep only the one served.',
    )
  }
  const rawMaxBytes = raw['maxBytes']
  if (rawMaxBytes !== undefined) {
    if (isWhole(rawMaxBytes) && rawMaxBytes >= 1 && rawMaxBytes <= MAX_FILE_BYTES) {
      maxBytes = rawMaxBytes
    } else {
      problems.add(
        keyPath(path, 'maxBytes'),
        `${show(rawMaxBytes)} is not a whole number of bytes from 1 to ${MAX_FILE_BYTES}`,
        'Give the largest video or PDF the site takes, in bytes, such as 524288000 for 500 MB.',
      )
    }
  }
  return { format, quality, maxWidth, widths, keepOriginals, maxBytes }
}

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function show(value: unknown): string {
  return typeof value === 'number' ? String(value) : wrongType(value, 'a number')
}
